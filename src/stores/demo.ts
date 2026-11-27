import { shallowRef } from 'vue'
import type { Readings, VehicleIdentity } from '../domain'
import { ReplyBuffer, interpretReply } from '../protocol/codec'
import { hexBytes } from '../protocol/registers'
import type { RecordLog } from './connection'
import type { CalibrationPort, MeterSnapshot } from '../calibration/calibration'

const identity: VehicleIdentity = {
  model: 'NineLab 演示台', serial: 'NINELAB-DEMO-01',
  firmware: { dashboard: 'DEMO-1.0', center: 'DEMO-1.0', meter: 'DEMO-1.0' },
}

const samples = [
  [1, 0xb1, 0xdc, 0x1c], [1, 0x44, 0xa0, 0x3f], [1, 0xb5, 62, 0],
  [1, 0x1e, 0x52, 0x07], [1, 0x92, 0x11, 0], [0x10, 0x02, 61],
]

export function createDemo(log: RecordLog) {
  const snapshot = shallowRef<MeterSnapshot>({
    identity, profile: 0, capacityMah: 24000, profileRaw: '00', capacityRaw: 'C0 5D',
  })
  const readings = shallowRef<Readings>({})

  function refresh() {
    const time = new Date().toISOString()
    const set = snapshot.value
    const simulated: Readings = {}
    const parser = new ReplyBuffer()
    const load = [...samples, [0x10, 0x00, set.profile],
      [0x10, 0x1c, set.capacityMah & 255, set.capacityMah >> 8]]
    for (const [module, register, ...payload] of load) {
      const bytes = Uint8Array.of(0x5a, 0xa5, payload.length, module!, 0x3e, 4, register!, ...payload)
      log('out', '模拟读取 ' + hexBytes(Uint8Array.of(module!, register!)))
      parser.push(bytes.slice(0, 4))
      for (const reply of parser.push(bytes.slice(4))) {
        const { field, reading } = interpretReply(reply, time)
        simulated[field] = { ...reading, origin: 'demo' }
        log('in', '模拟明文响应 ' + reading.source, {
          decoded: hexBytes(bytes), raw: reading.raw, duration: 0, check: '帧结构通过',
        })
      }
    }
    const manual = (value: number | string, source = '演示样本') => ({ value, source, time, origin: 'demo' as const })
    simulated.model = manual(identity.model)
    simulated.serial = manual(identity.serial)
    simulated.batteryType = manual('铅酸电池')
    simulated.firmwareDashboard = manual(identity.firmware.dashboard!)
    simulated.firmwareCenter = manual(identity.firmware.center!)
    simulated.firmwareMeter = manual(identity.firmware.meter!)
    simulated.current = manual(3.8)
    simulated.temperature = manual(26)
    simulated.power = { ...manual(Number((Number(simulated.voltage?.value) * 3.8).toFixed(1)), '演示电压 × 演示电流'), origin: 'calculated' }
    readings.value = simulated
  }

  const port: CalibrationPort = {
    read: async () => snapshot.value,
    write: async (target) => {
      const capacity = target.capacityMah
      snapshot.value = {
        identity, profile: target.profile, capacityMah: capacity,
        profileRaw: hexBytes(Uint8Array.of(target.profile)),
        capacityRaw: hexBytes(Uint8Array.of(capacity & 255, capacity >> 8)),
      }
      log('out', '仅模拟计量模块写入')
      refresh()
    },
  }
  return { snapshot, readings, refresh, port }
}
