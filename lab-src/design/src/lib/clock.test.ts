import { describe, expect, it } from 'vitest'
import { createSimClock } from './clock'

describe('createSimClock', () => {
  it('播放时按速度推进模型时间', () => {
    const clock = createSimClock({ playing: true, speed: 1 })
    clock.tick(0.05)
    expect(clock.get().time).toBeCloseTo(0.05, 6)
  })

  it('速度是乘数', () => {
    const clock = createSimClock({ playing: true, speed: 2 })
    clock.tick(0.05)
    expect(clock.get().time).toBeCloseTo(0.1, 6)
  })

  it('暂停后不再推进', () => {
    const clock = createSimClock({ playing: true })
    clock.tick(0.05)
    clock.pause()
    const frozen = clock.get().time
    clock.tick(0.05)
    clock.tick(0.05)
    expect(clock.get().time).toBe(frozen)
    expect(clock.get().playing).toBe(false)
  })

  it('重置把时间与帧数清零', () => {
    const clock = createSimClock({ playing: true })
    clock.tick(0.05)
    clock.tick(0.05)
    clock.reset()
    expect(clock.get().time).toBe(0)
    expect(clock.get().frames).toBe(0)
  })

  it('单帧推进被 maxDelta 截断，避免切回标签页后跳一大步', () => {
    const clock = createSimClock({ playing: true, maxDelta: 0.1 })
    clock.tick(5)
    expect(clock.get().time).toBeCloseTo(0.1, 6)
  })

  it('负数或非有限的时间增量被忽略', () => {
    const clock = createSimClock({ playing: true })
    clock.tick(-1)
    clock.tick(Number.NaN)
    expect(clock.get().time).toBe(0)
  })

  it('观察速度可以修改，并被限制在合理范围', () => {
    const clock = createSimClock({ playing: true, speed: 1 })
    clock.setSpeed(4)
    expect(clock.get().speed).toBe(4)
    clock.setSpeed(1000)
    expect(clock.get().speed).toBe(8)
    clock.setSpeed(0)
    expect(clock.get().speed).toBeCloseTo(0.05, 6)
  })

  it('播放/暂停切换会立即通知订阅者', () => {
    const clock = createSimClock({ playing: true })
    let notifications = 0
    clock.subscribe(() => {
      notifications += 1
    })
    clock.toggle()
    expect(clock.get().playing).toBe(false)
    expect(notifications).toBe(1)
    clock.toggle()
    expect(clock.get().playing).toBe(true)
    expect(notifications).toBe(2)
  })
})
