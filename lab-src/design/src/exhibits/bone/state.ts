/**
 * 骨骼展品的状态层：唯一状态源 + 修复进度时钟。
 *
 * 三个页签各自保存自己的参数（资料包要求：进入修复示意不修改「结构与断端」
 * 页保存的偏移参数），因此这里按页签分组，而不是一个大对象全混在一起。
 *
 * 纯逻辑，不 import React / three.js。
 */

import { createStore, type Store } from '../../lib/store'
import {
  DEFAULT_POSE,
  REPAIR_STAGES,
  type FracturePose,
  type LoadMode,
  type TabId,
} from './model'

export type CameraId = 'dorsal' | 'plantar' | 'lateral' | 'local' | 'load' | 'repair'

export interface StructureState {
  /** false = 完整骨对照；true = 基底部骨折示意 */
  fractured: boolean
  /** 剖切皮质与内部 */
  cutaway: boolean
  /** 隐藏其他骨，只看第 5 趾列 */
  isolate: boolean
  pose: FracturePose
  /** 选中的结构（骨编号或关节） */
  selected: string | null
}

export interface LoadState {
  mode: LoadMode
  /** 归一化载荷 λ（0–1） */
  load: number
  /** 预制骨折对照 */
  fractured: boolean
}

export interface RepairState {
  /** 剖开看内骨痂 */
  cutaway: boolean
}

export interface BoneState {
  tab: TabId
  camera: CameraId
  structure: StructureState
  load: LoadState
  repair: RepairState
}

/** 每个页签的默认镜头；「回到默认视角」回到这里 */
export const DEFAULT_CAMERA: Record<TabId, CameraId> = {
  structure: 'dorsal',
  load: 'load',
  repair: 'repair',
}

export const INITIAL_STATE: BoneState = {
  tab: 'structure',
  camera: DEFAULT_CAMERA.structure,
  structure: {
    fractured: false,
    cutaway: false,
    isolate: false,
    pose: DEFAULT_POSE,
    selected: null,
  },
  load: {
    mode: 'axial',
    load: 0.45,
    fractured: false,
  },
  repair: {
    cutaway: false,
  },
}

export function createBoneStore(): Store<BoneState> {
  return createStore<BoneState>(INITIAL_STATE)
}

/** 重置当前实验（不动其他页签保存的参数） */
export function resetTab(state: BoneState, tab: TabId = state.tab): BoneState {
  if (tab === 'structure') {
    return {
      ...state,
      camera: DEFAULT_CAMERA.structure,
      structure: { ...INITIAL_STATE.structure },
    }
  }
  if (tab === 'load') {
    return {
      ...state,
      camera: DEFAULT_CAMERA.load,
      load: { ...INITIAL_STATE.load },
    }
  }
  return {
    ...state,
    camera: DEFAULT_CAMERA.repair,
    repair: { ...INITIAL_STATE.repair },
  }
}

/* ========================================================================
   修复进度：概念进度 + 播放控制
   ======================================================================== */

export interface RepairClockState {
  /** 概念进度 h（0–1），不是天数、愈合率或强度 */
  progress: number
  playing: boolean
  speed: number
}

/** 1× 速度下走完 0–1 需要的时间（秒）；只是导演节奏 */
export const REPAIR_DURATION = 12
export const REPAIR_SPEEDS = [0.5, 1, 2] as const

export interface RepairClock {
  get(): RepairClockState
  subscribe(listener: () => void): () => void
  tick(realDelta: number): void
  setProgress(progress: number): void
  setStage(index: number): void
  play(): void
  pause(): void
  toggle(): void
  setSpeed(speed: number): void
  reset(): void
}

export function createRepairClock(): RepairClock {
  let state: RepairClockState = { progress: 0, playing: false, speed: 1 }
  const listeners = new Set<() => void>()
  let lastNotify = -Infinity
  const notifyInterval = 1000 / 15

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

    tick(realDelta) {
      if (!state.playing) return
      const dt = Number.isFinite(realDelta) ? Math.max(0, realDelta) : 0
      if (dt === 0) return
      const next = Math.min(1, state.progress + (dt * state.speed) / REPAIR_DURATION)
      if (next === state.progress) return
      state = { ...state, progress: next, playing: next < 1 }
      const now = typeof performance !== 'undefined' ? performance.now() : 0
      if (next === 1 || now - lastNotify >= notifyInterval) {
        lastNotify = now
        emit()
      }
    },

    setProgress(progress) {
      if (!Number.isFinite(progress)) return
      const next = Math.max(0, Math.min(1, progress))
      if (next === state.progress) return
      state = { ...state, progress: next, playing: next < 1 && state.playing }
      lastNotify = -Infinity
      emit()
    },

    setStage(index) {
      if (!Number.isFinite(index)) return
      const stage = REPAIR_STAGES[Math.max(0, Math.min(REPAIR_STAGES.length - 1, Math.floor(index)))]
      state = { ...state, progress: stage.jump, playing: false }
      lastNotify = -Infinity
      emit()
    },

    play() {
      if (state.playing) return
      state = { ...state, progress: state.progress >= 1 ? 0 : state.progress, playing: true }
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

    setSpeed(speed) {
      if (!Number.isFinite(speed)) return
      const next = Math.max(0.1, Math.min(4, speed))
      if (next === state.speed) return
      state = { ...state, speed: next }
      emit()
    },

    reset() {
      state = { progress: 0, playing: false, speed: state.speed }
      lastNotify = -Infinity
      emit()
    },
  }
}
