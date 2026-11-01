/**
 * 闭合链条路径与后拨姿态的几何求解。
 *
 * 这个文件只有几何与数学，不 import three.js，也不 import React：
 *  - 齿轮按节距对应的「节圆半径」布置：r_N = p / (2 sin(π/N))；
 *  - 链条是一条闭合路径：圆弧（包住每个轮）+ 外公切线（直线），
 *    绕行顺序按驱动方向固定为 前盘 → 张力轮 → 导向轮 → 飞轮 → 前盘；
 *  - 每一段切线都由「闭合环按顺时针行进、所有圆心在行进方向右侧」定出来，
 *    所以路径永远平滑、不自己交叉，也不需要手调控制点；
 *  - 链长固定：给定齿片与链长，用二分法解出摆臂（导板）绕导向轮转多少度，
 *    使路径总长正好等于链长。这是「用摆臂补偿绕行长度」的几何版，
 *    不是齿面接触求解，也不是受力分析。
 *
 * 坐标与单位沿用资料包 `parameters.json`：单位 mm，X 朝车前，Y 向上，
 * 地面 Y = 0；侧视图里车头朝右（+X）。
 */

export interface Vec2 {
  x: number
  y: number
}

export interface Circle2 {
  center: Vec2
  radius: number
}

/** 圆弧段：沿顺时针方向从 startAngle 扫过 sweep（> 0） */
export interface ArcSegment {
  kind: 'arc'
  center: Vec2
  radius: number
  startAngle: number
  sweep: number
  length: number
}

/** 直线段：链条在两轮之间的公切线 */
export interface LineSegment {
  kind: 'line'
  from: Vec2
  to: Vec2
  length: number
}

export type PathSegment = ArcSegment | LineSegment

export interface ChainPath {
  segments: PathSegment[]
  /** 每段起点处的累计弧长 */
  offsets: number[]
  length: number
}

export const TAU = Math.PI * 2

/* =========================================================================
   资料包里的整车与传动参数
   ========================================================================= */

/**
 * 数值来自 `E:\web\source\bicycle\parameters.json` 与 `02_参数与建模.md`：
 * 前七项是厂家几何与齿数（B01/B02），其余是资料包明确写出的教学设定。
 */
export const DRIVE = {
  /** 教学近似的外胎半径，不是把 29 英寸当成精确外径 */
  wheelRadius: 370,
  /** 五通（牙盘中心），地面 Y = 0 */
  bottomBracket: { x: 0, y: 315 },
  /** 后轴；后下叉 455、五通下降 55 的几何结果 */
  rearAxle: { x: -Math.sqrt(455 * 455 - 55 * 55), y: 370 },

  /** 前盘齿数（29 英寸版原厂） */
  chainringTeeth: 30,
  /** CS-M6100-12：10-51T，12 片 */
  cassetteTeeth: [10, 12, 14, 16, 18, 21, 24, 28, 33, 39, 45, 51],
  /** 链条教学节距 */
  chainPitch: 12.7,

  /** 最小齿片 Z（最外侧） */
  smallestCogZ: 66,
  /** 相邻齿片轴向中心距 */
  cogSpacingZ: 3.55,
  /** 前盘链线 Z */
  chainlineZ: 52,

  /** 上下导轮齿数（教学简化） */
  pulleyTeeth: 13,
  /**
   * 两导轮中心距。资料包给的初值是 90 mm，并明确允许「可调以闭合链长」；
   * 90 mm 时 12 个挡位找不到同一条可用链长，这里调到 130 mm，
   * 于是 120 节（1524 mm）能同时闭合全部挡位（见 docs/derailleur-model.md）。
   */
  pulleyCenterDistance: 130,

  /** 最大齿片处，导轮中心到齿片节圆的视觉间隙（齿顶间隙再另算） */
  pulleyToCogGap: 12,
  /** 导向轮中心相对后轴的后偏（侧视图） */
  guideRearOffset: -48,
  /** 链条节数（偶数，教学初值 120 与资料包一致） */
  chainPitchCount: 120,
} as const

/** 固定链长（mm）：节数 × 节距 */
export const CHAIN_LENGTH = DRIVE.chainPitchCount * DRIVE.chainPitch

