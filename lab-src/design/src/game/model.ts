/**
 * 魔丸模式 · 一局游戏的全部逻辑（不 import three.js，可直接单测）。
 *
 * 这里负责：阶段状态机、车速与转向、冲刺余量、障碍生成与公平性检查、
 * 扫掠碰撞、魔丸 GPA 计分、纪录比较。三维场景只读它给出的 view，不自己算。
 *
 * 阶段（独立管理，互斥）：
 *   idle（待机）→ countdown（倒计时）→ running（行驶）
 *   running / countdown ⇄ paused（暂停，含切后台自动暂停）
 *   running / paused → spectator（旁观：暂停 + 自由飞行）→ running / paused
 *   running → crash（碰撞演出）→ result（结算）
 *   任何阶段 restart → countdown
 */

import { createMachine, type MachineSpec } from '../lib/machine'
import {
  CONFIG,
  clamp,
  clamp01,
  cruiseSpeedAt,
  damp,
  gapWidthAt,
  maxBandsAt,
  rowGapSecondsAt,
} from './config'
import { groupDigits, hintFor, isBetterRecord, scoreAt, type MowanGpa } from './score'

/* =========================================================================
   类型
   ========================================================================= */

export type GamePhase = 'idle' | 'countdown' | 'running' | 'paused' | 'spectator' | 'crash' | 'result'

export type ObstacleKind = 'wall'

/** 一个碰撞体。碰撞盒与可见模型同尺寸，不做「隐形墙」 */
export interface Obstacle {
  id: number
  rowId: number
  kind: ObstacleKind
  /** 玩家行驶到这个里程时与障碍同排（m） */
  at: number
  /** 横向中心（m，0 是路中线） */
  x: number
  halfWidth: number
  halfDepth: number
  height: number
}

/** 横向区间，单位 m */
export interface Span {
  min: number
  max: number
}

/** 一排障碍：生成时就把「哪里能过」和「来不来得及」算清楚 */
export interface Row {
  id: number
  /** 这一排所在的里程 */
  at: number
  /** 被挡住的路段（可见障碍就铺在这些区间上） */
  blocked: Span[]
  /** 玩家中心可以待的净区间（已扣掉车宽） */
  free: Span[]
  /** 从上一排出发、按最大横向能力仍然来得及到达的位置集合 */
  reachable: Span[]
  obstacles: Obstacle[]
  pattern: 'gate' | 'islands' | 'fallback'
  /** 这一排的转向时间（s），测试与调试用 */
  gapSeconds: number
}

export interface CrashRecord {
  kind: ObstacleKind
  /** 撞击点相对车中心的横向偏移 */
  offsetX: number
  /** 撞击时的车速（m/s） */
  speed: number
  /** 撞击时的里程 */
  distance: number
  /** 撞击瞬间的魔丸 GPA */
  gpa: MowanGpa
}

export type GameEvent =
  | { type: 'count'; value: number }
  | { type: 'go' }
  | { type: 'nine'; nines: number; text: string }
  | { type: 'boost' }
  | { type: 'crash'; record: CrashRecord }
  | { type: 'result'; distance: number; text: string; nines: number; record: boolean; best: number }
  | { type: 'record'; best: number }

export interface Controls {
  /** -1 左 / 0 不转 / 1 右 */
  steer: number
  boost: boolean
}

export type CameraMode = 'chase' | 'spectator'

/** 给三维场景读的实时视图（同一个对象，逐帧改字段；不要缓存它） */
export interface GameView {
  phase: GamePhase
  distance: number
  speed: number
  lateral: number
  lean: number
  steer: number
  boosting: boolean
  stamina: number
  wheelAngle: number
  crankAngle: number
  chainTravel: number
  fanAngle: number
  countdown: number
  crashElapsed: number
  crash: CrashRecord | null
  cameraMode: CameraMode
  obstacles: readonly Obstacle[]
  rows: readonly Row[]
}

/** 给 React 的快照：约 12 Hz 更新一次，对象稳定，可直接给 useSyncExternalStore */
export interface GameSnapshot {
  phase: GamePhase
  distance: number
  distanceText: string
  speed: number
  speedText: string
  speedKmh: number
  gpa: MowanGpa
  nineNote: string | null
  hint: string | null
  stamina: number
  boosting: boolean
  countdown: number
  countdownText: string
  best: number
  bestText: string
  bestGpa: MowanGpa
  record: boolean
  crash: CrashRecord | null
  /** 这一局已经拿到几个 9（没到 3.9 时为 0） */
  nines: number
  paused: boolean
  spectator: boolean
}

