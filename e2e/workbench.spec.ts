import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, resolve, sep } from 'node:path'
import { expect, test } from '@playwright/test'
import { BfgCipher, bfgBootstrapMask, joinBytes, sealBootstrap } from '../src/protocol/bfg-crypto'
import { parseBfgKey } from '../src/protocol/bfg-session'
import { registerClues } from '../src/protocol/registers'

test('四个区块同页滚动，导航和返回键可定位', async ({ page, isMobile }) => {
  await page.goto('/')
  const nav = page.getByRole('navigation', { name: '工作台' })
  const connection = page.getByRole('heading', { name: '连接车辆' })
  await expect(connection).toBeInViewport()
  await expect(page.locator('main > .flow-section')).toHaveCount(4)
  await expect(nav).toHaveCSS('position', isMobile ? 'fixed' : 'static')
  const guide = page.getByRole('region', { name: '连接引导' })
  await expect(guide.getByRole('listitem')).toHaveCount(4)
  await expect(guide.getByText('连接蓝牙', { exact: true })).toBeVisible()
  await page.evaluate(() => document.getElementById('read')?.scrollIntoView())
  await expect(page.getByRole('heading', { name: '电池读取' })).toBeInViewport()
  await expect(nav.getByRole('link', { name: '读取' })).toHaveAttribute('aria-current', 'location')
  await nav.getByRole('link', { name: '校准' }).click()
  await expect(page).toHaveURL(/#calibration$/)
  await expect(page.getByRole('heading', { name: '实车校准待验证' })).toBeInViewport()
  await expect(page.getByRole('button', { name: '预览并确认' })).toHaveCount(0)
  await expect(guide).toBeVisible()
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

test('生产 PWA 在线刷新加载新页面，离线时仍能启动', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Windows Playwright WebKit 的离线模拟不覆盖 Service Worker')
  const directory = resolve('dist')
  const types: Record<string, string> = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
    '.png': 'image/png', '.webmanifest': 'application/manifest+json',
  }
  let release = 'one'
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
    const file = resolve(directory, pathname.slice(1) || 'index.html')
    if (!file.startsWith(directory + sep)) { response.writeHead(404).end(); return }
    try {
      const body = await readFile(file)
      const extension = extname(file)
      const payload = extension === '.html' ? body.toString('utf8').replace('</head>',
        '<meta name="qa-release" content="' + release + '" /></head>') : body
      response.writeHead(200, { 'Content-Type': types[extension] ?? 'application/octet-stream', 'Cache-Control': 'no-store' })
      response.end(payload)
    } catch {
      response.writeHead(404).end()
    }
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  try {
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('PWA test server address is unavailable')
    await page.goto('http://127.0.0.1:' + address.port + '/')
    await page.evaluate(() => navigator.serviceWorker.ready)
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller))
    const marker = page.locator('meta[name="qa-release"]')
    await expect(marker).toHaveAttribute('content', 'one')
    release = 'two'
    await page.reload()
    await expect(marker).toHaveAttribute('content', 'two')

    await context.setOffline(true)
    await page.reload()
    await expect(page.getByRole('heading', { name: '连接车辆' })).toBeVisible()
    await expect(marker).toHaveAttribute('content', 'one')
  } finally {
    await new Promise<void>((done) => server.close(() => done()))
  }
})

test('通过浏览器 GATT 接口读取标准电量，且诊断保留发现记录', async ({ page, isMobile }) => {
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
      getPrimaryService: async (requested: string) => {
        if (requested !== remoteService.uuid) throw new DOMException('Service not present', 'NotFoundError')
        return remoteService
      },
    }
    const device = Object.assign(battery, { name: 'Ninebot 测试外围设备', gatt: server })
    Object.defineProperty(navigator, 'bluetooth', {
      configurable: true,
      value: { requestDevice: async () => device },
    })
  })
  await page.goto('/')
  const guide = page.locator('.connection-guide')
  if (isMobile) await page.getByLabel('蓝牙筛选').selectOption('nearby')
  await page.getByRole('button', { name: '搜索蓝牙设备' }).click()
  await expect(guide.getByRole('listitem').last()).toHaveAttribute('aria-current', 'step')
  const auth = page.getByRole('region', { name: '车辆配对与认证' })
  await expect(auth).toContainText('当前设备未发现九号配对通道')
  await expect(auth.getByRole('button', { name: '使用密钥认证' })).toBeDisabled()
  await expect(auth.getByRole('button', { name: '生成密钥并配对' })).toBeDisabled()
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