/* =========================================================================
   平行四边形的运动学
   ========================================================================= */

/**
 * 后拨的下导向部分是一套平行四边形（四连杆）：
 *
 *   A1、A2 固定在后拨安装体（B 关节）上，间距 28 mm；
 *   B1、B2 在运动端（P 关节）上，间距同样是 28 mm；
 *   两根连杆 A1B1、A2B2 等长（45 mm）且始终平行。
 *
 * 于是运动端作「平移而不转动」：平移向量长度恒等于连杆长 45 mm，
 * 只改变方向——导向轮中心因此走一段**圆弧**（半径 45 mm），
 * 不是直线。这就是换挡时导向轮在横向移动之外还会略微径向升降的原因，
 * 也是这里不能用「y = a + b·z」直线公式的原因。
 *
 * 圆心不落在铰点上，而是 `虚拟圆心 + P 关节那段长度`：
 * 导向轮相对运动端铰点有一个固定的下垂偏移 `pulleyDrop`。
 */
export const PARALLELOGRAM = {
  /** 连杆长度 = 导向轮绕虚拟圆心转动的半径 */
  linkLength: 45,
  /** 两个铰点的间距（资料包教学值） */
  pivotSpan: 28,
  /** 虚拟圆心所在 Z：取飞轮组中间 */
  centerZ: 44,
  /** 导向轮相对运动端铰点的下垂偏移（侧视图中沿 +Y 向上为正，这里向下载荷） */
  pulleyDrop: 30,
} as const

/** 侧视图中平行四边形「虚拟圆心」相对后轴的高度（mm，向上为正） */
const guideCenterHeight = (() => {
  const biggestIndex = DRIVE.cassetteTeeth.length - 1
  const targetY =
    DRIVE.rearAxle.y -
    (pitchRadius(cassetteTeethAt(biggestIndex)) +
      pitchRadius(DRIVE.pulleyTeeth) +
      DRIVE.pulleyToCogGap)
  const dz = cogZ(biggestIndex) - PARALLELOGRAM.centerZ
  const reach = Math.sqrt(PARALLELOGRAM.linkLength ** 2 - dz ** 2)
  return targetY + reach
})()

/** 平行四边形虚拟圆心（侧视图 y-z 平面内） */
export function guideArcCenter(): { y: number; z: number } {
  return { y: guideCenterHeight, z: PARALLELOGRAM.centerZ }
}

/**
 * 导向轮（上导轮）中心。
 *
 * 侧视图里它挂在飞轮下方，位置由平行四边形成：横向 Z 必须对着所选齿片，
 * 径向 Y 则由「绕虚拟圆心、半径 = 连杆长」的圆弧决定。
 * 于是最大齿片处留出 `pulleyToCogGap` 的视觉间隙，越往外的小齿片间隙越大
 * （真实车也是这样：链在小齿片上时离导向轮更远）。
 */
export function guidePulleyCenterAtZ(planeZ: number): Vec2 {
  const center = guideArcCenter()
  const dz = planeZ - center.z
  const reach = Math.sqrt(Math.max(0, PARALLELOGRAM.linkLength ** 2 - dz ** 2))
  return {
    x: DRIVE.rearAxle.x + DRIVE.guideRearOffset,
    y: center.y - reach,
  }
}

/** 按挡位取导向轮中心（= 该挡位齿片平面上的位置） */
export function guidePulleyCenter(cogIndex: number): Vec2 {
  return guidePulleyCenterAtZ(cogZ(cogIndex))
}

/** 平行四边形当前转过的角度（弧度）：以连杆朝 +Z 为 0 */
export function parallelogramAngleAtZ(planeZ: number): number {
  const center = guideArcCenter()
  const guide = guidePulleyCenterAtZ(planeZ)
  return Math.atan2(planeZ - center.z, center.y - guide.y)
}

export function parallelogramAngle(cogIndex: number): number {
  return parallelogramAngleAtZ(cogZ(cogIndex))
}

/** 齿数 N 对应的节圆半径（mm） */
export function pitchRadius(teeth: number): number {
  return DRIVE.chainPitch / (2 * Math.sin(Math.PI / teeth))
}

