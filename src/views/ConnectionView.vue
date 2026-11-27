<script setup lang="ts">
import { computed, ref } from 'vue'
import { Bluetooth, BluetoothConnected, FlaskConical } from '@lucide/vue'
import ConnectionGuide from '../components/ConnectionGuide.vue'
import VehicleAuthentication from '../components/VehicleAuthentication.vue'
import type { detectCapabilities } from '../bluetooth/capabilities'
import type { DeviceSelection, SelectionMode } from '../bluetooth/transport'
import { connectionLabels, isAuthorizing } from '../stores/connection'
import type { createConnection } from '../stores/connection'

const props = defineProps<{
  capabilities: ReturnType<typeof detectCapabilities>
  connection: ReturnType<typeof createConnection>['data']
  demo: boolean
  pairingKey: () => string
}>()
const emit = defineEmits<{
  connect: [selection: DeviceSelection]; retry: []; disconnect: []; demo: []; read: []; authenticate: [key?: string]; pair: []
}>()
const chosenMode = ref<SelectionMode>()
const searchMode = computed<SelectionMode>({
  get: () => chosenMode.value ?? (props.capabilities.ios ? 'bfg-compatible' : 'ninebot'),
  set: (mode) => { chosenMode.value = mode },
})
const namePrefix = ref('')
const prefix = computed(() => namePrefix.value.trim())
const connected = computed(() => props.connection.state === 'connected' || props.connection.state === 'reading')
const authorizing = computed(() => isAuthorizing(props.connection.auth))
const authenticated = computed(() => props.connection.auth === 'ready')
const canRead = computed(() => authenticated.value || props.connection.standardAvailable)
const status = computed(() => props.demo ? '演示模式' : authorizing.value ? '车辆认证中' :
  authenticated.value && props.connection.state === 'connected' ? '车辆已认证' : connectionLabels[props.connection.state])
const connecting = computed(() => props.connection.state === 'searching' || props.connection.state === 'connecting')
const canSearch = computed(() => !connecting.value && (searchMode.value !== 'name-prefix' || Boolean(prefix.value)))
const browserHelp = computed(() => {
  if (props.capabilities.ios) return '在 Bluefy 中打开此页的 HTTPS 地址。'
  if (!props.capabilities.secure) return '请通过 HTTPS 打开此页后再连接。'
  return '请使用支持 Web Bluetooth 的 Chrome 或 Edge。'
})
const bluefyUrl = 'https://apps.apple.com/cn/app/bluefy-web-ble-browser/id1492822055'

function search() {
  if (!canSearch.value) return
  emit('connect', searchMode.value === 'name-prefix' ? { namePrefix: prefix.value } : searchMode.value)
}
</script>

<template>
  <header class="page-head">
    <h2 id="connection-title" class="flow-title" tabindex="-1">连接车辆</h2>
  </header>

  <section class="card connection-panel" aria-labelledby="ble-title">
    <div class="section-top">
      <span class="icon-box"><Bluetooth :size="24" aria-hidden="true" /></span>
      <span class="pill" :class="demo ? 'amber' : connected ? 'green' : ''" aria-live="polite">
        <span class="dot"></span>{{ status }}
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
    <div v-if="capabilities.ready && !demo && !connected" class="connection-filters">
      <label class="select-label">蓝牙筛选
        <select v-model="searchMode" :disabled="connecting">
          <option value="bfg-compatible">iPhone 兼容搜索</option>
          <option value="ninebot">九号自动筛选</option>
          <option value="bfg-filtered">仅 BFG 广播服务</option>
          <option value="name-prefix">按名称前缀</option>
          <option value="nearby">全部附近 BLE 设备</option>
        </select>
      </label>
      <label v-if="searchMode === 'name-prefix'" class="select-label">设备名称前缀
        <input v-model="namePrefix" type="text" autocomplete="off" autocapitalize="none" :spellcheck="false"
          :disabled="connecting" placeholder="例如 Ninebot" />
      </label>
    </div>
    <div class="button-row main-actions">
      <button v-if="demo" type="button" class="button primary" @click="emit('read')">查看演示读数</button>
      <button v-else-if="connected && canRead" type="button" class="button primary" :disabled="authorizing" @click="emit('read')">
        <BluetoothConnected :size="19" aria-hidden="true" /> {{ authenticated ? '读取车辆数据' : '查看标准字段' }}
      </button>
      <button v-else-if="capabilities.ready && !connected" type="button" class="button primary" :disabled="!canSearch" @click="search">
        <Bluetooth :size="19" aria-hidden="true" />
        {{ connection.state === 'searching' ? '请在系统列表选设备' : connection.state === 'connecting' ? '正在连接…' : '搜索蓝牙设备' }}
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

    <VehicleAuthentication v-if="!demo && (connection.bfgAvailable || connection.generatedKeyAvailable)"
      :available="connection.bfgAvailable && connected" :state="connection.auth" :message="connection.authMessage"
      :has-generated-key="connection.generatedKeyAvailable" :can-start="connection.state === 'connected' && !authorizing"
      :reveal-key="pairingKey" @authenticate="(key) => emit('authenticate', key)" @pair="emit('pair')" />
    <ConnectionGuide :active="demo || (connected && canRead) ? 'read' : connecting || connected ? 'connect' : 'prepare'" />
  </section>
</template>
