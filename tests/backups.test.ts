import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createBackup, listBackups, saveBackup, validateBackup } from '../src/storage/backups'
import { runDemoCalibration } from '../src/calibration/calibration'
import type { MeterSnapshot } from '../src/calibration/calibration'

const original: MeterSnapshot = {
  identity: { serial: 'NINELAB-DEMO-01', model: 'NineLab 演示台', firmware: { meter: 'x', dashboard: 'x', center: 'x' } },
  profile: 0, capacityMah: 24000, profileRaw: '00', capacityRaw: 'C0 5D',
}
const target: MeterSnapshot = { ...original, profile: 1, capacityMah: 28000, profileRaw: '01', capacityRaw: '60 6D' }
let current: MeterSnapshot
const write = vi.fn(async () => { current = target })
const backup = vi.fn(async () => {})
const input = () => ({
  port: { read: async () => current, write }, expected: original,
  target, confirmed: true, backup, active: () => true,
})

beforeEach(() => { current = original; vi.resetAllMocks() })

describe('本地备份', () => {
  it('可验证 JSON 与乱序键，保存不覆盖', async () => {
    const record = await createBackup(original)
    await expect(validateBackup(JSON.parse(JSON.stringify(record)))).resolves.toEqual(record)
    await saveBackup(record)
    await expect(saveBackup(record)).rejects.toMatchObject({ name: 'ConstraintError' })
    expect(await listBackups()).toContainEqual(record)
  })
  it('拒绝改过时间或原始参数的文件', async () => {
    const record = await createBackup(original)
    await expect(validateBackup({ ...record, createdAt: '2000-01-01' })).rejects.toThrow('SHA-256')
    await expect(validateBackup({ ...record, snapshot: { ...original, capacityRaw: 'FF FF' } })).rejects.toThrow('不受支持')
  })
})

describe('演示校准流程', () => {
  it('先备份，再写入，只在匹配回读时给成功状态', async () => {
    const result = await runDemoCalibration(input())
    expect(result.status).toBe('verified')
    expect(backup).toHaveBeenCalledWith(original)
    expect(write).toHaveBeenCalledTimes(1)
    expect(backup.mock.invocationCallOrder[0]).toBeLessThan(write.mock.invocationCallOrder[0]!)
  })
  it('备份失败、固件变化或缺少确认时阻止写入', async () => {
    backup.mockRejectedValueOnce(new Error('本地存储满'))
    await expect(runDemoCalibration(input())).rejects.toThrow('本地存储满')
    current = { ...original, identity: { ...original.identity, firmware: { ...original.identity.firmware, meter: 'y' } } }
    await expect(runDemoCalibration(input())).rejects.toThrow('身份')
    await expect(runDemoCalibration({ ...input(), confirmed: false })).rejects.toThrow('条件')
    expect(write).not.toHaveBeenCalled()
  })
  it('已一致时不产生校准写入', async () => {
    expect((await runDemoCalibration({ ...input(), target: original })).status).toBe('unchanged')
    expect(write).not.toHaveBeenCalled()
    expect(backup).not.toHaveBeenCalled()
  })
  it('回读不一致或写入报错，结果未确认且只尝试一次', async () => {
    write.mockImplementationOnce(async () => {}).mockRejectedValueOnce(new Error('timeout'))
    expect((await runDemoCalibration(input())).status).toBe('uncertain')
    expect((await runDemoCalibration(input())).status).toBe('uncertain')
    expect(write).toHaveBeenCalledTimes(2)
  })
})
