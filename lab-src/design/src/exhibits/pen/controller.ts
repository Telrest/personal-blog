/**
 * 按动笔的状态持有者：唯一的可变模型状态。
 *
 * 读这份状态的顺序永远是：
 *   用户输入 → 控制器（x / leg / cycle）→ derivePose() → { 3D、展开图、读数、字幕 }
 * 3D 场景不许自己算位移，图表也不许自己跑一条时间轴。
 *
 * 纯逻辑，不依赖 React / three.js，可以单测。
 */

import {
  derivePose,
  indexAngleOf,
  PEN,
  restXOf,
  slotKindOf,
  type Leg,
  type Pose,
  type StableState,
} from './model'

export interface PenSnapshot {
  /** 已完成的索引循环数 */
  cycle: number
  /** 本次操作开始时的循环数（索引角基准） */
  baseCycle: number
  /** 机构相对位移（mm） */
  x: number
  leg: Leg
  /** 本次按压是否已达到提交阈值 */
  committed: boolean
  moving: boolean
  dragging: boolean
  /** 由 θ 直接读出的稳定状态，保证与画面一致 */
  stable: StableState
  indexAngle: number
  pose: Pose
}

interface Segment {
  t0: number
  t1: number
  x0: number
  x1: number
  /** 这一段属于去程还是回程；回程才会累加索引角 */
  leg: Leg
}

export interface PenControllerOptions {
  /** 自动按下一整段的时间（模型秒） */
  downTime?: number
  /** 到底后的停留 */
  holdTime?: number
  /** 回位时间（模型秒） */
  upTime?: number
  /** 状态通知频率上限（Hz），3D 每帧直接读 getter，不受此限制 */
  notifyHz?: number
}

