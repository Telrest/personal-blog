import { describe, expect, it, vi } from 'vitest'
import { createRepairClock, REPAIR_DURATION } from './state'

describe('修复播放回归', () => {
  it('初始停在第一阶段；未播放时不会自行走完', () => {
    const clock = createRepairClock(); clock.tick(100)
    expect(clock.get()).toMatchObject({ progress: 0, playing: false })
  })
  it('拖动后播放继续通知界面；到达终点必须发出最后一次通知', () => {
    const clock = createRepairClock(), listener = vi.fn()
    clock.subscribe(listener); clock.setProgress(.4); clock.play(); listener.mockClear()
    clock.tick(.3); expect(listener).toHaveBeenCalled()
    listener.mockClear(); clock.tick(REPAIR_DURATION)
    expect(clock.get()).toMatchObject({ progress: 1, playing: false })
    expect(listener).toHaveBeenCalled()
  })
  it('大步长与不规则小步长一致；非法步长不污染状态', () => {
    const a = createRepairClock(), b = createRepairClock(); a.play(); b.play()
    a.tick(3.5); [.03, .27, 1.3, .7, 1.2].forEach((dt) => b.tick(dt))
    expect(a.get().progress).toBeCloseTo(b.get().progress, 12)
    const before = a.get(); [NaN, Infinity, -1].forEach((dt) => a.tick(dt))
    expect(a.get()).toBe(before)
  })
  it('完成后可重新播放；阶段跳转与重置停住供观察', () => {
    const clock = createRepairClock(); clock.play(); clock.tick(100); clock.play()
    expect(clock.get()).toMatchObject({ progress: 0, playing: true })
    clock.setStage(2); expect(clock.get()).toMatchObject({ progress: .64, playing: false })
    clock.reset(); expect(clock.get()).toMatchObject({ progress: 0, playing: false })
  })
})
