import { shallowReactive } from 'vue'
import type { GattTransport } from '../bluetooth/transport'
import { gatt } from '../bluetooth/transport'
import type { Direction, FieldId, Readings, Reading, ServiceInfo } from '../domain'
import { decodeStandard, standardFields } from '../protocol/standard-battery'
import { BfgSession, parseBfgKey, StoredBfgKey } from '../protocol/bfg-session'
import type { AuthStage } from '../protocol/bfg-session'
import { BfgError } from '../protocol/bfg-crypto'
import { hexBytes } from '../protocol/registers'

export type ConnectionState = 'idle' | 'searching' | 'connecting' | 'connected' | 'reading' | 'lost' | 'error'
export const connectionLabels: Record<ConnectionState, string> = {
  idle: '未连接', searching: '搜索中', connecting: '连接中', connected: '已连接 · 未认证',
  reading: '正在读取', lost: '连接已断开', error: '通信异常',
}

export type AuthState = 'idle' | 'ready' | 'failed' | 'key-required' | AuthStage
export const isAuthorizing = (state: AuthState) =>
  state === 'checking' || state === 'confirming' || state === 'authenticating'

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
    bfgAvailable: false, standardAvailable: false, auth: 'idle' as AuthState, authMessage: '', generatedKeyAvailable: false,
  })
  let generation = 0
  let retries = 0
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let bfg: BfgSession | undefined
  let generatedKey: Uint8Array | undefined

  function clearSnapshot() {
    bfg?.close()
    bfg = undefined
    data.auth = 'idle'
    data.authMessage = ''
    data.bfgAvailable = false
    data.standardAvailable = false
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
      const uart = services.find((service) => service.uuid === gatt.uart)
      const uartWrite = uart?.characteristics.find((item) => item.uuid === gatt.uartWrite)
      const uartNotify = uart?.characteristics.find((item) => item.uuid === gatt.uartNotify)
      data.bfgAvailable = Boolean(transport.openBfgChannel &&
        uartWrite?.properties.some((p) => p === 'write' || p === 'writeWithoutResponse') &&
        uartNotify?.properties.some((p) => p === 'notify' || p === 'indicate'))
      data.standardAvailable = standardFields.some(({ service, characteristic }) =>
        services.some((group) => group.uuid === service && group.characteristics.some((item) =>
          item.uuid === characteristic && item.properties.includes('read'))))
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
      forgetKey()
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

  function forgetKey() {
    generatedKey?.fill(0)
    generatedKey = undefined
    data.generatedKeyAvailable = false
  }

  function revealKey() {
    return generatedKey ? hexBytes(generatedKey).replaceAll(' ', '') : ''
  }

  async function authorize(method: { pair: true } | { key?: string }) {
    const open = transport.openBfgChannel
    if (!open || !data.bfgAvailable || data.state !== 'connected' || isAuthorizing(data.auth) || data.auth === 'ready') return
    const ticket = generation
    let key: Uint8Array | undefined
    data.authMessage = ''
    if ('pair' in method && (data.generatedKeyAvailable || data.auth === 'key-required')) return
    if (!('pair' in method)) {
      try {
        if (method.key !== undefined) key = parseBfgKey(method.key)
        else if (generatedKey) key = new Uint8Array(generatedKey)
        else throw new BfgError('请提供已有配对密钥。')
      } catch (error) {
        data.authMessage = error instanceof BfgError ? error.message : '无法使用此密钥。'
        return
      }
    }
    bfg?.close()
    const session = new BfgSession((receive) => open.call(transport, receive))
    bfg = session
    data.auth = 'checking'
    log('system', '开始 BFG 车辆认证')
    try {
      await withTimeout(session.authorize(transport.name, key ? { kind: 'existing', key } : {
        kind: 'pair',
        onKey: (value) => {
          if (bfg !== session || ticket !== generation) {
            value.fill(0)
            return
          }
          generatedKey = value
          data.generatedKeyAvailable = true
        },
      }, (stage) => {
        if (bfg === session && ticket === generation) data.auth = stage
      }), 80000, '车辆认证超时。')
      assertActive(ticket)
      data.auth = 'ready'
      data.message = ''
      log('system', 'BFG 车辆认证成功')
    } catch (error) {
      session.close()
      if (bfg !== session || ticket !== generation) return
      bfg = undefined
      const phase = data.auth as AuthState
      data.auth = error instanceof StoredBfgKey ? 'key-required' : 'failed'
      data.authMessage = error instanceof BfgError ? error.message :
        error instanceof DOMException && error.name === 'TimeoutError'
          ? phase === 'confirming' ? '等待车端确认超时，配对结果需在车端核对。'
            : phase === 'authenticating' ? '鉴权响应超时，请核对密钥并确认官方 App 已断开。'
              : '车辆握手超时。请确认车辆已唤醒、官方 App 未占用连接并核对车型协议。'
          : '无法建立车辆认证会话。请确认车辆已唤醒、官方 App 未占用蓝牙连接，并核对密钥。'
      log('system', error instanceof StoredBfgKey ? 'BFG 车辆已有配对' : 'BFG 车辆认证未完成')
    } finally {
      key?.fill(0)
    }
  }

  async function read() {
    if (data.state !== 'connected' || !transport.connected || isAuthorizing(data.auth)) return
    const ticket = generation
    data.state = 'reading'
    data.message = ''
    let successes = 0
    try {
      if (bfg && data.auth === 'ready') {
        successes += await bfg.read((field, reading) => {
          assertActive(ticket)
          setReading(field, reading)
        }, (message) => { if (generation === ticket) log('system', message) })
        assertActive(ticket)
      }
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
      data.message = successes ? '车辆读数已更新。' : data.bfgAvailable && data.auth !== 'ready'
        ? '请先在连接区完成车辆配对或密钥认证。'
        : '此设备未返回可用字段，可导出 GATT 发现记录。'
    } catch (error) {
      fail(ticket, error instanceof DOMException && error.name === 'TimeoutError'
        ? error.message + '，已结束本次连接。' : error instanceof BfgError
          ? error.message + ' 请重新连接并认证。' : '读取中断，请重新连接。')
    } finally {
      if (ticket === generation) data.state = 'connected'
    }
  }

  return { data, connect, disconnect, retry, read, authorize, revealKey, forgetKey }
}
