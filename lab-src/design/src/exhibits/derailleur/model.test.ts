import { describe, expect, it } from 'vitest'
import { DRIVE, cogCount, cogZ, pitchRadius } from './chainPath'
import {
  COAST,
  SHIFT,
  advanceShift,
  cadenceForWheelRpm,
  coastWheelRpm,
  createShiftState,
  driveResult,
  gearTable,
  inputPowerOf,
  isWaitingForPedal,
  ratioOf,
  requestGear,
  shiftDurationSeconds,
  shiftFrame,
  wheelRpmOf,
  wheelTorqueOf,
} from './model'

const WHEEL_RADIUS_MM = DRIVE.wheelRadius

describe('齿比与稳态读数', () => {
  it('单前盘 12 片飞轮，齿数与资料包一致', () => {
    const gears = gearTable()
    expect(gears).toHaveLength(12)
    expect(gears.map((gear) => gear.teeth)).toEqual([
      10, 12, 14, 16, 18, 21, 24, 28, 33, 39, 45, 51,
    ])
    expect(gears[0].ratio).toBeCloseTo(3, 10)
    expect(gears[11].ratio).toBeCloseTo(30 / 51, 10)
  })

  it('32 齿前盘 + 16 齿飞轮、踏频 60 rpm：后轮 120 rpm', () => {
    const ratio = ratioOf(32, 16)
    expect(ratio).toBe(2)
    expect(wheelRpmOf(60, ratio)).toBeCloseTo(120, 10)
  })

  it('同样条件下把后飞轮换成 32 齿：后轮 60 rpm', () => {
    const ratio = ratioOf(32, 32)
    expect(ratio).toBe(1)
    expect(wheelRpmOf(60, ratio)).toBeCloseTo(60, 10)
  })

  it('输入力矩 20 N·m：上述两挡理想轮端力矩分别为 10 与 20 N·m', () => {
    expect(wheelTorqueOf(20, ratioOf(32, 16))).toBeCloseTo(10, 10)
    expect(wheelTorqueOf(20, ratioOf(32, 32))).toBeCloseTo(20, 10)
  })

  it('资料包 calculation-examples.csv 三行样例逐项对上', () => {
    const samples = [
      { cogIndex: 0, ratio: 3, wheelRpm: 180, speed: 25.107608487489628, torque: 9.7 },
      { cogIndex: 6, ratio: 1.25, wheelRpm: 75, speed: 10.46150353645401, torque: 23.28 },
      {
        cogIndex: 11,
        ratio: 0.5882352941176471,
        wheelRpm: 35.294117647058826,
        speed: 4.923060487743065,
        torque: 49.47,
      },
    ]

    for (const sample of samples) {
      const result = driveResult({
        chainringTeeth: 30,
        cogIndex: sample.cogIndex,
        cadenceRpm: 60,
        torqueNm: 30,
        efficiency: 0.97,
        wheelRadiusMm: WHEEL_RADIUS_MM,
      })
      expect(result.ratio).toBeCloseTo(sample.ratio, 10)
      expect(result.wheelRpm).toBeCloseTo(sample.wheelRpm, 9)
      expect(result.speedKmh).toBeCloseTo(sample.speed, 9)
      expect(result.wheelTorqueNm).toBeCloseTo(sample.torque, 9)
      expect(result.inputPowerW).toBeCloseTo(188.49555921538757, 9)
      expect(result.outputPowerW).toBeCloseTo(182.84069243892594, 9)
    }
  })

  it('理想输入输出功率相等：η = 1 时 P_out = P_in', () => {
    const result = driveResult({
      chainringTeeth: 30,
      cogIndex: 3,
      cadenceRpm: 72,
      torqueNm: 24,
      efficiency: 1,
      wheelRadiusMm: WHEEL_RADIUS_MM,
    })
    expect(result.outputPowerW).toBeCloseTo(result.inputPowerW, 9)
    // 用轮端力矩 × 后轮角速度复核同一条关系
    expect(result.wheelTorqueNm * result.wheelRadPerSec).toBeCloseTo(result.inputPowerW, 9)
  })

  it('效率 0.97 时输出功率是输入的 0.97 倍，力矩也按同一系数缩放', () => {
    const ideal = driveResult({
      chainringTeeth: 30,
      cogIndex: 5,
      cadenceRpm: 60,
      torqueNm: 30,
      efficiency: 1,
      wheelRadiusMm: WHEEL_RADIUS_MM,
    })
    const lossy = driveResult({
      chainringTeeth: 30,
      cogIndex: 5,
      cadenceRpm: 60,
      torqueNm: 30,
      efficiency: 0.97,
      wheelRadiusMm: WHEEL_RADIUS_MM,
    })
    expect(lossy.inputPowerW).toBeCloseTo(ideal.inputPowerW, 12)
    expect(lossy.outputPowerW / lossy.inputPowerW).toBeCloseTo(0.97, 12)
    expect(lossy.wheelTorqueNm / ideal.wheelTorqueNm).toBeCloseTo(0.97, 12)
    // 转速不受效率影响
    expect(lossy.wheelRpm).toBeCloseTo(ideal.wheelRpm, 12)
  })

  it('踏频为 0 时轮速、车速、功率全为 0', () => {
    const result = driveResult({
      chainringTeeth: 30,
      cogIndex: 2,
      cadenceRpm: 0,
      torqueNm: 30,
      efficiency: 0.97,
      wheelRadiusMm: WHEEL_RADIUS_MM,
    })
    expect(result.wheelRpm).toBe(0)
    expect(result.speedKmh).toBe(0)
    expect(result.inputPowerW).toBe(0)
    expect(result.outputPowerW).toBe(0)
    // 力矩关系仍然成立：不踩的时候链不传力，但这一格的算式不随踏频变
    expect(result.wheelTorqueNm).toBeCloseTo(0.97 * 30 / (30 / 14), 10)
  })

  it('输入功率用 2π 换算，不用错误系数', () => {
    expect(inputPowerOf(30, 60)).toBeCloseTo(Math.PI * 60, 10)
    expect(inputPowerOf(10, 0)).toBe(0)
  })

  it('同一后轮转速下各挡所需踏频 = 轮速 / 齿比', () => {
    const needed = cadenceForWheelRpm(90)
    const gears = gearTable()
    for (let i = 0; i < gears.length; i += 1) {
      expect(needed[i]).toBeCloseTo(90 / gears[i].ratio, 10)
    }
    // 齿比越大（挡位越重）所需踏频越低
    expect(needed[0]).toBeLessThan(needed[11])
  })

  it('节圆半径公式 r = p / (2 sin(π/N))', () => {
    expect(pitchRadius(30)).toBeCloseTo(12.7 / (2 * Math.sin(Math.PI / 30)), 10)
    expect(pitchRadius(10)).toBeLessThan(pitchRadius(51))
  })
})