test('连接引导始终可见并尊重减少动效设置', async ({ page, isMobile }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'bluetooth', { configurable: true, value: undefined })
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(page.getByRole('link', { name: '在 App Store 查看 Bluefy' })).toHaveCount(isMobile ? 1 : 0)
  const guide = page.getByRole('region', { name: '连接引导' })
  await expect(guide.getByRole('listitem')).toHaveCount(4)
  for (const title of ['唤醒车辆', '连接蓝牙', '配对与认证', '读取电池']) {
    await expect(guide.getByText(title, { exact: true })).toBeVisible()
  }
  await expect(guide.locator('.guide-icon').first()).toHaveCSS('animation-name', 'none')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '搜索蓝牙设备' })).toHaveCount(0)
  await page.getByRole('button', { name: '体验演示' }).click()
  await expect(page).toHaveURL(/#read$/)
  await expect(page.getByRole('heading', { name: '电池读取' })).toBeFocused()
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '61')
  await expect(guide.getByRole('listitem').last()).toHaveAttribute('aria-current', 'step')
})

test('直接打开 BFG UART 并用已有密钥通过分片 GATT 读取车辆数据', async ({ page, isMobile }) => {
  const source = new TextEncoder().encode('NINELAB_TEST_01')
  const name = new TextDecoder().decode(source)
  const key = '00112233445566778899aabbccddeeff'
  const serial = new TextEncoder().encode('SIMULATED12345')
  const challenge = Uint8Array.from({ length: 16 }, (_, index) => index + 1)
  const mask = await bfgBootstrapMask(name)
  const cipher = await BfgCipher.create(parseBfgKey(key), challenge)
  const reply = (module: number, command: number, index: number, data: Uint8Array) =>
    joinBytes(Uint8Array.of(0x5a, 0xa5, data.length, module, 0x3e, command, index), data)
  const packet = (module: number, command: number, index: number, data: Uint8Array) =>
    joinBytes(Uint8Array.of(0x5a, 0xa5, data.length, 0x3e, module, command, index), data)
  const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex')
  const lookup: Record<string, string> = {}
  const hello = packet(4, 0x5b, 0, new Uint8Array())
  lookup[hex(sealBootstrap(hello, mask))] = hex(sealBootstrap(reply(4, 0x5b, 1, joinBytes(challenge, serial)), mask))
  lookup[hex(await cipher.seal(2, packet(4, 0x5d, 0, serial)))] =
    hex(await cipher.seal(3, reply(4, 0x5d, 1, new Uint8Array())))
  for (const [index, item] of registerClues.entries()) {
    const counter = index * 2 + 4
    const data = item.width === 1 ? Uint8Array.of(63) : Uint8Array.of(63, 0)
    lookup[hex(await cipher.seal(counter, packet(item.module, 1, item.register, Uint8Array.of(item.width))))] =
      hex(await cipher.seal(counter + 1, reply(item.module, 4, item.register, data)))
  }
  await page.addInitScript(({ name, lookup, isMobile }) => {
    const uart = '6e400001-b5a3-f393-e0a9-e50e24dcca9e'
    const rx = Object.assign(new EventTarget(), {
      uuid: uart.replace('0001', '0003'), properties: { notify: true },
      value: undefined as DataView | undefined,
      startNotifications: async () => rx,
    })
    let assembling: number[] = []
    const tx = {
      uuid: uart.replace('0001', '0002'), properties: { write: true, writeWithoutResponse: true },
      writeValueWithResponse: async () => { throw new Error('This peripheral uses writes without response') },
      writeValueWithoutResponse: async (chunk: Uint8Array) => {
        if (chunk.length > 20) throw new Error('BLE mock accepts fragments of up to 20 bytes')
        assembling.push(...chunk)
        if (assembling.length < 3 || assembling.length < assembling[2]! + 13) return
        const encrypted = lookup[assembling.map((value) => value.toString(16).padStart(2, '0')).join('')]
        assembling = []
        if (!encrypted) throw new Error('Unexpected authenticated request')
        const response = Uint8Array.from(encrypted.match(/../g)!, (pair) => Number.parseInt(pair, 16))
        for (const part of [response.slice(0, 9), response.slice(9)]) {
          rx.value = new DataView(part.buffer)
          rx.dispatchEvent(new Event('characteristicvaluechanged'))
        }
      },
    }
    const service = {
      uuid: uart,
      getCharacteristics: async () => {
        if (!isMobile) throw new DOMException('Use lookup by UUID', 'NotSupportedError')
        return [tx, rx]
      },
      getCharacteristic: async (uuid: string) => {
        if (isMobile) throw new DOMException('Use characteristic listing', 'NotSupportedError')
        return uuid === tx.uuid ? tx : rx
      },
    }
    const gatt = {
      connected: false,
      connect: async () => { gatt.connected = true; return gatt },
      disconnect: () => { gatt.connected = false },
      getPrimaryServices: async () => isMobile
        ? [{ uuid: '180f', getCharacteristics: async () => [] }]
        : [service],
      getPrimaryService: async (uuid: string) => {
        if (uuid !== uart) throw new DOMException('Service not present', 'NotFoundError')
        return service
      },
    }
    Object.defineProperty(navigator, 'bluetooth', {
      configurable: true,
      value: { requestDevice: async () => Object.assign(new EventTarget(), { name, gatt }) },
    })
  }, { name, lookup, isMobile })

  await page.goto('/')
  const auth = page.getByRole('region', { name: '车辆配对与认证' })
  const search = page.getByRole('button', { name: '搜索蓝牙设备' })
  const authenticate = auth.getByRole('button', { name: '使用密钥认证' })
  const confirmPairing = auth.getByRole('checkbox', { name: '我有权操作此车，并已了解配对影响' })
  const pair = auth.getByRole('button', { name: '生成密钥并配对' })
  await expect(auth).toBeVisible()
  await expect(authenticate).toBeVisible()
  await expect(pair).toBeVisible()
  await expect(authenticate).toBeDisabled()
  await expect(pair).toBeDisabled()
  if (isMobile) {
    await search.click()
    await expect(authenticate).toBeEnabled()
    await page.getByRole('button', { name: '断开', exact: true }).click()
    await expect(authenticate).toBeDisabled()
    await page.getByLabel('蓝牙筛选').selectOption('name-prefix')
    await page.getByLabel('设备名称前缀').fill(name)
  }
  await search.click()
  await expect(authenticate).toBeEnabled()
  const activeStep = page.getByRole('region', { name: '连接引导' }).locator('[aria-current=step]')
  await expect(activeStep).toContainText('配对与认证')
  await expect(page.getByRole('button', { name: '查看标准字段' })).toHaveCount(0)
  await expect(pair).toBeDisabled()
  await confirmPairing.check()
  await expect(pair).toBeEnabled()
  await confirmPairing.uncheck()
  const field = auth.getByLabel('已有配对密钥')
  await field.fill('invalid')
  await authenticate.click()
  await expect(auth.getByRole('status')).toContainText('32 或 64 位')
  await field.fill(key)
  await authenticate.click()
  await expect(auth.getByRole('status')).toContainText('已认证')
  await expect(activeStep).toContainText('读取电池')
  await page.getByRole('button', { name: '读取车辆数据' }).click()
  await expect(page.getByRole('progressbar', { name: '计量模块 SOC' })).toHaveAttribute('value', '63')
  await expect(page.getByText('实读 · 含义待核验').first()).toBeVisible()
  const logged = await page.locator('#diagnostic .log-output').innerText()
  expect(logged).not.toContain(key)
  expect(logged).not.toContain('SIMULATED12345')
})

