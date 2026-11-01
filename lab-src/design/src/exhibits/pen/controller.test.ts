import { describe, expect, it } from 'vitest'
import { createPenController } from './controller'
import { PEN } from './model'

/** 以 1/60 s 步长推进若干模型秒 */
function run(controller: ReturnType<typeof createPenController>, seconds: number): void {
  const step = 1 / 60
  for (let t = 0; t < seconds; t += step) controller.tick(step)
}

describe('按动笔控制器', () => {
  it.each(['丢帧', '一次跨过整段动画'])('%s 也必须经过按到底的提交点', (scenario) => {
    const c = createPenController()
    for (let cycle = 1; cycle <= 2; cycle += 1) {
      c.press()
      if (scenario === '丢帧') {
        c.tick(0.015)
        // 所有帧都 ≤ 0.1 秒，但可以完整跨过仅 0.08 秒的底部停留。
        for (let i = 0; i < 24; i += 1) c.tick(0.1)
      } else c.tick(2.5)
      const s = c.get()
      expect(s.cycle).toBe(cycle)
      expect(s.indexAngle).toBe(cycle * PEN.stepPerCycleDeg)
      expect(s.stable).toBe(cycle % 2 === 1 ? 'E' : 'R')
      expect(s.x).toBe(cycle % 2 === 1 ? PEN.xExtended : PEN.xRetracted)
      expect(s.pose.phase).toBe('idle')
    }
  })

  it('初始为收芯', () => {
    const c = createPenController()
    const s = c.get()
    expect(s.x).toBe(0)
    expect(s.stable).toBe('R')
    expect(s.indexAngle).toBe(0)
    expect(s.pose.phase).toBe('idle')
  })

  it('按一下并释放后保持出芯，不需要一直按着', () => {
    const c = createPenController()
    expect(c.press()).toBe(true)
    run(c, 2.5)

    const s = c.get()
    expect(s.cycle).toBe(1)
    expect(s.x).toBeCloseTo(PEN.xExtended, 6)
    expect(s.indexAngle).toBeCloseTo(60, 6)
    expect(s.stable).toBe('E')
    expect(s.moving).toBe(false)
    expect(s.pose.phase).toBe('idle')
  })

  it('再按一次收芯，索引角走到 120°（不必回到 0°）', () => {
    const c = createPenController()
    c.press()
    run(c, 2.5)
    c.press()
    run(c, 2.5)

    const s = c.get()
    expect(s.cycle).toBe(2)
    expect(s.x).toBe(0)
    expect(s.indexAngle).toBeCloseTo(120, 6)
    expect(s.stable).toBe('R')
  })

  it('连续 20 次后回到初始伸缩状态，且不累积位置误差', () => {
    const c = createPenController()
    for (let i = 0; i < 20; i += 1) {
      c.press()
      run(c, 2.5)
    }
    const s = c.get()
    expect(s.cycle).toBe(20)
    expect(s.x).toBe(0)
    expect(s.stable).toBe('R')
    expect(s.indexAngle % 60).toBeCloseTo(0, 6)
    expect(s.indexAngle % 120).toBeCloseTo(0, 6)
  })

  it('转子只在越过导向解除高度后转动', () => {
    const c = createPenController()
    c.beginDrag()
    c.dragTo(3.9)
    expect(c.get().indexAngle).toBe(0)

    c.dragTo(4.4)
    expect(c.get().indexAngle).toBeCloseTo(15, 6)

    c.dragTo(PEN.xMax)
    expect(c.get().indexAngle).toBeCloseTo(30, 6)
    c.endDrag()
  })

  it('拖动到一半就松手：返回原状态，不切换', () => {
    const c = createPenController()
    c.beginDrag()
    c.dragTo(3.2)
    c.endDrag()
    run(c, 2)

    const s = c.get()
    expect(s.cycle).toBe(0)
    expect(s.x).toBe(0)
    expect(s.indexAngle).toBe(0)
    expect(s.stable).toBe('R')
  })

  it('进入索引区但没到底就松手：索引角沿原路退回，不切换', () => {
    const c = createPenController()
    c.beginDrag()
    c.dragTo(4.4)
    c.endDrag()
    run(c, 2)

    const s = c.get()
    expect(s.cycle).toBe(0)
    expect(s.x).toBe(0)
    expect(s.stable).toBe('R')
    expect(s.pose.phase).toBe('idle')
  })

  it('拖到底再松手：正常提交，从出芯状态再次拖动也能提交', () => {
    const c = createPenController()
    c.beginDrag()
    c.dragTo(PEN.xMax)
    c.endDrag()
    run(c, 2)
    expect(c.get().cycle).toBe(1)
    expect(c.get().stable).toBe('E')

    c.beginDrag()
    c.dragTo(PEN.xMax)
    c.endDrag()
    run(c, 2)
    expect(c.get().cycle).toBe(2)
    expect(c.get().stable).toBe('R')
  })

  it('暂停时推进 0 秒不会改变任何状态', () => {
    const c = createPenController()
    c.press()
    run(c, 0.3)
    const before = c.get()
    c.tick(0)
    c.tick(0)
    const after = c.get()
    expect(after.x).toBe(before.x)
    expect(after.indexAngle).toBe(before.indexAngle)

    run(c, 2.5)
    expect(c.get().cycle).toBe(1)
  })

  it('重置回到初始收芯状态', () => {
    const c = createPenController()
    c.press()
    run(c, 2.5)
    c.reset()
    const s = c.get()
    expect(s.cycle).toBe(0)
    expect(s.x).toBe(0)
    expect(s.stable).toBe('R')
    expect(s.indexAngle).toBe(0)
  })

  it('自动按压进行中不会被打断成两次', () => {
    const c = createPenController()
    c.press()
    expect(c.press()).toBe(false)
    run(c, 2.5)
    expect(c.get().cycle).toBe(1)
  })

  it('导览步骤可以直接摆到指定阶段', () => {
    const c = createPenController()
    c.applyStatic({ cycle: 0, x: PEN.xMax, leg: 'down', committed: true })
    const s = c.get()
    expect(s.pose.phase).toBe('indexing')
    expect(s.indexAngle).toBeCloseTo(30, 6)

    c.applyStatic({ cycle: 1, x: PEN.xExtended, leg: 'down', committed: false })
    expect(c.get().stable).toBe('E')
  })

  it('状态变化会通知订阅者', () => {
    const c = createPenController()
    let count = 0
    const off = c.subscribe(() => {
      count += 1
    })
    c.press()
    run(c, 2.5)
    off()
    expect(count).toBeGreaterThan(1)
  })
})