/**
 * 齿顶半径：节圆外 0.24 倍节距（12.7 mm 节距下 +3.05 mm）。
 * 真实链轮齿顶大约在节圆外 3 mm 左右；齿太尖会显得像锯片，也会让换挡跨越时要抬得过高。
 */
export const toothTipRadius = (pitchR: number): number => pitchR + DRIVE.chainPitch * 0.24
/** 齿根半径：节圆内 0.31 倍节距（−3.94 mm），刚好容下链条滚子 */
export const toothRootRadius = (pitchR: number): number => pitchR - DRIVE.chainPitch * 0.31

/** 第 i 片飞轮的 Z（i = 0 是最小的 10T，最靠外侧） */
export function cogZ(index: number): number {
  return DRIVE.smallestCogZ - DRIVE.cogSpacingZ * index
}

/**
 * 导向轮（上导轮）中心。见上方 `guidePulleyCenter`（平行四边形圆弧）：
 * 这里只保留齿片 Z 与齿数查表。
 */
export function cassetteTeethAt(index: number): number {
  const teeth = DRIVE.cassetteTeeth[index]
  if (teeth === undefined) throw new Error(`飞轮片索引越界：${index}`)
  return teeth
}

export function cogCount(): number {
  return DRIVE.cassetteTeeth.length
}

/** 张力轮（下导轮）中心：绕导向轮转 cageAngle 弧度 */
export function tensionPulleyCenter(cogIndex: number, cageAngle: number): Vec2 {
  const guide = guidePulleyCenter(cogIndex)
  return {
    x: guide.x + DRIVE.pulleyCenterDistance * Math.cos(cageAngle),
    y: guide.y + DRIVE.pulleyCenterDistance * Math.sin(cageAngle),
  }
}

/* =========================================================================
   基本向量运算
   ========================================================================= */

const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y })
const scale = (a: Vec2, k: number): Vec2 => ({ x: a.x * k, y: a.y * k })
const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y
const length = (a: Vec2): number => Math.hypot(a.x, a.y)
export const distance = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y)

/** 从 a 指向 b 的单位向量 */
function unit(from: Vec2, to: Vec2): Vec2 {
  const d = sub(to, from)
  const l = length(d)
  if (l < 1e-9) return { x: 1, y: 0 }
  return scale(d, 1 / l)
}

/** 角度归一到 [0, 2π) */
function normalizeAngle(angle: number): number {
  const wrapped = angle % TAU
  return wrapped < 0 ? wrapped + TAU : wrapped
}

/** 顺时针角差：从 from 转到 to 需要顺时针走过的角度，范围 [0, 2π) */
function clockwiseDelta(from: number, to: number): number {
  return normalizeAngle(from - to)
}

/* =========================================================================
   外公切线
   ========================================================================= */

export interface Tangent {
  /** 在第一个圆上的切点（链条离开点） */
  from: Vec2
  /** 在第二个圆上的切点（链条进入点） */
  to: Vec2
}

/**
 * 求两圆的两条外公切线（候选），链条从 a 走向 b 时二选一。
 *
 * 为什么不是直接算一条：一段链条绕行方向固定后，两条外公切线在几何上都成立，
 * 但其中一条会让链环自交（链条从轮子外侧绕一大圈再回来）。真实链条是绷紧的，
 * 会走短的那条，所以这里把两条都交给闭合环去比总长（见 buildLoop）。
 *
 * 两圆相交、相切或包含时无解，返回 null。
 */
export function outerTangents(a: Circle2, b: Circle2): [Tangent, Tangent] | null {
  const delta = sub(b.center, a.center)
  const d = length(delta)
  if (d < 1e-6) return null

  const ux = delta.x / d
  const uy = delta.y / d
  const cosA = (a.radius - b.radius) / d
  if (Math.abs(cosA) > 1 - 1e-9) return null
  const sinA = Math.sqrt(1 - cosA * cosA)
  // delta 的左法向
  const px = -uy
  const py = ux

  const make = (sign: number): Tangent => {
    const nx = cosA * ux + sign * sinA * px
    const ny = cosA * uy + sign * sinA * py
    return {
      from: { x: a.center.x + a.radius * nx, y: a.center.y + a.radius * ny },
      to: { x: b.center.x + b.radius * nx, y: b.center.y + b.radius * ny },
    }
  }

  return [make(1), make(-1)]
}

