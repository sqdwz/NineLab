<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { BatteryCharging, Bluetooth, Gauge, SlidersHorizontal, Terminal } from '@lucide/vue'
import ConnectionView from './views/ConnectionView.vue'
import ReaderView from './views/ReaderView.vue'
import CalibrationView from './views/CalibrationView.vue'
import DiagnosticView from './views/DiagnosticView.vue'
import { detectCapabilities } from './bluetooth/capabilities'
import { WebGattTransport } from './bluetooth/transport'
import { createConnection } from './stores/connection'
import { createDemo } from './stores/demo'
import { createBackup, listBackups, saveBackup, validateBackup } from './storage/backups'
import type { Backup } from './storage/backups'
import { runDemoCalibration, sameIdentity } from './calibration/calibration'
import type { MeterParameters } from './calibration/calibration'
import { csv, exportFile } from './storage/export'
import type { Direction, FieldId, LogEntry } from './domain'
import { fieldLabels, fieldUnits, originLabels } from './domain'

const pages = [
  { id: 'connection', label: '连接', icon: Bluetooth },
  { id: 'read', label: '读取', icon: Gauge },
  { id: 'calibration', label: '校准', icon: SlidersHorizontal },
  { id: 'diagnostic', label: '诊断', icon: Terminal },
] as const
type Page = typeof pages[number]['id']
const getPage = (): Page => pages.find(({ id }) => '#' + id === location.hash)?.id ?? 'connection'
const page = ref(getPage())
const demo = ref(false)
const capabilities = shallowRef(detectCapabilities())
const logs = shallowRef<LogEntry[]>([])
const backups = shallowRef<Backup[]>([])
const busy = ref(false)
const polling = ref(false)
const backupMessage = ref('')
const main = ref<HTMLElement>()
let logId = 0
let timer: ReturnType<typeof setInterval> | undefined

function record(mode: LogEntry['mode'], direction: Direction, message: string, details?: Partial<LogEntry>) {
  logs.value = [...logs.value.slice(-499), { ...details, id: ++logId, time: new Date().toISOString(), mode, direction, message }]
}

const live = createConnection(new WebGattTransport(), (...args) => record('live', ...args))
const simulator = createDemo((...args) => record('demo', ...args))
const readings = computed(() => demo.value ? simulator.readings.value : live.data.readings)
const connected = computed(() => ['connected', 'reading'].includes(live.data.state))
const activeLogs = computed(() => logs.value.filter((entry) => entry.mode === (demo.value ? 'demo' : 'live')))

function syncLocation() {
  page.value = getPage()
  window.scrollTo(0, 0)
}
function navigate(id: Page, keyboard = false) {
  if (page.value === id) return
  history.pushState(null, '', '#' + id)
  syncLocation()
  if (keyboard) main.value?.focus({ preventScroll: true })
}
function updateEnvironment() {
  capabilities.value = detectCapabilities()
  if (document.hidden) polling.value = false
}
function showDemo() {
  if (busy.value) return
  polling.value = false
  if (live.data.state !== 'idle') live.disconnect()
  demo.value = true
  simulator.refresh()
  record('demo', 'system', '演示会话已启动')
}
function disconnect() {
  polling.value = false
  if (demo.value) {
    if (!busy.value) demo.value = false
    return
  }
  live.disconnect()
}
function refresh() {
  if (busy.value) return
  if (demo.value) simulator.refresh()
  else void live.read()
}
function openReading() {
  navigate('read', true)
  if (demo.value || !Object.keys(readings.value).length) refresh()
}

watch(polling, (enabled) => {
  clearInterval(timer)
  if (enabled) {
    refresh()
    timer = setInterval(refresh, 10000)
  }
})
watch(page, (id) => { if (id !== 'read') polling.value = false })
watch(connected, (available) => { if (!available && !demo.value) polling.value = false })

