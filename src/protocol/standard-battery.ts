import type { FieldId, Reading } from '../domain'
import { gatt } from '../bluetooth/transport'
import { hexBytes } from './registers'

type StandardField = Extract<FieldId, 'standardSoc' | 'model' | 'serial' | 'bleFirmware'>
export const standardFields: ReadonlyArray<{ field: StandardField; service: string; characteristic: string }> = [
  { field: 'standardSoc', service: gatt.battery, characteristic: gatt.level },
  { field: 'model', service: gatt.device, characteristic: gatt.model },
  { field: 'serial', service: gatt.device, characteristic: gatt.serial },
  { field: 'bleFirmware', service: gatt.device, characteristic: gatt.firmware },
]

export function decodeStandard(field: StandardField, view: DataView, time: string): Reading {
  const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
  if (field === 'standardSoc') {
    if (bytes.length !== 1 || bytes[0]! > 100) throw new Error('标准 Battery Level 超出允许范围')
    return { value: bytes[0]!, origin: 'live', time, source: 'BLE Battery Service · 2A19', raw: hexBytes(bytes) }
  }
  const value = new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/\0+$/, '').trim()
  if (!value || value.length > 128 || /[\u0000-\u001f\u007f]/u.test(value)) throw new Error('设备信息格式不符')
  return { value, origin: 'live', time, source: 'BLE Device Information' }
}
