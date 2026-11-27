import { createApp } from 'vue'
import App from './App.vue'
import './style.css'

createApp(App).mount('#app')

if (import.meta.env.PROD && 'serviceWorker' in navigator && globalThis.isSecureContext) {
  void navigator.serviceWorker.register(new URL('./sw.js', document.baseURI), { updateViaCache: 'none' }).catch(() => {
    console.info('NineLab 离线缓存不可用，在线功能仍可使用。')
  })
}
