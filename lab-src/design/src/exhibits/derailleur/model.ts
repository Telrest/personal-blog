/**
 * 自行车变速器的计算模型（纯逻辑，不 import three.js / React）。
 *
 * 这里只有「数字怎么算」和「换挡状态怎么走」：
 *  - 齿比、后轮转速、理论车速、理想轮端力矩、输入/输出功率；
 *  - 目标挡位与已完成啮合挡位的区分、换挡过渡按链条行程推进；
 *  - 滑行（单向离合）时后轮与飞轮脱开的那一套状态。
 *
 * 全部数值约定与公式来自用户资料包 `E:\web\source\bicycle`：
 *  - 稳态 g = 前齿数 / 后齿数（02_参数与建模.md「计算」）；
 *  - 轮 rpm = 踏频 × g；
 *  - 车速 v_km/h = 2πR_m × 轮rpm × 0.06；
 *  - 轮端力矩 = η × 曲柄力矩 / g；
 *  - 输入功率 = 曲柄力矩 × 2π × 踏频 / 60，输出功率 = η × 输入功率。
 *
 * 效率 η 是资料包给的假设值（0.97），不是实测；理想对比可以取 1。
 * 页面上必须同时写清「这是理想稳态关系，不是爬坡速度预测」。
 */

import { CHAIN_LENGTH, DRIVE, cassetteTeethAt, cogCount, cogZ, pitchRadius } from './chainPath'
import { liftPeakMm, shiftTimeline } from './shift'

export interface GearInfo {
  /** 0 = 最小的 10T（最外侧） */
  index: number
  teeth: number
  /** 传动比 g = 前盘齿数 / 本片齿数 */
  ratio: number
  /** 节圆半径（mm），几何布置用 */
  pitchRadiusMm: number
  /** 该挡位需要的链条可达性由链长求解器保证，这里不带几何 */
}

/** 12 个挡位的齿数与齿比（前盘齿数可改，默认 30T） */
export function gearTable(chainringTeeth: number = DRIVE.chainringTeeth): GearInfo[] {
  const gears: GearInfo[] = []
  for (let index = 0; index < cogCount(); index += 1) {
    const teeth = cassetteTeethAt(index)
    gears.push({
      index,
      teeth,
      ratio: chainringTeeth / teeth,
      pitchRadiusMm: pitchRadius(teeth),
    })
  }
  return gears
}

export interface DriveInput {
  /** 前盘齿数 */
  chainringTeeth: number
  /** 已完成啮合的挡位索引（0 = 最小片） */
  cogIndex: number
  /** 踏频 rpm；0 表示不踩 */
  cadenceRpm: number
  /** 曲柄输入力矩 N·m */
  torqueNm: number
  /** 传动效率假设，0..1 */
  efficiency: number
  /** 外胎半径（mm） */
  wheelRadiusMm: number
}

export interface DriveResult {
  cogTeeth: number
  ratio: number
  /** 后轮转速 rpm */
  wheelRpm: number
  /** 曲柄角速度 rad/s */
  crankRadPerSec: number
  /** 后轮角速度 rad/s */
  wheelRadPerSec: number
  /** 理论车速 km/h（理想稳态，不是爬坡预测） */
  speedKmh: number
  /** 理想轮端力矩 N·m = η × 曲柄力矩 / g */
  wheelTorqueNm: number
  /** 输入功率 W */
  inputPowerW: number
  /** 输出功率 W = η × 输入功率 */
  outputPowerW: number
  /** 平均链速 m/s，按 v = 节距 × 前齿数 × 踏频 / 60 */
  chainSpeedMs: number
  /** 前盘节圆半径 mm */
  chainringRadiusMm: number
  /** 当前齿片节圆半径 mm */
  cogRadiusMm: number
}

const TAU = Math.PI * 2

/* ---- 单一换算：齿比、后轮转速、轮端力矩 ------------------------------- */

/** 传动比 g = 前盘齿数 / 后飞轮齿数。理想、稳定、无打滑的啮合状态 */
export function ratioOf(chainringTeeth: number, cogTeeth: number): number {
  return chainringTeeth / cogTeeth
}

/** 后轮转速 rpm = 踏频 × 传动比 */
export function wheelRpmOf(cadenceRpm: number, ratio: number): number {
  return cadenceRpm * ratio
}

