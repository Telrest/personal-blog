/** 通用涡扇教学模型。坐标 X 为气流方向，Y 向上，轴心 Y=Z=0。
 * 尺度沿用 CC0 参考模型，所有级数、位置、响应与相对趋势均为教学设定。
 * 不求解真实转子力矩、热力匹配或流场，不输出实际发动机性能。
 */
export type EnginePart = 'nacelle' | 'fan' | 'lpc' | 'hpc' | 'combustor' | 'hpt' | 'lpt' | 'lp-shaft' | 'hp-shaft' | 'nozzle'
export type EngineView = 'exterior' | 'cutaway' | 'exploded'
export type Isolation = 'all' | 'lp' | 'hp' | 'shafts'
export type FlowMode = 'both' | 'core' | 'bypass' | 'off'
export type CameraId = 'overview' | 'side' | 'front' | 'compressor' | 'combustor' | 'shafts' | 'rear' | 'exploded'
export type Spool = 'lp' | 'hp' | 'fixed'

export const ENGINE = {
  initialLoad: 0.38,
  lpResponse: 1.6, hpResponse: 0.85,
  lpFrequency: { offset: 0.12, gain: 0.66 },
  hpFrequency: { offset: 0.24, gain: 1.05 },
  lpShaft: { start: -1.09, end: 1.27, radius: 0.055 },
  hpShaft: { start: -0.34, end: 0.84, inner: 0.078, outer: 0.108 },
  rotorStations: { fan: [-1.1], lpc: [-0.73, -0.65, -0.57], hpc: [-0.28, -0.17, -0.06, 0.05, 0.16], hpt: [0.79], lpt: [0.97, 1.07, 1.17] },
  nacelle: [[-1.64, 0.91], [-1.60, 0.95], [-1.48, 0.96], [-1.12, 0.93], [-0.65, 0.88], [-0.05, 0.79], [0.54, 0.68], [1.17, 0.56], [1.30, 0.53]] as [number, number][],
  coreCase: [[-0.91, 0.50], [-0.80, 0.49], [-0.46, 0.425], [-0.38, 0.39], [0.25, 0.365], [0.31, 0.43], [0.61, 0.445], [0.73, 0.375], [0.88, 0.37], [1.02, 0.415], [1.26, 0.425], [1.34, 0.39]] as [number, number][],
  corePath: [[-1.73, 0.48], [-1.1, 0.46], [-0.85, 0.37], [-0.45, 0.31], [0.22, 0.265], [0.36, 0.34], [0.62, 0.34], [0.81, 0.29], [1.25, 0.32], [1.85, 0.22]] as [number, number][],
  bypassPath: [[-1.73, 0.76], [-1.1, 0.77], [-0.85, 0.72], [-0.1, 0.635], [0.65, 0.535], [1.38, 0.45]] as [number, number][],
} as const

export const PART_SPOOL: Record<EnginePart, Spool> = {
  nacelle: 'fixed', fan: 'lp', lpc: 'lp', hpc: 'hp', combustor: 'fixed', hpt: 'hp', lpt: 'lp', 'lp-shaft': 'lp', 'hp-shaft': 'hp', nozzle: 'fixed',
}

export interface EngineState { time: number; load: number; lp: number; hp: number; lpAngle: number; hpAngle: number; travel: number }
export interface TrendStation { id: EnginePart; label: string; totalPressure: number; totalTemperature: number }
export interface EngineSnapshot extends EngineState { lpHz: number; hpHz: number; heat: number; stations: TrendStation[] }
export interface EngineDisplay { view: EngineView; isolate: Isolation; flow: FlowMode; selected: EnginePart | null; camera: CameraId; explode: number; quality: 'standard' | 'low' }

const clamp = (n: number) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0))
export function targetLevels(load: number) { const u = clamp(load); return { lp: 0.22 + 0.78 * u, hp: 0.40 + 0.60 * Math.sqrt(u) } }
export function frequencies(lp: number, hp: number) {
  return { lpHz: ENGINE.lpFrequency.offset + ENGINE.lpFrequency.gain * lp,
    hpHz: ENGINE.hpFrequency.offset + ENGINE.hpFrequency.gain * hp }
}
export function initialEngine(load: number = ENGINE.initialLoad): EngineState {
  const levels = targetLevels(load)
  return { time: 0, load: clamp(load), ...levels, lpAngle: 0, hpAngle: 0, travel: 0 }
}

