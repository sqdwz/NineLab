<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { BatteryMedium, Bluetooth, Smartphone, X } from '@lucide/vue'
import type { ConnectionState } from '../stores/connection'

const props = defineProps<{
  ready: boolean
  connected: boolean
  state: ConnectionState
  message: string
  demo: boolean
}>()
const emit = defineEmits<{ connect: []; cancel: []; read: []; demo: [] }>()

const steps = [
  { key: 'prepare', label: '准备', title: '打开蓝牙，唤醒车辆', icon: Smartphone,
    detail: '让手机或电脑靠近车辆。' },
  { key: 'connect', label: '连接', title: '选择自己的车辆', icon: Bluetooth,
    detail: '在浏览器的设备列表中选择车辆，并允许蓝牙访问。' },
  { key: 'read', label: '读取', title: '查看电池读数', icon: BatteryMedium,
    detail: '连接后可以读取设备公开的电量和身份信息。' },
] as const
const dialog = ref<HTMLDialogElement>()
const heading = ref<HTMLElement>()
const index = ref(0)
const step = computed(() => steps[index.value]!)
const connecting = computed(() => props.state === 'searching' || props.state === 'connecting')

function select(indexToShow: number) {
  index.value = indexToShow
  void nextTick(() => heading.value?.focus({ preventScroll: true }))
}
function open() {
  index.value = props.connected || props.demo ? 2 : connecting.value ? 1 : 0
  dialog.value?.showModal()
  select(index.value)
}
function finish(action: 'read' | 'demo') {
  dialog.value?.close()
  if (action === 'read') emit('read')
  else emit('demo')
}
watch(() => props.connected, (connected) => {
  if (connected && dialog.value?.open) select(2)
})
defineExpose({ open })
</script>

<template>
  <dialog ref="dialog" class="confirm-dialog connection-guide" aria-labelledby="guide-title">
    <div class="guide-head">
      <h2 id="guide-title">连接引导</h2>
      <button type="button" class="button secondary guide-close" aria-label="关闭引导" @click="dialog?.close()">
        <X :size="19" aria-hidden="true" />
      </button>
    </div>

    <ol class="guide-steps" aria-label="引导进度">
      <li v-for="(item, position) in steps" :key="item.key">
        <button type="button" :aria-current="position === index ? 'step' : undefined" @click="select(position)">
          <span class="guide-step-mark" aria-hidden="true">{{ position + 1 }}</span>{{ item.label }}
        </button>
      </li>
    </ol>

    <div :key="step.key" class="guide-scene" :data-step="step.key" aria-hidden="true">
      <span class="guide-icon"><component :is="step.icon" :size="40" :stroke-width="1.6" /></span>
      <span v-if="step.key === 'prepare'" class="guide-switch"><i></i></span>
      <span v-else-if="step.key === 'connect'" class="guide-wave"></span>
      <span v-else class="guide-meter"><i></i></span>
    </div>

    <div class="guide-copy">
      <h3 ref="heading" tabindex="-1">{{ step.title }}</h3>
      <p v-if="step.key === 'prepare' && !ready && !demo"><slot name="browser-help" /></p>
      <p v-else-if="step.key === 'connect' && !ready && !demo">当前浏览器无法搜索车辆，可继续体验演示。</p>
      <p v-else>{{ step.detail }}</p>
      <p v-if="step.key === 'connect' && connecting" role="status">
        {{ state === 'searching' ? '请在系统列表中选择设备。' : '正在连接…' }}
      </p>
      <p v-else-if="step.key === 'connect' && message" role="status">{{ message }}</p>
    </div>

    <div class="button-row guide-actions">
      <button v-if="index > 0" type="button" class="button secondary" @click="select(index - 1)">上一步</button>
      <button v-if="step.key === 'prepare'" type="button" class="button primary" @click="select(1)">下一步</button>
      <template v-else-if="step.key === 'connect'">
        <button v-if="connecting" type="button" class="button secondary" @click="emit('cancel')">取消连接</button>
        <button v-else-if="ready && !connected && !demo" type="button" class="button primary" @click="emit('connect')">
          搜索九号设备
        </button>
        <button v-else type="button" class="button primary" @click="select(2)">下一步</button>
      </template>
      <button v-else-if="connected || demo" type="button" class="button primary" @click="finish('read')">
        {{ demo ? '查看演示读数' : '查看标准字段' }}
      </button>
      <button v-else type="button" class="button primary" @click="finish('demo')">体验演示</button>
    </div>
  </dialog>
