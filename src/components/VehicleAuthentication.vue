<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { KeyRound } from '@lucide/vue'
import type { AuthState } from '../stores/connection'

const props = defineProps<{
  available: boolean
  state: AuthState
  message: string
  unavailableMessage: string
  hasGeneratedKey: boolean
  canStart: boolean
  canSearch: boolean
  revealKey: () => string
}>()
const emit = defineEmits<{ authenticate: [key?: string]; pair: []; search: [] }>()
const password = ref<HTMLInputElement>()
const pairingOpen = ref(false)
const visibleKey = ref('')
const keyOutput = ref<HTMLInputElement>()
const canPair = computed(() => props.canStart && !props.hasGeneratedKey && props.state !== 'key-required')
const step = computed(() => {
  if (props.state === 'checking') return '正在确认车辆配对状态…'
  if (props.state === 'confirming') return '等待车端确认（最多 60 秒）。请按仪表提示操作。'
  if (props.state === 'authenticating') return '正在验证车辆密钥…'
  if (props.state === 'ready') return '车辆已认证，可读取车辆数据。'
  return props.message
})
const pairingHint = computed(() => {
  if (!props.available) return props.unavailableMessage
  if (props.state === 'key-required') return '车辆已有配对密钥，请使用已有密钥认证。'
  if (props.hasGeneratedKey) return '本次已生成密钥，可使用该密钥重新认证。'
  if (!props.canStart) return step.value || '请等当前读取结束。'
  return '确认你有权为此车配对。车端未保存密钥时，工具会生成密钥并等待车端确认。新配对可能影响官方 App 的连接。'
})

function useExisting() {
  const input = password.value
  if (!input || !props.canStart) return
  const key = input.value
  input.value = ''
  pairingOpen.value = false
  emit('authenticate', key)
}
function generate() {
  if (!canPair.value) return
  pairingOpen.value = false
  emit('pair')
}
function toggleKey() {
  visibleKey.value = visibleKey.value ? '' : props.revealKey()
}
async function copyKey() {
  try {
    await navigator.clipboard.writeText(visibleKey.value)
  } catch {
    keyOutput.value?.select()
  }
}
watch(() => props.hasGeneratedKey, (available) => { if (!available) visibleKey.value = '' })
watch(() => props.available, (available) => {
  if (!available) {
    if (password.value) password.value.value = ''
    visibleKey.value = ''
  }
})
</script>

<template>
  <section class="vehicle-auth" aria-labelledby="vehicle-auth-title">
    <h3 id="vehicle-auth-title" class="section-label"><KeyRound :size="19" aria-hidden="true" /> 车辆配对与认证</h3>
    <p v-if="step" class="notice" role="status">{{ step }}</p>
    <p v-else-if="!available && !pairingOpen" class="footnote">{{ unavailableMessage }}</p>
    <div v-if="state !== 'ready'" class="auth-methods">
      <form class="auth-form" autocomplete="off" @submit.prevent="useExisting">
        <label for="vehicle-key">已有配对密钥</label>
        <div class="auth-input-row">
          <input id="vehicle-key" ref="password" type="password" autocomplete="off" autocapitalize="off"
            spellcheck="false" maxlength="128" placeholder="十六进制密钥" required :disabled="!canStart" />
          <button type="submit" class="button secondary" :disabled="!canStart">使用密钥认证</button>
        </div>
        <button v-if="hasGeneratedKey" type="button" class="button secondary auth-reuse" :disabled="!canStart"
          @click="emit('authenticate')">使用本次生成的密钥</button>
      </form>
      <div class="auth-enroll">
        <button type="button" class="button" :class="pairingOpen ? 'secondary' : 'primary'"
          aria-controls="temporary-pairing" :aria-expanded="pairingOpen" @click="pairingOpen = !pairingOpen">
          临时配对
        </button>
        <div id="temporary-pairing" v-show="pairingOpen">
          <p class="footnote" aria-live="polite">{{ pairingHint }}</p>
          <button v-if="canPair" type="button" class="button primary auth-next" @click="generate">确认并开始配对</button>
          <button v-else-if="canSearch" type="button" class="button primary auth-next" @click="emit('search')">兼容搜索车辆</button>
        </div>
      </div>
    </div>
    <div v-if="hasGeneratedKey" class="auth-secret">
      <p class="footnote">生成的密钥保留在本页内存。是否配对成功以车辆反馈为准。刷新前可按需查看并自行保管。</p>
      <div class="button-row auth-secret-actions">
        <button type="button" class="button secondary" :aria-expanded="Boolean(visibleKey)" @click="toggleKey">
          {{ visibleKey ? '隐藏密钥' : '查看配对密钥' }}
        </button>
        <button v-if="visibleKey" type="button" class="button secondary" @click="copyKey">复制密钥</button>
      </div>
      <input v-if="visibleKey" ref="keyOutput" class="auth-output" aria-label="本次配对密钥"
        type="text" readonly :value="visibleKey" autocomplete="off" spellcheck="false" />
    </div>
  </section>
</template>

<style scoped>
.vehicle-auth { margin-top: 18px; border-top: 1px solid var(--border); padding-top: 16px; }
.auth-methods { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 250px), 1fr)); gap: 10px; margin-top: 12px; }
.auth-form, .auth-enroll { min-width: 0; padding: 12px; border: 1px solid var(--border); border-radius: 10px; }
.auth-form label { display: block; margin: 0 0 6px; font-size: .93rem; font-weight: 650; }
.auth-enroll p { color: var(--muted); }
.auth-next { margin-top: 8px; }
.auth-input-row { display: flex; flex-wrap: wrap; gap: 8px; }
.auth-input-row input, .auth-output {
  min-width: 0;
  min-height: 44px;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 6px 10px;
  color: var(--text);
  background: var(--panel);
}
.auth-input-row input { flex: 1 1 172px; max-width: 300px; }
.auth-output { display: block; width: min(100%, 32rem); margin-top: 8px; font-family: ui-monospace, monospace; }
.auth-reuse, .auth-secret { margin-top: 12px; }
.auth-secret-actions { margin-top: 8px; }
</style>