/** 指数响应与角度积分均使用闭式解，大步长与细分步长结果一致。 */
export function advanceEngine(state: EngineState, delta: number): EngineState {
  if (!Number.isFinite(delta) || delta <= 0) return state
  const target = targetLevels(state.load)
  const advance = (v: number, to: number, tau: number, offset: number, gain: number) => {
    const decay = Math.exp(-delta / tau)
    const integral = to * delta + (v - to) * tau * (1 - decay)
    return { value: to + (v - to) * decay, angle: 2 * Math.PI * (offset * delta + gain * integral), integral }
  }
  const lp = advance(state.lp, target.lp, ENGINE.lpResponse, ENGINE.lpFrequency.offset, ENGINE.lpFrequency.gain)
  const hp = advance(state.hp, target.hp, ENGINE.hpResponse, ENGINE.hpFrequency.offset, ENGINE.hpFrequency.gain)
  return { ...state, time: state.time + delta, lp: lp.value, hp: hp.value,
    lpAngle: state.lpAngle + lp.angle, hpAngle: state.hpAngle + hp.angle,
    travel: state.travel + 0.18 * delta + 0.35 * lp.integral }
}

/** 无量纲教学趋势，并非一维热力循环求解。各站点相对量在同一工况下生成。 */
export function trendStations(lp: number, hp: number): TrendStation[] {
  const pFan = 1 + 0.35 * lp, pLpc = pFan * (1 + 0.65 * lp), pHpc = pLpc * (1 + 6.5 * hp)
  const tFan = 1 + 0.12 * lp, tLpc = tFan + 0.22 * lp, tHpc = tLpc + 0.65 * hp, tBurn = tHpc + 1.2 + 1.4 * hp
  return [
    { id: 'nacelle', label: '入口', totalPressure: 1, totalTemperature: 1 },
    { id: 'fan', label: '风扇后', totalPressure: pFan, totalTemperature: tFan },
    { id: 'lpc', label: '低压压气机后', totalPressure: pLpc, totalTemperature: tLpc },
    { id: 'hpc', label: '高压压气机后', totalPressure: pHpc, totalTemperature: tHpc },
    { id: 'combustor', label: '燃烧室后', totalPressure: pHpc * 0.95, totalTemperature: tBurn },
    { id: 'hpt', label: '高压涡轮后', totalPressure: pHpc * 0.56, totalTemperature: tBurn - 0.45 - 0.3 * hp },
    { id: 'lpt', label: '低压涡轮后', totalPressure: pHpc * 0.30, totalTemperature: tBurn - 0.85 - 0.5 * hp },
    { id: 'nozzle', label: '核心喷口', totalPressure: pHpc * 0.294, totalTemperature: tBurn - 0.85 - 0.5 * hp },
  ]
}
export function snapshotOf(state: EngineState): EngineSnapshot {
  return { ...state, ...frequencies(state.lp, state.hp), heat: 0.35 + 0.65 * state.hp, stations: trendStations(state.lp, state.hp) }
}

export function radiusAt(profile: readonly (readonly [number, number])[], x: number): number {
  if (x <= profile[0][0]) return profile[0][1]
  for (let i = 1; i < profile.length; i += 1) {
    if (x <= profile[i][0]) {
      const [x0, r0] = profile[i - 1], [x1, r1] = profile[i]
      return r0 + (r1 - r0) * (x - x0) / (x1 - x0)
    }
  }
  return profile[profile.length - 1][1]
}
export function flowPoint(path: 'core' | 'bypass', progress: number, azimuth: number, offset = 0): [number, number, number] {
  const points = path === 'core' ? ENGINE.corePath : ENGINE.bypassPath
  const t = ((progress % 1) + 1) % 1
  const x = points[0][0] + t * (points[points.length - 1][0] - points[0][0])
  const r = radiusAt(points, x) + offset
  return [x, r * Math.cos(azimuth), r * Math.sin(azimuth)]
}

export function createEngineController() {
  let state = initialEngine(), cached = snapshotOf(state), elapsed = 0
  const listeners = new Set<() => void>()
  const emit = () => { for (const fn of listeners) fn() }
  return {
    get: () => cached,
    subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn) } },
    setLoad(value: number, settle = false) {
      state = settle ? { ...initialEngine(value), time: state.time, travel: state.travel, lpAngle: state.lpAngle, hpAngle: state.hpAngle } : { ...state, load: clamp(value) }
      cached = snapshotOf(state); emit()
    },
    tick(dt: number) {
      const next = advanceEngine(state, dt)
      if (next === state) return
      state = next; cached = snapshotOf(state); elapsed += dt
      if (elapsed >= 0.10) { elapsed %= 0.10; emit() }
    },
    reset() { state = initialEngine(); cached = snapshotOf(state); elapsed = 0; emit() },
  }
}
