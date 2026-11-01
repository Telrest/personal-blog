import { describe, expect, it } from 'vitest'
import {
  derivePose,
  indexAngleOf,
  PEN,
  restXOf,
  slotIndexOf,
  slotKindOf,
  springLength,
  stableOf,
  tipZ,
} from './model'

const pose = (over: Partial<Parameters<typeof derivePose>[0]>) =>
  derivePose({ baseCycle: 0, cycle: 0, x: 0, leg: 'down', committed: false, moving: false, ...over })

describe('参数与派生量', () => {
  it('三个关键位移对应笔尖 Z 与弹簧长度（验收清单 C 第 1、2 条）', () => {
    expect(tipZ(0)).toBeCloseTo(0.8, 6)
    expect(tipZ(2.2)).toBeCloseTo(-1.4, 6)
    expect(tipZ(4.8)).toBeCloseTo(-4.0, 6)

    expect(springLength(0)).toBeCloseTo(15.5, 6)
    expect(springLength(2.2)).toBeCloseTo(13.3, 6)
    expect(springLength(4.8)).toBeCloseTo(10.7, 6)
  })

  it('弹簧最短长度仍大于并紧高度（10 圈 × 0.35 mm ≈ 3.5 mm）', () => {
    expect(springLength(PEN.xMax)).toBeGreaterThan(PEN.springTurns * PEN.springWireDiameter)
  })

  it('导向解除高度必须落在出芯与到底之间', () => {
    expect(PEN.xExtended).toBeLessThan(PEN.xClear)
    expect(PEN.xClear).toBeLessThan(PEN.xMax)
  })

  it('两次按动后索引角增加 120°，三重对称下几何等价', () => {
    expect(PEN.lugSpacingDeg).toBe(120)
    expect(PEN.stepPerCycleDeg * 2).toBe(PEN.lugSpacingDeg)
    expect(indexAngleOf(2)).toBe(120)
  })

  it('索引位交替深浅：0/120/240 深，60/180/300 浅', () => {
    for (const deg of PEN.deepSlotDeg) expect(slotKindOf(deg)).toBe('deep')
    for (const deg of PEN.shallowStopDeg) expect(slotKindOf(deg)).toBe('shallow')
    expect(PEN.deepSlotDeg).toHaveLength(3)
    expect(PEN.shallowStopDeg).toHaveLength(3)
  })

  it('稳定状态与静止位移交替', () => {
    expect(stableOf(0)).toBe('R')
    expect(restXOf(0)).toBe(0)
    expect(stableOf(1)).toBe('E')
    expect(restXOf(1)).toBe(2.2)
    expect(stableOf(20)).toBe('R')
  })
})

describe('姿态推导：一次完整按压释放', () => {
  it('收芯静止：导槽内、索引角 0、按帽顶在原点', () => {
    const p = pose({ x: 0, moving: false })
    expect(p.phase).toBe('idle')
    expect(p.theta).toBe(0)
    expect(p.slotKind).toBe('deep')
    expect(p.buttonZ).toBeCloseTo(141, 6)
  })

  it('按下到导向解除高度：索引角仍然不变（导槽锁住）', () => {
    const p = pose({ x: PEN.xClear, leg: 'down', committed: false, moving: true })
    expect(p.phase).toBe('pressing')
    expect(p.theta).toBe(0)
  })

  it('越过解除高度后按到到底：转过 30°', () => {
    const p = pose({ x: PEN.xMax, leg: 'down', committed: true, moving: true })
    expect(p.phase).toBe('indexing')
    expect(p.theta).toBeCloseTo(30, 6)
    expect(p.cycleProgressDeg).toBeCloseTo(30, 6)
  })

  it('回程到解除高度：再转 30°，共 60°，正好对准浅锁止位', () => {
    const p = pose({ x: PEN.xClear, leg: 'up', committed: true, moving: true })
    expect(p.phase).toBe('releasing')
    expect(p.theta).toBeCloseTo(60, 6)
    expect(slotIndexOf(p.theta)).toBe(1)
    expect(slotKindOf(p.theta)).toBe('shallow')
  })

  it('落到支承面：停在 2.2 mm，笔尖伸出 1.4 mm', () => {
    const p = pose({ baseCycle: 1, cycle: 1, x: PEN.xExtended, leg: 'down', committed: false, moving: false })
    expect(p.phase).toBe('idle')
    expect(p.theta).toBeCloseTo(60, 6)
    expect(p.tipZ).toBeCloseTo(-1.4, 6)
    expect(p.tipExtension).toBeCloseTo(2.2, 6)
    expect(p.slotKind).toBe('shallow')
  })

  it('第二次按压完成后再回到深导槽', () => {
    const p = pose({ baseCycle: 2, cycle: 2, x: 0, leg: 'down', committed: false, moving: false })
    expect(p.theta).toBeCloseTo(120, 6)
    expect(p.slotKind).toBe('deep')
    expect(p.tipZ).toBeCloseTo(0.8, 6)
  })

  it('索引角在一次操作中单调增加，不会回摆', () => {
    const xs = [4.0, 4.2, 4.4, 4.6, 4.8]
    const thetas = xs.map((x) => pose({ x, leg: 'down', committed: true, moving: true }).theta)
    for (let i = 1; i < thetas.length; i += 1) {
      expect(thetas[i]).toBeGreaterThan(thetas[i - 1])
    }
  })
})

describe('姿态推导：没按到底就松手', () => {
  it('没有越过提交阈值时，回程把索引角原路退回', () => {
    const mid = pose({ x: 4.4, leg: 'up', committed: false, moving: true })
    expect(mid.phase).toBe('aborting')
    expect(mid.theta).toBeCloseTo(15, 6)

    const back = pose({ x: PEN.xClear, leg: 'up', committed: false, moving: true })
    expect(back.theta).toBeCloseTo(0, 6)

    const rest = pose({ x: 0, leg: 'down', committed: false, moving: false })
    expect(rest.phase).toBe('idle')
    expect(rest.theta).toBeCloseTo(0, 6)
  })

  it('只按到导槽内松手：完全没有转动', () => {
    const p = pose({ x: 3.9, leg: 'up', committed: false, moving: true })
    expect(p.theta).toBe(0)
    expect(p.phase).toBe('aborting')
  })
})
