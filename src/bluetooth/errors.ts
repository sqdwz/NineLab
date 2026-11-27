const knownNames = [
  'AbortError', 'NotFoundError', 'NotAllowedError', 'SecurityError', 'TypeError',
  'NotSupportedError', 'InvalidStateError', 'NetworkError', 'TimeoutError', 'OperationError',
  'NotReadableError', 'InvalidAccessError', 'UnknownError',
] as const

export function bluetoothFailure(error: unknown) {
  const fields = typeof error === 'object' && error !== null ? error as { name?: unknown; message?: unknown } : undefined
  const message = typeof error === 'string' ? error : typeof fields?.message === 'string' ? fields.message : ''
  const name = knownNames.find((value) => value === fields?.name || message.startsWith(value + ':')) ?? '未知错误'
  if (/user (?:gesture|activation)|transient activation|用户手势|用户激活/i.test(message)) {
    return { name, reason: 'activation' as const, hint: '请在当前页面直接点搜索按钮，重新打开系统设备列表。' }
  }
  if (/powered[ -]?off|bluetooth (?:is )?(?:off|disabled|not enabled)|蓝牙未开启|蓝牙已关闭/i.test(message)) {
    return { name, reason: 'off' as const, hint: '请打开系统蓝牙，然后回到当前页面重新搜索。' }
  }
  if (name === 'NotAllowedError' || name === 'SecurityError' || /permission|unauthori[sz]ed|权限/i.test(message)) {
    return { name, reason: 'permission' as const, hint: '请确认当前浏览器有系统蓝牙权限，并在浏览器内直接打开此 HTTPS 页面。' }
  }
  if (name === 'NotFoundError' || name === 'AbortError') {
    return { name, reason: 'unselected' as const, hint: '未选择设备。如果列表为空，请唤醒车辆后换一种搜索方式。' }
  }
  if (name === 'TypeError' || name === 'NotSupportedError') {
    return { name, reason: 'unsupported' as const, hint: '当前浏览器未接受这组搜索条件。请切换「蓝牙筛选」后重试。' }
  }
  return { name, reason: 'other' as const, hint: '请确认蓝牙已开启，再切换搜索方式重试。' }
}
