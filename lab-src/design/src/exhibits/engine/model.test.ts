import { describe, expect, it } from 'vitest'
import { advanceEngine, createEngineController, ENGINE, flowPoint, initialEngine, PART_SPOOL, radiusAt, snapshotOf, targetLevels, trendStations } from './model'
import { shellGeometry, vaneGeometry } from './geometry'

describe('双转子运动与工况', () => {
  it('跨过 8 秒的大步长与不规则细分得到相同转速、累计角度与气流进度', () => {
    const start = { ...initialEngine(0), load: 1 }
    const once = advanceEngine(start, 8)
    let many = start
    const steps = [0.013, 0.12, 0.03, 0.071, 0.25, 0.019]
    let t = 0, i = 0
    while (t < 8 - 1e-10) { const dt = Math.min(8 - t, steps[i++ % steps.length]); many = advanceEngine(many, dt); t += dt }
    for (const key of ['lp', 'hp', 'lpAngle', 'hpAngle', 'travel', 'time'] as const) expect(many[key]).toBeCloseTo(once[key], 10)
  })
  it('稳定工况下角度导数等于读数，暂停不会推进任一状态', () => {
    const start = initialEngine(), before = snapshotOf(start), next = advanceEngine(start, 2)
    expect((next.lpAngle - start.lpAngle) / (2 * Math.PI * 2)).toBeCloseTo(before.lpHz, 12)
    expect((next.hpAngle - start.hpAngle) / (2 * Math.PI * 2)).toBeCloseTo(before.hpHz, 12)
    expect(advanceEngine(start, 0)).toBe(start)
    expect(advanceEngine(start, NaN)).toBe(start)
  })
  it('高低压系统各自响应，同轴部件映射正确，静子不包含在旋转映射中', () => {
    const s = advanceEngine({ ...initialEngine(0), load: 1 }, 0.5)
    const initial = targetLevels(0), target = targetLevels(1)
    expect((s.hp - initial.hp) / (target.hp - initial.hp)).toBeGreaterThan((s.lp - initial.lp) / (target.lp - initial.lp))
    expect(PART_SPOOL.fan).toBe('lp'); expect(PART_SPOOL.lpc).toBe('lp'); expect(PART_SPOOL.lpt).toBe('lp')
    expect(PART_SPOOL.hpc).toBe('hp'); expect(PART_SPOOL.hpt).toBe('hp'); expect(PART_SPOOL.combustor).toBe('fixed')
  })
  it('控制器订阅、输入钳制、暂停和重置可重复', () => {
    const c = createEngineController(); let notifications = 0
    const off = c.subscribe(() => { notifications += 1 })
    c.setLoad(5); expect(c.get().load).toBe(1)
    c.tick(4); const frozen = c.get(); c.tick(0); expect(c.get()).toBe(frozen)
    c.reset(); expect(c.get().time).toBe(0); expect(c.get().lpAngle).toBe(0)
    expect(c.get().load).toBe(ENGINE.initialLoad); expect(notifications).toBeGreaterThan(1); off()
  })
})

describe('教学趋势与气流边界', () => {
  it.each([0, 0.25, 0.5, 0.75, 1])('工况 %s 下总量变化方向正确，喷口不凭空升温', (load) => {
    const { lp, hp } = targetLevels(load), s = trendStations(lp, hp)
    for (let i = 1; i <= 3; i += 1) { expect(s[i].totalPressure).toBeGreaterThan(s[i - 1].totalPressure); expect(s[i].totalTemperature).toBeGreaterThan(s[i - 1].totalTemperature) }
    expect(s[4].totalPressure).toBeLessThan(s[3].totalPressure)
    expect(s[4].totalTemperature).toBeGreaterThan(s[3].totalTemperature)
    for (let i = 5; i <= 6; i += 1) { expect(s[i].totalPressure).toBeLessThan(s[i - 1].totalPressure); expect(s[i].totalTemperature).toBeLessThan(s[i - 1].totalTemperature) }
    expect(s[7].totalTemperature).toBe(s[6].totalTemperature)
    expect(s[7].totalPressure).toBeGreaterThan(1)
  })
  it('两根轴有径向间隙，低压内轴贯穿高压轴', () => {
    expect(ENGINE.lpShaft.radius).toBeLessThan(ENGINE.hpShaft.inner)
    expect(ENGINE.hpShaft.inner).toBeLessThan(ENGINE.hpShaft.outer)
    expect(ENGINE.lpShaft.start).toBeLessThan(ENGINE.hpShaft.start)
    expect(ENGINE.lpShaft.end).toBeGreaterThan(ENGINE.hpShaft.end)
  })
  it('外涵道不穿过核心机，气流留在对应机匣内；核心气流不穿轴', () => {
    for (let i = 0; i < 1000; i += 1) {
      const [x, y, z] = flowPoint('bypass', i / 1000, 0.6, 0.012), r = Math.hypot(y, z)
      if (x >= -0.91 && x <= 1.30) expect(r).toBeGreaterThan(radiusAt(ENGINE.coreCase, x) + 0.012)
      if (x >= -1.64 && x <= 1.30) expect(r).toBeLessThan(radiusAt(ENGINE.nacelle, x) - 0.045)
      const core = flowPoint('core', i / 1000, 0.6, -0.012)
      expect(Math.hypot(core[1], core[2])).toBeGreaterThan(ENGINE.hpShaft.outer)
    }
  })
})

describe('模型资产与几何', () => {
  it('机匣与扭转静子没有非法坐标或法线，半剖减少壳体覆盖面', () => {
    const full = shellGeometry(ENGINE.nacelle, 0.045), cut = shellGeometry(ENGINE.nacelle, 0.045, true), vane = vaneGeometry(0.24, 0.34, 0.05)
    expect(cut.index!.count).toBeLessThan(full.index!.count)
    for (const g of [full, cut, vane]) {
      for (const key of ['position', 'normal']) expect(Array.from(g.attributes[key].array).every(Number.isFinite)).toBe(true)
      g.dispose()
    }
  })
})
