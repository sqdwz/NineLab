import type { FieldId, Reading } from '../domain'
import { BfgCipher, BfgError, bfgBootstrapMask, deviceKeyPart, joinBytes, openBootstrap, sealBootstrap } from './bfg-crypto'
import { decodeReply, interpretReply } from './codec'
import { hexNumber, registerClues } from './registers'

export interface BfgChannel {
  send(bytes: Uint8Array): Promise<void>
  close(): void
}
export type OpenBfgChannel = (receive: (chunk: Uint8Array) => void) => Promise<BfgChannel>
export type AuthStage = 'checking' | 'confirming' | 'authenticating'
type Pairing = { kind: 'pair'; onKey: (key: Uint8Array) => void }
type ExistingKey = { kind: 'existing'; key: Uint8Array }
const bluetoothAddress = 4
const prepareCommand = 0x5b
const pairingCommand = 0x5c
const authCommand = 0x5d
const readCommand = 1

export class StoredBfgKey extends BfgError {
  constructor() { super('车辆已有配对密钥。请使用已有有效密钥认证。') }
}

type Pending = {
  resolve: (value: Uint8Array) => void
  reject: (reason: unknown) => void
  match: (plain: Uint8Array) => boolean
  cipher?: BfgCipher
  mask?: Uint8Array
}

export function parseBfgKey(value: string) {
  const compact = value.replace(/\s/g, '')
  if (!/^(?:[\da-f]{32}|[\da-f]{64})$/i.test(compact)) throw new BfgError('请输入 32 或 64 位十六进制密钥。')
  return Uint8Array.from(compact.slice(0, 32).match(/../g)!, (pair) => Number.parseInt(pair, 16))
}

function request(target: number, operation: number, index: number, payload: Uint8Array = new Uint8Array()) {
  return joinBytes(Uint8Array.of(0x5a, 0xa5, payload.length, 0x3e, target, operation, index), payload)
}

function matched(plain: Uint8Array, sender: number, command: number) {
  return plain.length === plain[2]! + 7 && plain[3] === sender && plain[4] === 0x3e && plain[5] === command
}

export class BfgSession {
  private channel: BfgChannel | undefined
  private pending: Pending | undefined
  private frameBuffer: Uint8Array<ArrayBuffer> = new Uint8Array(0)
  private receiving = Promise.resolve()
  private cipher: BfgCipher | undefined
  private counter = 2
  private lastCounter = 0
  private authorized = false
  private closed = false
  private unavailable = new Set<FieldId>()

  constructor(private readonly openChannel: OpenBfgChannel) {}

  close() {
    this.closed = true
    this.authorized = false
    this.pending?.reject(new DOMException('车辆会话已结束。', 'AbortError'))
    this.pending = undefined
    this.channel?.close()
    this.channel = undefined
    this.cipher = undefined
    this.frameBuffer.fill(0)
    this.frameBuffer = new Uint8Array(0)
  }

  private receive = (chunk: Uint8Array) => {
    const pending = this.pending
    if (!pending || this.closed) return
    this.receiving = this.receiving.then(async () => {
      if (pending !== this.pending || this.closed) return
      const data = joinBytes(this.frameBuffer, chunk)
      if (data.length > 2048) throw new BfgError('车辆通知长度异常。')
      let offset = 0
      while (data.length - offset > 2 && this.pending === pending && !this.closed) {
        if (data[offset] !== 0x5a || data[offset + 1] !== 0xa5) {
          offset++
          continue
        }
        const end = offset + data[offset + 2]! + 13
        if (end > data.length) break
        const wire = data.subarray(offset, end)
        offset = end
        let plain: Uint8Array
        if (pending.cipher) {
          const reply = await pending.cipher.open(wire)
          if (pending !== this.pending || this.closed) return
          if (reply.counter <= this.lastCounter) continue
          this.lastCounter = reply.counter
          this.counter = Math.max(this.counter, reply.counter + 1)
          plain = reply.plain
        } else {
          plain = openBootstrap(wire, pending.mask!)
        }
        if (pending.match(plain)) {
          this.pending = undefined
          this.frameBuffer = new Uint8Array(0)
          pending.resolve(plain)
          return
        }
        plain.fill(0)
      }
      if (pending === this.pending && !this.closed) this.frameBuffer = data.slice(offset)
    }).catch((error: unknown) => {
      if (this.pending === pending) pending.reject(error)
    })
  }

  private async exchange(
    body: Uint8Array,
    match: (plain: Uint8Array) => boolean,
    options: { mask?: Uint8Array; cipher?: BfgCipher; timeout: number },
  ) {
    const channel = this.channel
    if (this.pending || this.closed || !channel) throw new BfgError('车辆会话当前不可用。')
    const wire = options.cipher ? await options.cipher.seal(this.counter++, body) : sealBootstrap(body, options.mask!)
    if (this.closed) throw new DOMException('车辆会话已结束。', 'AbortError')
    let timeout: ReturnType<typeof setTimeout> | undefined
    let target: Pending | undefined
    let sent = false
    try {
      const response = new Promise<Uint8Array>((resolve, reject) => {
        target = { resolve, reject, match, cipher: options.cipher, mask: options.mask }
        this.pending = target
        this.frameBuffer = new Uint8Array(0)
        timeout = setTimeout(() => reject(new DOMException('车辆响应超时。', 'TimeoutError')), options.timeout)
      })
      const writing = channel.send(wire).then(() => { sent = true })
      const [reply] = await Promise.all([response, writing])
      return reply
    } catch (error) {
      if (!sent && error instanceof DOMException && error.name === 'TimeoutError') {
        throw new BfgError('蓝牙发送超时。')
      }
      throw error
    } finally {
      if (this.pending === target) this.pending = undefined
      clearTimeout(timeout)
      wire.fill(0)
    }
  }