/* =========================================================================
   闭合路径
   ========================================================================= */

function makeArc(circle: Circle2, entry: Vec2, exit: Vec2): ArcSegment | null {
  const startAngle = Math.atan2(entry.y - circle.center.y, entry.x - circle.center.x)
  const endAngle = Math.atan2(exit.y - circle.center.y, exit.x - circle.center.x)
  const sweep = clockwiseDelta(startAngle, endAngle)
  if (!Number.isFinite(sweep)) return null
  // 完全重合（扫过 0 或整圈）说明布局退化，交回调用方处理
  if (sweep < 1e-4) return null
  return {
    kind: 'arc',
    center: circle.center,
    radius: circle.radius,
    startAngle,
    sweep,
    length: circle.radius * sweep,
  }
}

/** 每个圆的包角允许范围（弧度）。超出说明链条绕了远路，不是绷紧状态 */
export interface WrapLimits {
  min: number
  max: number
}

const DEFAULT_WRAP: WrapLimits = { min: 0.02, max: 4.0 }

/**
 * 按绕行顺序把若干圆连成一条闭合链环。
 *
 * circles[0] 的进入点来自最后一个圆到它的切线，所以顺序必须沿链条行进方向。
 * 每对相邻圆有两条外公切线，整环共 2^n 种组合；逐个试，
 * 丢掉包角离谱或自交的组合，在剩下的里面取总长最短的一条——
 * 这就是「绷紧的链条会走最短路径」。
 */
export function buildLoop(
  circles: Circle2[],
  limits: WrapLimits[] = circles.map(() => DEFAULT_WRAP),
): LoopResult | null {
  const n = circles.length
  if (n < 3) return null

  const candidates: Tangent[][] = []
  for (let i = 0; i < n; i += 1) {
    const pair = outerTangents(circles[i], circles[(i + 1) % n])
    if (!pair) return null
    candidates.push(pair)
  }

  let best: LoopResult | null = null
  const total = 1 << n

  for (let mask = 0; mask < total; mask += 1) {
    const tangents: Tangent[] = []
    for (let i = 0; i < n; i += 1) tangents.push(candidates[i][(mask >> i) & 1])

    const built = assembleLoop(circles, tangents)
    if (!built) continue

    let valid = true
    for (let i = 0; i < n; i += 1) {
      const wrap = built.wraps[i]
      if (wrap < limits[i].min || wrap > limits[i].max) {
        valid = false
        break
      }
    }
    if (!valid) continue
    if (isSelfIntersecting(built.path)) continue

    if (!best || built.path.length < best.path.length) best = built
  }

  return best
}

export interface LoopResult {
  path: ChainPath
  /** 每个圆上链条的包角（弧度），顺序与 circles 一致 */
  wraps: number[]
}

function assembleLoop(circles: Circle2[], tangents: Tangent[]): LoopResult | null {
  const n = circles.length
  const segments: PathSegment[] = []
  const wraps: number[] = []

  for (let i = 0; i < n; i += 1) {
    const entry = tangents[(i - 1 + n) % n].to
    const exit = tangents[i].from
    const arc = makeArc(circles[i], entry, exit)
    if (!arc) return null
    wraps.push(arc.sweep)
    segments.push(arc)

    const line = tangents[i]
    const lineLength = distance(line.from, line.to)
    if (lineLength < 1e-6) return null
    segments.push({ kind: 'line', from: line.from, to: line.to, length: lineLength })
  }

  const offsets: number[] = []
  let total = 0
  for (const segment of segments) {
    offsets.push(total)
    total += segment.length
  }
  return { path: { segments, offsets, length: total }, wraps }
}

/* =========================================================================
   自交检查
   链环必须是一条简单闭曲线，否则说明切线选错了分支
   ========================================================================= */

function isSelfIntersecting(path: ChainPath): boolean {
  const segments = path.segments
  for (let i = 0; i < segments.length; i += 1) {
    for (let j = i + 1; j < segments.length; j += 1) {
      if (areAdjacent(i, j, segments.length)) continue
      if (segmentsIntersect(segments[i], segments[j])) return true
    }
  }
  return false
}

/** 路径里圆弧与直线交替出现，相邻段共享端点，不算相交 */
function areAdjacent(i: number, j: number, count: number): boolean {
  if (j === i + 1) return true
  return i === 0 && j === count - 1
}

