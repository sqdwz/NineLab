<script setup lang="ts">
import { computed, ref } from 'vue'
import { ArrowDownLeft, ArrowUpRight, Copy, Download, Terminal, Trash2 } from '@lucide/vue'
import type { Direction, LogEntry, ServiceInfo } from '../domain'
import { fieldLabels } from '../domain'
import { hexNumber, registerClues } from '../protocol/registers'
import { csv, exportFile } from '../storage/export'
import { decodeReply, interpretReply } from '../protocol/codec'
import type { FieldId, Reading } from '../domain'
import { fieldUnits } from '../domain'

const frameInput = ref('')
const result = ref<{ field: FieldId; reading: Reading }>()
const frameError = ref('')
function parseFrame() {
  result.value = undefined
  frameError.value = ''
  const compact = frameInput.value.replace(/\s/g, '')
  if (!/^(?:[0-9a-f]{2}){8,32}$/i.test(compact)) {
    frameError.value = '请输入 8–32 字节十六进制明文，可用空格分隔。'
    return
  }
  try {
    const bytes = Uint8Array.from(compact.match(/../g)!, (pair) => Number.parseInt(pair, 16))
    result.value = interpretReply(decodeReply(bytes), new Date().toISOString())
  } catch {
    frameError.value = '响应格式、寄存器或字段长度不在候选表中。'
  }
}

const props = defineProps<{ services: ServiceInfo[]; logs: LogEntry[]; demo: boolean; connected: boolean }>()
const emit = defineEmits<{ clear: [] }>()
const filter = ref<Direction | 'all'>('all')
const format = ref<'json' | 'csv' | 'txt'>('json')
const feedback = ref('')
const copyText = ref('')
const filtered = computed(() => props.logs.filter((log) => filter.value === 'all' || filter.value === log.direction))
const textOutput = () => filtered.value.map((log) => [log.time, log.mode, log.direction, log.message, log.raw, log.decoded,
  log.check, log.duration === undefined ? '' : Math.round(log.duration) + 'ms'].filter(Boolean).join('  ')).join('\n')
async function copy() {
  try {
    await navigator.clipboard.writeText(textOutput())
    feedback.value = '日志已复制。'
    copyText.value = ''
  } catch {
    feedback.value = '请长按文本手动复制。'
    copyText.value = textOutput()
  }
}
function download() {
  const content = format.value === 'json'
    ? JSON.stringify({ schema: 1, capturedAt: new Date().toISOString(), mode: props.demo ? 'demo' : 'live', servicesConnected: props.connected && !props.demo, services: props.services, logs: filtered.value }, null, 2)
    : format.value === 'csv'
      ? csv([['时间', '会话', '方向', '记录', '原始数据', '明文', '耗时 ms', '校验'],
        ...filtered.value.map((log) => [log.time, log.mode, log.direction, log.message, log.raw, log.decoded, log.duration, log.check])])
      : textOutput()
  const mime = { json: 'application/json', csv: 'text/csv', txt: 'text/plain' }
  void exportFile('ninelab-diagnostics.' + format.value, content, mime[format.value] + ';charset=utf-8')
}
</script>

