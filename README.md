# NineLab · 九号电池实验室

NineLab 是在浏览器中运行的中文本地 BLE 工作台。v0.1 可查看蓝牙设备的 GATT 服务和标准字段，也可独立演示读取、校准和备份恢复。

[打开 NineLab](https://sqdwz.github.io/NineLab/)

## 运行

需要 Node.js 22.12+ 或 24+。

```powershell
npm ci
npm run dev
```

```powershell
npm run check
npm test
npm run build
npx playwright install chromium webkit
npm run test:ui
```

生产交付为 `dist/`。使用 `npm run preview` 本地预览。电脑可用 localhost。iPhone 实机蓝牙请使用可信 HTTPS 地址并在 Bluefy 内打开。

## 快速上手

连接区直接显示「连接引导」，并标出当前步骤。向下滚动可依次进入读取、校准和诊断，也可用导航定位到相应区块。浏览器不具备蓝牙能力时，页面会显示对应入口，也可以进入演示。

连接区直接显示「使用密钥认证」和「生成密钥并配对」。检测到兼容 BFG 通道后，才可提交认证或发起配对。车端已有配对时，需要已有有效密钥。新配对需按仪表提示完成车端确认，可能影响官方 App。密钥保存在当前页面内存。

## 现有功能

| 功能 | 交付状态 |
| --- | --- |
| 连接、读取、校准和诊断单页 | 已实现，已通过 Chromium 和 iPhone 尺寸 WebKit 的模拟交互测试 |
| BLE 选择器、连接、服务发现、标准读取和电量通知 | 已实现，模拟 GATT 已测，iPhone 与车辆实机待验证 |
| 九号 BFG 配对、认证和寄存器读取 | 已实现 Nordic UART 的 BFG Encryption2 流程并通过模拟。车型及实车待验证，读数字段含义待核对 |
| 备份、JSON 校验与恢复 | 已实现并验证演示流程。演示文件包含设备身份、固件、原始参数、时间和完整性校验 |
| 实车校准与参数恢复 | 已锁定。容量、SOC、能量和持久化规则等待固件级验证 |
| 本地诊断 | 已实现 GATT UUID、日志筛选和导出、离线候选明文解析 |
| PWA 和静态构建 | 已实现离线页面缓存。BLE 仍取决于运行页面的浏览器 |

### 代码入口

- `src/views/` 提供工作台的四个区块。布局按用户提供的视觉描述独立实现。
- `src/bluetooth/` 是真实 GATT 传输。它只读取明确列出的标准特征，并订阅标准 Battery Level。
- `src/stores/` 管理实车连接状态与独立演示会话。
- `src/protocol/` 解析标准 BLE 字段和候选寄存器明文。
- `src/calibration/` 校验演示档位，执行预检、备份、单次写入和回读。
- `src/storage/` 处理本机 IndexedDB 与文件导入导出。

### 文档

- [相关项目调研](docs/related-projects.md)
- [协议研究](docs/protocol-research.md) · [寄存器表](docs/register-map.md)
- [iOS 与浏览器兼容](docs/compatibility.md) · [实车验证表](docs/hardware-testing.md)
- [校准与备份机制](docs/calibration-safety.md)
- [部署说明](docs/deployment.md) · [第三方许可证](docs/third-party.md)
- [验证记录](docs/verification.md)
