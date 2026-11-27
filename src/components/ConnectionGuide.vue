<script setup lang="ts">
import { BatteryMedium, Bluetooth, Smartphone } from '@lucide/vue'

defineProps<{ active: 'prepare' | 'connect' | 'read' }>()

const steps = [
  { key: 'prepare', title: '打开蓝牙，唤醒车辆', detail: '让手机或电脑靠近车辆。', icon: Smartphone },
  { key: 'connect', title: '选择自己的车辆', detail: '在浏览器的设备列表中选择自己的车辆。', icon: Bluetooth },
  { key: 'read', title: '查看电池读数', detail: '连接后可查看设备公开的电量和身份信息。', icon: BatteryMedium },
] as const
</script>

<template>
  <details class="connection-guide">
    <summary>连接引导</summary>
    <ol class="guide-steps">
      <li v-for="step in steps" :key="step.key" class="guide-step"
        :aria-current="active === step.key ? 'step' : undefined">
        <span class="guide-icon" aria-hidden="true">
          <component :is="step.icon" :size="22" :stroke-width="1.7" />
        </span>
        <div>
          <strong>{{ step.title }}</strong>
          <p>{{ step.detail }}</p>
        </div>
      </li>
    </ol>
  </details>
</template>

<style scoped>
.connection-guide {
  margin-top: 16px;
  border-top: 1px solid var(--border);
  padding-top: 5px;
}
.guide-steps {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  list-style: none;
  padding: 7px 0 0;
  margin: 0;
}
.guide-step {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  gap: 10px;
  align-items: start;
}
.guide-icon {
  position: relative;
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 11px;
  background: var(--panel);
  color: var(--muted);
}
.guide-step[aria-current="step"] .guide-icon {
  background: var(--accent-light);
  color: var(--accent-copy);
}
[open] .guide-step[aria-current="step"] .guide-icon {
  animation: guide-enter 360ms cubic-bezier(.2,.65,.3,1) both;
}
[open] .guide-step[aria-current="step"] .guide-icon::after {
  content: '';
  position: absolute;
  inset: 0;
  border: 1px solid currentColor;
  border-radius: inherit;
  animation: guide-emphasis 570ms 160ms ease-out both;
}
.guide-step strong { display: block; margin-top: 1px; }
.guide-step p { margin-top: 3px; font-size: .9rem; }
@keyframes guide-enter {
  from { opacity: 0; transform: translateY(6px) scale(.96); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes guide-emphasis {
  from { opacity: .55; transform: scale(1); }
  to { opacity: 0; transform: scale(1.28); }
}
@media (max-width: 760px) {
  .guide-steps { grid-template-columns: 1fr; gap: 13px; }
}
@media (prefers-reduced-motion: reduce) {
  [open] .guide-step[aria-current="step"] .guide-icon { animation: none; }
  [open] .guide-step[aria-current="step"] .guide-icon::after { content: none; }
}
</style>
