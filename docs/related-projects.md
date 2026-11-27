# NineLab 相关项目调查

核验日期 2026-11-27。覆盖 GitHub 主题与仓库搜索、关联分支、项目文档、国内外 App Store，以及 Apple、Bluetooth SIG 和九号官方资料。License 指仓库或子目录明确声明的许可。

## 与九号电摩、电自和原厂计量模块直接相关

| 项目 | 本次发现 | 对 NineLab 的用途 |
| --- | --- | --- |
| [DongAier/Ninebot-BFG](https://github.com/DongAier/Ninebot-BFG) | main `6012db7`，3 次提交，7 个跟踪文件。Issues 与 PR 为空，无许可证。在线页面提供配对、读取、备份与回读。 | 最接近原厂计量板的协议线索。候选字段和流程用于独立实现和核验。 |
| BFG 的公开派生 | GitHub 列出的三个 forks 中，两个与主线相同，一个落后一个提交。另有 GitHub 搜索列出的同名镜像，未见新增的车型适配证据。 | 以主线固定提交作为追溯点。 |
| [yy1142274323/ninebotcal](https://github.com/yy1142274323/ninebotcal/tree/f56037e/web) | 静态单页，`web/` 内有 MIT 许可证、自测脚本和测试向量。固件覆盖只描述 NUS＋BFG＋仪表这一组合。 | 最接近 NineLab 的额外网页参考。核对读取表、分片策略和备份流程。与 BFG 主线的 Profile 电压编码有分歧。 |
| [sunce66666666/Ninebot-BFG-Calibration](https://github.com/sunce66666666/Ninebot-BFG-Calibration) | Android 工程说明，顶层 MIT。公开 HEAD `a66494e` 已删除源码压缩包，当前树只有说明、忽略规则和许可证。 | 公开讨论对车型适配有价值。[Issue #3](https://github.com/sunce66666666/Ninebot-BFG-Calibration/issues/3) 有其他车型的容量寄存器读数差异及回读后恢复原值报告，均为社区报告。 |
| [NootNooot/segway-ninebot-ble](https://nootnooot.codeberg.page/segway-ninebot-ble/) | 多代 Segway BLE 文档。 | 核对 GATT、协议版本与消息结构。需要车型与固件对应证据。 |
| Margele/NinebotEnhance | 当前 API 返回 404，仍能查到此前公开归档的信息。相关 [KaruMono 分支](https://github.com/KaruMono/NinebotEnhance) 和 [AinaSnow 分支](https://github.com/AinaSnow/NinebotEnhance) 声明 Apache-2.0。 | 主要服务于官方 App 投屏，部分 Android 分支处理第三方保护板。它们未提供原厂铅酸计量板直连证据。 |
| [NinebotEnhance-iOS](https://github.com/zzw757026112-oss/NinebotEnhance-iOS) | 独立的 Theos 投屏增强插件，未查到明确许可。README 将若干车辆实时字段列为后续工作。 | 提供 iOS 投屏背景。独立 BLE 工作台采用公开 Core Bluetooth 接口。 |
| 韭号出行 / ninebot-desktop | GitHub 主题一度展示 SDK 与 iOS App，仓库、Git 克隆和 API 当前均返回 404。 | 当前无法核验其源码、许可或本地 BLE 能力。 |
| [GalenaHu/ninebot-connect](https://github.com/GalenaHu/ninebot-connect) | MIT，Home Assistant 九号车辆 API 集成。 | 参考字段呈现与隐私处理。NineLab 路线限定为本机直连。 |

车型与官方资料可在[九号服务与支持](https://support.ninebot.com/)查询。

## 滑板车与其他平台参考

| 项目 | 实际价值与范围 |
| --- | --- |
| [Scooter Tools App](https://github.com/62fixolab/Scooter-Tools-App) | iOS、iPadOS、macOS 的滑板车仪表参考，覆盖 Xiaomi 与部分 Ninebot G30；仓库未声明许可证。 |
| [ScooterDash](https://apps.apple.com/cn/app/scooterdash/id6760898967) | 中国区 App Store 可查的 iOS 对照应用。开发者列出 ES、G30、G2 等滑板车型号。 |
| [ownbee/ninebot-ble](https://github.com/ownbee/ninebot-ble) | MIT Python BLE 客户端。寄存器表和数据模型适用于它支持的滑板车协议族。 |
| [BobMcGlobus/ha-ninebot](https://github.com/BobMcGlobus/ha-ninebot) | AGPL-3.0，本地 BLE 电压、电流、温度、容量和多代服务发现参考，公开兼容清单偏滑板车。 |
| [segway-monitor](https://github.com/trycom-3008/segway-monitor) | MIT，Windows 本地 GT3 D 读数、第二 BMS 和导出参考。 |
| [OpenDash](https://github.com/nope0183/OpenDash) | ESP32 BLE 只读监测，README 列出 G30 / ES4。 |
| [NinebotCrypto](https://github.com/scooterhacking/NinebotCrypto) | AGPL-3.0，旧滑板车密码协议库，Swift 实现可用于比较协议代际。 |
| [etransport/ninebot-docs](https://github.com/etransport/ninebot-docs) | GPL-3.0，旧滑板车协议、模块与 UART 参考。 |
| [Scooter_Dashboard_Support](https://github.com/lucidnx/Scooter_Dashboard_Support) | GPL-3.0，VESC 与某些滑板车仪表的遥测数据分类和 BLE 行为参照。 |
| [EUC Planet](https://github.com/eried/eucplanet) | MIT，电动独轮车跨设备客户端案例。可参考多车型数据组织。 |

## iPhone 上最可用的入口

| 入口 | 依据及验证范围 |
| --- | --- |
| [Bluefy（中国区）](https://apps.apple.com/cn/app/bluefy-web-ble-browser/id1492822055) | 优先验证。第三方浏览器在 HTTPS 页面提供 Web Bluetooth。真机需核对设备筛选、服务枚举、通知及断线。 |
| [WebBLE 浏览器](https://github.com/daphtdazz/WebBLE) | Apache-2.0，公开 iOS 浏览器兼容层，README 给出支持的 API 子集。可作为 Bluefy 的独立对照。 |
| [beacio Safari 扩展](https://beacio.com/docs) | 把 Core Bluetooth 能力桥接给已授权的 Safari 站点。历史 iOSWebBLE SDK 页面指向此产品。需检查 iOS 版本、地区和扩展权限。NineLab 只检测浏览器实际暴露的接口。 |
| [Capacitor Community Bluetooth LE](https://github.com/capacitor-community/bluetooth-le) | MIT，未来若需要独立 iOS App，可保留 Vue 界面，替换原生传输层。此路径需要原生构建、签名及真机测试。 |
| [Apple Core Bluetooth](https://developer.apple.com/documentation/corebluetooth) | 原生 BLE 的官方接口和权限说明。 |
| [Nordic nRF Connect](https://github.com/nordicsemi/IOS-nRF-Connect) 与 [LightBlue](https://punchthrough.com/lightblue/) | 两个独立 iPhone GATT 观察工具，适合检查广播、服务、特征和权限。 |
| [Nordic iOS nRF Toolbox](https://github.com/nordicsemi/IOS-nRF-Toolbox) 与 [Nordic UART 样例](https://github.com/nrfconnect/sdk-nrf/tree/main/samples/bluetooth/peripheral_uart) | NUS 通用传输和测试外围设备样例。UUID 相同只能说明传输接口相同。 |
| [BLE Inspector](https://github.com/thiagotoscanomagician/ble-inspector) | Bluefy 网页与 SwiftUI/Core Bluetooth 双实现的近似案例。公开 README 报告通用 BLE 模拟测试，原生端实体设备待测，仓库未声明许可证。 |
| [CoreBluetoothMock](https://github.com/nordicsemi/IOS-CoreBluetooth-Mock) | BSD-3-Clause，原生 iOS 模拟 Bluetooth 测试库。 |
| [Bleak](https://github.com/hbldh/bleak) 与 [Chromium BLE 测试基础设施](https://github.com/chromium/chromium/blob/main/content/browser/bluetooth/README.md) | 电脑端跨平台 GATT 对照和浏览器模拟测试方法。 |
| [Web Bluetooth 实现状态](https://github.com/whatwg/bluetooth/blob/main/implementation-status.md) 与 [Chromium Web Bluetooth 指南](https://developer.chrome.com/docs/capabilities/bluetooth) | 判断平台支持、设备选择器的用户手势要求及服务授权范围。 |
