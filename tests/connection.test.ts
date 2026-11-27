import { afterEach, describe, expect, it, vi } from 'vitest'
import { gatt } from '../src/bluetooth/transport'
import type { GattTransport } from '../src/bluetooth/transport'
import { createConnection } from '../src/stores/connection'

function mockGatt() {
  let notify: ((value: DataView) => void) | undefined
  const transport = {
    name: 'Mock BLE', selected: false as boolean, connected: false as boolean,
    onDisconnect: undefined as (() => void) | undefined,
    select: vi.fn(async () => { transport.selected = true }),
    connect: vi.fn(async () => { transport.connected = true }),
    disconnect: vi.fn(() => { transport.connected = false }),
    discover: vi.fn(async () => [
      { uuid: gatt.battery, characteristics: [{ uuid: gatt.level, properties: ['read', 'notify'] }] },
      { uuid: gatt.device, characteristics: [{ uuid: gatt.serial, properties: ['read'] }] },
    ]),
    read: vi.fn(async (_service: string, characteristic: string) => new DataView(
      characteristic === gatt.level ? Uint8Array.of(61).buffer : new TextEncoder().encode('MY-SERIAL').buffer,
    )),
    subscribe: vi.fn(async (_service: string, _characteristic: string, callback: (value: DataView) => void) => { notify = callback }),
  } satisfies GattTransport
  return {
    transport,
    lose: () => { transport.connected = false; transport.onDisconnect?.() },
    emit: (level: number) => notify?.(new DataView(Uint8Array.of(level).buffer)),
  }
}
afterEach(() => vi.useRealTimers())

describe('标准 GATT 会话', () => {
  it('先连接再手动读取，订阅只创建一次，日志不含序列号', async () => {
    const mock = mockGatt()
    const log = vi.fn()
    const connection = createConnection(mock.transport, log)
    await connection.connect('ninebot')
    expect(connection.data.state).toBe('connected')
    expect(mock.transport.read).not.toHaveBeenCalled()
    await connection.read()
    await connection.read()
    expect(connection.data.readings.standardSoc?.value).toBe(61)
    expect(connection.data.readings.serial?.value).toBe('MY-SERIAL')
    expect(mock.transport.subscribe).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(log.mock.calls)).not.toContain('MY-SERIAL')
    mock.emit(42)
    expect(connection.data.readings.standardSoc?.value).toBe(42)
    connection.disconnect()
    mock.emit(19)
    expect(connection.data.readings).toEqual({})
  })
  it('网络断开只自动重连一次，并清除旧快照', async () => {
    vi.useFakeTimers()
    const mock = mockGatt()
    const connection = createConnection(mock.transport, vi.fn(), () => true)
    await connection.connect('ninebot')
    await connection.read()
    mock.lose()
    expect(connection.data.readings).toEqual({})
    expect(connection.data.state).toBe('lost')
    await vi.advanceTimersByTimeAsync(1000)
    expect(connection.data.state).toBe('connected')
    mock.lose()
    await vi.advanceTimersByTimeAsync(1000)
    expect(connection.data.state).toBe('lost')
    expect(mock.transport.connect).toHaveBeenCalledTimes(2)
  })
  it('超时后停止并忽略迟到读数', async () => {
    vi.useFakeTimers()
    const mock = mockGatt()
    let late: ((view: DataView<ArrayBuffer>) => void) | undefined
    mock.transport.read.mockImplementation(() => new Promise((resolve) => { late = resolve }))
    const connection = createConnection(mock.transport, vi.fn())
    await connection.connect('ninebot')
    const request = connection.read()
    await vi.advanceTimersByTimeAsync(6000)
    await request
    expect(connection.data.state).toBe('error')
    late?.(new DataView(Uint8Array.of(64).buffer))
    await Promise.resolve()
    expect(connection.data.readings).toEqual({})
    expect(mock.transport.read).toHaveBeenCalledTimes(1)
  })
  it('处理取消设备选择和过期的 GATT 发现', async () => {
    const mock = mockGatt()
    const connection = createConnection(mock.transport, vi.fn())
    mock.transport.select.mockRejectedValueOnce(new DOMException('cancel', 'NotFoundError'))
    await connection.connect('ninebot')
    expect(connection.data.state).toBe('idle')

    let discover: (() => void) | undefined
    mock.transport.discover.mockImplementationOnce(() => new Promise((resolve) => { discover = () => resolve([]) }))
    const pending = connection.connect('nearby')
    await vi.waitFor(() => expect(discover).toBeDefined())
    connection.disconnect()
    discover?.()
    await pending
    expect(connection.data.state).toBe('idle')
    expect(connection.data.services).toEqual([])
  })

  it('将系统蓝牙错误分开归类并省略原始信息', async () => {
    const mock = mockGatt()
    const log = vi.fn()
    const connection = createConnection(mock.transport, log)
    mock.transport.select.mockRejectedValueOnce({ name: 'NetworkError', message: 'Bluetooth powered off (internal identity)' })
    await connection.connect('bfg-compatible')
    expect(connection.data.state).toBe('error')
    expect(connection.data.message).toContain('请打开系统蓝牙')
    expect(log).toHaveBeenCalledWith('system', '设备选择器 · iPhone 兼容 · NetworkError · off')
    expect(JSON.stringify(log.mock.calls)).not.toContain('internal identity')

    mock.transport.select.mockRejectedValueOnce(new DOMException('Bluetooth permission denied', 'NotAllowedError'))
    await connection.connect('bfg-filtered')
    expect(connection.data.message).toContain('系统蓝牙权限')
    expect(log).toHaveBeenCalledWith('system', '设备选择器 · 仅 BFG 服务 · NotAllowedError · permission')
  })

  it('将选中后的 GATT 失败与选择器失败分开', async () => {
    const mock = mockGatt()
    const log = vi.fn()
    const connection = createConnection(mock.transport, log)
    mock.transport.connect.mockRejectedValueOnce(new DOMException('Unsupported GATT', 'NotSupportedError'))
    await connection.connect('ninebot')
    expect(connection.data.state).toBe('error')
    expect(connection.data.message).toContain('已选中设备')
    expect(log).toHaveBeenCalledWith('system', '设备已选中 · 九号筛选')
    expect(log).toHaveBeenCalledWith('system', 'GATT 连接失败 · NotSupportedError · unsupported')
  })
})