function segmentsIntersect(a: PathSegment, b: PathSegment): boolean {
  if (a.kind === 'line' && b.kind === 'line') return lineLine(a, b)
  if (a.kind === 'arc' && b.kind === 'arc') return arcArc(a, b)
  if (a.kind === 'line' && b.kind === 'arc') return lineArc(a, b)
  if (a.kind === 'arc' && b.kind === 'line') return lineArc(b, a)
  return false
}

function lineLine(a: LineSegment, b: LineSegment): boolean {
  const r = sub(a.to, a.from)
  const s = sub(b.to, b.from)
  const denom = r.x * s.y - r.y * s.x
  if (Math.abs(denom) < 1e-12) return false
  const qp = sub(b.from, a.from)
  const t = (qp.x * s.y - qp.y * s.x) / denom
  const u = (qp.x * r.y - qp.y * r.x) / denom
  const eps = 1e-6
  return t > eps && t < 1 - eps && u > eps && u < 1 - eps
}

function lineArc(line: LineSegment, arc: ArcSegment): boolean {
  const d = sub(line.to, line.from)
  const f = sub(line.from, arc.center)
  const a = dot(d, d)
  if (a < 1e-12) return false
  const b = 2 * dot(f, d)
  const c = dot(f, f) - arc.radius * arc.radius
  const disc = b * b - 4 * a * c
  if (disc < 0) return false
  const sq = Math.sqrt(disc)
  const eps = 1e-6
  for (const t of [(-b - sq) / (2 * a), (-b + sq) / (2 * a)]) {
    if (t <= eps || t >= 1 - eps) continue
    const p = { x: line.from.x + d.x * t, y: line.from.y + d.y * t }
    if (angleInArc(arc, Math.atan2(p.y - arc.center.y, p.x - arc.center.x))) return true
  }
  return false
}

function arcArc(a: ArcSegment, b: ArcSegment): boolean {
  const delta = sub(b.center, a.center)
  const d = length(delta)
  if (d < 1e-9) return false
  if (d > a.radius + b.radius || d < Math.abs(a.radius - b.radius)) return false
  const along = (a.radius * a.radius - b.radius * b.radius + d * d) / (2 * d)
  const heightSq = a.radius * a.radius - along * along
  if (heightSq <= 0) return false
  const height = Math.sqrt(heightSq)
  const ux = delta.x / d
  const uy = delta.y / d
  const base = { x: a.center.x + ux * along, y: a.center.y + uy * along }
  for (const sign of [1, -1] as const) {
    const p = { x: base.x - uy * height * sign, y: base.y + ux * height * sign }
    const inA = angleInArc(a, Math.atan2(p.y - a.center.y, p.x - a.center.x))
    const inB = angleInArc(b, Math.atan2(p.y - b.center.y, p.x - b.center.x))
    if (inA && inB) return true
  }
  return false
}

/** 角度是否落在顺时针弧段 [startAngle - sweep, startAngle] 内 */
function angleInArc(arc: ArcSegment, angle: number): boolean {
  const rel = normalizeAngle(arc.startAngle - angle)
  return rel > 1e-6 && rel < arc.sweep - 1e-6
}

/* =========================================================================
   采样
   ========================================================================= */

/** 取路径上弧长 s 处的点（s 会按总长循环） */
export function pointAt(path: ChainPath, s: number): Vec2 {
  const wrapped = ((s % path.length) + path.length) % path.length
  const index = segmentIndexAt(path, wrapped)
  const segment = path.segments[index]
  const local = wrapped - path.offsets[index]

  if (segment.kind === 'line') {
    const t = local / segment.length
    return {
      x: segment.from.x + (segment.to.x - segment.from.x) * t,
      y: segment.from.y + (segment.to.y - segment.from.y) * t,
    }
  }

  const angle = segment.startAngle - local / segment.radius
  return {
    x: segment.center.x + segment.radius * Math.cos(angle),
    y: segment.center.y + segment.radius * Math.sin(angle),
  }
}

