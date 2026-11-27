// Encryption2 for the BFG Nordic UART profile, using browser Web Crypto.
export class BfgError extends Error {}

const blockSize = 16
const bfgParameter = new Uint8Array([
  0x97, 0xcf, 0xb8, 0x02, 0x84, 0x41, 0x43, 0xde, 0x56, 0x00, 0x2b, 0x3b, 0x34, 0x78, 0x0a, 0x5d,
])
const iv = new Uint8Array(blockSize)

export function joinBytes(...parts: Uint8Array[]) {
  const output = new Uint8Array(parts.reduce((size, part) => size + part.byteLength, 0))
  let offset = 0
  for (const part of parts) {
    output.set(part, offset)
    offset += part.byteLength
  }
  return output
}

function xor(data: Uint8Array, mask: Uint8Array) {
  return Uint8Array.from(data, (byte, i) => byte ^ mask[i]!)
}

async function makeKey(left: Uint8Array, right: Uint8Array) {
  const material = joinBytes(left, right)
  try {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-1', material))
    try {
      return await crypto.subtle.importKey('raw', digest.subarray(0, blockSize), 'AES-CBC', false, ['encrypt'])
    } finally {
      digest.fill(0)
    }
  } finally {
    material.fill(0)
  }
}

async function block(key: CryptoKey, data: Uint8Array<ArrayBuffer>) {
  // The first block of zero-IV CBC is the raw AES block used by the protocol.
  return new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, key, data)).slice(0, blockSize)
}

export function deviceKeyPart(name: string, tail = false) {
  if (!name || !/^[\x20-\x7e]+$/.test(name)) throw new BfgError('浏览器未提供此协议要求的蓝牙名称。')
  const bytes = new TextEncoder().encode(name)
  const result = new Uint8Array(blockSize)
  result.set(tail ? bytes.slice(-blockSize) : bytes.subarray(0, blockSize))
  return result
}

export async function bfgBootstrapMask(name: string) {
  return block(await makeKey(deviceKeyPart(name), bfgParameter), bfgParameter)
}

function checkValue(body: Uint8Array) {
  return (~body.reduce((total, byte) => total + byte, 0)) & 0xffff
}

export function sealBootstrap(plain: Uint8Array, mask: Uint8Array) {
  const body = plain.subarray(3)
  const check = checkValue(body)
  return joinBytes(plain.subarray(0, 3),
    Uint8Array.from(body, (value, i) => value ^ mask[i % blockSize]!),
    Uint8Array.of(0, 0, check & 255, check >> 8, 0, 0))
}

export function openBootstrap(wire: Uint8Array, mask: Uint8Array) {
  const body = Uint8Array.from(wire.subarray(3, -6), (value, i) => value ^ mask[i % blockSize]!)
  const footer = wire.subarray(-6)
  if (footer[4] !== 0 || footer[5] !== 0 || (footer[2]! | footer[3]! << 8) !== checkValue(body)) {
    throw new BfgError('车辆握手响应校验失败。')
  }
  return joinBytes(wire.subarray(0, 3), body)
}

export class BfgCipher {
  private constructor(private readonly key: CryptoKey, private readonly noncePrefix: Uint8Array<ArrayBuffer>) {}

  static async create(password: Uint8Array, challenge: Uint8Array) {
    if (password.length !== blockSize || challenge.length !== blockSize) throw new BfgError('无效的鉴权参数。')
    return new BfgCipher(await makeKey(password, challenge), new Uint8Array(challenge.subarray(0, 8)))
  }

  private input(counter: number, type: number, index: number) {
    const bytes = new Uint8Array(blockSize)
    bytes[0] = type
    new DataView(bytes.buffer).setUint16(3, counter)
    bytes.set(this.noncePrefix, 5)
    bytes[15] = index
    return bytes
  }

  private async crypt(counter: number, data: Uint8Array) {
    const output = new Uint8Array(data.length)
    for (let offset = 0; offset < data.length; offset += blockSize) {
      const stream = await block(this.key, this.input(counter, 1, offset / blockSize + 1))
      output.set(xor(data.subarray(offset, offset + blockSize), stream), offset)
    }
    return output
  }

  private async tag(counter: number, plain: Uint8Array) {
    const body = plain.subarray(3)
    let acc = await block(this.key, this.input(counter, 0x59, body.length))
    const padded = new Uint8Array(blockSize)
    padded.set(plain.subarray(0, 3))
    acc = await block(this.key, xor(acc, padded))
    for (let offset = 0; offset < body.length; offset += blockSize) {
      padded.fill(0)
      padded.set(body.subarray(offset, offset + blockSize))
      acc = await block(this.key, xor(acc, padded))
    }
    return xor(acc.subarray(0, 4), await block(this.key, this.input(counter, 1, 0)))
  }

  async seal(counter: number, plain: Uint8Array) {
    if (!Number.isInteger(counter) || counter < 1 || counter > 0xffff) throw new BfgError('会话计数器已用尽。')
    const [body, tag] = await Promise.all([this.crypt(counter, plain.subarray(3)), this.tag(counter, plain)])
    return joinBytes(plain.subarray(0, 3), body, tag, Uint8Array.of(counter >> 8, counter & 255))
  }

  async open(wire: Uint8Array) {
    const footer = wire.subarray(-6)
    const counter = footer[4]! << 8 | footer[5]!
    if (!counter) throw new BfgError('车辆返回了无效的会话计数器。')
    const plain = joinBytes(wire.subarray(0, 3), await this.crypt(counter, wire.subarray(3, -6)))
    const tag = await this.tag(counter, plain)
    let mismatch = 0
    for (let i = 0; i < tag.length; i++) mismatch |= tag[i]! ^ footer[i]!
    if (mismatch) throw new BfgError('车辆响应未通过消息认证码校验。')
    return { counter, plain }
  }
}
