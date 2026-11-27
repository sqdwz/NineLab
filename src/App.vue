<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { BatteryCharging, Bluetooth, Gauge, SlidersHorizontal, Terminal } from '@lucide/vue'
import ConnectionView from './views/ConnectionView.vue'
import ReaderView from './views/ReaderView.vue'
import CalibrationView from './views/CalibrationView.vue'
import DiagnosticView from './views/DiagnosticView.vue'
import { detectCapabilities } from './bluetooth/capabilities'
import { WebGattTransport } from './bluetooth/transport'
import { createConnection, isAuthorizing } from './stores/connection'
import { createDemo } from './stores/demo'
import { createBackup, listBackups, saveBackup, validateBackup } from './storage/backups'
import type { Backup } from './storage/backups'
import { runDemoCalibration, sameIdentity } from './calibration/calibration'
import type { MeterParameters } from './calibration/calibration'
import { csv, exportFile } from './storage/export'
import type { Direction, FieldId, LogEntry } from './domain'
import { fieldLabels, fieldUnits, readingLabel } from './domain'

const sections = [
  { id: 'connection', label: '连接', icon: Bluetooth },
  { id: 'read', label: '读取', icon: Gauge },
  { id: 'calibration', label: '校准', icon: SlidersHorizontal },
  { id: 'diagnostic', label: '诊断', icon: Terminal },
] as const
type FlowSection = typeof sections[number]['id']
const activeSection = ref<FlowSection>('connection')
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
let scrollFrame: number | undefined
let resizeObserver: ResizeObserver | undefined

function record(mode: LogEntry['mode'], direction: Direction, message: string, details?: Partial<LogEntry>) {
  logs.value = [...logs.value.slice(-499), { ...details, id: ++logId, time: new Date().toISOString(), mode, direction, message }]
}

const live = createConnection(new WebGattTransport(), (...args) => record('live', ...args))
const simulator = createDemo((...args) => record('demo', ...args))
const readings = computed(() => demo.value ? simulator.readings.value : live.data.readings)
const connected = computed(() => ['connected', 'reading'].includes(live.data.state))
const readable = computed(() => connected.value && !isAuthorizing(live.data.auth) &&
  (live.data.standardAvailable || live.data.auth === 'ready'))
const needsAuthentication = computed(() => connected.value && live.data.bfgAvailable &&
  live.data.auth !== 'ready' && !live.data.standardAvailable)
const activeLogs = computed(() => logs.value.filter((entry) => entry.mode === (demo.value ? 'demo' : 'live')))

function sectionAtHash(): FlowSection | undefined {
  return sections.find(({ id }) => location.hash === '#' + id)?.id
}

function trackSection() {
  if (scrollFrame !== undefined) return
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = undefined
    const atBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2
    const threshold = Math.min(160, window.innerHeight * 0.3)
    const section = [...sections].reverse().find(({ id }) => {
      const element = document.getElementById(id)
      return element && element.getBoundingClientRect().top <= threshold
    })
    activeSection.value = atBottom ? 'diagnostic' : section?.id ?? 'connection'
  })
}

function navigate(id: FlowSection, focus = false) {
  if (location.hash !== '#' + id) history.pushState(null, '', '#' + id)
  const destination = document.getElementById(id)
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  destination?.scrollIntoView({ block: 'start', behavior: reducedMotion ? 'auto' : 'smooth' })
  if (focus) destination?.querySelector<HTMLElement>('.flow-title')?.focus({ preventScroll: true })
  trackSection()
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
  navigate('read', true)
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
  if (demo.value || readable.value) refresh()
}

function authenticate(key?: string) {
  polling.value = false
  void live.authorize({ key })
}

function pair() {
  polling.value = false
  void live.authorize({ pair: true })
}

watch(polling, (enabled) => {
  clearInterval(timer)
  if (enabled) {
    refresh()
    timer = setInterval(refresh, 10000)
  }
})
watch(activeSection, (id) => { if (id !== 'read') polling.value = false })
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
      fieldUnits[id], readingLabel(reading), reading.source, reading.raw, reading.time])
  void exportFile(demo.value ? 'ninelab-demo-readings.csv' : 'ninelab-readings.csv',
    csv([['字段', '结果', '单位', '状态', '来源', '原始数据', '读取时间'], ...rows]), 'text/csv;charset=utf-8')
}
onMounted(() => {
  document.addEventListener('visibilitychange', updateEnvironment)
  window.addEventListener('focus', updateEnvironment)
  window.addEventListener('scroll', trackSection, { passive: true })
  window.addEventListener('resize', trackSection)
  if (main.value && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(trackSection)
    resizeObserver.observe(main.value)
  }
  const initial = sectionAtHash()
  if (initial) document.getElementById(initial)?.scrollIntoView({ block: 'start' })
  trackSection()
  void refreshBackups().catch(() => { backupMessage.value = '当前浏览器无法访问本地备份数据库。' })
})
onUnmounted(() => {
  clearInterval(timer)
  live.disconnect()
  live.forgetKey()
  document.removeEventListener('visibilitychange', updateEnvironment)
  window.removeEventListener('focus', updateEnvironment)
  window.removeEventListener('scroll', trackSection)
  window.removeEventListener('resize', trackSection)
  resizeObserver?.disconnect()
  if (scrollFrame !== undefined) cancelAnimationFrame(scrollFrame)
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
        <a v-for="{ id, label, icon } in sections" :key="id" :href="'#' + id" :aria-current="activeSection === id ? 'location' : undefined"
          @click.prevent="navigate(id, $event.detail === 0)">
          <component :is="icon" :size="20" aria-hidden="true" /><span>{{ label }}</span>
        </a>
      </nav>
    </aside>
    <div class="workspace">
      <main ref="main" class="page-frame">
        <h1 class="sr-only">NineLab 九号电池实验室</h1>
        <section id="connection" class="flow-section" aria-labelledby="connection-title">
          <ConnectionView :connection="live.data" :capabilities="capabilities" :demo="demo" :pairing-key="live.revealKey"
            @connect="live.connect" @retry="live.retry" @disconnect="disconnect" @demo="showDemo" @read="openReading"
            @authenticate="authenticate" @pair="pair" />
        </section>
        <section id="read" class="flow-section" aria-labelledby="read-title">
          <ReaderView :readings="readings" :demo="demo" :connected="readable" :needs-authentication="needsAuthentication"
            :reading="live.data.state === 'reading'" :polling="polling" @refresh="refresh" @toggle-polling="polling = !polling" @export="exportReadings" />
        </section>
        <section id="calibration" class="flow-section" aria-labelledby="calibration-title">
          <CalibrationView :snapshot="demo ? simulator.snapshot.value : null"
            :backups="backups" :busy="busy" :message="backupMessage" @apply="calibrate" @backup="saveCurrent" @import="importBackup" />
        </section>
        <section id="diagnostic" class="flow-section" aria-labelledby="diagnostic-title">
          <DiagnosticView :services="demo ? [] : live.data.lastServices" :connected="connected" :logs="activeLogs" :demo="demo"
            @clear="logs = logs.filter((item) => item.mode !== (demo ? 'demo' : 'live'))" />
        </section>
      </main>
    </div>
  </div>
</template>
