# 协议调查

## 直接参考和证据

DongAier 的 [`6012db7`](https://github.com/DongAier/Ninebot-BFG/commit/6012db7) 是核对版本。README 只有项目摘要。index、CSS 和图片负责界面；app.js 负责操作和读数单位；protocol.js 管理 GATT、认证、候选请求、回读和备份检查；crypto.js 处理通信加密。提交历史包含初始提交、导入网页和更新交互。源码公开，但仓库和在线页面都未给出可供复制或分发源码的明确许可。

[在线页面](https://dongaier.github.io/Ninebot-BFG/) 实际展示了临时配对的确认事项。上游使用已存在的车辆会话或需要车端物理确认的配对流程，其页面明确提示后者可能影响官方旧凭据。参考源中区分 GATT 连接、车辆认证和车辆参数查询，已认证会话另有消息认证码及计数器校验。NineLab 当前只进入标准 GATT 路径，专有认证、密钥协商和占用官方配对凭据的流程均待实车验证。

## 传输与响应

- 参考源使用 Nordic UART Service `6e400001-b5a3-f393-e0a9-e50e24dcca9e`。通常由中心向 `6e400002-…` 发送，并接收 `6e400003-…` 通知。另有现代滑板车实现公开名称空间不同的 Segway UART UUID。两者都作为候选发现服务。
- 观察公开实现时发现，固定 20 字节写分片与完整写入各有实现。iOS 需要用本车验证 MTU、写属性和通知边界。NineLab 的专有明文重组用模拟样本测试。
- 参考 BFG 命令把只读查询和配置修改分开。已解密的读取响应包含帧头、长度、源模块、目的模块、响应类型、寄存器和数据。在明文解析层检查长度、方向、响应类型及候选字段宽度。此处的“格式通过”只反映明文结构；线上完整性须由经验证的加密层提供。
- 标准 Bluetooth SIG Battery Service `180F / 2A19` 直接给出 0–100 的百分数。Device Information `180A / 2A24, 2A25, 2A26` 可读取设备型号、序列号和固件版本，语义限于公开这些字段的 BLE 设备。[Battery Service](https://www.bluetooth.com/specifications/specs/battery-service/)
- Web Bluetooth 通常只枚举站点获准访问的服务。列表中的“可见服务”应与原生 GATT 对照工具交叉核查。

## 车型和参数分歧

1. DongAier BFG 主线与 [ninebotcal `f56037e`](https://github.com/yy1142274323/ninebotcal/blob/f56037e/web/index.html) 都使用相关模块和寄存器，但针对 **Profile 电压低位**采用不同编码。两者对 **仪表电压配置** 的解释属于另一个字段。NineLab 保留原始字段值，并以各自版本标注出处。
2. Android [BFG 项目 Issue #3](https://github.com/sunce66666666/Ninebot-BFG-Calibration/issues/3) 的 A2z35c 与其他用户报告包括“配置回读后恢复原值”和配置容量寄存器表现不同。它们是社区线索，当前仍需对应车型的持久化与恢复证据。
3. 待实车抽样确认各固件版本、身份、模块路由、响应类型、原始字节、采样条件和解析结果。未知字段没有任何通用地址扫描入口。

[候选寄存器表](register-map.md) · [iPhone 实车清单](hardware-testing.md)
