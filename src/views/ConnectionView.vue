<script setup lang="ts">
import { Bluetooth, BluetoothConnected, FlaskConical, LockKeyhole, Smartphone } from '@lucide/vue'
import type { detectCapabilities } from '../bluetooth/capabilities'
import { connectionLabels } from '../stores/connection'
import type { createConnection } from '../stores/connection'

defineProps<{
  capabilities: ReturnType<typeof detectCapabilities>
  connection: ReturnType<typeof createConnection>['data']
  demo: boolean
}>()
const emit = defineEmits<{ connect: [broad: boolean]; retry: []; disconnect: []; demo: []; read: [] }>()
</script>

<template>
  <header class="page-head">
    <h1>连接车辆</h1>
    <p>通过本机蓝牙查看设备与电池信息。</p>
  </header>
  <div class="connection-grid">
    <section class="card primary-card" aria-labelledby="ble-title">
      <div class="section-top">
        <span class="icon-box"><Bluetooth :size="24" aria-hidden="true" /></span>
        <span class="pill" :class="demo ? 'amber' : 'green'">
          <span class="dot"></span>{{ demo ? '演示会话' : connectionLabels[connection.state] }}
        </span>
      </div>
      <h2 id="ble-title">{{ demo ? 'NineLab 演示台' : connection.selected ? connection.name : '本机蓝牙' }}</h2>
      <p v-if="demo">演示读数、备份和校准都来自本地模拟器。</p>
      <p v-else-if="connection.state === 'connected' || connection.state === 'reading'">
        GATT 已连接。可查看服务与标准字段。车型专有认证待验证。
      </p>
      <p v-else>唤醒车辆，在附近设备列表中选择自己的九号设备。</p>
      <p v-if="!demo && connection.message" class="notice" role="status">{{ connection.message }}</p>
      <div class="button-row main-actions">
        <button v-if="demo" class="button primary" @click="emit('read')">查看演示读数</button>
        <button v-else-if="['connected', 'reading'].includes(connection.state)" class="button primary" @click="emit('read')">
          <BluetoothConnected :size="19" aria-hidden="true" /> 查看标准字段
        </button>
        <button v-else class="button primary" :disabled="!capabilities.ready || ['searching','connecting'].includes(connection.state)" @click="emit('connect', false)">
          <Bluetooth :size="19" aria-hidden="true" />
          {{ connection.state === 'searching' ? '请在系统界面选设备' : connection.state === 'connecting' ? '正在连接…' : '搜索九号设备' }}
        </button>
        <button v-if="demo || ['searching','connecting','connected','reading'].includes(connection.state)"
          class="button secondary" @click="emit('disconnect')">{{ demo ? '退出演示' : '断开' }}</button>
        <button v-else-if="connection.selected && ['error','lost'].includes(connection.state)" class="button secondary"
          :disabled="!capabilities.ready" @click="emit('retry')">重新连接</button>
        <button v-else class="button secondary" @click="emit('demo')"><FlaskConical :size="18" aria-hidden="true" /> 体验演示</button>
      </div>
      <details v-if="!demo && !['searching','connecting','connected','reading'].includes(connection.state)" class="advanced">
        <summary>列表里找不到车辆</summary>
        <p>有些车辆广播时省略服务 UUID，或蓝牙名称带自定义前缀。可打开附近 BLE 设备列表，手动辨认。</p>
        <button class="button secondary" :disabled="!capabilities.ready" @click="emit('connect', true)">显示附近 BLE 设备</button>
      </details>
    </section>

    <section class="card environment-card" aria-labelledby="phone-title">
      <div class="section-top">
        <span class="icon-box muted-box"><Smartphone :size="22" aria-hidden="true" /></span>
        <span class="pill" :class="capabilities.ready ? 'green' : 'amber'">{{ capabilities.ready ? '检测到蓝牙接口' : '蓝牙接口不可用' }}</span>
      </div>
      <h2 id="phone-title">手机连接</h2>
      <p v-if="capabilities.ios && capabilities.ready">当前浏览器提供蓝牙接口。在此页使用系统设备选择器。</p>
      <p v-else-if="capabilities.ios">请在 Bluefy 内打开本页的 HTTPS 地址。如使用 Safari 扩展，需先授权此站点，再刷新检测。</p>
      <p v-else>iPhone 使用 Bluefy 打开 HTTPS 地址。电脑与 Android 可使用支持 Web Bluetooth 的 Chrome 或 Edge。</p>
      <dl class="compact-list">
        <div><dt>安全上下文</dt><dd>{{ capabilities.secure ? '可用' : '需要 HTTPS' }}</dd></div>
        <div><dt>Web Bluetooth</dt><dd>{{ capabilities.bluetooth ? '检测到' : '未检测到' }}</dd></div>
      </dl>
      <a class="text-link" href="https://apps.apple.com/cn/app/bluefy-web-ble-browser/id1492822055" target="_blank" rel="noopener noreferrer">在 App Store 查看 Bluefy</a>
    </section>
  </div>

  <p class="privacy"><LockKeyhole :size="16" aria-hidden="true" /> 蓝牙通信、读数和备份在本机处理。</p>
</template>
