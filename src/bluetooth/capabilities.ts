export function detectCapabilities() {
  const ua = navigator.userAgent
  const ios = /Bluefy|iP(ad|hone|od)/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const secure = globalThis.isSecureContext === true
  const bluetooth = typeof navigator.bluetooth?.requestDevice === 'function'
  return { ios, secure, bluetooth, ready: secure && bluetooth }
}
