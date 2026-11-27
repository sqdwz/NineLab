import { describe, expect, it } from 'vitest'
import { decodeReply, interpretReply, ReplyBuffer } from '../src/protocol/codec'
import { decodeStandard } from '../src/protocol/standard-battery'
import { csv } from '../src/storage/export'

const voltage = Uint8Array.of(0x5a, 0xa5, 2, 1, 0x3e, 4, 0xb1, 0xdc, 0x1c)
const level = Uint8Array.of(0x5a, 0xa5, 1, 0x10, 0x3e, 4, 2, 61)
const time = '2026-11-27T00:00:00.000Z'

describe('候选明文解析', () => {
  it('电压使用小端和比例，并保留来源和原始字节', () => {
    expect(interpretReply(decodeReply(voltage), time)).toEqual({
      field: 'voltage', reading: { value: 73.88, origin: 'candidate', time, source: '0x01 / 0xB1', raw: 'DC 1C' },
    })
  })
  it('重组分片和粘帧，并跳过头部杂字节', () => {
    const parser = new ReplyBuffer()
    expect(parser.push(Uint8Array.of(0xff, voltage[0]!))).toEqual([])
    const frames = parser.push(Uint8Array.from([...voltage.slice(1), ...level]))
    expect(frames).toHaveLength(2)
    expect(interpretReply(frames[1]!, time).reading.value).toBe(61)
  })
  it('拒绝错误长度、方向及命令', () => {
    expect(() => decodeReply(voltage.slice(0, -1))).toThrow('格式')
    expect(() => decodeReply(Uint8Array.from(voltage, (n, i) => i === 5 ? 2 : n))).toThrow('格式')
    expect(() => interpretReply({ module: 1, register: 0xff, payload: Uint8Array.of(0) }, time)).toThrow('寄存器')
    expect(() => interpretReply({ module: 1, register: 0xb1, payload: Uint8Array.of(0) }, time)).toThrow('数据长度')
  })
  it('限制接收缓冲', () => {
    const parser = new ReplyBuffer()
    expect(() => parser.push(new Uint8Array(1025))).toThrow('缓冲区')
    expect(parser.push(level)).toHaveLength(1)
  })
})

describe('标准电量及导出格式', () => {
  it('支持 DataView 偏移和真实零值', () => {
    expect(decodeStandard('standardSoc', new DataView(Uint8Array.of(123, 0, 123).buffer, 1, 1), time).value).toBe(0)
  })
  it('拒绝不合法的字节和长度', () => {
    expect(() => decodeStandard('standardSoc', new DataView(Uint8Array.of(101).buffer), time)).toThrow('范围')
    expect(() => decodeStandard('standardSoc', new DataView(new ArrayBuffer(2)), time)).toThrow('范围')
  })
  it('序列号仅进入读数，不保留原始字节副本', () => {
    const sample = new TextEncoder().encode('TEST-SERIAL\0')
    expect(decodeStandard('serial', new DataView(sample.buffer), time)).toMatchObject({ value: 'TEST-SERIAL', origin: 'live' })
    expect(decodeStandard('serial', new DataView(sample.buffer), time).raw).toBeUndefined()
  })
  it('转义 CSV 特殊字符和文本公式，同时保留数字负值', () => {
    expect(csv([[' =ABC()', 'a"b', -3]])).toBe('\uFEFF"\' =ABC()","a""b","-3"')
  })
})