/** 取路径上弧长 s 处链条的行进方向（单位向量） */
export function directionAt(path: ChainPath, s: number): Vec2 {
  const wrapped = ((s % path.length) + path.length) % path.length
  const index = segmentIndexAt(path, wrapped)
  const segment = path.segments[index]
  const local = wrapped - path.offsets[index]

  if (segment.kind === 'line') {
    return unit(segment.from, segment.to)
  }

  const angle = segment.startAngle - local / segment.radius
  // 顺时针绕行时的切向
  return { x: Math.sin(angle), y: -Math.cos(angle) }
}

function segmentIndexAt(path: ChainPath, s: number): number {
  let lo = 0
  let hi = path.segments.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (path.offsets[mid] <= s) lo = mid
    else hi = mid - 1
  }
  return lo
}

/** 弧长 s 处是直线段还是圆弧段，用于把链节画成直的还是绕弯的 */
export function segmentKindAt(path: ChainPath, s: number): 'arc' | 'line' {
  const wrapped = ((s % path.length) + path.length) % path.length
  return path.segments[segmentIndexAt(path, wrapped)].kind
}

/* =========================================================================
   传动装置路径
   ========================================================================= */

export interface DrivetrainPath {
  path: ChainPath
  cogIndex: number
  cageAngle: number
  /** 各轮在路径里的包角（弧度），用于自检与讲解 */
  wraps: {
    chainring: number
    tension: number
    guide: number
    cassette: number
  }
  /** 每段的 Z 起止（mm）：前盘在前链线，其余随后拨所在齿片面 */
  segmentZ: { from: number; to: number }[]
  /** 后拨所在齿片的 Z */
  rearPlaneZ: number
  /** 三维链长（mm）：直线段的 Z 变化也算进去，圆弧段 Z 不变 */
  length3d: number
  /** 按三维链长累计的段起点，与 path.offsets 一一对应 */
  offsets3d: number[]
}

/**
 * 给定挡位与摆臂角度，装配闭合链环。
 *
 * 绕行顺序（沿驱动方向）：前盘 → 张力轮 → 导向轮 → 飞轮 → 回到前盘。
 * 也就是：上段从飞轮回到前盘、下段从前盘走向张力轮、
 * 张力轮与导向轮之间是导板内的一小段。
 */
/**
 * 某一瞬间链条与后拨的平面 / 半径设定。
 *
 * 换挡过渡时这几个量彼此不同：后拨先到目标平面，链条还贴在原齿片上，
 * 跨越阶段再抬离齿顶挪过去。稳定挡位下三者一致。
 */
export interface PathFrame {
  /** 链条与飞轮的接触半径（mm） */
  contactRadius: number
  /** 链条接触齿片所在的 Z（mm） */
  contactPlaneZ: number
  /** 后拨（导向轮 / 张力轮 / 导板）所在 Z（mm） */
  derailleurZ: number
}

/** 稳定挡位的默认 frame：三者都取该挡位齿片 */
export function defaultFrame(cogIndex: number): PathFrame {
  const radius = pitchRadius(cassetteTeethAt(cogIndex))
  const z = cogZ(cogIndex)
  return { contactRadius: radius, contactPlaneZ: z, derailleurZ: z }
}