/** 理想轮端力矩 N·m = η × 曲柄力矩 / 传动比 */
export function wheelTorqueOf(crankTorqueNm: number, ratio: number, efficiency = 1): number {
  return (efficiency * crankTorqueNm) / ratio
}

/** 输入功率 W = 曲柄力矩 × 2π × 踏频 / 60 */
export function inputPowerOf(crankTorqueNm: number, cadenceRpm: number): number {
  return (crankTorqueNm * TAU * cadenceRpm) / 60
}

/**
 * 稳态驱动、无打滑时的全部读数。所有界面数字都必须来自这里，
 * 不要在任何组件里重算一遍。
 */
export function driveResult(input: DriveInput): DriveResult {
  const cogTeeth = cassetteTeethAt(input.cogIndex)
  const ratio = ratioOf(input.chainringTeeth, cogTeeth)
  const wheelRpm = wheelRpmOf(input.cadenceRpm, ratio)
  const crankRadPerSec = (TAU * input.cadenceRpm) / 60
  const wheelRadPerSec = (TAU * wheelRpm) / 60
  const wheelRadiusM = input.wheelRadiusMm / 1000
  const efficiency = clamp(input.efficiency, 0, 1)

  return {
    cogTeeth,
    ratio,
    wheelRpm,
    crankRadPerSec,
    wheelRadPerSec,
    speedKmh: TAU * wheelRadiusM * wheelRpm * 0.06,
    wheelTorqueNm: wheelTorqueOf(input.torqueNm, ratio, efficiency),
    inputPowerW: inputPowerOf(input.torqueNm, input.cadenceRpm),
    outputPowerW: efficiency * inputPowerOf(input.torqueNm, input.cadenceRpm),
    chainSpeedMs: (DRIVE.chainPitch * input.chainringTeeth * input.cadenceRpm) / 60 / 1000,
    chainringRadiusMm: pitchRadius(input.chainringTeeth),
    cogRadiusMm: pitchRadius(cogTeeth),
  }
}

/** 链速（mm/s）：界面上的「链条速度」用这个口径，与多边形效应的精确速度略有差别 */
export function chainSpeedMmPerSec(chainringTeeth: number, cadenceRpm: number): number {
  return (DRIVE.chainPitch * chainringTeeth * cadenceRpm) / 60
}

/**
 * 换挡过渡的链条行程。
 *
 * 资料包给的是「0.6 秒起步」的视觉时间，并要求换挡必须有正向链条运动。
 * 所以这里把时间换算成链条行程：默认 60 rpm 时 0.6 s 正好走完，
 * 踏频更低时就自然变慢（停下踩踏就永远走不完，只能排队）。
 */
export const SHIFT = {
  /** 默认踏频下的一次换挡持续时间（s），资料包初值 */
  baseSeconds: 0.6,
  /** 换算成链条行程（mm） */
  travelMm:
    (DRIVE.chainPitch * DRIVE.chainringTeeth * 60) / 60 * 0.6,
} as const

/** 在给定踏频下，一次换挡大约要多久（s）；踏频 0 时返回 Infinity */
export function shiftDurationSeconds(cadenceRpm: number): number {
  const speed = chainSpeedMmPerSec(DRIVE.chainringTeeth, cadenceRpm)
  if (speed <= 0) return Infinity
  return SHIFT.travelMm / speed
}

/* =========================================================================
   换挡状态机
   ========================================================================= */

/**
 * 换挡过渡。
 *
 * `from` 与 `to` 永远是整数齿片索引——过渡只是「示意运动学」，
 * 不会出现 25.7T 这种虚构的中间齿比，也不会在过渡中改变已完成啮合的齿比。
 */
export interface Shift {
  from: number
  to: number
  /** 0..1，按链条行程推进 */
  progress: number
}

export interface ShiftState {
  /** 已完成啮合的挡位 */
  engaged: number
  /** 用户最后请求的挡位 */
  target: number
  /** 正在进行的过渡；不在换挡时为 null */
  shift: Shift | null
}

export function createShiftState(engaged = 0): ShiftState {
  return { engaged, target: engaged, shift: null }
}

export function requestGear(state: ShiftState, index: number): ShiftState {
  const target = clamp(index, 0, cogCount() - 1)
  if (target === state.target) return state
  return { ...state, target }
}

/**
 * 推进换挡。返回新状态与「这一帧是否完成了一次啮合切换」。
 *
 * 只有链条真的在动（travelMm > 0）才推进，所以停踩时请求会一直排队。
 * 连续点击只保留最后一个合法目标：当前过渡先走完，再接着朝目标换下一挡。
 */
