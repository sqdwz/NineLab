import type { ServiceInfo } from '../domain'
import type { BfgChannel, OpenBfgChannel } from '../protocol/bfg-session'

export interface GattTransport {
  select(mode: SelectionMode): Promise<void>
  connect(): Promise<void>
  disconnect(): void
  discover(): Promise<ServiceInfo[]>
  read(service: string, characteristic: string): Promise<DataView>
  subscribe(service: string, characteristic: string, handler: (value: DataView) => void): Promise<void>
  openBfgChannel?: OpenBfgChannel
  onDisconnect: (() => void) | undefined
  readonly name: string
  readonly selected: boolean
  readonly connected: boolean
}

export function assigned(number: string) {
  return '0000' + number + '-0000-1000-8000-00805f9b34fb'
}

export const gatt = {
  uart: '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
  uartWrite: '6e400002-b5a3-f393-e0a9-e50e24dcca9e',
  uartNotify: '6e400003-b5a3-f393-e0a9-e50e24dcca9e',
  segwayUart: '6e400001-0000-0000-006e-696e65626f74',
  battery: assigned('180f'), level: assigned('2a19'),
  device: assigned('180a'), model: assigned('2a24'), serial: assigned('2a25'), firmware: assigned('2a26'),
}

const services = [gatt.uart, gatt.segwayUart, gatt.battery, gatt.device]
const filterNames = ['Ninebot', 'NINEBOT', 'Segway', 'SEGWAY']

export type SelectionMode = 'ninebot' | 'bfg-compatible' | 'bfg-filtered' | 'nearby'

export const selectionLabels: Record<SelectionMode, string> = {
  ninebot: '九号筛选',
  'bfg-compatible': 'iPhone 兼容',
  'bfg-filtered': '仅 BFG 服务',
  nearby: '附近 BLE',
}

function selectionOptions(mode: SelectionMode): RequestDeviceOptions {
  if (mode === 'bfg-compatible') return { acceptAllDevices: true, optionalServices: [gatt.uart] }
  if (mode === 'bfg-filtered') return { filters: [{ services: [gatt.uart] }] }
  if (mode === 'nearby') return { acceptAllDevices: true, optionalServices: [...services] }
  return {
    filters: [
      { services: [gatt.uart] }, { services: [gatt.segwayUart] },
      ...filterNames.map((namePrefix) => ({ namePrefix })),
    ],
    optionalServices: [...services],
  }
}

export class WebGattTransport implements GattTransport {
  onDisconnect: (() => void) | undefined
  private device: BluetoothDevice | undefined
  private server: BluetoothRemoteGATTServer | undefined
  private generation = 0
  private listeners = new Set<() => void>()
  private stopWatchingDevice: (() => void) | undefined

  get name() { return this.device?.name || '未广播名称' }
  get selected() { return Boolean(this.device) }
  get connected() { return Boolean(this.server?.connected) }

  async select(mode: SelectionMode) {
    const generation = this.generation
    // Invoke the native picker directly in the click handler's task.
    const device = await navigator.bluetooth.requestDevice(selectionOptions(mode))
    if (generation !== this.generation) throw new DOMException('选择已取消', 'AbortError')
    if (!device) throw new DOMException('未选择设备。', 'NotFoundError')
    this.stopWatchingDevice?.()
    this.stopWatchingDevice = undefined
    this.device = device
  }

  private watchDevice(device: BluetoothDevice) {
    if (this.stopWatchingDevice) return
    if (typeof device.addEventListener === 'function' && typeof device.removeEventListener === 'function') {
      device.addEventListener('gattserverdisconnected', this.lost)
      this.stopWatchingDevice = () => device.removeEventListener('gattserverdisconnected', this.lost)
    } else if ('ongattserverdisconnected' in device) {
      // Some native Web Bluetooth bridges expose the event handler property only.
      const bridged = device as BluetoothDevice & { ongattserverdisconnected: ((event: Event) => void) | null }
      const previous = bridged.ongattserverdisconnected
      const notify = (event: Event) => {
        this.lost()
        previous?.call(bridged, event)
      }
      bridged.ongattserverdisconnected = notify
      this.stopWatchingDevice = () => {
        if (bridged.ongattserverdisconnected === notify) bridged.ongattserverdisconnected = previous
      }
    }
  }

  private lost = () => {
    if (!this.server || this.server.connected) return
    this.generation++
    this.clearCharacteristics()
    this.server = undefined
    this.onDisconnect?.()
  }

  private clearCharacteristics() {
    for (const remove of this.listeners) remove()
    this.listeners.clear()
  }