export function buildDrivetrainPath(
  cogIndex: number,
  cageAngle: number,
  frame: PathFrame = defaultFrame(cogIndex),
): DrivetrainPath | null {
  const chainring: Circle2 = {
    center: DRIVE.bottomBracket,
    radius: pitchRadius(DRIVE.chainringTeeth),
  }
  const tension: Circle2 = {
    center: tensionPulleyCenter(cogIndex, cageAngle),
    radius: pitchRadius(DRIVE.pulleyTeeth),
  }
  const guide: Circle2 = {
    center: guidePulleyCenterAtZ(frame.derailleurZ),
    radius: pitchRadius(DRIVE.pulleyTeeth),
  }
  const cassette: Circle2 = {
    center: DRIVE.rearAxle,
    radius: frame.contactRadius,
  }

  // 相邻两轮不能相交，否则公切线无解（视觉上也会穿模）
  const pairs: [Circle2, Circle2][] = [
    [chainring, tension],
    [tension, guide],
    [guide, cassette],
    [cassette, chainring],
  ]
  for (const [a, b] of pairs) {
    if (distance(a.center, b.center) <= a.radius + b.radius + 0.5) return null
  }

  // 包角上限按「绷紧链条」的常识收紧：任何一个轮被绕 200° 以上都不合理
  const loop = buildLoop([chainring, tension, guide, cassette], [
    { min: 0.8, max: 4.2 },
    { min: 0.04, max: 3.6 },
    { min: 0.04, max: 3.6 },
    { min: 0.4, max: 3.6 },
  ])
  if (!loop) return null

  const wraps = {
    chainring: loop.wraps[0],
    tension: loop.wraps[1],
    guide: loop.wraps[2],
    cassette: loop.wraps[3],
  }

  // 圆弧段 Z 恒定；直线段 Z 从上一段圆弧过渡到下一段圆弧。
  // 注意：链条在飞轮上那一圈用「接触平面」，两个导轮用「后拨平面」——
  // 换挡过渡时两者不同，直线段因此是斜的（真实的链条侧向偏移）。
  const rearPlaneZ = frame.contactPlaneZ
  const arcZ = [DRIVE.chainlineZ, frame.derailleurZ, frame.derailleurZ, frame.contactPlaneZ]
  const segmentZ: { from: number; to: number }[] = []
  for (let i = 0; i < loop.wraps.length; i += 1) {
    segmentZ.push({ from: arcZ[i], to: arcZ[i] })
    segmentZ.push({ from: arcZ[i], to: arcZ[(i + 1) % arcZ.length] })
  }

  // 三维长度：直线段带有 Z 落差，长度略长于侧视投影，链长守恒要按三维算
  const offsets3d: number[] = []
  let length3d = 0
  for (let i = 0; i < loop.path.segments.length; i += 1) {
    offsets3d.push(length3d)
    const segment = loop.path.segments[i]
    const { from, to } = segmentZ[i]
    const dz = to - from
    length3d += segment.kind === 'line' ? Math.hypot(segment.length, dz) : segment.length
  }

  return {
    path: loop.path,
    cogIndex,
    cageAngle,
    wraps,
    segmentZ,
    rearPlaneZ,
    length3d,
    offsets3d,
  }
}

/* =========================================================================
   三维取点
   ========================================================================= */

export interface Vec3 {
  x: number
  y: number
  z: number
}

/**
 * 取三维链长 s 处的点。三维弧长与侧视弧长在直线段上是线性比例关系，
 * 所以只要按段的 3D/2D 长度比换算局部参数即可。
 */
export function pointAt3d(dt: DrivetrainPath, s: number): Vec3 {
  const path = dt.path
  const total = dt.length3d
  const wrapped = ((s % total) + total) % total
  let index = 0
  for (let i = path.segments.length - 1; i >= 0; i -= 1) {
    if (dt.offsets3d[i] <= wrapped) {
      index = i
      break
    }
  }
  const segment = path.segments[index]
  const { from, to } = dt.segmentZ[index]
  const segment3d =
    segment.kind === 'line' ? Math.hypot(segment.length, to - from) : segment.length
  const t = segment3d < 1e-9 ? 0 : (wrapped - dt.offsets3d[index]) / segment3d

  if (segment.kind === 'line') {
    return {
      x: segment.from.x + (segment.to.x - segment.from.x) * t,
      y: segment.from.y + (segment.to.y - segment.from.y) * t,
      z: from + (to - from) * t,
    }
  }

  const angle = segment.startAngle - segment.sweep * t
  return {
    x: segment.center.x + segment.radius * Math.cos(angle),
    y: segment.center.y + segment.radius * Math.sin(angle),
    z: from,
  }
}

/** 取三维链长 s 处的单位切向（用左右邻点差分，直线和圆弧通用） */
export function directionAt3d(dt: DrivetrainPath, s: number): Vec3 {
  const span = 0.35
  const a = pointAt3d(dt, s - span)
  const b = pointAt3d(dt, s + span)
  const dx = b.x - a.x
  const dy = b.y - a.y
  const dz = b.z - a.z
  const l = Math.hypot(dx, dy, dz)
  if (l < 1e-9) return { x: 1, y: 0, z: 0 }
  return { x: dx / l, y: dy / l, z: dz / l }
}

/* =========================================================================
   链长守恒：解摆臂角度
   ========================================================================= */