export function advanceShift(
  state: ShiftState,
  chainTravelMm: number,
  shiftTravelMm = SHIFT.travelMm,
): { state: ShiftState; completed: boolean } {
  let { engaged, target, shift } = state
  let completed = false

  if (!shift && target !== engaged && chainTravelMm > 0) {
    shift = { from: engaged, to: engaged + Math.sign(target - engaged), progress: 0 }
  }

  if (shift) {
    const nextProgress = shift.progress + chainTravelMm / Math.max(1e-6, shiftTravelMm)
    if (nextProgress < 1) {
      shift = { ...shift, progress: nextProgress }
    } else {
      engaged = shift.to
      shift = null
      completed = true
      if (target !== engaged) {
        shift = { from: engaged, to: engaged + Math.sign(target - engaged), progress: 0 }
      }
    }
  }

  return { state: { engaged, target, shift }, completed }
}

/** 换挡是否在等踩踏：有目标、有差异，但链条没动 */
export function isWaitingForPedal(state: ShiftState): boolean {
  return state.target !== state.engaged && !state.shift
}

/**
 * 换挡过渡期间链条的「实际位置」：交给几何层直接使用。
 *
 * - 后拨先横向到位（derailleurPlaneZ）；
 * - 链条先仍贴在原齿片上（contactPlaneZ / contactRadiusMm = 原齿片）；
 * - 跨越阶段链条抬离齿顶、横向挪到目标齿片，最后落进新齿片的齿谷。
 *
 * 抬升是必须的：链片比齿片间距宽，不越过齿顶就只能从齿盘里穿过去。
 */
export interface ShiftFrame {
  /** 链条接触半径（mm）：稳定时就是所选齿片的节圆半径 */
  contactRadiusMm: number
  /** 链条接触平面 Z（mm） */
  contactPlaneZ: number
  /** 后拨（导向轮 / 张力轮 / 导板）所在平面 Z（mm） */
  derailleurPlaneZ: number
  /** 是否正在过渡 */
  shifting: boolean
}

export function shiftFrame(state: ShiftState): ShiftFrame {
  const fromRadius = pitchRadius(cassetteTeethAt(state.engaged))
  const fromZ = cogZ(state.engaged)
  const shift = state.shift

  if (!shift) {
    return {
      contactRadiusMm: fromRadius,
      contactPlaneZ: fromZ,
      derailleurPlaneZ: fromZ,
      shifting: false,
    }
  }

  const toRadius = pitchRadius(cassetteTeethAt(shift.to))
  const toZ = cogZ(shift.to)
  const timeline = shiftTimeline(shift.progress)

  return {
    contactRadiusMm:
      fromRadius +
      (toRadius - fromRadius) * timeline.contact +
      liftPeakMm(fromRadius, toRadius) * timeline.lift,
    contactPlaneZ: fromZ + (toZ - fromZ) * timeline.contact,
    derailleurPlaneZ: fromZ + (toZ - fromZ) * timeline.derailleur,
    shifting: true,
  }
}

/* =========================================================================
   滑行（单向离合）
   ========================================================================= */

export const COAST = {
  /** 资料包给的滑行初值 rpm */
  initialWheelRpm: 90,
  /** 教学用的任意阻尼：每秒残余比例 */
  dampingPerSecond: 0.45,
} as const

/** 滑行时后轮转速：按指数衰减，纯教学演示，不代表真实滚阻 */
export function coastWheelRpm(initialRpm: number, seconds: number): number {
  return initialRpm * Math.exp(-COAST.dampingPerSecond * Math.max(0, seconds))
}

/* =========================================================================
   单位换算小工具
   ========================================================================= */

export function rpmToRadPerSec(rpm: number): number {
  return (TAU * rpm) / 60
}

export function radPerSecToRpm(rad: number): number {
  return (rad * 60) / TAU
}

/** 给定目标后轮转速，各挡位需要的踏频（补充说明用，不推断体力） */
export function cadenceForWheelRpm(
  targetWheelRpm: number,
  chainringTeeth: number = DRIVE.chainringTeeth,
): number[] {
  return gearTable(chainringTeeth).map((gear) => targetWheelRpm / gear.ratio)
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** 链条总长（mm），供界面与自检显示 */
export const chainLengthMm = CHAIN_LENGTH