</template>

<style scoped>
.connection-guide {
  box-sizing: border-box;
  inline-size: min(450px, calc(100% - 28px));
  max-block-size: calc(100dvh - 28px - env(safe-area-inset-top) - env(safe-area-inset-bottom));
  overscroll-behavior: contain;
}
.guide-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.guide-close { inline-size: 44px; flex: none; padding: 0; }
.guide-steps {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 5px;
  padding: 0;
  margin: 16px 0 12px;
  list-style: none;
}
.guide-steps button {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  width: 100%;
  gap: 5px;
  border: 0;
  border-bottom: 2px solid var(--border);
  padding: 5px 0 8px;
  background: transparent;
  color: var(--muted);
  font-size: .9rem;
  white-space: nowrap;
  transition: border-color 240ms ease-out, color 240ms ease-out;
}
.guide-steps button[aria-current="step"] {
  border-color: var(--accent);
  color: var(--accent-copy);
  font-weight: 700;
}
.guide-step-mark { font-variant-numeric: tabular-nums; }
.guide-scene {
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 8px;
  position: relative;
  isolation: isolate;
  height: 122px;
  overflow: hidden;
  border-radius: 12px;
  background: var(--accent-light);
  color: var(--accent-copy);
}
.guide-icon {
  display: grid;
  place-items: center;
  inline-size: 68px;
  block-size: 68px;
  border-radius: 18px;
  background: var(--surface);
  border: 1px solid var(--border);
  animation: guide-icon-in 350ms cubic-bezier(.2,.65,.3,1) both;
}
.guide-switch, .guide-meter {
  display: block;
  width: 43px;
  height: 19px;
  border-radius: 20px;
  padding: 3px;
  background: var(--accent);
}
.guide-switch i {
  display: block;
  width: 13px;
  height: 13px;
  border-radius: 100%;
  background: var(--accent-ink);
  transform: translateX(24px);
  animation: guide-switch-on 330ms 130ms ease-in-out both;
}
.guide-wave {
  position: absolute;
  z-index: -1;
  place-self: center;
  width: 86px;
  height: 86px;
  border: 1px solid var(--accent);
  border-radius: 100%;
  opacity: .45;
  animation: guide-search 650ms ease-out 2;
}
.guide-meter {
  width: 82px;
  height: 9px;
  padding: 0;
  background: var(--border);
  overflow: hidden;
}
.guide-meter i {
  display: block;
  width: 62%;
  height: 100%;
  background: var(--accent);
  transform-origin: left;
  animation: guide-meter-fill 430ms 100ms ease-out both;
}
.guide-copy { margin-top: 13px; }
.guide-copy h3 { margin: 0; font-size: 1.09rem; }
.guide-copy h3:focus { outline: none; }
.guide-copy p { margin: 4px 0 0; }
.guide-actions { justify-content: flex-end; margin-top: 16px; }
@keyframes guide-icon-in {
  from { opacity: 0; transform: translateY(7px) scale(.96); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes guide-switch-on { from { transform: translateX(0); } }
@keyframes guide-search {
  from { opacity: .58; transform: scale(.77); }
  to { opacity: .12; transform: scale(1.39); }
}
@keyframes guide-meter-fill { from { transform: scaleX(0); } }
@media (prefers-reduced-motion: reduce) {
  .guide-icon, .guide-switch i, .guide-wave, .guide-meter i { animation: none; }
  .guide-steps button { transition: none; }
}
</style>
