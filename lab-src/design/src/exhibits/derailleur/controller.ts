/**
 * 变速器的状态持有者：把时间积分成角度，把请求变成换挡。
 *
 * 与 model.ts 的分工：
 *   model.ts      纯函数：齿比、功率、换挡状态机、滑行衰减；
 *   controller.ts 保存唯一状态（角度、链条行程、挡位），并按 dt 推进。
 *
 * 三条硬规则：
 *  1. 轴角一律用角速度积分，不用「角度 = 齿比 × 曲柄角」反算，
 *     否则换挡完成的那一帧车轮会突然跳角度；
 *  2. 链条行程是唯一驱动换挡进度的量，停踩就不会换挡；
 *  3. 整组飞轮在驱动时同角速度；滑行时飞轮与后轮经单向离合脱开。
 */

import {
  COAST,
  advanceShift,
  coastWheelRpm,
  createShiftState,
  isWaitingForPedal,
  requestGear,
  shiftFrame,
  type Shift,
  type ShiftFrame,
  type ShiftState,
} from './model'
import { DRIVE, cassetteTeethAt, cogCount, pitchRadius } from './chainPath'

export type DriveMode = 'drive' | 'coast'

export interface DrivetrainState {
  /** 模式：正常驱动 / 滑行演示 */
  mode: DriveMode
  /** 用户设定踏频 rpm（0 = 不踩） */
  cadenceRpm: number
  /** 曲柄输入力矩 N·m */
  torqueNm: number
  /** 传动效率假设 */
  efficiency: number
  /** 挡位状态 */
  shiftState: ShiftState
  /** 曲柄角（rad），前盘与之同轴 */
  crankAngle: number
  /** 链条行程（mm），链节相位由它决定 */
  chainTravel: number
  /** 后轮角度（rad） */
  wheelAngle: number
  /** 飞轮（整组）角度（rad）：驱动时与后轮同步，滑行时停在原处 */
  cassetteAngle: number
  /** 滑行已经持续的时间（s） */
  coastSeconds: number
}

export interface DrivetrainSnapshot extends DrivetrainState {
  /** 已完成啮合的挡位 */
  engaged: number
  /** 用户请求的目标挡位 */
  target: number
  /** 正在进行的过渡 */
  shift: Shift | null
  /** 链条当前实际贴着的那片齿片（过渡中仍然是已完成啮合那片） */
  loadedCog: number
  /** 换挡过渡时链条与后拨的几何位置（稳定挡位下三者等于所选齿片） */
  frame: ShiftFrame
  /** 是否在等踩踏（有目标但链条没动） */
  waiting: boolean
  /** 本挡位的前盘/飞轮节圆半径（mm） */
  chainringRadiusMm: number
  loadedCogRadiusMm: number
  /** 换挡过渡是否在进行 */
  shifting: boolean
}

export interface DrivetrainController {
  get(): DrivetrainSnapshot
  subscribe(listener: () => void): () => void
  /** dt 是已经乘过观察速度的模型时间（秒）；暂停时传 0 */
  tick(dt: number): void
  setCadence(rpm: number): void
  setTorque(nm: number): void
  setEfficiency(value: number): void
  /** 请求换到某个挡位（越界会被夹到端点） */
  requestGear(index: number): void
  /** 换轻挡 / 换重挡：delta = +1 更轻（更大后齿片），-1 更重 */
  stepGear(delta: number): void
  setMode(mode: DriveMode): void
  reset(): void
}

const DEFAULT_STATE: DrivetrainState = {
  mode: 'drive',
  cadenceRpm: 60,
  torqueNm: 30,
  efficiency: 0.97,
  shiftState: createShiftState(6),
  crankAngle: 0,
  chainTravel: 0,
  wheelAngle: 0,
  cassetteAngle: 0,
  coastSeconds: 0,
}

export interface ControllerOptions {
  initialCog?: number
  initialState?: Partial<DrivetrainState>
}

