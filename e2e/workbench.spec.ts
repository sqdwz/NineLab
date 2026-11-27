import { expect, test } from '@playwright/test'

test('四个区块同页滚动，导航和返回键可定位', async ({ page, isMobile }) => {
  await page.goto('/')
  const nav = page.getByRole('navigation', { name: '工作台' })
  const connection = page.getByRole('heading', { name: '连接车辆' })
  await expect(connection).toBeInViewport()
  await expect(page.locator('main > .flow-section')).toHaveCount(4)
  await expect(nav).toHaveCSS('position', isMobile ? 'fixed' : 'static')
  await page.getByText('连接引导', { exact: true }).click()
  await expect(page.locator('.connection-guide')).toHaveAttribute('open', '')
  await page.evaluate(() => document.getElementById('read')?.scrollIntoView())
  await expect(page.getByRole('heading', { name: '电池读取' })).toBeInViewport()
  await expect(nav.getByRole('link', { name: '读取' })).toHaveAttribute('aria-current', 'location')
  await nav.getByRole('link', { name: '校准' }).click()
  await expect(page).toHaveURL(/#calibration$/)
  await expect(page.getByRole('heading', { name: '实车校准待验证' })).toBeInViewport()
  await expect(page.getByRole('button', { name: '预览并确认' })).toHaveCount(0)
  await expect(page.locator('.connection-guide')).toHaveAttribute('open', '')
  await page.goBack()
  await expect(page.getByRole('heading', { name: '电池读取' })).toBeInViewport()
  await expect(nav.getByRole('link', { name: '读取' })).toHaveAttribute('aria-current', 'location')
  await page.goto('/#diagnostic')
  await expect(page.getByRole('heading', { name: '通信诊断' })).toBeInViewport()
  await expect(nav.getByRole('link', { name: '诊断' })).toHaveAttribute('aria-current', 'location')
})

test('演示读数、校准、备份查看和恢复', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '体验演示' }).click()
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '61')
  await expect(page.getByText('计算值', { exact: true }).first()).toBeVisible()
  await page.getByRole('link', { name: '校准' }).click()
  await page.getByRole('checkbox', { name: '允许执行演示校准' }).check()
  await page.getByRole('checkbox', { name: '模拟车辆已静止' }).check()
  await page.getByRole('button', { name: '预览并确认' }).click()
  await expect(page.getByRole('dialog')).toContainText('28 Ah')
  await page.getByRole('button', { name: '确认演示操作' }).click()
  await expect(page.getByRole('status')).toHaveText('演示操作已完成，回读与目标一致。')
  await page.getByRole('button', { name: '查看', exact: true }).click()
  await expect(page.getByText('SHA-256', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '恢复', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('24 Ah')
  await page.getByRole('button', { name: '确认演示操作' }).click()
  await expect(page.getByText('2 份')).toBeVisible()
  await page.reload()
  await expect(page.getByText('2 份')).toBeVisible()
  await expect(page.getByRole('heading', { name: '实车校准待验证' })).toBeVisible()
})

test('通信诊断筛选、TXT 导出和清空', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => false })
  })
  await page.goto('/')
  await page.getByRole('button', { name: '体验演示' }).click()
  await page.getByRole('link', { name: '诊断' }).click()
  await page.getByLabel('方向').selectOption('in')
  await expect(page.getByText('模拟明文响应', { exact: false })).toHaveCount(8)
  await page.getByLabel('导出格式').selectOption('txt')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出', exact: true }).click()
  expect((await download).suggestedFilename()).toBe('ninelab-diagnostics.txt')
  await page.getByRole('button', { name: '清空' }).click()
  await expect(page.getByText('当前筛选下没有日志。')).toBeVisible()
})

test('窄屏深色模式可滚动，底栏不挡住内容', async ({ page, isMobile }) => {
  test.skip(!isMobile)
  await page.setViewportSize({ width: 320, height: 650 })
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/')
  await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(18, 24, 20)')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)
  const bottom = page.getByText('候选寄存器', { exact: true })
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  const nav = (await page.getByRole('navigation').boundingBox())!
  const text = (await bottom.boundingBox())!
  expect(text.y).toBeGreaterThanOrEqual(0)
  expect(text.y + text.height).toBeLessThan(nav.y)
})