export interface GameOptions {
  /** 固定随机种子：调试与单测可复现；不传则每局不同 */
  seed?: number
  best?: number
  onEvent?: (event: GameEvent) => void
}

/* =========================================================================
   工具
   ========================================================================= */

/** mulberry32：小、快、可复现，只为关卡生成服务 */
function createRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a += 0x6d2b79f5
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 把若干区间合并成不重叠的升序区间 */
export function mergeSpans(spans: Span[]): Span[] {
  if (spans.length <= 1) return spans.slice()
  const sorted = [...spans].sort((a, b) => a.min - b.min)
  const out: Span[] = [{ ...sorted[0] }]
  for (let i = 1; i < sorted.length; i += 1) {
    const last = out[out.length - 1]
    const next = sorted[i]
    if (next.min <= last.max + 1e-9) last.max = Math.max(last.max, next.max)
    else out.push({ ...next })
  }
  return out
}

/**
 * 某一排的可达位置集合：上一排可达集合按横向能力展开，再与本排净通道取交集。
 * 只要结果非空，就存在一条「从上一排赶得过来」的路线——这是公平性的判据。
 */
export function propagateReachable(previous: Span[], free: Span[], travel: number): Span[] {
  const out: Span[] = []
  for (const lane of free) {
    for (const from of previous) {
      const min = Math.max(lane.min, from.min - travel)
      const max = Math.min(lane.max, from.max + travel)
      if (max >= min) out.push({ min, max })
    }
  }
  return mergeSpans(out)
}

/** 路面区间减去障碍带，得到空出来的路段 */
function complementSpans(blocked: Span[], half: number): Span[] {
  const merged = mergeSpans(blocked)
  const free: Span[] = []
  let cursor = -half
  for (const span of merged) {
    if (span.min > cursor) free.push({ min: cursor, max: Math.min(span.min, half) })
    cursor = Math.max(cursor, span.max)
  }
  if (cursor < half) free.push({ min: cursor, max: half })
  return free.filter((span) => span.max - span.min > 1e-6)
}

const PHASE_LABEL: Record<GamePhase, string> = {
  idle: '待机',
  countdown: '倒计时',
  running: '行驶中',
  paused: '已暂停',
  spectator: '旁观中',
  crash: '碰撞演出',
  result: '结算',
}

export function phaseLabel(phase: GamePhase): string {
  return PHASE_LABEL[phase]
}

/* =========================================================================
   阶段状态机：锁止与历史用明确的状态机，不用一条时间变量硬凑
   ========================================================================= */

interface PhaseContext {
  fromCountdown: boolean
  resumeAfterSpectator: boolean
}

/**
 * 状态机规格是纯数据（模块级只读），但**每局都要新建一个实例**：
 * React 严格模式下同一页面会建两次游戏，共用一个状态机会互相踢。
 */
const PHASE_SPEC = {
  initial: 'idle',
  states: {
    idle: {
      transitions: [{ event: 'start', target: 'countdown' }],
    },
    countdown: {
      transitions: [
        { event: 'counted', target: 'running' },
        {
          event: 'pause',
          target: 'paused',
          action: (context: PhaseContext) => {
            context.fromCountdown = true
          },
        },
        {
          event: 'spectate',
          target: 'spectator',
          action: (context: PhaseContext) => {
            context.resumeAfterSpectator = true
          },
        },
      ],
    },
    running: {
      transitions: [
        {
          event: 'pause',
          target: 'paused',
          action: (context: PhaseContext) => {
            context.fromCountdown = false
          },
        },
        {
          event: 'spectate',
          target: 'spectator',
          action: (context: PhaseContext) => {
            context.resumeAfterSpectator = true
          },
        },
        { event: 'crash', target: 'crash' },
      ],
    },
    paused: {
      transitions: [
        { event: 'resume', target: 'running', when: (context: PhaseContext) => !context.fromCountdown },
        { event: 'resume', target: 'countdown', when: (context: PhaseContext) => context.fromCountdown },
        {
          event: 'spectate',
          target: 'spectator',
          action: (context: PhaseContext) => {
            context.resumeAfterSpectator = false
          },
        },
      ],
    },
    spectator: {
      transitions: [
        { event: 'spectateEnd', target: 'running', when: (context: PhaseContext) => context.resumeAfterSpectator },
        { event: 'spectateEnd', target: 'paused', when: (context: PhaseContext) => !context.resumeAfterSpectator },
      ],
    },
    crash: {
      transitions: [{ event: 'finished', target: 'result' }],
    },
    result: {
      transitions: [{ event: 'start', target: 'countdown' }],
    },
  },
} satisfies MachineSpec<PhaseContext>

