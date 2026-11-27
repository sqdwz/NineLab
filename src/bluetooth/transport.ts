import type { ServiceInfo } from '../domain'

export interface GattTransport {
  select(broad: boolean): Promise<void>
  connect(): Promise<void>
  disconnect(): void
  discover(): Promise<ServiceInfo[]>
  read(service: string, characteristic: string): Promise<DataView>
  subscribe(service: string, characteristic: string, handler: (value: DataView) => void): Promise<void>
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
  segwayUart: '6e400001-0000-0000-006e-696e65626f74',
  battery: assigned('180f'), level: assigned('2a19'),
  device: assigned('180a'), model: assigned('2a24'), serial: assigned('2a25'), firmware: assigned('2a26'),
}

const services = [gatt.uart, gatt.segwayUart, gatt.battery, gatt.device]
const filterNames = ['Ninebot', 'NINEBOT', 'Segway', 'SEGWAY']

export class WebGattTransport implements GattTransport {
  onDisconnect: (() => void) | undefined
  private device: BluetoothDevice | undefined
  private server: BluetoothRemoteGATTServer | undefined
  private generation = 0
  private listeners = new Set<() => void>()

  get name() { return this.device?.name || '未广播名称' }
  get selected() { return Boolean(this.device) }
  get connected() { return Boolean(this.server?.connected) }

  async select(broad: boolean) {
    const generation = this.generation
    const options: RequestDeviceOptions = broad
      ? { acceptAllDevices: true, optionalServices: services }
      : { filters: [
        { services: [gatt.uart] }, { services: [gatt.segwayUart] },
        ...filterNames.map((namePrefix) => ({ namePrefix })),
      ], optionalServices: services }
    const device = await navigator.bluetooth.requestDevice(options)
    if (generation !== this.generation) throw new DOMException('选择已取消', 'AbortError')
    this.device?.removeEventListener('gattserverdisconnected', this.lost)
    this.device = device
    device.addEventListener('gattserverdisconnected', this.lost)
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
    const remote = this.device?.gatt
    const generation = this.generation
    if (!remote) throw new Error('所选设备没有 GATT 接口')
    const server = await remote.connect()
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
    this.device?.gatt?.disconnect()
  }

  private active() {
    if (!this.server?.connected) throw new Error('蓝牙连接已断开')
    return this.server
  }

  async discover() {
    const server = this.active()
    const available = await server.getPrimaryServices()
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
