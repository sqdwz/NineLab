# 候选寄存器与标准字段

以下是公开 BFG 实现的读取语义。所有专有寄存器在 NineLab 中均标记为待验证。

| 模块 | 寄存器 | 长度 | 解析线索 | 来源或写入现状 |
| --- | --- | --- | --- | --- |
| 仪表 0x01 | 0xB1 | 2 | uint16 LE × 0.01 V | BFG 界面换算 |
| 仪表 0x01 | 0x44 | 2 | uint16 LE × 0.001 Ah | BFG 界面换算 |
| 仪表 0x01 | 0xB5 | 2 | uint16 LE，候选百分比 | BFG 仪表 SOC |
| 仪表 0x01 | 0x1E | 2 | uint16 LE，单位待查 | BFG 能量参数，占用场景待查 |
| 仪表 0x01 | 0x92 | 2 | uint16 LE，保留原始 hex | 参考项目可写，NineLab 保持锁定 |
| 计量 0x10 | 0x00 | 1 | uint8 档位 | 参考项目可写，映射有分歧，NineLab 保持锁定 |
| 计量 0x10 | 0x02 | 1 | uint8，候选百分比 | BFG 计量 SOC |
| 计量 0x10 | 0x1C | 2 | uint16 LE × 0.001 Ah | 上游作为读取量，直接可写性待查 |
| 仪表 0x01 | 0x1A | 2 | uint16 LE，低 12 位分三个版本段 | BFG 仪表版本 |
| 仪表 0x01 | 0x3D | 2 | 同上 | BFG 计量版本线索 |
| 中控 0x09 | 0x02 | 2 | 同上 | BFG 中控版本线索 |

当前没有本车型的电流、温度和实时功率专有定义。模拟例中功率由模拟电压和电流计算。诊断页候选响应解析只接受一个已解密且剥除传输校验尾的白名单读取响应。

| 公开 GATT 服务 | 特征 | 对应 UI |
| --- | --- | --- |
| 180F Battery Service | 2A19 | 标准 BLE 电量 |
| 180A Device Information | 2A24 / 2A25 / 2A26 | BLE 设备型号、设备序列号、BLE 设备固件 |

[源码协议部分](https://github.com/DongAier/Ninebot-BFG/blob/6012db7/protocol.js) · [上游字段显示](https://github.com/DongAier/Ninebot-BFG/blob/6012db7/app.js)