describe('换挡状态机', () => {
  it('请求新挡位只改目标，不立刻改啮合', () => {
    const state = createShiftState(6)
    const next = requestGear(state, 2)
    expect(next.target).toBe(2)
    expect(next.engaged).toBe(6)
    expect(next.shift).toBeNull()
    expect(isWaitingForPedal(next)).toBe(true)
  })

  it('链条不动时换挡请求一直排队', () => {
    let state = requestGear(createShiftState(6), 2)
    for (let i = 0; i < 20; i += 1) {
      const advanced = advanceShift(state, 0)
      state = advanced.state
      expect(advanced.completed).toBe(false)
    }
    expect(state.engaged).toBe(6)
    expect(state.shift).toBeNull()
    expect(isWaitingForPedal(state)).toBe(true)
  })

  it('链条走完 SHIFT.travelMm 才完成一次啮合切换，且一次只换一挡', () => {
    let state = requestGear(createShiftState(6), 2)
    const step = SHIFT.travelMm / 4
    let completions = 0
    let sawTooth = 0

    for (let i = 0; i < 40; i += 1) {
      const advanced = advanceShift(state, step)
      state = advanced.state
      if (advanced.completed) completions += 1
      if (state.shift) {
        sawTooth += 1
        // 过渡中 from/to 必须是相邻的整数齿片
        expect(Math.abs(state.shift.to - state.shift.from)).toBe(1)
      }
    }

    expect(completions).toBe(4)
    expect(state.engaged).toBe(2)
    expect(state.target).toBe(2)
    expect(state.shift).toBeNull()
    expect(sawTooth).toBeGreaterThan(0)
  })

  it('连续点击只保留最后一个合法目标，端点不越界', () => {
    let state = createShiftState(6)
    state = requestGear(state, 0)
    state = requestGear(state, -5)
    expect(state.target).toBe(0)
    state = requestGear(state, 99)
    expect(state.target).toBe(cogCount() - 1)

    // 一路朝目标换过去，不会冲出端点
    for (let i = 0; i < 200; i += 1) {
      state = advanceShift(state, SHIFT.travelMm).state
    }
    expect(state.engaged).toBe(cogCount() - 1)
  })

  it('从 0 挡直接点到 11 挡，会一挡一挡走完 11 次', () => {
    let state = requestGear(createShiftState(0), 11)
    let completions = 0
    for (let i = 0; i < 200; i += 1) {
      const advanced = advanceShift(state, SHIFT.travelMm)
      state = advanced.state
      if (advanced.completed) completions += 1
    }
    expect(completions).toBe(11)
    expect(state.engaged).toBe(11)
  })

  it('过渡中改目标：当前这一段走完后继续朝新目标换', () => {
    let state = requestGear(createShiftState(6), 5)
    state = advanceShift(state, SHIFT.travelMm * 0.5).state
    expect(state.shift?.to).toBe(5)
    state = requestGear(state, 0)
    expect(state.target).toBe(0)
    // 先把 5 走完
    state = advanceShift(state, SHIFT.travelMm * 0.5).state
    expect(state.engaged).toBe(5)
    expect(state.shift?.to).toBe(4)
  })

  it('换挡过渡：后拨先到位、链条后跨越、跨越时抬起越过齿顶', () => {
    const zFrom = cogZ(6)
    const zTo = cogZ(5)
    const idle = shiftFrame(createShiftState(6))
    expect(idle.shifting).toBe(false)
    expect(idle.contactRadiusMm).toBeCloseTo(gearTable()[6].pitchRadiusMm, 9)
    expect(idle.contactPlaneZ).toBeCloseTo(zFrom, 9)

    // 刚开始：链条还贴着原齿片，后拨已经动了一点
    const early = shiftFrame(advanceShift(requestGear(createShiftState(6), 5), SHIFT.travelMm * 0.15).state)
    expect(early.contactPlaneZ).toBeCloseTo(zFrom, 6)
    expect(early.contactRadiusMm).toBeCloseTo(gearTable()[6].pitchRadiusMm, 6)
    expect(Math.abs(early.derailleurPlaneZ - zFrom)).toBeGreaterThan(0.4)

    // 过半：链条抬到两侧齿片齿顶之外，平面在两片之间
    const middle = shiftFrame(advanceShift(requestGear(createShiftState(6), 5), SHIFT.travelMm * 0.73).state)
    const outer = Math.max(gearTable()[5].pitchRadiusMm, gearTable()[6].pitchRadiusMm)
    expect(middle.contactRadiusMm).toBeGreaterThan(outer)
    expect(middle.contactPlaneZ).toBeGreaterThan(Math.min(zFrom, zTo))
    expect(middle.contactPlaneZ).toBeLessThan(Math.max(zFrom, zTo))

    // 收尾：落到新齿片的节圆半径与平面
    const late = shiftFrame(advanceShift(requestGear(createShiftState(6), 5), SHIFT.travelMm * 0.999).state)
    expect(late.contactRadiusMm).toBeCloseTo(gearTable()[5].pitchRadiusMm, 1)
    expect(late.contactPlaneZ).toBeCloseTo(zTo, 1)
  })

  it('换挡时长随踏频变化：60 rpm 约 0.6 s，0 rpm 不完成', () => {
    expect(shiftDurationSeconds(60)).toBeCloseTo(SHIFT.baseSeconds, 6)
    expect(shiftDurationSeconds(120)).toBeCloseTo(SHIFT.baseSeconds / 2, 6)
    expect(shiftDurationSeconds(0)).toBe(Infinity)
  })
})

describe('滑行', () => {
  it('后轮转速按教学阻尼衰减，且不套用稳态齿比关系', () => {
    expect(coastWheelRpm(COAST.initialWheelRpm, 0)).toBe(COAST.initialWheelRpm)
    expect(coastWheelRpm(COAST.initialWheelRpm, 1)).toBeLessThan(COAST.initialWheelRpm)
    expect(coastWheelRpm(COAST.initialWheelRpm, 2)).toBeLessThan(coastWheelRpm(90, 1))
    // 滑行时轮速与踏频无关（这里踏频恒为 0）
    expect(coastWheelRpm(90, 3)).toBeGreaterThan(0)
  })
})