<template>
  <header class="page-head"><h1>通信诊断</h1><p v-if="demo">演示模式</p></header>
  <section class="card">
    <div class="section-top"><h2>GATT 服务</h2><span class="pill">{{ services.length }} 个可见服务</span></div>
    <p v-if="services.length && !connected">上次连接的服务记录。</p>
    <p v-if="services.length === 0">{{ demo ? '演示使用内存传输层。' : '连接设备后显示浏览器有权访问的服务。' }}</p>
    <details v-for="service in services" :key="service.uuid" class="service">
      <summary><code>{{ service.uuid }}</code> <span>{{ service.characteristics.length }} 项</span></summary>
      <p v-if="service.error">{{ service.error }}</p>
      <div v-for="characteristic in service.characteristics" :key="characteristic.uuid" class="characteristic">
        <code>{{ characteristic.uuid }}</code><span>{{ characteristic.properties.join(' · ') || '无可识别属性' }}</span>
      </div>
    </details>
  </section>
  <section class="card diagnostic-card" aria-labelledby="log-title">
    <div class="section-top"><h2 id="log-title" class="section-label"><Terminal :size="19" aria-hidden="true" /> 通信日志</h2>
      <label class="select-label">方向 <select v-model="filter"><option value="all">全部</option><option value="out">发送</option>
        <option value="in">接收</option><option value="system">事件</option></select></label>
    </div>
    <div class="log-output" tabindex="0" aria-label="通信日志">
      <p v-if="filtered.length === 0" class="log-empty">当前筛选下没有日志。</p>
      <article v-for="log in [...filtered].reverse()" :key="log.id" class="log-row" :data-direction="log.direction">
        <div class="log-meta">
          <ArrowUpRight v-if="log.direction === 'out'" :size="15" aria-hidden="true" />
          <ArrowDownLeft v-else-if="log.direction === 'in'" :size="15" aria-hidden="true" />
          <span>{{ { out: '发送', in: '接收', system: '事件' }[log.direction] }}</span>
          <time :datetime="log.time" :title="log.time">{{ log.time.slice(11, 23) }}Z</time>
          <span v-if="log.duration !== undefined">{{ Math.round(log.duration) }} ms</span>
        </div>
        <strong>{{ log.message }}</strong>
        <code v-if="log.raw">原始 {{ log.raw }}</code>
        <code v-if="log.decoded">解析 {{ log.decoded }}</code>
        <span v-if="log.check" class="log-check">{{ log.check }}</span>
      </article>
    </div>
    <div class="button-row log-actions">
      <button class="button secondary" :disabled="!filtered.length" @click="copy"><Copy :size="17" aria-hidden="true" /> 复制</button>
      <button class="button secondary" :disabled="!logs.length" @click="emit('clear'); feedback = ''; copyText = ''">
        <Trash2 :size="17" aria-hidden="true" /> 清空
      </button>
      <label class="select-label"><span class="sr-only">导出格式</span>
        <select v-model="format"><option value="json">JSON</option><option value="csv">CSV</option><option value="txt">TXT</option></select>
      </label>
      <button class="button primary" :disabled="(!filtered.length && !services.length) || (format !== 'json' && !filtered.length)"
        @click="download"><Download :size="17" aria-hidden="true" /> 导出</button>
    </div>
    <p v-if="feedback" role="status">{{ feedback }}</p>
    <textarea v-if="copyText" readonly :value="copyText" aria-label="待复制通信日志"></textarea>
  </section>
  <section class="card">
    <details class="clues">
      <summary>候选寄存器</summary>
      <p>来自 BFG 源码的线索。这里的定义均待对应车型实车验证。</p>
      <form class="offline-parser" @submit.prevent="parseFrame">
        <label for="offline-frame">离线解析候选响应</label>
        <textarea id="offline-frame" v-model="frameInput" rows="2" maxlength="160" spellcheck="false"
          placeholder="例如 5A A5 02 01 3E 04 B1 DC 1C"></textarea>
        <p class="footnote">输入一条已解密且去除传输校验尾的响应。解析结果不发往车辆或加入通信日志。</p>
        <button class="button secondary" type="submit">解析明文</button>
        <p v-if="frameError" role="status">{{ frameError }}</p>
        <p v-if="result" role="status">{{ fieldLabels[result.field] }} {{ result.reading.value }}
          {{ fieldUnits[result.field] }} · {{ result.reading.source }} · 待验证</p>
      </form>
      <div v-for="item in registerClues" :key="item.field" class="reading-row">
        <strong>{{ fieldLabels[item.field] }}</strong>
        <div class="reading-value"><code>{{ hexNumber(item.module) }} / {{ hexNumber(item.register) }}</code>
          <span>无符号 {{ item.width * 8 }} 位{{ item.width === 2 ? ' · 小端' : '' }}{{ item.scale === null ? '' : ' · × ' + item.scale }}</span></div>
      </div>
    </details>
  </section>
</template>
