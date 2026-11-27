import { shallowReactive } from 'vue'
import type { GattTransport } from '../bluetooth/transport'
import { gatt } from '../bluetooth/transport'
import type { Direction, FieldId, Readings, Reading, ServiceInfo } from '../domain'
import { decodeStandard, standardFields } from '../protocol/standard-battery'

export type ConnectionState = 'idle' | 'searching' | 'connecting' | 'connected' | 'reading' | 'lost' | 'error'
export const connectionLabels: Record<ConnectionState, string> = {
  idle: '未连接', searching: '搜索中', connecting: '连接中', connected: '已连接 · 未认证',
  reading: '正在读取', lost: '连接已断开', error: '通信异常',
}

export type RecordLog = (
  direction: Direction, message: string, details?: { raw?: string; decoded?: string; duration?: number; check?: string }
) => void

function withTimeout<T>(promise: Promise<T>, delay: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new DOMException(message, 'TimeoutError')), delay)
    promise.then(
      (value) => { clearTimeout(timer); resolve(value) },
      (error: unknown) => { clearTimeout(timer); reject(error) },
    )
  })
}

export function createConnection(
  transport: GattTransport,
  log: RecordLog,
  foreground = () => document.visibilityState === 'visible',
) {
  const data = shallowReactive({
    state: 'idle' as ConnectionState,
    name: '', message: '', services: [] as ServiceInfo[], readings: {} as Readings,
    lastServices: [] as ServiceInfo[], selected: false, subscribed: false, missedSubscription: false,
  })
  let generation = 0
  let retries = 0
  let retryTimer: ReturnType<typeof setTimeout> | undefined

  function clearSnapshot() {
    data.services = []
    data.readings = {}
    data.subscribed = false
    data.missedSubscription = false
  }

  function assertActive(ticket: number) {
    if (generation !== ticket || !transport.connected) throw new DOMException('蓝牙会话已结束', 'AbortError')
  }

  function setReading(field: FieldId, reading: Reading) {
    data.readings = { ...data.readings, [field]: reading }
  }

  function fail(ticket: number, message: string) {
    if (generation !== ticket) return
    generation++
    transport.disconnect()
    clearSnapshot()
    data.state = 'error'
    data.message = message
    log('system', message)
  }

  async function reconnect(ticket: number) {
    try {
      data.state = 'connecting'
      const started = performance.now()
      await withTimeout(transport.connect(), 10000, 'GATT 连接超时')
      assertActive(ticket)
      const services = await withTimeout(transport.discover(), 12000, 'GATT 服务发现超时')
      assertActive(ticket)
      data.services = services
      data.lastServices = services
      data.state = 'connected'
      data.message = ''
      log('system', 'GATT 已建立，发现 ' + services.length + ' 个可见服务', { duration: performance.now() - started })
    } catch (error) {
      const message = error instanceof DOMException && error.name === 'TimeoutError'
        ? error.message : 'GATT 连接或服务发现失败，请检查车辆和浏览器权限。'
      fail(ticket, message)
    }
  }

  transport.onDisconnect = () => {
    if (data.state !== 'connected' && data.state !== 'reading' && data.state !== 'connecting') return
    const ticket = ++generation
    clearSnapshot()
    data.state = 'lost'
    data.message = '连接已断开，历史读数已从当前会话移除。'
    log('system', 'GATT 意外断开')
    if (retries >= 1 || !foreground()) return
    retries++
    retryTimer = setTimeout(() => {
      if (generation === ticket && foreground()) void reconnect(ticket)
    }, 1000)
  }

  async function connect(broad: boolean) {
    if (['searching', 'connecting', 'connected', 'reading'].includes(data.state)) return
    clearTimeout(retryTimer)
    clearSnapshot()
    const ticket = ++generation
    data.state = 'searching'
    data.message = ''
    retries = 0
    try {
      await transport.select(broad)
      if (ticket !== generation) return
      data.selected = true
      data.lastServices = []
      data.name = transport.name
      await reconnect(ticket)
    } catch (error) {
      if (ticket !== generation) return
      if (error instanceof DOMException && ['NotFoundError', 'AbortError'].includes(error.name)) {
        data.state = 'idle'
        data.message = '未选中蓝牙设备。'
        return
      }
      fail(ticket, '无法打开设备选择器，请检查蓝牙权限及 HTTPS。')
    }
  }

  async function retry() {
    if (!transport.selected || !['lost', 'error', 'idle'].includes(data.state)) return
    clearTimeout(retryTimer)
    retries = 0
    await reconnect(++generation)
  }

  function disconnect() {
    clearTimeout(retryTimer)
    generation++
    clearSnapshot()
    data.state = 'idle'
    data.message = ''
    transport.disconnect()
    log('system', '已主动断开连接')
  }

  async function read() {
    if (data.state !== 'connected' || !transport.connected) return
    const ticket = generation
    data.state = 'reading'
    data.message = ''
    let successes = 0
    try {
      for (const { field, service, characteristic } of standardFields) {
        const properties = data.services.find((group) => group.uuid === service)
          ?.characteristics.find((item) => item.uuid === characteristic)?.properties
        const started = performance.now()
        const time = new Date().toISOString()
        if (!properties?.includes('read')) {
          setReading(field, { value: null, time, origin: 'unsupported', source: '标准 GATT', detail: '设备未公开可读特征' })
          continue
        }
        try {
          log('out', '标准 GATT 读取 ' + characteristic)
          const view = await withTimeout(transport.read(service, characteristic), 6000, '标准 GATT 读取超时')
          assertActive(ticket)
          const item = decodeStandard(field, view, new Date().toISOString())
          setReading(field, item)
          successes++
          log('in', '标准 GATT 响应 ' + characteristic, {
            duration: performance.now() - started, raw: item.raw,
            decoded: field === 'standardSoc' ? String(item.value) + '%' : undefined,
            check: '格式通过',
          })
        } catch (error) {
          assertActive(ticket)
          if (error instanceof DOMException && error.name === 'TimeoutError') throw error
          log('system', '读取失败 ' + characteristic, { duration: performance.now() - started })
          setReading(field, { value: null, time, origin: 'failed', source: '标准 GATT', detail: '设备未返回有效数据或需要系统权限' })
        }
      }

      const level = data.services.find((item) => item.uuid === gatt.battery)
        ?.characteristics.find((item) => item.uuid === gatt.level)
      if (!data.subscribed && !data.missedSubscription && level?.properties.some((p) => p === 'notify' || p === 'indicate')) {
        try {
          await withTimeout(transport.subscribe(gatt.battery, gatt.level, (view) => {
            if (ticket !== generation) return
            try {
              const item = decodeStandard('standardSoc', view, new Date().toISOString())
              setReading('standardSoc', item)
              log('in', '标准 BLE 电量通知', { raw: item.raw, decoded: String(item.value) + '%', check: '格式通过' })
            } catch {
              log('system', '标准 BLE 电量通知格式不符')
            }
          }), 6000, '标准 GATT 订阅超时')
          assertActive(ticket)
          data.subscribed = true
          log('system', '已订阅标准 BLE 电量通知')
        } catch (error) {
          assertActive(ticket)
          if (error instanceof DOMException && error.name === 'TimeoutError') throw error
          data.missedSubscription = true
          log('system', '设备未接受标准 BLE 电量通知订阅')
        }
      }
      data.message = successes ? '标准字段已更新。' : '此设备未返回可用的标准字段，可导出 GATT 发现记录。'
    } catch (error) {
      fail(ticket, error instanceof DOMException && error.name === 'TimeoutError'
        ? error.message + '，已结束本次连接。' : '读取中断，请重新连接。')
    } finally {
      if (ticket === generation) data.state = 'connected'
    }
  }

  return { data, connect, disconnect, retry, read }
}
