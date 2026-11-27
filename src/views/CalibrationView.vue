<script setup lang="ts">
import { computed, ref } from 'vue'
import { Download, LockKeyhole, ShieldCheck, Upload } from '@lucide/vue'
import { demoProfiles } from '../calibration/calibration'
import type { MeterParameters, MeterSnapshot } from '../calibration/calibration'
import type { Backup } from '../storage/backups'
import { exportFile } from '../storage/export'

const props = defineProps<{ snapshot: MeterSnapshot | null; backups: Backup[]; busy: boolean; message: string }>()
const emit = defineEmits<{ apply: [target: MeterParameters, restore?: Backup]; import: [file: File]; backup: [] }>()
const targetProfile = ref(1)
const authorized = ref(false)
const parked = ref(false)
const dialog = ref<HTMLDialogElement>()
const restore = ref<Backup>()
const inspected = ref<Backup>()
const fileInput = ref<HTMLInputElement>()
const selected = computed(() => restore.value?.snapshot ?? demoProfiles.find((item) => item.profile === targetProfile.value))
const capacity = (mah: number | undefined) => mah === undefined ? '—' : mah / 1000 + ' Ah'
const delta = computed(() => props.snapshot && selected.value ? (selected.value.capacityMah - props.snapshot.capacityMah) / 1000 : null)

const locked = [
  ['计量模块配置容量 / 档位', '高', '待核验车型、固件和档位映射'],
  ['剩余容量', '高', '写入语义和持久化待确认'],
  ['仪表 / 计量模块 SOC', '高', '刷新机制和影响范围待确认'],
  ['仪表能量参数', '高', '单位、可写性和恢复方式待确认'],
]

function confirm(backup?: Backup) {
  if (!props.snapshot || !authorized.value || !parked.value || props.busy) return
  restore.value = backup
  dialog.value?.showModal()
}
function apply() {
  if (selected.value && authorized.value && parked.value && !props.busy) emit('apply', selected.value, restore.value)
}
function filePicked(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) emit('import', file)
}
function backupExport(backup: Backup) {
  void exportFile('ninelab-demo-' + backup.createdAt.slice(0, 10) + '-' + backup.id.slice(0, 8) + '.json',
    JSON.stringify(backup, null, 2), 'application/json')
}
</script>

<template>
  <header class="page-head"><h1>电池校准</h1><p>核对当前参数、目标差异和原始备份。</p></header>
  <section v-if="!snapshot" class="card locked-card">
    <span class="icon-box"><LockKeyhole :size="24" aria-hidden="true" /></span>
    <h2>实车校准待验证</h2>
    <p>需要确认具体车型、固件、原始参数及恢复方法。可在演示会话预览流程。</p>
    <div v-for="[name, risk, reason] in locked" :key="name" class="reading-row">
      <div><strong>{{ name }}</strong><div class="reading-source">{{ reason }}</div></div>
      <div class="reading-value"><span class="pill amber">风险 {{ risk }}</span><span>已锁定</span></div>
    </div>
  </section>
  <section v-else class="card">
    <div class="section-top"><h2>计量模块容量</h2><span class="pill amber">演示</span></div>
    <label class="select-label profile-select">模拟容量档位
      <select v-model.number="targetProfile" :disabled="busy">
        <option v-for="profile in demoProfiles" :key="profile.profile" :value="profile.profile">
          {{ capacity(profile.capacityMah) }}
        </option>
      </select>
    </label>
    <dl class="spec-grid comparison">
      <div><dt>原始参数</dt><dd>{{ capacity(snapshot.capacityMah) }}</dd><small>{{ snapshot.profileRaw }} / {{ snapshot.capacityRaw }}</small></div>
      <div><dt>目标参数</dt><dd>{{ capacity(demoProfiles.find((item) => item.profile === targetProfile)?.capacityMah) }}</dd></div>
    </dl>
    <p>模拟计量模块容量，重载页面重置。演示备份可恢复当前演示设备。实车持久化与重启要求待验证。</p>
    <label class="check-row"><input v-model="authorized" type="checkbox" :disabled="busy" /> 允许执行演示校准</label>
    <label class="check-row"><input v-model="parked" type="checkbox" :disabled="busy" /> 模拟车辆已静止</label>
    <button class="button primary" :disabled="!authorized || !parked || busy" @click="confirm()">
      <ShieldCheck :size="19" aria-hidden="true" /> 预览并确认
    </button>
  </section>
  <section class="card" aria-labelledby="backup-title">
    <div class="section-top"><h2 id="backup-title">参数备份</h2><span class="pill">{{ backups.length }} 份</span></div>
    <p>演示备份通过 SHA-256 完整性校验，导入后会在本机单独保存。</p>
    <div class="button-row">
      <input ref="fileInput" type="file" accept=".json,application/json" hidden @change="filePicked" />
      <button class="button secondary" :disabled="busy" @click="fileInput?.click()"><Upload :size="17" aria-hidden="true" /> 导入 JSON</button>
      <button class="button secondary" :disabled="!snapshot || busy" @click="emit('backup')">保存当前演示参数</button>
    </div>
    <p v-if="message" class="notice" role="status">{{ message }}</p>
    <div v-for="backup in backups" :key="backup.id" class="backup-row">
      <div><strong>{{ capacity(backup.snapshot.capacityMah) }} · 演示备份</strong>
        <time :datetime="backup.createdAt">{{ new Date(backup.createdAt).toLocaleString('zh-CN', { hour12: false }) }}</time></div>
      <div class="button-row">
        <button class="button secondary" @click="inspected = inspected?.id === backup.id ? undefined : backup">
          {{ inspected?.id === backup.id ? '收起' : '查看' }}</button>
        <button class="button secondary" @click="backupExport(backup)"><Download :size="17" aria-hidden="true" /> 导出</button>
        <button class="button secondary" :disabled="!snapshot || !authorized || !parked || busy" @click="confirm(backup)">恢复</button>
      </div>
      <dl v-if="inspected?.id === backup.id" class="compact-list backup-details">
        <div><dt>车辆序列号</dt><dd>{{ backup.snapshot.identity.serial }}</dd></div>
        <div><dt>车型</dt><dd>{{ backup.snapshot.identity.model }}</dd></div>
        <div v-for="(version, module) in backup.snapshot.identity.firmware" :key="module"><dt>{{ module }} 固件</dt><dd>{{ version }}</dd></div>
        <div><dt>协议</dt><dd>{{ backup.protocol }}</dd></div>
        <div><dt>原始档位 / 容量</dt><dd><code>{{ backup.snapshot.profileRaw }} / {{ backup.snapshot.capacityRaw }}</code></dd></div>
        <div><dt>SHA-256</dt><dd><code>{{ backup.integrity }}</code></dd></div>
      </dl>
    </div>
  </section>
  <dialog ref="dialog" class="confirm-dialog" aria-labelledby="confirm-title" @close="restore = undefined">
    <form method="dialog">
      <h2 id="confirm-title">{{ restore ? '确认恢复演示参数' : '确认演示校准' }}</h2>
      <p>由 {{ capacity(snapshot?.capacityMah) }} 调整至 {{ capacity(selected?.capacityMah) }}。</p>
      <p v-if="delta !== null">容量差值 {{ delta > 0 ? '+' : '' }}{{ delta }} Ah。操作前会保存已有参数。</p>
      <div class="button-row"><button class="button secondary" autofocus>取消</button>
        <button class="button primary" @click="apply">确认演示操作</button></div>
    </form>
  </dialog>
</template>
