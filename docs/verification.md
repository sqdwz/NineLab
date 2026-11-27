# v0.1 验证记录

记录日期 2026-11-27。执行环境为 Windows，Node.js 25.9.0。依赖使用源码包中的 package-lock.json。

| 检查 | 结果 |
| --- | --- |
| TypeScript 与生产构建 | `npm run build` 通过 |
| Vitest | 4 个测试文件，27 项通过 |
| Playwright | Chromium 桌面与 iPhone 13 尺寸 WebKit 共 18 项通过、2 项按平台跳过 |
| 设备选择器 | 已模拟 iPhone 兼容参数、主动改用筛选、桥接对象、蓝牙权限错误及后续 GATT 错误。Bluefy 实机待验 |
| 生产 PWA 离线启动 | Chromium 通过。手机 WebKit 用例保留给实机离线检查 |
| 移动界面 | WebKit 验证 320 px 深色模式、页内导航、连接引导（含减少动效设定）及校准确认对话框 |
| BLE 行为 | 测试注入 GATT 外设模型，验证连接、标准电量读取、订阅、超时、丢弃迟到响应、有限重连及日志保留 |
| BFG 配对与认证 | 已用独立合成向量、分片 GATT、车端确认/拒绝、已有密钥、错误密钥、断线及字段超时测试。实车待验 |
| 离线协议 | 测试明文结构、分片、连续帧、字节序、单位和候选标签 |
| 备份和恢复 | 测试 JSON 校验、追加保存、回读匹配、保护原始备份和未确认结果 |
| 实体 iPhone / Bluefy / 车辆 | 待实车验收 |
| 静态托管配置 | 已准备 GitHub Pages 工作流与 Cloudflare Pages 静态产物 |

Chromium 跳过移动窄屏专项，Windows Playwright WebKit 跳过离线 Service Worker 专项。GATT 测试使用浏览器注入或模拟传输。真实设备身份、固件兼容、标准字段是否存在和专有协议仍需采集。
