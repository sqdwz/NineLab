import type { Reading } from '../domain'
import { hexBytes, hexNumber, registerClues } from './registers'

export interface ReadReply {
  module: number
  register: number
  payload: Uint8Array
}

// Accepts normalized plaintext produced by a simulator or a verified future adapter.
export function decodeReply(bytes: Uint8Array): ReadReply {
  const [first, second, length, module, receiver, operation, register] = bytes
  if (first !== 0x5a || second !== 0xa5 || receiver !== 0x3e || operation !== 4 ||
      length === undefined || bytes.length !== length + 7 || module === undefined || register === undefined) {
    throw new Error('明文响应帧格式不符')
  }
  return { module, register, payload: bytes.slice(7) }
}

export class ReplyBuffer {
  private pending: Uint8Array<ArrayBuffer> = new Uint8Array(0)

  push(chunk: Uint8Array): ReadReply[] {
    if (this.pending.length + chunk.length > 1024) {
      this.pending = new Uint8Array(0)
      throw new Error('响应缓冲区超限')
    }
    const bytes = new Uint8Array(this.pending.length + chunk.length)
    bytes.set(this.pending)
    bytes.set(chunk, this.pending.length)
    const replies: ReadReply[] = []
    let start = 0
    while (bytes.length - start >= 3) {
      if (bytes[start] !== 0x5a || bytes[start + 1] !== 0xa5) {
        start++
        continue
      }
      const end = start + 7 + bytes[start + 2]!
      if (end > bytes.length) break
      replies.push(decodeReply(bytes.subarray(start, end)))
      start = end
    }
    this.pending = bytes.slice(start)
    return replies
  }
}

export function interpretReply(reply: ReadReply, time: string) {
  const clue = registerClues.find((item) => item.module === reply.module && item.register === reply.register)
  if (!clue || reply.payload.length !== clue.width) throw new Error('寄存器或数据长度不匹配')
  const raw = new DataView(reply.payload.buffer, reply.payload.byteOffset, clue.width)
  const integer = clue.width === 1 ? raw.getUint8(0) : raw.getUint16(0, true)
  let value: string | number = clue.scale === null ? integer : Number((integer * clue.scale).toFixed(3))
  if (clue.format === 'firmware') value = [8, 4, 0].map((shift) => (integer >> shift) & 15).join('.')
  if (clue.format === 'hex') value = hexNumber(integer, clue.width * 2)
  const reading: Reading = {
    value, time, origin: 'candidate', source: hexNumber(reply.module) + ' / ' + hexNumber(reply.register),
    raw: hexBytes(reply.payload),
  }
  return { field: clue.field, reading }
}
