export type FieldId = 'model' | 'serial' | 'firmwareDashboard' | 'firmwareCenter' | 'firmwareMeter'
  | 'batteryType' | 'voltage' | 'current' | 'power' | 'temperature' | 'dashboardSoc' | 'meterSoc'
  | 'remainingCapacity' | 'configuredCapacity' | 'profile' | 'dashboardEnergy' | 'dashboardConfig'
  | 'standardSoc' | 'bleFirmware'

export type Origin = 'live' | 'manual' | 'calculated' | 'demo' | 'candidate' | 'failed' | 'unsupported'

export interface Reading {
  value: string | number | null
  origin: Origin
  source: string
  time: string
  raw?: string
  detail?: string
}

export type Readings = Partial<Record<FieldId, Reading>>

export interface CharacteristicInfo {
  uuid: string
  properties: string[]
}

export interface ServiceInfo {
  uuid: string
  characteristics: CharacteristicInfo[]
  error?: string
}

export type Direction = 'out' | 'in' | 'system'
export interface LogEntry {
  id: number
  time: string
  mode: 'live' | 'demo'
  direction: Direction
  message: string
  raw?: string
  decoded?: string
  duration?: number
  check?: string
}

export interface VehicleIdentity {
  serial: string
  model: string
  firmware: Record<string, string>
}

export const fieldLabels: Record<FieldId, string> = {
  model: '车辆型号', serial: '设备序列号', firmwareDashboard: '仪表固件',
  firmwareCenter: '中控固件', firmwareMeter: '计量模块固件', batteryType: '电池类型',
  voltage: '电池电压', current: '电池电流', power: '实时功率', temperature: '电池温度',
  dashboardSoc: '仪表 SOC', meterSoc: '计量模块 SOC', remainingCapacity: '剩余容量',
  configuredCapacity: '配置容量', profile: '容量档位', dashboardEnergy: '仪表能量参数',
  dashboardConfig: '仪表配置', standardSoc: '标准 BLE 电量', bleFirmware: 'BLE 设备固件',
}

export const fieldUnits: Partial<Record<FieldId, string>> = {
  voltage: 'V', current: 'A', power: 'W', temperature: '°C',
  dashboardSoc: '%', meterSoc: '%', standardSoc: '%', remainingCapacity: 'Ah', configuredCapacity: 'Ah',
}

export const originLabels: Record<Origin, string> = {
  live: '设备实读', manual: '手动录入', calculated: '计算值', demo: '演示值',
  candidate: '待验证', failed: '读取失败', unsupported: '暂不支持',
}
