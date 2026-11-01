import { describe, expect, it } from 'vitest'
import { createDrivetrainController } from './controller'
import { SHIFT } from './model'
import { pitchRadius } from './chainPath'

const TAU = Math.PI * 2

/** 用固定帧间隔跑 n 秒，返回快照 */
function run(controller: ReturnType<typeof createDrivetrainController>, fps: number, seconds: number) {
  const dt = 1 / fps
  const steps = Math.round(seconds * fps)
  for (let i = 0; i < steps; i += 1) controller.tick(dt)
  return controller.get()
}

describe('运动积分', () => {
  it('不同刷新率下，相同模拟时间得到一致角度', () => {
    const a = createDrivetrainController({ initialCog: 6 })
    const b = createDrivetrainController({ initialCog: 6 })
    const c = createDrivetrainController({ initialCog: 6 })

    const sa = run(a, 60, 2)
    const sb = run(b, 144, 2)
    const sc = run(c, 240, 2)

    expect(sb.crankAngle).toBeCloseTo(sa.crankAngle, 9)
    expect(sc.crankAngle).toBeCloseTo(sa.crankAngle, 9)
    expect(sb.wheelAngle).toBeCloseTo(sa.wheelAngle, 9)
    expect(sc.wheelAngle).toBeCloseTo(sa.wheelAngle, 9)
    expect(sb.chainTravel).toBeCloseTo(sa.chainTravel, 6)
  })

  it('稳态下：后轮角度 = 链条行程 / 飞轮节圆半径，前盘角度 = 链条行程 / 前盘节圆半径', () => {
    const controller = createDrivetrainController({ initialCog: 3 })
    controller.setCadence(60)
    const snap = run(controller, 60, 1)

    const ring = pitchRadius(30)
    const cog = pitchRadius(16)
    expect(snap.crankAngle).toBeCloseTo(snap.chainTravel / ring, 9)
    expect(snap.wheelAngle).toBeCloseTo(snap.chainTravel / cog, 9)
    // 60 rpm 踩 1 秒 = 1 圈曲柄
    expect(snap.crankAngle).toBeCloseTo(TAU, 6)
  })

  it('飞轮与后轮在驱动时同步，滑行时脱开', () => {
    const controller = createDrivetrainController({ initialCog: 6 })
    run(controller, 60, 0.5)
    const driving = controller.get()
    expect(driving.cassetteAngle).toBeCloseTo(driving.wheelAngle, 9)
    expect(driving.wheelAngle).toBeGreaterThan(0)

    controller.setMode('coast')
    const beforeCoast = controller.get()
    run(controller, 60, 0.5)
    const coasting = controller.get()
    expect(coasting.wheelAngle).toBeGreaterThan(beforeCoast.wheelAngle)
    expect(coasting.cassetteAngle).toBeCloseTo(beforeCoast.cassetteAngle, 12)
    expect(coasting.crankAngle).toBeCloseTo(beforeCoast.crankAngle, 12)
    expect(coasting.chainTravel).toBeCloseTo(beforeCoast.chainTravel, 12)
  })

  it('踏频 0：所有角度与链条行程都不变，换挡请求排队', () => {
    const controller = createDrivetrainController({ initialCog: 6 })
    controller.setCadence(0)
    controller.requestGear(2)
    const start = controller.get()

    for (let i = 0; i < 120; i += 1) controller.tick(1 / 60)
    const end = controller.get()

    expect(end.crankAngle).toBe(start.crankAngle)
    expect(end.wheelAngle).toBe(start.wheelAngle)
    expect(end.chainTravel).toBe(start.chainTravel)
    expect(end.engaged).toBe(6)
    expect(end.target).toBe(2)
    expect(end.waiting).toBe(true)
    expect(end.shifting).toBe(false)
    expect(end.frame.shifting).toBe(false)
  })

  it('恢复踩踏后，排队的换挡会自动执行', () => {
    const controller = createDrivetrainController({ initialCog: 6 })
    controller.setCadence(0)
    controller.requestGear(4)
    run(controller, 60, 0.5)
    expect(controller.get().engaged).toBe(6)

    controller.setCadence(60)
    run(controller, 60, SHIFT.baseSeconds * 2)
    const snap = controller.get()
    expect(snap.engaged).toBe(4)
    expect(snap.target).toBe(4)
    expect(snap.shifting).toBe(false)
  })

  it('暂停（dt = 0）时角度与换挡都不前进', () => {
    const controller = createDrivetrainController({ initialCog: 6 })
    run(controller, 60, 0.3)
    controller.requestGear(8)
    const start = controller.get()
    for (let i = 0; i < 60; i += 1) controller.tick(0)
    const end = controller.get()
    expect(end.crankAngle).toBe(start.crankAngle)
    expect(end.chainTravel).toBe(start.chainTravel)
    expect(end.engaged).toBe(start.engaged)
  })

  it('换挡完成那一帧车轮角度连续，不会跳角', () => {
    const controller = createDrivetrainController({ initialCog: 0 })
    controller.setCadence(60)
    controller.requestGear(1)

    let previous = controller.get()
    let maxJump = 0
    let completed = false
    for (let i = 0; i < 400; i += 1) {
      controller.tick(1 / 240)
      const now = controller.get()
      const jump = Math.abs(now.wheelAngle - previous.wheelAngle)
      maxJump = Math.max(maxJump, jump)
      if (previous.shifting && !now.shifting && now.engaged === 1) completed = true
      previous = now
    }
    expect(completed).toBe(true)
    // 每帧正常转动约 0.05 rad；完成那一帧不应出现几十倍跳变
    expect(maxJump).toBeLessThan(0.2)
  })

  it('连续快速换挡：最终落在最后一个目标上，且不越界', () => {
    const controller = createDrivetrainController({ initialCog: 6 })
    controller.setCadence(80)
    for (let i = 0; i < 12; i += 1) controller.requestGear(i)
    controller.requestGear(-3)
    run(controller, 60, 4)
    let snap = controller.get()
    expect(snap.target).toBe(0)
    expect(snap.engaged).toBe(0)

    for (let i = 0; i < 20; i += 1) controller.stepGear(1)
    run(controller, 60, 6)
    snap = controller.get()
    expect(snap.target).toBe(11)
    expect(snap.engaged).toBe(11)
    for (let i = 0; i < 20; i += 1) controller.stepGear(1)
    expect(controller.get().target).toBe(11)
  })

  it('重置回到初始挡位与零角度', () => {
    const controller = createDrivetrainController({ initialCog: 6 })
    run(controller, 60, 1)
    controller.requestGear(2)
    controller.reset()
    const snap = controller.get()
    expect(snap.crankAngle).toBe(0)
    expect(snap.wheelAngle).toBe(0)
    expect(snap.chainTravel).toBe(0)
    expect(snap.engaged).toBe(6)
    expect(snap.target).toBe(6)
    expect(snap.cadenceRpm).toBe(60)
    expect(snap.torqueNm).toBe(30)
  })

  it('踏频被夹在 0..120，力矩被夹在 0..80', () => {
    const controller = createDrivetrainController()
    controller.setCadence(999)
    expect(controller.get().cadenceRpm).toBe(120)
    controller.setCadence(-10)
    expect(controller.get().cadenceRpm).toBe(0)
    controller.setTorque(500)
    expect(controller.get().torqueNm).toBe(80)
  })
})
