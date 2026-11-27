<script setup lang="ts">
import { computed } from 'vue'
import { Battery, Download, Pause, Play, RefreshCw, Thermometer, Zap, Gauge, BatteryMedium, Activity } from '@lucide/vue'
import type { FieldId, Readings } from '../domain'
import { fieldLabels, fieldUnits, originLabels } from '../domain'
import { registerClues, hexNumber } from '../protocol/registers'

const props = defineProps<{ readings: Readings; demo: boolean; connected: boolean; reading: boolean; polling: boolean }>()
const emit = defineEmits<{ refresh: []; togglePolling: []; export: [] }>()
const metrics = [
  { id: 'voltage', icon: Zap }, { id: 'remainingCapacity', icon: BatteryMedium },
  { id: 'configuredCapacity', icon: Gauge }, { id: 'current', icon: Activity },
  { id: 'power', icon: Zap }, { id: 'temperature', icon: Thermometer },
] as const
const socOrder = ['meterSoc', 'dashboardSoc', 'standardSoc'] as const
const socId = computed(() => socOrder.find((id) => typeof props.readings[id]?.value === 'number'))
const soc = computed(() => socId.value ? props.readings[socId.value] : undefined)
const fields = Object.keys(fieldLabels) as FieldId[]
const clueOf = (id: FieldId) => registerClues.find((item) => item.field === id)
</script>

<template>
  <header class="page-head action-head">
    <div><h2 id="read-title" class="flow-title" tabindex="-1">电池读取</h2><p v-if="demo">演示模式</p></div>
    <div class="button-row">
      <button class="button secondary" :disabled="!demo && !connected" :aria-pressed="polling" @click="emit('togglePolling')">
        <Pause v-if="polling" :size="17" aria-hidden="true" /><Play v-else :size="17" aria-hidden="true" />
        {{ polling ? '暂停自动读取' : '自动读取' }}
      </button>
      <button class="button primary" :disabled="reading || (!demo && !connected)" @click="emit('refresh')">
        <RefreshCw :size="17" aria-hidden="true" /> {{ reading ? '读取中…' : '刷新' }}
      </button>
    </div>
  </header>

  <section class="card soc-card" aria-labelledby="soc-title">
    <div class="section-top">
      <span class="section-label"><Battery :size="21" aria-hidden="true" />
        <h3 id="soc-title">{{ socId ? fieldLabels[socId] : '当前电量' }}</h3></span>
      <span class="pill" :class="demo ? 'amber' : 'green'">{{ soc ? originLabels[soc.origin] : '未读取' }}</span>
    </div>
    <div class="soc-number">{{ soc?.value ?? '—' }}<span v-if="soc">%</span></div>
    <progress v-if="soc" class="soc-progress" :value="Number(soc.value)" max="100" :aria-label="socId ? fieldLabels[socId] : '当前电量'"></progress>
    <div v-else class="progress-track" aria-hidden="true"></div>
    <p v-if="socId === 'standardSoc'">设备公开的标准 Battery Level。仪表和计量模块 SOC 需单独核验。</p>
    <p v-else>{{ soc ? soc.source : '等待车辆或 BLE 设备返回数据。' }}</p>
  </section>

  <div class="metric-grid">
    <section v-for="{id, icon} of metrics" :key="id" class="card metric">
      <h3><component :is="icon" :size="18" aria-hidden="true" /> {{ fieldLabels[id] }}</h3>
      <p class="metric-number">{{ readings[id]?.value ?? '—' }} <small>{{ fieldUnits[id] }}</small></p>
      <span>{{ readings[id] ? originLabels[readings[id].origin] : clueOf(id) ? '待实车验证' : '暂不支持' }}</span>
    </section>
  </div>

  <section class="card" aria-labelledby="details-heading">
    <div class="section-top"><h3 id="details-heading">详细参数</h3>
      <button class="button secondary" :disabled="Object.keys(readings).length === 0" @click="emit('export')">
        <Download :size="17" aria-hidden="true" /> 导出 CSV
      </button>
    </div>
    <details>
      <summary>查看全部字段</summary>
      <div v-for="field in fields" :key="field" class="reading-row">
        <div>
          <strong>{{ field === 'model' && !demo ? 'BLE 设备型号' : fieldLabels[field] }}</strong>
          <div class="reading-source">{{ readings[field]?.source ?? (clueOf(field) ?
            '线索 ' + hexNumber(clueOf(field)!.module) + ' / ' + hexNumber(clueOf(field)!.register) : '') }}</div>
        </div>
        <div class="reading-value">
          <strong>{{ readings[field]?.value ?? '—' }} {{ readings[field]?.value != null ? fieldUnits[field] : '' }}</strong>
          <span>{{ readings[field] ? originLabels[readings[field].origin] : clueOf(field) ? '待实车验证' : '暂不支持' }}</span>
          <time v-if="readings[field]?.time" :datetime="readings[field]?.time">{{ new Date(readings[field]!.time).toLocaleTimeString('zh-CN', { hour12: false }) }}</time>
        </div>
        <details v-if="readings[field]?.raw || readings[field]?.detail" class="reading-raw">
          <summary>原始数据</summary>
          <code>{{ readings[field]?.raw }}</code> {{ readings[field]?.detail }}
        </details>
      </div>
    </details>
  </section>
</template>
