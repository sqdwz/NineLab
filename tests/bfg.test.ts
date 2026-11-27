import { describe, expect, it, vi } from 'vitest'
import { gatt } from '../src/bluetooth/transport'
import type { GattTransport } from '../src/bluetooth/transport'
import { createConnection } from '../src/stores/connection'
import { BfgCipher, bfgBootstrapMask, deviceKeyPart, joinBytes, openBootstrap, sealBootstrap } from '../src/protocol/bfg-crypto'
import { parseBfgKey } from '../src/protocol/bfg-session'
import type { OpenBfgChannel } from '../src/protocol/bfg-session'

const deviceName = 'NINELAB_TEST_01'
const serial = new TextEncoder().encode('SIMULATED12345')
const initialKey = '00112233445566778899aabbccddeeff'
const challenge = Uint8Array.from(Buffer.from('01020304050607080900010203040506', 'hex'))
const bytes = (value: string) => Uint8Array.from(Buffer.from(value, 'hex'))

function response(source: number, command: number, status: number, data: Uint8Array = new Uint8Array()) {
  return joinBytes(Uint8Array.of(0x5a, 0xa5, data.length, source, 0x3e, command, status), data)
}

function mockBfg(options: { stored: boolean; reject?: boolean; missing?: boolean }) {
  let key = options.stored ? parseBfgKey(initialKey) : undefined
  let approve: (() => Promise<void>) | undefined
  let notificationsClosed = false
  const commands: number[] = []
  let ready = false
  let connected = false

  const openBfgChannel: OpenBfgChannel = async (notify) => {
    notificationsClosed = false
    ready = false
    const mask = await bfgBootstrapMask(deviceName)
    const pairingCipher = await BfgCipher.create(deviceKeyPart(deviceName, true), challenge)
    function deliver(frame: Uint8Array) {
      if (notificationsClosed) return
      notify(frame.slice(0, 2))
      notify(frame.slice(2, 11))
      notify(frame.slice(11))
    }
    return {
      async send(wire) {
        const counter = wire.at(-2)! * 256 + wire.at(-1)!
        if (!counter) {
          const request = openBootstrap(wire, mask)
          commands.push(request[5]!)
          deliver(sealBootstrap(response(4, 0x5b, key ? 1 : 0, joinBytes(challenge, serial)), mask))
          return
        }
        if (!key) {
          const { plain } = await pairingCipher.open(wire)
          commands.push(plain[5]!)
          if (plain[5] !== 0x5c || plain[2] !== 32) throw new Error('unexpected enrollment')
          const newKey = plain.slice(7, 23)
          deliver(await pairingCipher.seal(counter + 1, response(4, 0x5c, 0)))
          approve = async () => {
            const accepted = !options.reject
            if (accepted) key = newKey
            const packet = await pairingCipher.seal(counter + 2, response(4, 0x5c, accepted ? 1 : 2))
            deliver(packet)
          }
          return
        }
        const cipher = await BfgCipher.create(key, challenge)
        const { plain } = await cipher.open(wire)
        commands.push(plain[5]!)
        if (!ready) {
          if (plain[5] !== 0x5d || !Buffer.from(plain.slice(7)).equals(Buffer.from(serial))) throw new Error('auth was not sent')
          ready = true
          deliver(await cipher.seal(counter + 1, response(4, 0x5d, 1)))
          return
        }
        if (plain[5] !== 1) throw new Error('unexpected operation after auth')
        if (options.missing && plain[4] === 1 && plain[6] === 0x44) return
        let data = plain[7] === 1 ? [56] : [56, 0]
        if (plain[4] === 1 && plain[6] === 0xb1) data = [0xdc, 0x1c]
        if (plain[4] === 1 && plain[6] === 0xd1) data = [0x64, 0x02]
        deliver(await cipher.seal(counter + 1, response(plain[4]!, 4, plain[6]!, Uint8Array.from(data))))
      },
      close() { notificationsClosed = true },
    }
  }
  const transport: GattTransport = {
    name: deviceName, selected: true, get connected() { return connected },
    onDisconnect: undefined,
    select: async () => {},
    connect: async () => { connected = true },
    disconnect: () => { connected = false },
    openBfgChannel,
    discover: async () => [{ uuid: gatt.uart, characteristics: [
      { uuid: gatt.uartWrite, properties: ['write'] },
      { uuid: gatt.uartNotify, properties: ['notify'] },
    ] }],
    read: async () => { throw new Error('unexpected standard read') },
    subscribe: async () => { throw new Error('unexpected standard subscription') },
  }
  const log = vi.fn()
  const connection = createConnection(transport, log, () => false)
  return { connection, log, commands, approve: () => approve?.(), awaiting: () => Boolean(approve),
    closed: () => notificationsClosed, drop: () => { connected = false; transport.onDisconnect?.() } }
}

describe('BFG 独立加密实现', () => {
  it('符合由 MIT 参考实现生成的合成向量并拒绝损坏消息', async () => {
    const mask = await bfgBootstrapMask(deviceName)
    const bootstrap = bytes('5aa5003e045b00')
    const mixed = sealBootstrap(bootstrap, mask)
    expect(mixed).toEqual(bytes('5aa5003a2afa1f000062ff0000'))
    expect(openBootstrap(mixed, mask)).toEqual(bootstrap)
    mixed[5] = mixed[5]! ^ 1
    expect(() => openBootstrap(mixed, mask)).toThrow('校验失败')

    const cipher = await BfgCipher.create(parseBfgKey(initialKey), challenge)
    const plain = bytes('5aa5013e10010201')
    const wire = await cipher.seal(3, plain)
    expect(wire).toEqual(bytes('5aa501c5372447409e8512050003'))
    await expect(cipher.open(wire)).resolves.toEqual({ counter: 3, plain })
    wire[9] = wire[9]! ^ 1
    await expect(cipher.open(wire)).rejects.toThrow('消息认证码')
  })
})