async function refreshBackups() {
  backups.value = await listBackups()
}
async function withBackupOperation(operation: () => Promise<void>) {
  if (busy.value) return
  polling.value = false
  busy.value = true
  backupMessage.value = ''
  try {
    await operation()
  } catch (error) {
    backupMessage.value = error instanceof Error ? error.message : '备份或演示操作失败。'
  } finally {
    busy.value = false
  }
}
async function saveCurrent() {
  if (!demo.value) return
  await withBackupOperation(async () => {
    await saveBackup(await createBackup(simulator.snapshot.value))
    await refreshBackups()
    backupMessage.value = '当前演示参数已保存。'
  })
}
async function importBackup(file: File) {
  await withBackupOperation(async () => {
    if (file.size > 65536) throw new Error('备份文件超过 64 KB。')
    const backup = await validateBackup(JSON.parse(await file.text()))
    try {
      await saveBackup(backup)
    } catch (error) {
      if (!(error instanceof DOMException) || error.name !== 'ConstraintError') throw error
      throw new Error('此备份编号已存在，原备份已保留。')
    }
    await refreshBackups()
    backupMessage.value = '演示备份校验通过，已保存。'
  })
}
async function calibrate(target: MeterParameters, restore?: Backup) {
  if (!demo.value) return
  await withBackupOperation(async () => {
    const expected = simulator.snapshot.value
    if (restore && !sameIdentity((await validateBackup(restore)).snapshot.identity, expected.identity)) {
      throw new Error('备份车辆身份或固件不符。')
    }
    const result = await runDemoCalibration({
      port: simulator.port, expected, target, confirmed: true,
      backup: async (current) => saveBackup(await createBackup(current)),
      active: () => demo.value,
    })
    backupMessage.value = result.message
    record('demo', 'system', result.message)
    await refreshBackups()
  })
}
function exportReadings() {
  const rows = (Object.entries(readings.value) as Array<[FieldId, NonNullable<typeof readings.value[FieldId]>]>)
    .map(([id, reading]) => [fieldLabels[id], id === 'serial' && !demo.value ? '已隐藏' : reading.value,
      fieldUnits[id], originLabels[reading.origin], reading.source, reading.raw, reading.time])
  void exportFile(demo.value ? 'ninelab-demo-readings.csv' : 'ninelab-readings.csv',
    csv([['字段', '结果', '单位', '状态', '来源', '原始数据', '读取时间'], ...rows]), 'text/csv;charset=utf-8')
}
onMounted(() => {
  document.addEventListener('visibilitychange', updateEnvironment)
  window.addEventListener('hashchange', syncLocation)
  window.addEventListener('popstate', syncLocation)
  window.addEventListener('focus', updateEnvironment)
  void refreshBackups().catch(() => { backupMessage.value = '当前浏览器无法访问本地备份数据库。' })
})
onUnmounted(() => {
  clearInterval(timer)
  live.disconnect()
  document.removeEventListener('visibilitychange', updateEnvironment)
  window.removeEventListener('hashchange', syncLocation)
  window.removeEventListener('popstate', syncLocation)
  window.removeEventListener('focus', updateEnvironment)
})
</script>

<template>
  <div class="shell">
    <aside class="sidebar">
      <a href="#connection" class="brand" @click.prevent="navigate('connection')">
        <span class="brand-icon"><BatteryCharging :size="23" aria-hidden="true" /></span>
        <span><strong>NineLab</strong><small>九号电池实验室</small></span>
      </a>
      <nav aria-label="工作台" class="nav">
        <a v-for="{ id, label, icon } in pages" :key="id" :href="'#' + id" :aria-current="page === id ? 'page' : undefined"
          @click.prevent="navigate(id, $event.detail === 0)">
          <component :is="icon" :size="20" aria-hidden="true" /><span>{{ label }}</span>
        </a>
      </nav>
    </aside>
    <div class="workspace">
      <main ref="main" tabindex="-1" class="page-frame">
        <ConnectionView v-if="page === 'connection'" :connection="live.data" :capabilities="capabilities" :demo="demo"
          @connect="live.connect" @retry="live.retry" @disconnect="disconnect" @demo="showDemo" @read="openReading" />
        <ReaderView v-else-if="page === 'read'" :readings="readings" :demo="demo" :connected="connected"
          :reading="live.data.state === 'reading'" :polling="polling" @refresh="refresh" @toggle-polling="polling = !polling" @export="exportReadings" />
        <CalibrationView v-else-if="page === 'calibration'" :snapshot="demo ? simulator.snapshot.value : null"
          :backups="backups" :busy="busy" :message="backupMessage" @apply="calibrate" @backup="saveCurrent" @import="importBackup" />
        <DiagnosticView v-else :services="demo ? [] : live.data.lastServices" :connected="connected" :logs="activeLogs" :demo="demo"
          @clear="logs = logs.filter((item) => item.mode !== (demo ? 'demo' : 'live'))" />
      </main>
    </div>
  </div>
</template>