/** 摆臂允许的转角范围（弧度，侧视图中 0 指向 +X，负值表示向下） */
export const CAGE_RANGE = { min: -2.7, max: -0.25 } as const

export interface CageSolve {
  cageAngle: number
  result: DrivetrainPath
  lengthError: number
}

/**
 * 求摆臂角，使三维链长正好等于固定链长。
 *
 * 链长随摆臂角的曲线并不连续覆盖整个转角范围（有些角度上切线分支会失效），
 * 所以先按一定步长采样，只在「相邻两个有效采样之间变号」的地方二分。
 * 找不到就返回 null，由界面如实报告「该挡位在当前链长下无法闭合」。
 *
 * `guess` 是给换挡过渡用的起点：逐帧重解时从上一次的解出发用割线法收敛，
 * 通常 3–4 次就能到 1e-6 mm，避免每帧几十次建环。
 */
export function solveCageAngleFor(
  frame: PathFrame,
  chainLength: number,
  options: { cogIndex?: number; guess?: number; samples?: number } = {},
): CageSolve | null {
  const cogIndex = options.cogIndex ?? 0
  const samples = options.samples ?? 96
  const span = CAGE_RANGE.max - CAGE_RANGE.min

  const evaluate = (angle: number): number | null => {
    const built = buildDrivetrainPath(cogIndex, angle, frame)
    return built ? built.length3d - chainLength : null
  }

  const finish = (angle: number): CageSolve | null => {
    const result = buildDrivetrainPath(cogIndex, angle, frame)
    if (!result) return null
    return { cageAngle: angle, result, lengthError: result.length3d - chainLength }
  }

  // --- 快速路径：从上一帧的解出发做割线迭代 ---
  if (options.guess !== undefined) {
    let a = Math.min(CAGE_RANGE.max, Math.max(CAGE_RANGE.min, options.guess))
    let fa = evaluate(a)
    if (fa !== null) {
      let b = Math.min(CAGE_RANGE.max, a + 0.08)
      let fb = evaluate(b)
      for (let i = 0; i < 10 && fa !== null && fb !== null; i += 1) {
        if (Math.abs(fb) < 1e-7) return finish(b)
        const slope = (fb - fa) / (b - a)
        if (!Number.isFinite(slope) || Math.abs(slope) < 1e-9) break
        let next = b - fb / slope
        if (!Number.isFinite(next)) break
        next = Math.min(CAGE_RANGE.max, Math.max(CAGE_RANGE.min, next))
        a = b
        fa = fb
        b = next
        fb = evaluate(b)
      }
      if (fb !== null && Math.abs(fb) < 1e-3) return finish(b)
    }
  }

  // --- 稳妥路径：采样找变号区间，再二分 ---
  const points: { angle: number; value: number }[] = []
  for (let k = 0; k <= samples; k += 1) {
    const angle = CAGE_RANGE.min + (span * k) / samples
    const value = evaluate(angle)
    if (value !== null) points.push({ angle, value })
  }

  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i]
    const b = points[i + 1]
    if (a.value === 0) return finish(a.angle)
    if (a.value * b.value > 0) continue

    let lo = a.angle
    let hi = b.angle
    let valueLo = a.value
    for (let iteration = 0; iteration < 70; iteration += 1) {
      const mid = (lo + hi) / 2
      const valueMid = evaluate(mid)
      if (valueMid === null) break
      if (valueLo * valueMid <= 0) hi = mid
      else {
        lo = mid
        valueLo = valueMid
      }
      if (hi - lo < 1e-8) break
    }
    return finish((lo + hi) / 2)
  }

  return null
}

/** 稳定挡位的求解：等价于 solveCageAngleFor(该挡位默认 frame) */
export function solveCageAngle(
  cogIndex: number,
  chainLength: number,
  samples = 96,
): CageSolve | null {
  return solveCageAngleFor(defaultFrame(cogIndex), chainLength, { cogIndex, samples })
}

/**
 * 给定一个挡位与链长，报告闭合误差。
 * 用于验收页里如实列出「每挡路径长度误差」。
 */
export function pathLengthAtCage(cogIndex: number, cageAngle: number): number | null {
  const built = buildDrivetrainPath(cogIndex, cageAngle)
  return built ? built.path.length : null
}