test('生产构建离线启动', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Windows Playwright WebKit 的离线模拟不覆盖 Service Worker')
  await page.goto('/')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller))
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: '连接车辆' })).toBeVisible()
})

test('通过浏览器 GATT 接口读取标准电量，且诊断保留发现记录', async ({ page }) => {
  await page.addInitScript(() => {
    const uuid = (number: string) => '0000' + number + '-0000-1000-8000-00805f9b34fb'
    const battery = new EventTarget()
    const remoteService = {
      uuid: uuid('180f'),
      getCharacteristic: async () => characteristic,
      getCharacteristics: async () => [characteristic],
    }
    const characteristic = Object.assign(new EventTarget(), {
      uuid: uuid('2a19'), properties: { read: true, notify: true },
      readValue: async () => new DataView(Uint8Array.of(54).buffer),
      startNotifications: async () => characteristic,
    })
    const server = {
      connected: false,
      connect: async () => { server.connected = true; return server },
      disconnect: () => { server.connected = false; battery.dispatchEvent(new Event('gattserverdisconnected')) },
      getPrimaryServices: async () => [remoteService],
      getPrimaryService: async () => remoteService,
    }
    const device = Object.assign(battery, { name: 'Ninebot 测试外围设备', gatt: server })
    Object.defineProperty(navigator, 'bluetooth', {
      configurable: true,
      value: { requestDevice: async () => device },
    })
  })
  await page.goto('/')
  await page.getByText('连接引导', { exact: true }).click()
  const guide = page.locator('.connection-guide')
  await page.getByRole('button', { name: '搜索九号设备' }).click()
  await expect(guide.getByRole('listitem').last()).toHaveAttribute('aria-current', 'step')
  await page.getByRole('button', { name: '查看标准字段' }).click()
  await expect(page.getByRole('progressbar', { name: '标准 BLE 电量' })).toHaveAttribute('value', '54')
  await expect(page.getByRole('heading', { name: '电池电压' }).locator('..')).toContainText('待实车验证')
  await page.getByRole('link', { name: '连接' }).click()
  await page.getByRole('button', { name: '断开', exact: true }).click()
  await page.getByRole('link', { name: '诊断' }).click()
  await expect(page.getByText('上次连接的服务记录。')).toBeVisible()
  await expect(page.getByText('0000180f-0000-1000-8000-00805f9b34fb')).toBeVisible()
})

test('离线候选帧可解释，错误长度不产生读数', async ({ page }) => {
  await page.goto('/#diagnostic')
  await page.getByText('候选寄存器', { exact: true }).click()
  const input = page.getByLabel('离线解析候选响应')
  await input.fill('5A A5 02 01 3E 04 B1 DC 1C')
  await page.getByRole('button', { name: '解析明文' }).click()
  await expect(page.getByRole('status')).toContainText('73.88 V')
  await expect(page.getByRole('status')).toContainText('待验证')
  await input.fill('5A A5 02 01 3E 04 B1 DC')
  await page.getByRole('button', { name: '解析明文' }).click()
  await expect(page.getByRole('status')).toContainText('响应格式')
})

test('连接引导在原处展开，尊重减少动效设置', async ({ page, isMobile }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'bluetooth', { configurable: true, value: undefined })
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(page.getByRole('link', { name: '在 App Store 查看 Bluefy' })).toHaveCount(isMobile ? 1 : 0)
  const summary = page.getByText('连接引导', { exact: true })
  await summary.focus()
  await summary.press('Enter')
  const guide = page.locator('.connection-guide')
  await expect(guide).toHaveAttribute('open', '')
  await expect(guide.getByRole('listitem')).toHaveCount(3)
  for (const title of ['打开蓝牙，唤醒车辆', '选择自己的车辆', '查看电池读数']) {
    await expect(guide.getByText(title, { exact: true })).toBeVisible()
  }
  await expect(guide.locator('.guide-icon').first()).toHaveCSS('animation-name', 'none')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '搜索九号设备' })).toHaveCount(0)
  await page.getByRole('button', { name: '体验演示' }).click()
  await expect(page).toHaveURL(/#read$/)
  await expect(page.getByRole('heading', { name: '电池读取' })).toBeFocused()
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '61')
  await expect(guide.getByRole('listitem').last()).toHaveAttribute('aria-current', 'step')
})
