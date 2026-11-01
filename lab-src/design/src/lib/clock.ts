/**
 * 观察时钟：整站统一的「暂停 / 重置 / 观察速度」实现。
 *
 * 设计要点：
 *  - 时间只在这里推进。3D、图表、读数都从这里读，不各自跑一套时间；
 *  - 输入是真实经过时间（秒），输出是模型时间（秒）= 真实时间 × 速度；
 *  - 通知频率可以低于帧率（默认 20 Hz），避免每秒 60 次 React 重渲染，
 *    但 get().time 始终是最新值，帧循环直接读它；
 *  - 纯逻辑，不依赖 React / three.js，可单测。
 */

export interface ClockState {
  /** 模型时间（秒），已乘观察速度 */
  time: number
  /** 观察速度倍率 */
  speed: number
  playing: boolean
  /** 已经推过的帧数，用于调试 */
  frames: number
}

export const SPEEDS = [0.25, 0.5, 1, 2] as const
export type Speed = (typeof SPEEDS)[number]

export interface SimClockOptions {
  playing?: boolean
  speed?: number
  /** 单帧最多推进多少真实时间，防止切回标签页后一口气跳一大步 */
  maxDelta?: number
  /** 通知订阅者的频率上限（Hz） */
  notifyHz?: number
}

export interface SimClock {
  get(): ClockState
  subscribe(listener: () => void): () => void
  play(): void
  pause(): void
  toggle(): void
  setSpeed(speed: number): void
  reset(): void
  /** 传入真实经过时间（秒）。由页面唯一的帧循环调用。 */
  tick(realDelta: number): void
}

export function createSimClock(options: SimClockOptions = {}): SimClock {
  const { playing = true, speed = 1, maxDelta = 0.1, notifyHz = 20 } = options
  const notifyInterval = notifyHz > 0 ? 1000 / notifyHz : 0

  let state: ClockState = { time: 0, speed, playing, frames: 0 }
  const listeners = new Set<() => void>()
  let lastNotify = -Infinity

  const emit = () => {
    for (const listener of [...listeners]) listener()
  }

  return {
    get: () => state,

    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    play() {
      if (state.playing) return
      state = { ...state, playing: true }
      lastNotify = -Infinity
      emit()
    },

    pause() {
      if (!state.playing) return
      state = { ...state, playing: false }
      lastNotify = -Infinity
      emit()
    },

    toggle() {
      if (state.playing) this.pause()
      else this.play()
    },

    setSpeed(nextSpeed) {
      const clamped = Math.max(0.05, Math.min(8, nextSpeed))
      if (clamped === state.speed) return
      state = { ...state, speed: clamped }
      lastNotify = -Infinity
      emit()
    },

    reset() {
      state = { ...state, time: 0, frames: 0 }
      lastNotify = -Infinity
      emit()
    },

    tick(realDelta) {
      const dt = Math.max(0, Math.min(maxDelta, realDelta))
      if (!Number.isFinite(dt) || dt === 0) return
      if (!state.playing) return

      state = { ...state, time: state.time + dt * state.speed, frames: state.frames + 1 }

      const now = typeof performance !== 'undefined' ? performance.now() : 0
      if (now - lastNotify >= notifyInterval) {
        lastNotify = now
        emit()
      }
    },
  }
}