  async connect() {
    const device = this.device
    const remote = device?.gatt
    const generation = this.generation
    if (!device || !remote || typeof remote.connect !== 'function') {
      throw new DOMException('所选设备没有 GATT 接口。', 'NotSupportedError')
    }
    this.watchDevice(device)
    const server = await remote.connect() ?? remote
    if (generation !== this.generation) {
      if (!this.server?.connected) server.disconnect()
      throw new DOMException('连接已取消', 'AbortError')
    }
    this.server = server
  }

  disconnect() {
    this.generation++
    this.clearCharacteristics()
    this.server = undefined
    const remote = this.device?.gatt
    if (remote?.connected) remote.disconnect()
  }

  private active() {
    if (!this.server?.connected) throw new Error('蓝牙连接已断开')
    return this.server
  }

  async discover() {
    const server = this.active()
    let available: BluetoothRemoteGATTService[] = []
    try {
      available = await server.getPrimaryServices()
    } catch {
      if (!server.connected) throw new Error('发现服务时蓝牙断开')
    }
    if (!available.length) {
      for (const uuid of services) {
        try {
          available.push(await server.getPrimaryService(uuid))
        } catch {
          if (!server.connected) throw new Error('发现服务时蓝牙断开')
        }
      }
    }
    const result: ServiceInfo[] = []
    for (const service of available) {
      try {
        const characteristics = await service.getCharacteristics()
        result.push({
          uuid: service.uuid,
          characteristics: characteristics.map((item) => ({
            uuid: item.uuid,
            properties: (['read', 'notify', 'indicate', 'write', 'writeWithoutResponse'] as const)
              .filter((key) => item.properties[key]),
          })),
        })
      } catch {
        if (!server.connected) throw new Error('发现特征时蓝牙断开')
        result.push({ uuid: service.uuid, characteristics: [], error: '特征列表无法读取' })
      }
    }
    return result
  }

  async openBfgChannel(receive: (chunk: Uint8Array) => void): Promise<BfgChannel> {
    const generation = this.generation
    const service = await this.active().getPrimaryService(gatt.uart)
    const tx = await service.getCharacteristic(gatt.uartWrite)
    const rx = await service.getCharacteristic(gatt.uartNotify)
    const sendChunk = tx.properties.write && typeof tx.writeValueWithResponse === 'function'
      ? tx.writeValueWithResponse.bind(tx)
      : tx.properties.writeWithoutResponse && typeof tx.writeValueWithoutResponse === 'function'
        ? tx.writeValueWithoutResponse.bind(tx)
        : (tx.properties.write || tx.properties.writeWithoutResponse) && typeof tx.writeValue === 'function'
          ? tx.writeValue.bind(tx) : undefined
    if (!sendChunk || !(rx.properties.notify || rx.properties.indicate)) throw new Error('蓝牙通道不支持读写通知。')

    let closed = false
    const open = () => !closed && generation === this.generation && this.connected
    const notify = () => {
      const value = rx.value
      if (open() && value) receive(new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice())
    }
    const close = () => {
      closed = true
      rx.removeEventListener('characteristicvaluechanged', notify)
      this.listeners.delete(close)
    }
    if (!open()) throw new DOMException('车辆会话已结束。', 'AbortError')
    this.listeners.add(close)
    rx.addEventListener('characteristicvaluechanged', notify)
    try {
      await rx.startNotifications()
      if (!open()) throw new DOMException('车辆会话已结束。', 'AbortError')
    } catch (error) {
      close()
      throw error
    }

    return {
      close,
      send: async (data) => {
        for (let offset = 0; offset < data.length; offset += 20) {
          if (!open()) throw new DOMException('车辆会话已结束。', 'AbortError')
          await sendChunk(data.slice(offset, offset + 20))
        }
      },
    }
  }

  private async standardCharacteristic(service: string, characteristic: string) {
    const allowed = service === gatt.battery ? [gatt.level] :
      service === gatt.device ? [gatt.model, gatt.serial, gatt.firmware] : []
    if (!allowed.includes(characteristic)) throw new Error('该特征未获准读取')
    const group = await this.active().getPrimaryService(service)
    return group.getCharacteristic(characteristic)
  }

  async read(service: string, characteristic: string) {
    const item = await this.standardCharacteristic(service, characteristic)
    if (!item.properties.read) throw new Error('该特征不支持读取')
    return item.readValue()
  }

  async subscribe(service: string, characteristic: string, handler: (value: DataView) => void) {
    if (service !== gatt.battery || characteristic !== gatt.level) throw new Error('该特征未获准订阅')
    const generation = this.generation
    const item = await this.standardCharacteristic(service, characteristic)
    const notify = () => { if (generation === this.generation && item.value) handler(item.value) }
    const remove = () => item.removeEventListener('characteristicvaluechanged', notify)
    await item.startNotifications()
    if (generation !== this.generation) throw new DOMException('订阅已取消', 'AbortError')
    item.addEventListener('characteristicvaluechanged', notify)
    this.listeners.add(remove)
  }
}