describe('车辆配对和只读会话', () => {
  it('生成密钥后等待车端确认，成功认证后读取分片通知', async () => {
    const { connection, commands, awaiting, approve, log } = mockBfg({ stored: false })
    await connection.connect('ninebot')
    expect(connection.data.bfgAvailable).toBe(true)
    expect(connection.data.standardAvailable).toBe(false)
    await connection.read()
    expect(commands).toEqual([])

    const pending = connection.authorize({ pair: true })
    await vi.waitFor(() => expect(awaiting()).toBe(true))
    expect(connection.data.auth).toBe('confirming')
    const key = connection.revealKey()
    expect(key).toMatch(/^[0-9A-F]{32}$/)
    expect(commands).toEqual([0x5b, 0x5c])
    await approve()
    await pending
    expect(connection.data.auth).toBe('ready')
    await connection.read()
    expect(connection.data.readings.voltage).toMatchObject({ value: 73.88, origin: 'live' })
    expect(connection.data.readings.meterSoc?.value).toBe(56)
    expect(connection.data.readings.firmwareColor?.value).toBe('2.6.4')
    expect(connection.data.readings.serial).toMatchObject({ value: 'SIMULATED12345', origin: 'live' })
    expect(connection.data.readings.serial?.raw).toBeUndefined()
    expect(commands.slice(0, 3)).toEqual([0x5b, 0x5c, 0x5d])
    expect(new Set(commands.slice(3))).toEqual(new Set([1]))
    const serialized = JSON.stringify([connection.data, log.mock.calls])
    expect(serialized).not.toContain(key)
    expect(JSON.stringify(log.mock.calls)).not.toContain('SIMULATED12345')
    connection.disconnect()
    expect(connection.data.readings.serial).toBeUndefined()
    connection.forgetKey()
    expect(connection.revealKey()).toBe('')
  })

  it('发现已经配对时只允许现有密钥登录', async () => {
    const { connection, commands } = mockBfg({ stored: true })
    await connection.connect('ninebot')
    await connection.authorize({ pair: true })
    expect(connection.data.auth).toBe('key-required')
    expect(commands).toEqual([0x5b])
    expect(connection.revealKey()).toBe('')
    await connection.authorize({ key: initialKey })
    expect(connection.data.auth).toBe('ready')
    expect(commands).toEqual([0x5b, 0x5b, 0x5d])
  })

  it('错误密钥认证失败且不会回退到重新配对', async () => {
    const { connection, commands, closed } = mockBfg({ stored: true })
    await connection.connect('ninebot')
    await connection.authorize({ key: 'abcdefabcdefabcdefabcdefabcdefab' })
    expect(connection.data.auth).toBe('failed')
    expect(connection.data.readings.serial).toBeUndefined()
    expect(closed()).toBe(true)
    expect(commands).toEqual([0x5b])
    expect(connection.revealKey()).toBe('')
  })

  it('配对被拒绝时停止，结果可在页面内核对且不重写密钥', async () => {
    const { connection, commands, approve, awaiting, closed } = mockBfg({ stored: false, reject: true })
    await connection.connect('ninebot')
    const pending = connection.authorize({ pair: true })
    await vi.waitFor(() => expect(awaiting()).toBe(true))
    await approve()
    await pending
    expect(connection.data.auth).toBe('failed')
    expect(closed()).toBe(true)
    await connection.authorize({ pair: true })
    expect(commands).toEqual([0x5b, 0x5c])
  })

  it('车端确认前断线时不继续鉴权', async () => {
    const { connection, commands, approve, awaiting, drop, closed } = mockBfg({ stored: false })
    await connection.connect('ninebot')
    const pending = connection.authorize({ pair: true })
    await vi.waitFor(() => expect(awaiting()).toBe(true))
    drop()
    await approve()
    await pending
    expect(connection.data.state).toBe('lost')
    expect(connection.data.auth).toBe('idle')
    expect(closed()).toBe(true)
    expect(commands).toEqual([0x5b, 0x5c])
  })

  it('一个字段无响应仍读取其他字段，并跳过本会话已超时的字段', async () => {
    const device = { stored: true, missing: false }
    const { connection, commands } = mockBfg(device)
    await connection.connect('ninebot')
    await connection.authorize({ key: initialKey })
    const beforeReading = commands.length
    await connection.read()
    const fieldCount = commands.length - beforeReading
    expect(connection.data.readings.remainingCapacity).toMatchObject({ value: 0.056, origin: 'live' })
    device.missing = true
    await connection.read()
    expect(connection.data.auth).toBe('ready')
    expect(connection.data.readings.remainingCapacity).toMatchObject({ value: null, origin: 'failed' })
    expect(connection.data.readings.firmwareColor?.value).toBe('2.6.4')
    const previousCount = commands.length
    await connection.read()
    expect(commands.length - previousCount).toBe(fieldCount - 1)
  })
})