/* =========================================================================
   一局游戏
   ========================================================================= */

/**
 * 一次位移是否撞上一个障碍。
 *
 * 高速时一帧能走 0.5 m 以上，比路障的厚度还大——只比较落点会漏判，
 * 所以这里先把「这一帧走过的整段路」在障碍坐标系里求纵向重叠期，
 * 再在该时间段里查横向：直线运动，取两个端点的极值就够精确。
 *
 * 导出是为了单测能直接构造「跨帧穿过薄路障」的情形。
 */
export function sweptCollision(
  fromDistance: number,
  toDistance: number,
  fromLateral: number,
  toLateral: number,
  obstacle: Obstacle,
): boolean {
  const r = CONFIG.collision.bikeRadius
  const hl = CONFIG.collision.bikeHalfLength
  const delta = toDistance - fromDistance
  // 车中心在障碍坐标系里的纵向位置：行驶得越远，障碍越靠后
  const zFrom = fromDistance - obstacle.at
  const zTo = toDistance - obstacle.at
  const zLo = -obstacle.halfDepth - hl
  const zHi = obstacle.halfDepth + hl
  if (zTo < zLo || zFrom > zHi) return false
  if (delta === 0) return false
  const t0 = clamp01((zLo - zFrom) / delta)
  const t1 = clamp01((zHi - zFrom) / delta)
  const lo = Math.min(t0, t1)
  const hi = Math.max(t0, t1)
  const xa = fromLateral + (toLateral - fromLateral) * lo
  const xb = fromLateral + (toLateral - fromLateral) * hi
  const xMin = Math.min(xa, xb)
  const xMax = Math.max(xa, xb)
  if (xMax < obstacle.x - obstacle.halfWidth - r) return false
  if (xMin > obstacle.x + obstacle.halfWidth + r) return false
  return true
}

const WHEEL_RADIUS = 0.365
/** 车轮转一圈，曲柄转多少圈（教学设定，不是这台车的真实齿比） */
const CRANK_PER_WHEEL = 0.31
/** 链条线速度 = 曲柄角速度 × 盘半径 */
const CHAINRING_RADIUS = 0.1

export interface Game {
  advance(dt: number): void
  start(): void
  restart(): void
  pause(): boolean
  resume(): boolean
  togglePause(): boolean
  enterSpectator(): boolean
  exitSpectator(): boolean
  skipCutscene(): boolean
  setControls(controls: Partial<Controls>): void
  /** 切到后台：自动暂停（已经结束的局不受影响） */
  handleHidden(): void
  getSnapshot(): GameSnapshot
  subscribe(listener: () => void): () => void
  getView(): GameView
  getPhase(): GamePhase
  getRows(): readonly Row[]
  getBest(): number
  /** 调试 / 单测：把整局直接推到某个里程（用于验证极长距离的计分） */
  debugTeleport(distance: number): void
  dispose(): void
}