export function createDrivetrainController(options: ControllerOptions = {}): DrivetrainController {
  let state: DrivetrainState = {
    ...DEFAULT_STATE,
    ...options.initialState,
    shiftState: options.initialState?.shiftState ?? createShiftState(options.initialCog ?? 6),
  }
  const listeners = new Set<() => void>()

  const emit = () => {
    for (const listener of [...listeners]) listener()
  }

  /**
   * 快照缓存：useSyncExternalStore 要求 getSnapshot 每次返回同一个对象，
   * 否则每次渲染都会认为状态变了（→ 无限重渲染）。所以只在状态变更时失效。
   */
  let cached: DrivetrainSnapshot | null = null

  const chainringRadius = () => pitchRadius(DRIVE.chainringTeeth)
  const loadedCogRadius = () => pitchRadius(cassetteTeethAt(state.shiftState.engaged))

  const buildSnapshot = (): DrivetrainSnapshot => ({
    ...state,
    engaged: state.shiftState.engaged,
    target: state.shiftState.target,
    shift: state.shiftState.shift,
    loadedCog: state.shiftState.engaged,
    frame: shiftFrame(state.shiftState),
    waiting: isWaitingForPedal(state.shiftState),
    chainringRadiusMm: chainringRadius(),
    loadedCogRadiusMm: loadedCogRadius(),
    shifting: state.shiftState.shift !== null,
  })

  const get = (): DrivetrainSnapshot => {
    if (!cached) cached = buildSnapshot()
    return cached
  }

  const tick = (dt: number) => {
    if (!(dt > 0)) return
    const next: DrivetrainState = { ...state }

    if (state.mode === 'drive') {
      const crankRadPerSec = (Math.PI * 2 * state.cadenceRpm) / 60
      const dCrank = crankRadPerSec * dt
      // 链条行程 = 前盘节圆走过的弧长
      const chainDelta = dCrank * chainringRadius()
      const wheelDelta = chainDelta / loadedCogRadius()

      next.crankAngle = state.crankAngle + dCrank
      next.chainTravel = state.chainTravel + chainDelta
      next.wheelAngle = state.wheelAngle + wheelDelta
      // 驱动时整组飞轮与后轮同轴同速（单向离合咬合）
      next.cassetteAngle = state.cassetteAngle + wheelDelta
      next.coastSeconds = 0

      // 换挡只会随链条行程前进；踩踏为 0 时 chainDelta = 0，请求自然排队
      const advanced = advanceShift(state.shiftState, chainDelta)
      next.shiftState = advanced.state
    } else {
      const seconds = state.coastSeconds + dt
      const rpm = coastWheelRpm(COAST.initialWheelRpm, seconds)
      const wheelDelta = (Math.PI * 2 * rpm * dt) / 60
      next.wheelAngle = state.wheelAngle + wheelDelta
      next.coastSeconds = seconds
      // 飞轮与后轮脱开：飞轮、链条、曲柄都不动
    }

    state = next
    cached = null
    emit()
  }

  return {
    get,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    tick,
    setCadence(rpm) {
      const value = Math.max(0, Math.min(120, Math.round(rpm)))
      if (value === state.cadenceRpm) return
      state = { ...state, cadenceRpm: value }
      cached = null
      emit()
    },
    setTorque(nm) {
      const value = Math.max(0, Math.min(80, nm))
      if (value === state.torqueNm) return
      state = { ...state, torqueNm: value }
      cached = null
      emit()
    },
    setEfficiency(value) {
      const clamped = Math.max(0.5, Math.min(1, value))
      if (clamped === state.efficiency) return
      state = { ...state, efficiency: clamped }
      cached = null
      emit()
    },
    requestGear(index) {
      const next = requestGear(state.shiftState, index)
      if (next === state.shiftState) return
      state = { ...state, shiftState: next }
      cached = null
      emit()
    },
    stepGear(delta) {
      const base = state.shiftState.target
      const index = Math.max(0, Math.min(cogCount() - 1, base + delta))
      if (index === base) return
      state = { ...state, shiftState: requestGear(state.shiftState, index) }
      cached = null
      emit()
    },
    setMode(mode) {
      if (mode === state.mode) return
      state =
        mode === 'coast'
          ? { ...state, mode, coastSeconds: 0 }
          : { ...state, mode, coastSeconds: 0 }
      cached = null
      emit()
    },
    reset() {
      state = {
        ...DEFAULT_STATE,
        ...options.initialState,
        shiftState: createShiftState(options.initialCog ?? 6),
        mode: state.mode,
      }
      cached = null
      emit()
    },
  }
}

/** 判断过渡的横向位置是否已落在目标齿片：供场景决定链条贴哪片 */
export function isSettled(shift: Shift | null): boolean {
  return shift === null
}
