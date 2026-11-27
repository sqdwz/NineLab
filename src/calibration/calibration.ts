import type { VehicleIdentity } from '../domain'

export const demoProfiles = [
  { profile: 0, capacityMah: 24000 },
  { profile: 1, capacityMah: 28000 },
  { profile: 2, capacityMah: 30000 },
] as const

export interface MeterParameters { profile: number; capacityMah: number }
export interface MeterSnapshot extends MeterParameters {
  identity: VehicleIdentity
  profileRaw: string
  capacityRaw: string
}

export interface CalibrationPort {
  read(): Promise<MeterSnapshot>
  write(target: MeterParameters): Promise<void>
}
export type CalibrationResult = { status: 'verified' | 'unchanged' | 'uncertain'; message: string }

export function allowedDemoTarget(target: MeterParameters) {
  return demoProfiles.some((entry) => entry.profile === target.profile && entry.capacityMah === target.capacityMah)
}

export function sameIdentity(left: VehicleIdentity, right: VehicleIdentity) {
  const keys = Object.keys(left.firmware)
  return left.serial === right.serial && left.model === right.model &&
    keys.length === Object.keys(right.firmware).length && keys.every((key) =>
      Object.hasOwn(right.firmware, key) && left.firmware[key] === right.firmware[key])
}

export function eligibleDemo(snapshot: MeterSnapshot) {
  return snapshot.identity.serial === 'NINELAB-DEMO-01' && snapshot.identity.model === 'NineLab 演示台' &&
    allowedDemoTarget(snapshot) &&
    snapshot.profileRaw === snapshot.profile.toString(16).padStart(2, '0').toUpperCase() &&
    snapshot.capacityRaw === [snapshot.capacityMah & 255, snapshot.capacityMah >> 8]
      .map((byte) => byte.toString(16).padStart(2, '0').toUpperCase()).join(' ')
}

function matches(left: MeterParameters, right: MeterParameters) {
  return left.profile === right.profile && left.capacityMah === right.capacityMah
}

export async function runDemoCalibration(input: {
  port: CalibrationPort
  expected: MeterSnapshot
  target: MeterParameters
  confirmed: boolean
  backup: (current: MeterSnapshot) => Promise<void>
  active: () => boolean
}): Promise<CalibrationResult> {
  if (!input.confirmed || !input.active() || !allowedDemoTarget(input.target)) {
    throw new Error('演示校准条件不足')
  }
  const current = await input.port.read()
  if (!eligibleDemo(current) || !sameIdentity(input.expected.identity, current.identity) ||
      !matches(input.expected, current) || !input.active()) {
    throw new Error('设备身份或当前参数变化，请重新核对')
  }
  if (matches(current, input.target)) return { status: 'unchanged', message: '演示参数与目标一致。' }
  await input.backup(current)
  if (!input.active()) throw new Error('演示会话已结束')
  try {
    await input.port.write(input.target)
    if (input.active()) {
      const after = await input.port.read()
      if (input.active() && eligibleDemo(after) && sameIdentity(current.identity, after.identity) && matches(after, input.target)) {
        return { status: 'verified', message: '演示操作已完成，回读与目标一致。' }
      }
    }
  } catch {
    // Once write has been invoked, the outcome is uncertain until a matching readback.
  }
  return { status: 'uncertain', message: '演示写入结果未确认，后续步骤已停止。' }
}
