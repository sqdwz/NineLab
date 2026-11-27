import type { FieldId } from '../domain'

export interface RegisterClue {
  field: FieldId
  module: number
  register: number
  width: 1 | 2
  scale: number | null
  format?: 'firmware' | 'hex'
  status: 'candidate'
}

export const registerClues: readonly RegisterClue[] = [
  { field: 'voltage', module: 1, register: 0xb1, width: 2, scale: 0.01, status: 'candidate' },
  { field: 'remainingCapacity', module: 1, register: 0x44, width: 2, scale: 0.001, status: 'candidate' },
  { field: 'dashboardSoc', module: 1, register: 0xb5, width: 2, scale: 1, status: 'candidate' },
  { field: 'dashboardEnergy', module: 1, register: 0x1e, width: 2, scale: null, status: 'candidate' },
  { field: 'dashboardConfig', module: 1, register: 0x92, width: 2, scale: null, format: 'hex', status: 'candidate' },
  { field: 'profile', module: 0x10, register: 0, width: 1, scale: null, format: 'hex', status: 'candidate' },
  { field: 'meterSoc', module: 0x10, register: 2, width: 1, scale: 1, status: 'candidate' },
  { field: 'configuredCapacity', module: 0x10, register: 0x1c, width: 2, scale: 0.001, status: 'candidate' },
  { field: 'firmwareDashboard', module: 1, register: 0x1a, width: 2, scale: null, format: 'firmware', status: 'candidate' },
  { field: 'firmwareMeter', module: 1, register: 0x3d, width: 2, scale: null, format: 'firmware', status: 'candidate' },
  { field: 'firmwareCenter', module: 9, register: 2, width: 2, scale: null, format: 'firmware', status: 'candidate' },
]

export function hexNumber(value: number, width = 2) {
  return '0x' + value.toString(16).padStart(width, '0').toUpperCase()
}

export function hexBytes(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0').toUpperCase()).join(' ')
}
