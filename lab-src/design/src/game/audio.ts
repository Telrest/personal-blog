/**
 * 魔丸模式的音效：全部用 WebAudio 现场合成，不下载任何音频文件。
 *
 * 为什么合成：站点是纯静态托管，多一个音频文件就多一次请求；而且这套声音只需要
 * 「数字跳一下」「咔嚓」「发动机嗡」——用振荡器和噪声就够。
 *
 * 浏览器要求用户先动手才能出声，所以 AudioContext 在第一次点击「开始」时才创建，
 * 静音开关会直接落在主增益上，保证立刻生效。
 */

import type { GameEvent } from './model'

export interface GameAudio {
  /** 用户第一次动手时调用：创建 / 恢复音频上下文 */
  resume(): void
  /** 游戏事件 → 声音 */
  play(event: GameEvent): void
  /** 每帧更新发动机：0–1 的车速归一化 + 是否冲刺 + 是否在跑 */
  engine(speedNorm: number, boosting: boolean, active: boolean): void
  setMuted(muted: boolean): void
  dispose(): void
}

type AudioContextConstructor = new () => AudioContext

function contextConstructor(): AudioContextConstructor | null {
  if (typeof window === 'undefined') return null
  const candidate =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext
  return candidate ?? null
}

export function createGameAudio(muted = false): GameAudio {
  let context: AudioContext | null = null
  let master: GainNode | null = null
  let engineGain: GainNode | null = null
  let engineOscillator: OscillatorNode | null = null
  let engineHarmonic: OscillatorNode | null = null
  let engineFilter: BiquadFilterNode | null = null
  let noiseBuffer: AudioBuffer | null = null
  let isMuted = muted
  let disposed = false

  const ensure = (): AudioContext | null => {
    if (disposed) return null
    if (context) return context
    const Constructor = contextConstructor()
    if (!Constructor) return null
    try {
      context = new Constructor()
      master = context.createGain()
      master.gain.value = isMuted ? 0 : 0.5
      master.connect(context.destination)
    } catch {
      context = null
      return null
    }
    return context
  }

  const getNoise = (ctx: AudioContext): AudioBuffer => {
    if (noiseBuffer) return noiseBuffer
    const length = Math.floor(ctx.sampleRate * 0.6)
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    let last = 0
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1
      last = last * 0.72 + white * 0.28
      data[i] = last
    }
    noiseBuffer = buffer
    return buffer
  }

  const tone = (
    frequency: number,
    duration: number,
    type: OscillatorType,
    gain: number,
    slideTo?: number,
    delay = 0,
  ) => {
    const ctx = ensure()
    if (!ctx || !master) return
    const start = ctx.currentTime + delay
    const oscillator = ctx.createOscillator()
    const envelope = ctx.createGain()
    oscillator.type = type
    oscillator.frequency.setValueAtTime(frequency, start)
    if (slideTo !== undefined) oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), start + duration)
    envelope.gain.setValueAtTime(0.0001, start)
    envelope.gain.exponentialRampToValueAtTime(gain, start + 0.012)
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    oscillator.connect(envelope)
    envelope.connect(master)
    oscillator.start(start)
    oscillator.stop(start + duration + 0.02)
  }

  const noiseBurst = (duration: number, gain: number, frequency: number, q = 1) => {
    const ctx = ensure()
    if (!ctx || !master) return
    const start = ctx.currentTime
    const source = ctx.createBufferSource()
    source.buffer = getNoise(ctx)
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.setValueAtTime(frequency, start)
    filter.Q.value = q
    const envelope = ctx.createGain()
    envelope.gain.setValueAtTime(gain, start)
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    source.connect(filter)
    filter.connect(envelope)
    envelope.connect(master)
    source.start(start)
    source.stop(start + duration + 0.02)
  }

  const startEngine = () => {
    const ctx = ensure()
    if (!ctx || !master || engineOscillator) return
    engineFilter = ctx.createBiquadFilter()
    engineFilter.type = 'lowpass'
    engineFilter.frequency.value = 420
    engineFilter.Q.value = 0.9
    engineGain = ctx.createGain()
    engineGain.gain.value = 0.0001
    engineOscillator = ctx.createOscillator()
    engineOscillator.type = 'sawtooth'
    engineOscillator.frequency.value = 48
    engineHarmonic = ctx.createOscillator()
    engineHarmonic.type = 'triangle'
    engineHarmonic.frequency.value = 96
    const harmonicGain = ctx.createGain()
    harmonicGain.gain.value = 0.35
    engineOscillator.connect(engineFilter)
    engineHarmonic.connect(harmonicGain)
    harmonicGain.connect(engineFilter)
    engineFilter.connect(engineGain)
    engineGain.connect(master)
    engineOscillator.start()
    engineHarmonic.start()
  }

  return {
    resume() {
      const ctx = ensure()
      if (!ctx) return
      if (ctx.state === 'suspended') void ctx.resume()
      startEngine()
    },

    play(event) {
      if (!context || disposed) return
      switch (event.type) {
        case 'count':
          tone(660, 0.08, 'square', 0.09)
          break
        case 'go':
          tone(990, 0.2, 'square', 0.12, 1320)
          break
        case 'nine':
          // 每多一个 9，音高往上抬一点
          tone(880, 0.14, 'sine', 0.16)
          tone(1320, 0.22, 'sine', 0.12, 1320, 0.07)
          tone(660 + event.nines * 60, 0.16, 'triangle', 0.07, 990, 0.12)
          break
        case 'boost':
          noiseBurst(0.35, 0.16, 900, 0.8)
          tone(180, 0.3, 'sawtooth', 0.07, 420)
          break
        case 'crash':
          noiseBurst(0.45, 0.34, 320, 0.6)
          tone(120, 0.5, 'triangle', 0.2, 44)
          tone(1600, 0.12, 'square', 0.06, 900)
          break
        case 'record':
          tone(660, 0.12, 'triangle', 0.12)
          tone(880, 0.12, 'triangle', 0.12, 880, 0.12)
          tone(1320, 0.26, 'triangle', 0.13, 1320, 0.24)
          break
        case 'result':
          tone(330, 0.24, 'sine', 0.08, 220)
          break
        default:
          break
      }
    },

    engine(speedNorm, boosting, active) {
      if (!context || !engineGain || !engineOscillator || !engineHarmonic) return
      const ctx = context
      const target = active ? 0.035 + speedNorm * 0.05 + (boosting ? 0.03 : 0) : 0.0001
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.12)
      const frequency = 42 + speedNorm * 74 + (boosting ? 26 : 0)
      engineOscillator.frequency.setTargetAtTime(frequency, ctx.currentTime, 0.15)
      engineHarmonic.frequency.setTargetAtTime(frequency * 2.02, ctx.currentTime, 0.15)
      engineFilter?.frequency.setTargetAtTime(320 + speedNorm * 720, ctx.currentTime, 0.2)
    },

    setMuted(mutedNext) {
      isMuted = mutedNext
      if (master && context) master.gain.setTargetAtTime(mutedNext ? 0 : 0.5, context.currentTime, 0.05)
    },

    dispose() {
      disposed = true
      try {
        engineOscillator?.stop()
        engineHarmonic?.stop()
      } catch {
        /* 已经停了 */
      }
      engineOscillator = null
      engineHarmonic = null
      engineGain = null
      engineFilter = null
      void context?.close()
      context = null
      master = null
      noiseBuffer = null
    },
  }
}
