<script setup lang="ts">
import { computed } from 'vue'
import { Bluetooth, BluetoothConnected, FlaskConical } from '@lucide/vue'
import ConnectionGuide from '../components/ConnectionGuide.vue'
import type { detectCapabilities } from '../bluetooth/capabilities'
import { connectionLabels } from '../stores/connection'
import type { createConnection } from '../stores/connection'

const props = defineProps<{
  capabilities: ReturnType<typeof detectCapabilities>
  connection: ReturnType<typeof createConnection>['data']
  demo: boolean
}>()
const emit = defineEmits<{ connect: [broad: boolean]; retry: []; disconnect: []; demo: []; read: [] }>()
const connected = computed(() => props.connection.state === 'connected' || props.connection.state === 'reading')
const connecting = computed(() => props.connection.state === 'searching' || props.connection.state === 'connecting')
const browserHelp = computed(() => {
  if (props.capabilities.ios) return '在 Bluefy 中打开此页的 HTTPS 地址。'
  if (!props.capabilities.secure) return '请通过 HTTPS 打开此页后再连接。'
  return '请使用支持 Web Bluetooth 的 Chrome 或 Edge。'
})
const bluefyUrl = 'https://apps.apple.com/cn/app/bluefy-web-ble-browser/id1492822055'
</script>

<template>
  <header class="page-head">
    <h2 id="connection-title" class="flow-title" tabindex="-1">连接车辆</h2>
  </header>

  <section class="card connection-panel" aria-labelledby="ble-title">
    <div class="section-top">
      <span class="icon-box"><Bluetooth :size="24" aria-hidden="true" /></span>
      <span class="pill" :class="demo ? 'amber' : connected ? 'green' : ''" aria-live="polite">
        <span class="dot"></span>{{ demo ? '演示模式' : connectionLabels[connection.state] }}
      </span>
    </div>
    <h3 id="ble-title">{{ demo ? 'NineLab 演示台' : connection.selected ? connection.name : '本机蓝牙' }}</h3>
    <template v-if="!demo && !capabilities.ready">
      <p>{{ browserHelp }}</p>
      <a v-if="capabilities.ios" class="text-link" :href="bluefyUrl" target="_blank" rel="noopener noreferrer">
        在 App Store 查看 Bluefy
      </a>
    </template>
    <p v-if="!demo && connection.message" class="notice" role="status">{{ connection.message }}</p>
    <div class="button-row main-actions">
      <button v-if="demo" type="button" class="button primary" @click="emit('read')">查看演示读数</button>
      <button v-else-if="connected" type="button" class="button primary" @click="emit('read')">
        <BluetoothConnected :size="19" aria-hidden="true" /> 查看标准字段
      </button>
      <button v-else-if="capabilities.ready" type="button" class="button primary" :disabled="connecting" @click="emit('connect', false)">
        <Bluetooth :size="19" aria-hidden="true" />
        {{ connection.state === 'searching' ? '请在系统列表选设备' : connection.state === 'connecting' ? '正在连接…' : '搜索九号设备' }}
      </button>
      <button v-if="demo || connecting || connected" type="button" class="button secondary" @click="emit('disconnect')">
        {{ demo ? '退出演示' : '断开' }}
      </button>
      <button v-else-if="capabilities.ready && connection.selected && ['error', 'lost'].includes(connection.state)"
        type="button" class="button secondary" @click="emit('retry')">重新连接</button>
      <button v-else type="button" class="button" :class="capabilities.ready ? 'secondary' : 'primary'" @click="emit('demo')">
        <FlaskConical :size="18" aria-hidden="true" /> 体验演示
      </button>
    </div>

    <details v-if="capabilities.ready && !demo && !connecting && !connected" class="advanced">
      <summary>找不到车辆？</summary>
      <button type="button" class="button secondary" @click="emit('connect', true)">显示附近 BLE 设备</button>
    </details>
    <ConnectionGuide :active="demo || connected ? 'read' : connecting ? 'connect' : 'prepare'" />
  </section>
</template>
