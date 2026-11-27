# 兼容性

| 入口 | 当前状态 |
| --- | --- |
| iPhone / iPad · Bluefy | 主选浏览器，站点实际检测 HTTPS 和 `requestDevice`。蓝牙权限、设备选择、通知、文件分享待同一台真机验证。 |
| iPhone / iPad · Safari 或添加至主屏 PWA | 可浏览、用演示和本地备份。普通安装没有原生 Web Bluetooth。若使用带 Core Bluetooth 桥接的扩展，需要明确允许此站点。 |
| iOS · WebBLE / beacio | 可作第二套实验入口。由页面检测 API，确认 GATT 与文件行为后再记录支持状态。 |
| iOS · Chrome / Edge | 普通入口可运行页面和演示。默认不把浏览器品牌作为 BLE 能力依据。 |
| Windows Chrome / Edge、macOS Chrome、Android Chrome | 用可用的 Web Bluetooth 和安全上下文。Windows 桌面 Chromium 已测界面，其他平台和实车待验。 |
| 原生 iOS App | 可沿用 Vue，通过 Capacitor + Core Bluetooth 另行封装。需要 iOS 签名及实体设备。 |

移动端底部导航按安全区域留边。窄屏宽度和深色模式已用 iPhone 尺寸的 WebKit 验证。切后台时自动读取暂停，回到页面可手动恢复。单个前台连接遇到意外断开时最多自动尝试重新连接一次，重新连接后，专有读取需要重新认证。需要时可用当前页面保留的新密钥。

| 车型或设备 | GATT | 专有读取 | 写入 |
| --- | --- | --- | --- |
| 九号电自与电摩的 BFG Nordic UART | 分片和认证已通过模拟 | 仅内置候选字段，实车待验证 | 锁定 |
| G30、GT3 D、ES 等滑板车 | 仅有各参考项目自己的范围 | 本项目待验证 | 锁定 |
| 提供标准 180F / 180A 的 BLE 外设 | 已实现，模拟 GATT 已测 | 不适用 | 不适用 |

[WebKit 立场](https://github.com/WebKit/standards-positions/issues/570) · [Bluefy 中国区](https://apps.apple.com/cn/app/bluefy-web-ble-browser/id1492822055) · [Web Bluetooth 平台列表](https://github.com/whatwg/bluetooth/blob/main/implementation-status.md)