test('按蓝牙筛选条件打开选择器，错误可恢复且不记录名称前缀', async ({ page, isMobile }) => {
  await page.addInitScript(({ isMobile }) => {
    const uart = '6e400001-b5a3-f393-e0a9-e50e24dcca9e'
    const remote = {
      connected: false,
      connect: async () => { remote.connected = true },
      disconnect: () => { remote.connected = false },
      getPrimaryServices: async () => [],
      getPrimaryService: async () => { throw new DOMException('Absent service', 'NotFoundError') },
    }
    const chosen = { name: 'BLE compatibility mock', gatt: remote, ongattserverdisconnected: null }
    let attempts = 0
    Object.defineProperty(navigator, 'bluetooth', {
      value: { requestDevice: async (options: RequestDeviceOptions) => {
        if (navigator.userActivation && !navigator.userActivation.isActive) {
          throw new DOMException('Transient activation is required', 'SecurityError')
        }
        if (++attempts === 1) {
          if (isMobile && JSON.stringify(options) !== JSON.stringify({ acceptAllDevices: true, optionalServices: [uart] })) {
            throw new DOMException('iPhone must use the minimal BFG request', 'NotSupportedError')
          }
          if (!isMobile && !('filters' in options)) throw new DOMException('Expected desktop filters', 'NotSupportedError')
          throw { name: 'TypeError', message: 'Unsupported request options (internal private mock detail)' }
        }
        if (attempts === 2) {
          const expected = isMobile
            ? { filters: [{ services: [uart] }], optionalServices: [uart], acceptAllDevices: false }
            : { acceptAllDevices: true, optionalServices: [uart] }
          if (JSON.stringify(options) !== JSON.stringify(expected)) {
            throw new DOMException('Unexpected fallback', 'NotSupportedError')
          }
        } else {
          if (attempts !== 3 || !('filters' in options) || options.filters.length !== 1 ||
              options.filters[0]?.namePrefix !== 'TestPrefix' || !options.optionalServices?.includes(uart)) {
            throw new DOMException('Unexpected prefix filter', 'NotSupportedError')
          }
        }
        return chosen
      } },
    })
  }, { isMobile })
  await page.goto('/')
  const filter = page.getByLabel('蓝牙筛选')
  const search = page.getByRole('button', { name: '搜索蓝牙设备' })
  await expect(filter).toHaveValue(isMobile ? 'bfg-compatible' : 'ninebot')
  await search.click()
  await expect(page.locator('#connection').getByRole('status')).toContainText('未接受这组搜索条件')
  const log = page.locator('#diagnostic .log-output')
  await expect(log).toContainText('设备选择器 · ' + (isMobile ? 'iPhone 兼容' : '九号筛选') + ' · TypeError')
  await expect(log).not.toContainText('private mock detail')
  await expect(log).not.toContainText('设备已选中')
  await filter.selectOption(isMobile ? 'bfg-filtered' : 'bfg-compatible')
  await search.click()
  await expect(page.getByText('已连接 · 未认证', { exact: true })).toBeVisible()
  await expect(log).toContainText('设备已选中')
  await expect(log).toContainText('GATT 已建立')
  await page.getByRole('button', { name: '断开', exact: true }).click()
  await filter.selectOption('name-prefix')
  const input = page.getByLabel('设备名称前缀')
  await expect(search).toBeDisabled()
  await input.fill('   ')
  await expect(search).toBeDisabled()
  await input.fill('  TestPrefix  ')
  await search.click()
  await expect(page.getByText('已连接 · 未认证', { exact: true })).toBeVisible()
  await expect(log).toContainText('设备已选中 · 名称前缀')
  await expect(log).not.toContainText('TestPrefix')
})
