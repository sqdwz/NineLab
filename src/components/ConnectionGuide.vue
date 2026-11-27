<script setup lang="ts">
import { BatteryMedium, Bluetooth, KeyRound, Smartphone } from '@lucide/vue'

defineProps<{ active: 'prepare' | 'connect' | 'pair' | 'read' }>()

const steps = {
  prepare: { title: '唤醒车辆', detail: '打开手机蓝牙，靠近并唤醒车辆。', icon: Smartphone },
  connect: { title: '连接蓝牙', detail: '在蓝牙设备列表中选中自己的车辆。', icon: Bluetooth },
  pair: { title: '配对与认证', detail: '已配对的车辆使用已有密钥。首次配对时按车端提示确认。', icon: KeyRound },
  read: { title: '读取电池', detail: '进入读取区查看设备返回的电池数据。', icon: BatteryMedium },
}
</script>

<template>
  <section class="connection-guide" aria-labelledby="connection-guide-title">
    <h3 id="connection-guide-title">连接引导</h3>
    <ol class="guide-steps">
      <li v-for="(step, key) in steps" :key="key" class="guide-step"
        :aria-current="active === key ? 'step' : undefined">
        <span class="guide-icon" aria-hidden="true">
          <component :is="step.icon" :size="22" :stroke-width="1.7" />
        </span>
        <strong>{{ step.title }}</strong>
      </li>
    </ol>
    <p class="guide-instruction">{{ steps[active].detail }}</p>
  </section>
</template>

<style scoped>
.connection-guide {
  margin-top: 16px;
  border-top: 1px solid var(--border);
  padding-top: 12px;
}
.guide-steps {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  list-style: none;
  padding: 9px 0 0;
  margin: 0;
}
.guide-step {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
}
.guide-icon {
  position: relative;
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 11px;
  background: var(--panel);
  color: var(--muted);
}
.guide-step[aria-current="step"] .guide-icon {
  background: var(--accent-light);
  color: var(--accent-copy);
}
.guide-step[aria-current="step"] .guide-icon {
  animation: guide-enter 360ms cubic-bezier(.2,.65,.3,1) both;
}
.guide-step[aria-current="step"] .guide-icon::after {
  content: '';
  position: absolute;
  inset: 0;
  border: 1px solid currentColor;
  border-radius: inherit;
  animation: guide-emphasis 570ms 160ms ease-out both;
}
.guide-step strong { font-size: .9rem; }
.guide-instruction { color: var(--muted); font-size: .9rem; }
@keyframes guide-enter {
  from { opacity: 0; transform: translateY(6px) scale(.96); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes guide-emphasis {
  from { opacity: .55; transform: scale(1); }
  to { opacity: 0; transform: scale(1.28); }
}
@media (max-width: 760px) {
  .guide-steps { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (prefers-reduced-motion: reduce) {
  .guide-step[aria-current="step"] .guide-icon { animation: none; }
  .guide-step[aria-current="step"] .guide-icon::after { content: none; }
}
</style>