export function createGame(options: GameOptions = {}): Game {
  const phaseMachine = createMachine<PhaseContext>(PHASE_SPEC, {
    initialContext: { fromCountdown: false, resumeAfterSpectator: false },
  })
  const listeners = new Set<() => void>()
  const onEvent = options.onEvent
  const baseSeed = options.seed ?? Math.floor(Math.random() * 0x7fffffff)
  let rng = createRng(baseSeed)
  let best = Math.max(0, Math.round(options.best ?? 0))
  let record = false
  let publishClock = 0
  let lastCountBeat = -1
  let disposed = false

  const controls: Controls = { steer: 0, boost: false }

  const run = {
    distance: 0,
    speed: 0,
    lateral: 0,
    lateralVelocity: 0,
    stamina: 1,
    boosting: false,
    elapsed: 0,
    countdown: 0,
    crashElapsed: 0,
    crash: null as CrashRecord | null,
    obstacles: [] as Obstacle[],
    rows: [] as Row[],
    lastReach: [] as Span[],
    lastRowAt: null as number | null,
    cursor: 0,
    nextObstacleId: 0,
    nextRowId: 0,
    nines: 0,
    wheelAngle: 0,
    crankAngle: 0,
    chainTravel: 0,
    fanAngle: 0,
  }

  const halfWidth = CONFIG.steering.roadHalfWidth
  const bikeRadius = CONFIG.collision.bikeRadius

  /* ---------------------------------------------------------------------
     生成：先把路面分成「障碍带」，再用可达性检查确认这一排过得去
     --------------------------------------------------------------------- */

  /**
   * 一段被挡住的路面 = 一堵连跳矮墙。
   *
   * 参照三视图：低矮混凝土墙 + 顶部压顶，长度就是这一段的宽度。
   * 一排里可能有两三段墙，中间的缺口就是玩家要穿的地方。
   * 碰撞盒与可见模型同尺寸（厚 0.38 m、高 0.85 m），不留假缝。
   */

  /** 「带缺口的路障」：两侧各一段，中间留一个缺口 */
  function gateBands(gap: number, center: number): Span[] {
    const start = clamp(center - gap / 2, -halfWidth, halfWidth)
    const end = clamp(center + gap / 2, -halfWidth, halfWidth)
    const bands: Span[] = []
    if (start > -halfWidth + 0.05) bands.push({ min: -halfWidth, max: start })
    if (end < halfWidth - 0.05) bands.push({ min: end, max: halfWidth })
    return bands
  }

  /** 「几块障碍岛」：中间几段障碍，两侧或中间留出通道 */
  function islandBands(count: number, gap: number): Span[] {
    const bands: Span[] = []
    let cursor = -halfWidth + rng() * 1.4
    for (let i = 0; i < count; i += 1) {
      const width = 1.05 + rng() * 1.55
      const end = Math.min(halfWidth - 0.05, cursor + width)
      if (end - cursor < 0.5) break
      bands.push({ min: cursor, max: end })
      cursor = end + gap * (1 + rng() * 0.3)
      if (cursor > halfWidth - Math.min(gap, 2)) break
    }
    return bands
  }

  /** 一段被挡住的路面 = 一堵墙（碰撞盒 = 可见模型，不留假缝） */
  function buildWall(band: Span, at: number, rowId: number): Obstacle[] {
    const width = band.max - band.min
    if (width <= 0.12) return []
    return [
      {
        id: run.nextObstacleId++,
        rowId,
        kind: 'wall',
        at,
        x: (band.min + band.max) / 2,
        halfWidth: width / 2,
        halfDepth: CONFIG.obstacle.wall.halfDepth,
        height: CONFIG.obstacle.wall.height,
      },
    ]
  }

  /**
   * 生成一排。
   *
   * 公平性不是「每排留一个空位」就够：必须保证从上一排的可达位置出发，
   * 按当前车速与横向能力来得及赶到这一排的某个通道。做不到就换一种排法重来；
   * 实在不行就退化成「一个正对着你的宽缺口」——宁可简单，也不给死局。
   */
  function generateRow(at: number): Row {
    const gapSeconds =
      run.lastRowAt === null ? 2.4 : Math.max(0.4, (at - run.lastRowAt) / Math.max(6, cruiseSpeedAt(at)))
    const travel = CONFIG.steering.maxLateralSpeed * gapSeconds * CONFIG.generate.reachSafety
    const previous = run.lastReach.length
      ? run.lastReach
      : [{ min: -halfWidth + bikeRadius, max: halfWidth - bikeRadius }]
    const baseGap = gapWidthAt(at)
    const minGap = CONFIG.generate.minGapWidth
    const maxBands = maxBandsAt(at)
    const rowId = run.nextRowId++

    const settle = (blocked: Span[], pattern: Row['pattern']): Row | null => {
      const free = complementSpans(blocked, halfWidth)
        .map((span) => ({ min: span.min + bikeRadius, max: span.max - bikeRadius }))
        .filter((span) => span.max - span.min >= minGap - bikeRadius * 2)
      if (!free.length) return null
      const reachable = propagateReachable(previous, free, travel)
      if (!reachable.length) return null
      const obstacles: Obstacle[] = []
      for (const band of mergeSpans(blocked)) obstacles.push(...buildWall(band, at, rowId))
      return { id: rowId, at, blocked, free, reachable, obstacles, pattern, gapSeconds }
    }

    const attempts = 18
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const bandCount = Math.max(1, Math.min(maxBands, 1 + Math.floor(rng() * maxBands)))
      const useGate = bandCount === 1 ? rng() < 0.62 : rng() < 0.28
      const gap = Math.max(minGap, baseGap * (0.9 + rng() * 0.36))
      const maxOffset = Math.max(0, halfWidth - gap / 2 - 0.1)
      const blocked = useGate
        ? gateBands(gap, (rng() * 2 - 1) * maxOffset)
        : islandBands(bandCount, gap)
      if (!blocked.length) continue
      const row = settle(blocked, useGate ? 'gate' : 'islands')
      if (row) {
        run.lastReach = row.reachable
        run.lastRowAt = at
        return row
      }
    }

    // 兜底：缺口正对上一排还能待的位置，一定过得去
    const anchor = previous[Math.floor(rng() * previous.length)] ?? { min: 0, max: 0 }
    const center = clamp((anchor.min + anchor.max) / 2, -halfWidth + 2, halfWidth - 2)
    const gap = Math.max(minGap + 0.5, baseGap)
    const fallback = settle(gateBands(gap, center), 'fallback')
    if (fallback) {
      run.lastReach = fallback.reachable
      run.lastRowAt = at
      return fallback
    }

    // 理论上到不了这里；真到了就给一排完全不挡路的记录，保证游戏继续
    const empty: Row = {
      id: rowId,
      at,
      blocked: [],
      free: complementSpans([], halfWidth).map((span) => ({
        min: span.min + bikeRadius,
        max: span.max - bikeRadius,
      })),
      reachable: previous,
      obstacles: [],
      pattern: 'fallback',
      gapSeconds,
    }
    run.lastReach = empty.reachable
    run.lastRowAt = at
    return empty
  }

  function spacingAt(at: number): number {
    const base = cruiseSpeedAt(at) * rowGapSecondsAt(at)
    return Math.max(13, base * (0.92 + rng() * 0.16))
  }

  function ensureRows(): void {
    const target = run.distance + CONFIG.track.spawnAhead
    let guard = 0
    while (run.cursor < target && guard < 60) {
      guard += 1
      if (run.cursor < CONFIG.track.warmupDistance) {
        run.cursor = CONFIG.track.warmupDistance
        continue
      }
      const at = run.cursor
      const row = generateRow(at)
      run.rows.push(row)
      for (const obstacle of row.obstacles) run.obstacles.push(obstacle)
      run.cursor = at + spacingAt(at)
    }
  }

  function recycle(): void {
    const cut = run.distance - CONFIG.track.recycleBehind
    while (run.rows.length && run.rows[0].at < cut) run.rows.shift()
    while (run.obstacles.length && run.obstacles[0].at < cut) run.obstacles.shift()
  }

  /* ---------------------------------------------------------------------
     碰撞：把这一帧走过的整段路一起检查，避免高速跨帧穿过障碍
     --------------------------------------------------------------------- */

  function findCollision(
    fromDistance: number,
    toDistance: number,
    fromLateral: number,
    toLateral: number,
  ): Obstacle | null {
    for (const obstacle of run.obstacles) {
      if (obstacle.at < fromDistance - 12 || obstacle.at > toDistance + 12) continue
      if (sweptCollision(fromDistance, toDistance, fromLateral, toLateral, obstacle)) return obstacle
    }
    return null
  }

  /* ---------------------------------------------------------------------
     阶段、事件与结算
     --------------------------------------------------------------------- */

  function emit(event: GameEvent): void {
    onEvent?.(event)
  }

  function getPhase(): GamePhase {
    return phaseMachine.get().value as GamePhase
  }

  function resetRun(): void {
    rng = createRng(baseSeed)
    run.distance = 0
    run.speed = 0
    run.lateral = 0
    run.lateralVelocity = 0
    run.stamina = 1
    run.boosting = false
    run.elapsed = 0
    run.countdown = CONFIG.run.countdownSeconds
    run.crashElapsed = 0
    run.crash = null
    run.obstacles = []
    run.rows = []
    run.lastReach = [{ min: -halfWidth + bikeRadius, max: halfWidth - bikeRadius }]
    run.lastRowAt = null
    run.cursor = CONFIG.track.warmupDistance
    run.nines = 0
    run.wheelAngle = 0
    run.crankAngle = 0
    run.chainTravel = 0
    run.fanAngle = 0
    record = false
    lastCountBeat = -1
    controls.steer = 0
    controls.boost = false
    ensureRows()
    publishClock = 0
  }

  function start(): void {
    if (disposed) return
    const phase = getPhase()
    if (phase === 'crash') return
    phaseMachine.reset()
    phaseMachine.send('start')
    resetRun()
    publish(true)
    emit({ type: 'count', value: Math.ceil(run.countdown) })
  }

  function restart(): void {
    start()
  }

  function pause(): boolean {
    const phase = getPhase()
    if (phase !== 'running' && phase !== 'countdown') return false
    const ok = phaseMachine.send('pause')
    if (ok) {
      controls.steer = 0
      controls.boost = false
      publish(true)
    }
    return ok
  }

  function resume(): boolean {
    if (getPhase() !== 'paused') return false
    const ok = phaseMachine.send('resume')
    if (ok) publish(true)
    return ok
  }

  function togglePause(): boolean {
    if (getPhase() === 'paused') return resume()
    return pause()
  }

  function enterSpectator(): boolean {
    const phase = getPhase()
    if (phase !== 'running' && phase !== 'paused' && phase !== 'countdown') return false
    const ok = phaseMachine.send('spectate')
    if (ok) {
      controls.steer = 0
      controls.boost = false
      publish(true)
    }
    return ok
  }

  function exitSpectator(): boolean {
    if (getPhase() !== 'spectator') return false
    const ok = phaseMachine.send('spectateEnd')
    if (ok) publish(true)
    return ok
  }

  function finishRun(): void {
    if (getPhase() !== 'crash') return
    phaseMachine.send('finished')
    const distance = run.distance
    const gpa = scoreAt(distance)
    if (isBetterRecord(distance, best)) {
      best = distance
      record = true
      emit({ type: 'record', best })
    }
    emit({ type: 'result', distance, text: gpa.text, nines: gpa.nines, record, best })
    publish(true)
  }

  function skipCutscene(): boolean {
    if (getPhase() !== 'crash') return false
    run.crashElapsed = CONFIG.run.crashSeconds
    finishRun()
    return true
  }

  function startCrash(obstacle: Obstacle): void {
    const hit: CrashRecord = {
      kind: obstacle.kind,
      offsetX: obstacle.x - run.lateral,
      speed: run.speed,
      distance: run.distance,
      gpa: scoreAt(run.distance),
    }
    run.crash = hit
    run.crashElapsed = 0
    run.boosting = false
    controls.steer = 0
    controls.boost = false
    if (phaseMachine.send('crash')) {
      emit({ type: 'crash', record: hit })
      publish(true)
    }
  }

  /* ---------------------------------------------------------------------
     行驶
     --------------------------------------------------------------------- */

  function stepRunning(dt: number): void {
    run.elapsed += dt

    // 冲刺：余量有限，松手后慢慢回
    if (controls.boost && !run.boosting && run.stamina >= CONFIG.boost.minToStart) {
      run.boosting = true
      run.speed += CONFIG.boost.kick
      emit({ type: 'boost' })
    }
    if (!controls.boost) run.boosting = false
    if (run.boosting) {
      run.stamina = Math.max(0, run.stamina - CONFIG.boost.drainPerSecond * dt)
      if (run.stamina <= 0) run.boosting = false
    } else {
      run.stamina = Math.min(1, run.stamina + CONFIG.boost.recoverPerSecond * dt)
    }

    // 车速：向目标速度靠拢，冲刺时目标更高
    const target = cruiseSpeedAt(run.distance) * (run.boosting ? CONFIG.speed.boostMultiplier : 1)
    run.speed = damp(run.speed, target, 1 / CONFIG.speed.responseSeconds, dt)

    // 横向：连续转向，有加速度、有阻尼
    const steerScale = run.boosting ? CONFIG.speed.boostSteerScale : 1
    const targetLateral = clamp(controls.steer, -1, 1) * CONFIG.steering.maxLateralSpeed * steerScale
    if (controls.steer === 0) {
      run.lateralVelocity = damp(run.lateralVelocity, 0, CONFIG.steering.lateralDamping, dt)
    } else {
      const accel = CONFIG.steering.lateralAccel * dt
      run.lateralVelocity += clamp(targetLateral - run.lateralVelocity, -accel, accel)
    }

    const fromDistance = run.distance
    const fromLateral = run.lateral

    run.lateral += run.lateralVelocity * dt
    const limit = halfWidth - bikeRadius
    if (run.lateral < -limit) {
      run.lateral = -limit
      run.lateralVelocity = 0
    } else if (run.lateral > limit) {
      run.lateral = limit
      run.lateralVelocity = 0
    }

    run.distance += run.speed * dt

    // 视觉联动：车轮 → 曲柄 → 链条；发动机风扇随车速转
    run.wheelAngle += (run.speed / WHEEL_RADIUS) * dt
    run.crankAngle += (run.speed / WHEEL_RADIUS) * CRANK_PER_WHEEL * dt
    run.chainTravel += (run.speed / WHEEL_RADIUS) * CRANK_PER_WHEEL * CHAINRING_RADIUS * dt
    run.fanAngle += (9 + run.speed * 1.35) * dt

    ensureRows()
    recycle()

    // 计分：每跨过一个 500 m 节点就多一个 9
    const gpa = scoreAt(run.distance)
    if (gpa.nines > run.nines) {
      run.nines = gpa.nines
      emit({ type: 'nine', nines: gpa.nines, text: gpa.text })
    }

    const hit = findCollision(fromDistance, run.distance, fromLateral, run.lateral)
    if (hit) startCrash(hit)
  }

  function stepCrash(dt: number): void {
    run.crashElapsed += dt
    // 撞上之后速度迅速归零：演出期间不再产生距离
    run.speed = Math.max(0, run.speed - dt * 26)
    run.wheelAngle += (run.speed / WHEEL_RADIUS) * dt * 0.35
    if (run.crashElapsed >= CONFIG.run.crashSeconds) finishRun()
  }

  function stepCountdown(dt: number): void {
    run.countdown = Math.max(0, run.countdown - dt)
    // 倒计时里发动机先转起来：3 秒刚好够它把转速拉满
    run.fanAngle += (7 + (1 - run.countdown / CONFIG.run.countdownSeconds) * 16) * dt
    const beat = Math.ceil(run.countdown)
    if (beat !== lastCountBeat) {
      lastCountBeat = beat
      if (beat > 0) emit({ type: 'count', value: beat })
    }
    if (run.countdown <= 0) {
      phaseMachine.send('counted')
      emit({ type: 'go' })
      publish(true)
    }
  }

  /* ---------------------------------------------------------------------
     快照与视图
     --------------------------------------------------------------------- */

  let snapshot: GameSnapshot = {
    phase: 'idle',
    distance: 0,
    distanceText: '0',
    speed: 0,
    speedText: '0.0',
    speedKmh: 0,
    gpa: scoreAt(0),
    nineNote: null,
    hint: null,
    stamina: 1,
    boosting: false,
    countdown: 0,
    countdownText: '',
    best,
    bestText: `${Math.round(best)}`,
    bestGpa: scoreAt(best),
    record: false,
    crash: null,
    nines: 0,
    paused: false,
    spectator: false,
  }

  function buildSnapshot(): GameSnapshot {
    const phase = getPhase()
    const gpa = scoreAt(run.distance)
    const countText =
      phase === 'countdown' ? (run.countdown > 0 ? String(Math.ceil(run.countdown)) : '冲') : ''
    return {
      phase,
      distance: run.distance,
      distanceText: groupDigits(Math.round(run.distance)),
      speed: run.speed,
      speedText: run.speed.toFixed(1),
      speedKmh: run.speed * 3.6,
      gpa,
      nineNote: gpa.nines > 0 ? `第 ${groupDigits(gpa.nines)} 个 9` : null,
      hint: hintFor(gpa),
      stamina: run.stamina,
      boosting: run.boosting,
      countdown: run.countdown,
      countdownText: countText,
      best,
      bestText: groupDigits(Math.round(best)),
      bestGpa: scoreAt(best),
      record,
      crash: run.crash,
      nines: run.nines,
      paused: phase === 'paused',
      spectator: phase === 'spectator',
    }
  }

  function publish(force = false): void {
    if (disposed && !force) return
    snapshot = buildSnapshot()
    for (const listener of [...listeners]) listener()
  }

  function maybePublish(dt: number): void {
    publishClock += dt
    if (publishClock < 0.08) return
    publishClock = 0
    publish()
  }

  const view: GameView = {
    phase: 'idle',
    distance: 0,
    speed: 0,
    lateral: 0,
    lean: 0,
    steer: 0,
    boosting: false,
    stamina: 1,
    wheelAngle: 0,
    crankAngle: 0,
    chainTravel: 0,
    fanAngle: 0,
    countdown: 0,
    crashElapsed: 0,
    crash: null,
    cameraMode: 'chase',
    obstacles: [],
    rows: [],
  }

  function syncView(): void {
    const phase = getPhase()
    view.phase = phase
    view.distance = run.distance
    view.speed = run.speed
    view.lateral = run.lateral
    view.lean =
      clamp(run.lateralVelocity / CONFIG.steering.maxLateralSpeed, -1, 1) * CONFIG.steering.maxLean
    view.steer = clamp(controls.steer, -1, 1)
    view.boosting = run.boosting
    view.stamina = run.stamina
    view.wheelAngle = run.wheelAngle
    view.crankAngle = run.crankAngle
    view.chainTravel = run.chainTravel
    view.fanAngle = run.fanAngle
    view.countdown = run.countdown
    view.crashElapsed = run.crashElapsed
    view.crash = run.crash
    view.cameraMode = phase === 'spectator' ? 'spectator' : 'chase'
    view.obstacles = run.obstacles
    view.rows = run.rows
  }

  // 待机时先把路铺出来：进场就能看见跑道和远处的障碍，而不是一条空路
  run.cursor = CONFIG.track.warmupDistance
  run.lastReach = [{ min: -halfWidth + bikeRadius, max: halfWidth - bikeRadius }]
  ensureRows()
  syncView()

  return {
    advance(dt: number) {
      if (disposed) return
      const step = Math.min(0.05, Math.max(0, dt))
      if (step > 0) {
        const phase = getPhase()
        if (phase === 'countdown') stepCountdown(step)
        else if (phase === 'running') stepRunning(step)
        else if (phase === 'crash') stepCrash(step)
      }
      syncView()
      if (getPhase() === 'running' || getPhase() === 'countdown' || getPhase() === 'crash') {
        maybePublish(step)
      }
    },

    start,
    restart,
    pause,
    resume,
    togglePause,
    enterSpectator,
    exitSpectator,
    skipCutscene,

    setControls(next) {
      if (next.steer !== undefined) {
        const value = clamp(next.steer, -1, 1)
        controls.steer = Math.abs(value) < 0.1 ? 0 : value
      }
      if (next.boost !== undefined) controls.boost = next.boost
    },

    handleHidden() {
      const phase = getPhase()
      if (phase === 'spectator') phaseMachine.send('spectateEnd')
      const after = getPhase()
      if (after === 'running' || after === 'countdown') pause()
      controls.steer = 0
      controls.boost = false
    },

    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getView() {
      syncView()
      return view
    },
    getPhase,
    getRows: () => run.rows,
    getBest: () => best,

    debugTeleport(distance: number) {
      run.distance = Math.max(0, distance)
      run.nines = scoreAt(run.distance).nines
      run.rows = []
      run.obstacles = []
      run.lastRowAt = null
      run.lastReach = [{ min: -halfWidth + bikeRadius, max: halfWidth - bikeRadius }]
      run.cursor = Math.max(CONFIG.track.warmupDistance, run.distance + 20)
      ensureRows()
      syncView()
      publish(true)
    },

    dispose() {
      disposed = true
      listeners.clear()
    },
  }
}