  async authorize(name: string, action: Pairing | ExistingKey, stage: (value: AuthStage) => void) {
    if (this.closed || this.channel) throw new BfgError('车辆会话当前不可用。')
    stage('checking')
    const mask = await bfgBootstrapMask(name)
    let material: Uint8Array | undefined
    let challenge: Uint8Array | undefined
    let serial: Uint8Array | undefined
    let proof: Uint8Array | undefined
    try {
      if (this.closed) throw new DOMException('车辆会话已结束。', 'AbortError')
      const channel = await this.openChannel(this.receive)
      if (this.closed) {
        channel.close()
        throw new DOMException('车辆会话已结束。', 'AbortError')
      }
      this.channel = channel
      const hello = await this.exchange(request(bluetoothAddress, prepareCommand, 0),
        (plain) => matched(plain, bluetoothAddress, prepareCommand) && plain[2] === 30, { mask, timeout: 6500 })
      const hasKey = hello[6] !== 0
      challenge = hello.slice(7, 23)
      serial = hello.slice(23, 37)
      hello.fill(0)
      const vehicleSerial = new TextDecoder().decode(serial)
      if (!/^[A-Za-z0-9]{14}$/.test(vehicleSerial)) throw new BfgError('车辆身份响应格式不符。')

      if (action.kind === 'pair') {
        if (hasKey) throw new StoredBfgKey()
        material = crypto.getRandomValues(new Uint8Array(32))
        const newKey = material.subarray(0, 16)
        const pairingCipher = await BfgCipher.create(deviceKeyPart(name, true), challenge)
        if (this.closed) throw new DOMException('车辆会话已结束。', 'AbortError')
        stage('confirming')
        action.onKey(new Uint8Array(newKey))
        const enrollment = request(bluetoothAddress, pairingCommand, 0, material)
        try {
          const reply = await this.exchange(enrollment, (plain) =>
            matched(plain, bluetoothAddress, pairingCommand) && plain[6] !== 0, { cipher: pairingCipher, timeout: 60000 })
          if (reply[6] !== 1) throw new BfgError('车端未接受配对请求。')
        } finally {
          enrollment.fill(0)
        }
        this.cipher = await BfgCipher.create(newKey, challenge)
      } else {
        if (!hasKey) throw new BfgError('车辆未保存配对密钥，请使用临时密钥配对。')
        this.cipher = await BfgCipher.create(action.key, challenge)
      }
      if (this.closed) {
        this.cipher = undefined
        throw new DOMException('车辆会话已结束。', 'AbortError')
      }
      stage('authenticating')
      this.lastCounter = 0
      proof = request(bluetoothAddress, authCommand, 0, serial)
      const result = await this.exchange(proof, (plain) => matched(plain, bluetoothAddress, authCommand),
        { cipher: this.cipher, timeout: 6500 })
      const accepted = result[6] === 1
      result.fill(0)
      if (!accepted) throw new BfgError('车辆拒绝了密钥认证。')
      this.authorized = true
      return vehicleSerial
    } catch (error) {
      this.close()
      throw error
    } finally {
      mask.fill(0)
      proof?.fill(0)
      material?.fill(0)
      challenge?.fill(0)
      serial?.fill(0)
    }
  }

  async read(publish: (field: FieldId, reading: Reading) => void, trace: (message: string) => void) {
    const cipher = this.cipher
    if (!cipher || !this.authorized || this.closed) throw new BfgError('车辆认证尚未完成。')
    let successes = 0
    for (const item of registerClues) {
      if (this.unavailable.has(item.field)) continue
      const address = hexNumber(item.module) + ' / ' + hexNumber(item.register)
      const source = '九号 BFG · ' + address
      try {
        const reply = await this.exchange(request(item.module, readCommand, item.register, Uint8Array.of(item.width)),
          (plain) => matched(plain, item.module, 4) && plain[6] === item.register && plain[2] === item.width,
          { cipher, timeout: 1800 })
        const { reading } = interpretReply(decodeReply(reply), new Date().toISOString())
        if ((item.field === 'dashboardSoc' || item.field === 'meterSoc') && Number(reading.value) > 100) {
          publish(item.field, { value: null, time: reading.time, source, origin: 'failed', detail: '电量响应超出可用范围' })
          trace('BFG 电量响应超出可用范围。')
          continue
        }
        publish(item.field, { ...reading, origin: 'live', source, provisional: true,
          detail: '已校验车辆响应，字段含义仍需与对应车型核对。' })
        trace('BFG 已读取 ' + address)
        successes++
      } catch (error) {
        if (!(error instanceof DOMException) || error.name !== 'TimeoutError') throw error
        this.unavailable.add(item.field)
        publish(item.field, { value: null, time: new Date().toISOString(), source, origin: 'failed', detail: '车辆未应答此字段' })
        trace('BFG 读取无回应 ' + address)
      }
    }
    return successes
  }
}