export interface PenController {
  get(): PenSnapshot
  subscribe(listener: () => void): () => void
  /** 「按一下」：完整按下释放一次 */
  press(): boolean
  beginDrag(): void
  dragTo(x: number): void
  endDrag(): void
  /** 推进动画；dt 是模型时间（已乘观察速度），暂停时传 0 */
  tick(dt: number): void
  reset(): void
  /** 导览步骤直接摆到某个状态 */
  applyStatic(state: { cycle: number; x: number; leg: Leg; committed: boolean }): void
  isAnimating(): boolean
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const smoothstep = (u: number) => u * u * (3 - 2 * u)

export function createPenController(options: PenControllerOptions = {}): PenController {
  const { downTime = 0.62, holdTime = 0.08, upTime = 0.86, notifyHz = 20 } = options
  const notifyInterval = notifyHz > 0 ? 1 / notifyHz : 0

  let cycle = 0
  let baseCycle = 0
  let x: number = PEN.xRetracted
  let leg: Leg = 'down'
  let committed = false
  let dragging = false
  let moving = false
  let timeline: Segment[] | null = null
  let timelineTime = 0

  const listeners = new Set<() => void>()
  let snapshot: PenSnapshot | null = null
  let sinceNotify = Infinity

  function buildSnapshot(): PenSnapshot {
    const pose = derivePose({ baseCycle, cycle, x, leg, committed, moving })
    return {
      cycle,
      baseCycle,
      x,
      leg,
      committed,
      moving,
      dragging,
      stable: slotKindOf(pose.theta) === 'deep' ? 'R' : 'E',
      indexAngle: pose.theta,
      pose,
    }
  }

  function get(): PenSnapshot {
    if (!snapshot) snapshot = buildSnapshot()
    return snapshot
  }

  function invalidate(): void {
    snapshot = null
  }

  function notify(force = false): void {
    if (!force && sinceNotify < notifyInterval) return
    sinceNotify = 0
    for (const listener of [...listeners]) listener()
  }

  /** 所有位移都必须经过这里：提交判据、索引提交点都只在这一处判断 */
  function setX(next: number): void {
    const clamped = clamp(next, 0, PEN.xMax)
    if (clamped === x) return
    x = clamped
    if (!committed && clamped >= PEN.xMax - 1e-6) committed = true
    // 回程越过导向解除高度 = 本次循环真正提交，索引角换成下一个整数位置
    if (leg === 'up' && committed && clamped < PEN.xClear && cycle === baseCycle) {
      cycle += 1
    }
    invalidate()
  }

  /** 结束一次操作：把索引基准对齐到已完成循环，回到静止 */
  function settleAt(rest: number): void {
    setX(rest)
    timeline = null
    moving = false
    leg = 'down'
    committed = false
    baseCycle = cycle
    invalidate()
  }

  function buildReturnTimeline(target: number): Segment[] {
    const distance = Math.abs(x - target)
    const duration = Math.max(0.16, (upTime * distance) / PEN.xMax)
    return [{ t0: 0, t1: duration, x0: x, x1: target, leg: 'up' }]
  }

  function finalTarget(): number {
    return committed ? restXOf(cycle + 1) : restXOf(baseCycle)
  }

  return {
    get,

    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    press() {
      if (dragging || timeline) return false
      const start = x
      // 已经到底还没回位时，按一下没有意义
      if (start >= PEN.xMax - 1e-6) return false

      const downSpan = Math.max(0.12, (downTime * (PEN.xMax - start)) / PEN.xMax)
      const endX = restXOf(cycle + 1)
      const upSpan = Math.max(0.16, (upTime * (PEN.xMax - endX)) / PEN.xMax)

      timeline = [
        { t0: 0, t1: downSpan, x0: start, x1: PEN.xMax, leg: 'down' },
        { t0: downSpan, t1: downSpan + holdTime, x0: PEN.xMax, x1: PEN.xMax, leg: 'down' },
        {
          t0: downSpan + holdTime,
          t1: downSpan + holdTime + upSpan,
          x0: PEN.xMax,
          x1: endX,
          leg: 'up',
        },
      ]
      timelineTime = 0
      leg = 'down'
      committed = false
      moving = true
      invalidate()
      notify(true)
      return true
    },

    beginDrag() {
      if (dragging) return
      timeline = null
      dragging = true
      leg = 'down'
      committed = false
      moving = false
      invalidate()
      notify(true)
    },

    dragTo(next) {
      if (!dragging) return
      const before = x
      setX(next)
      moving = x !== before
      if (moving) notify()
    },

    endDrag() {
      if (!dragging) return
      dragging = false
      leg = 'up'
      const target = finalTarget()
      // 没到提交阈值：按原路退回原稳定状态
      timeline = buildReturnTimeline(target)
      timelineTime = 0
      moving = true
      invalidate()
      notify(true)
    },

    tick(dt) {
      if (dt <= 0) return
      sinceNotify += dt
      if (!timeline) return

      const beforeTime = timelineTime
      timelineTime += dt
      // 帧采样可以跨过整段“到底停留”，但状态机不能漏掉它。
      // 按时间顺序消费跨过的端点，保证到底提交和回程索引各执行一次。
      for (const crossed of timeline) {
        if (beforeTime < crossed.t1 && timelineTime >= crossed.t1) {
          leg = crossed.leg
          invalidate()
          setX(crossed.x1)
        }
      }
      const last = timeline[timeline.length - 1]
      if (timelineTime >= last.t1) {
        settleAt(last.x1)
        notify(true)
        return
      }

      const segment = timeline.find((item) => timelineTime >= item.t0 && timelineTime <= item.t1) ?? last
      // 回程一开始就必须切到 up：索引角的第二段和提交判据都靠这个方向
      if (segment.leg !== leg) {
        leg = segment.leg
        invalidate()
      }
      const span = segment.t1 - segment.t0
      const u = span <= 0 ? 1 : (timelineTime - segment.t0) / span
      setX(segment.x0 + (segment.x1 - segment.x0) * smoothstep(clamp(u, 0, 1)))
      moving = true
      notify()
    },

    reset() {
      cycle = 0
      baseCycle = 0
      x = PEN.xRetracted
      leg = 'down'
      committed = false
      dragging = false
      moving = false
      timeline = null
      timelineTime = 0
      invalidate()
      notify(true)
    },

    applyStatic(state) {
      timeline = null
      dragging = false
      moving = false
      cycle = state.cycle
      baseCycle = state.cycle
      x = clamp(state.x, 0, PEN.xMax)
      leg = state.leg
      committed = state.committed
      invalidate()
      notify(true)
    },

    isAnimating() {
      return Boolean(timeline)
    },
  }
}

/** 当前索引角对应的索引位说明 */
export function indexLabel(theta: number): string {
  const kind = slotKindOf(theta)
  return kind === 'deep' ? '深导槽（收芯通道）' : '浅锁止位（出芯支承）'
}

/** 下一个整数索引位置的角度（展开图上画下一个稳定点用） */
export function nextIndexAngle(cycle: number): number {
  return indexAngleOf(cycle) + PEN.stepPerCycleDeg
}
