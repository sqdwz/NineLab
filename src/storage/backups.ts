import type { MeterSnapshot } from '../calibration/calibration'
import { eligibleDemo } from '../calibration/calibration'

export interface Backup {
  schema: 1
  protocol: 'ninelab-demo-v1'
  id: string
  createdAt: string
  snapshot: MeterSnapshot
  integrity: string
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  const record = value as Record<string, unknown>
  return '{' + Object.keys(record).sort().map((key) => JSON.stringify(key) + ':' + canonical(record[key])).join(',') + '}'
}

async function checksum(record: Omit<Backup, 'integrity'>) {
  const bytes = new TextEncoder().encode(canonical(record))
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
    (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function createBackup(snapshot: MeterSnapshot): Promise<Backup> {
  if (!eligibleDemo(snapshot)) throw new Error('演示备份的车辆身份或参数不符')
  const record = {
    schema: 1 as const, protocol: 'ninelab-demo-v1' as const, id: crypto.randomUUID(),
    createdAt: new Date().toISOString(), snapshot: JSON.parse(JSON.stringify(snapshot)) as MeterSnapshot,
  }
  return { ...record, integrity: await checksum(record) }
}

export async function validateBackup(input: unknown): Promise<Backup> {
  if (!input || typeof input !== 'object') throw new Error('备份格式无效')
  const backup = input as Backup
  const snapshot = backup.snapshot
  if (Object.keys(backup).length !== 6 || backup.schema !== 1 || backup.protocol !== 'ninelab-demo-v1' ||
      typeof backup.id !== 'string' || !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/.test(backup.id) ||
      typeof backup.createdAt !== 'string' || !Number.isFinite(Date.parse(backup.createdAt)) ||
      typeof backup.integrity !== 'string' || !/^[\da-f]{64}$/.test(backup.integrity) ||
      !snapshot?.identity?.firmware || !eligibleDemo(snapshot) ||
      Object.keys(snapshot).length !== 5 || Object.keys(snapshot.identity).length !== 3 ||
      Object.keys(snapshot.identity.firmware).sort().join(',') !== 'center,dashboard,meter' ||
      Object.values(snapshot.identity.firmware).some((value) => typeof value !== 'string' || !value || value.length > 64)) {
    throw new Error('备份结构或协议不受支持')
  }
  const { integrity, ...record } = backup
  if (integrity !== await checksum(record)) throw new Error('备份 SHA-256 校验失败')
  return backup
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('ninelab', 1)
    open.onupgradeneeded = () => open.result.createObjectStore('backups', { keyPath: 'id' })
    open.onsuccess = () => resolve(open.result)
    open.onerror = () => reject(open.error)
    open.onblocked = () => reject(new Error('其他标签页正在占用备份数据库'))
  })
}

export async function saveBackup(backup: Backup) {
  const db = await openDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('backups', 'readwrite')
      tx.oncomplete = () => resolve()
      tx.onabort = () => reject(tx.error)
      tx.objectStore('backups').add(backup)
    })
  } finally {
    db.close()
  }
}

export async function listBackups() {
  const db = await openDatabase()
  try {
    return await new Promise<Backup[]>((resolve, reject) => {
      const request = db.transaction('backups', 'readonly').objectStore('backups').getAll()
      request.onsuccess = () => resolve((request.result as Backup[]).sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
      request.onerror = () => reject(request.error)
    })
  } finally {
    db.close()
  }
}
