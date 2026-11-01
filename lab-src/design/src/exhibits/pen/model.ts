/**
 * 按动笔（ZEBRA SARASA CLIP JJ15 外观参考）的简化教学机构模型。
 *
 * 这个文件只有计算，没有 three.js、没有 React：
 *  1. 参数表（每个数标注是官方规格还是教学设定）；
 *  2. 由「索引循环数 + 机构位移 x + 运动方向」推出的唯一姿态；
 *  3. 导览步骤表。
 *
 * 参考资料：`E:\web\source\jj15-reference-pack-20261101`（用户提供的制作资料包）
 *   - 01_资料与证据.md：官方规格 S01–S03、照片 U01–U03、同系列拆解 S04、斑马专利 S05
 *   - 02_建模参数与零件.md：尺寸与零件层级
 *   - 03_运动与交互.md：四段运动与索引拓扑
 *   - parameters.json：机器可读参数
 *
 * 边界（务必保留在界面说明里）：
 *  - 外形比例按官方名义尺寸，内部机构是本资料包自拟的教学设定，不是 JJ15 的实物凸轮；
 *  - 不做接触求解、不做弹簧应力，不显示按压力；
 *  - 索引数、齿形、配合间隙都可以统一调整，调整时必须同步展开图与说明。
 */

/** 参数来源：官方公开规格，或本资料包的教学设定 */
export type Provenance = 'official' | 'teaching'

export interface ParamNote {
  value: number
  provenance: Provenance
  note?: string
}

/**
 * 教学机构参数。改这里就等于改全站——几何、展开图、读数、说明都读同一份。
 * 除 official 外都不是实测值。
 */
export const PEN = {
  /** 官方：名义总长 (S01) */
  nominalLength: 141.0,
  /** 官方：目录轴径 (S01) */
  shaftDiameter: 11.0,
  /** 官方：球珠直径；0.5 只是球珠，不是笔杆直径 (S01) */
  ballDiameter: 0.5,
  /** 官方：JF-0.5 笔芯长度 / 最大直径 (S02) */
  refillLength: 111.1,
  refillMaxDiameter: 6.1,

  /* ---- 以下为教学设定（02_建模参数与零件.md） ---- */
  /** 透明前锥轴向范围 Z=0～11.5，出芯口所在平面 Z=0 */
  coneZ: [0, 11.5] as const,
  coneTipDiameter: 2.8,
  gripZ: [11.5, 52] as const,
  gripMaxDiameter: 11.0,
  connectorZ: [52, 66] as const,
  rearBarrelZ: [66, 130.5] as const,
  rearBarrelOuterDiameter: 10.2,
  mechanismCavityDiameter: 8.6,
  /** 收芯状态按帽可见段 */
  buttonZ: [130.5, 141] as const,
  buttonDiameter: 5.4,
  clipLength: 38,
  clipMaxWidth: 5,
  clipOpenAngleMax: 18,

  /** 收芯位置：机构相对位移基准 */
  xRetracted: 0,
  /** 出芯锁止位置：伸缩差 2.2 mm */
  xExtended: 2.2,
  /** 导向解除高度：转子可以索引的区间边界 */
  xClear: 4.0,
  /** 完全按到底：必须大于 xClear */
  xMax: 4.8,

  /** 收芯时球珠轴向位置；出芯为 0.8−2.2=−1.4 */
  tipZRetracted: 0.8,

  /** 3 个凸耳，彼此 120° */
  lugCount: 3,
  lugSpacingDeg: 120,
  /** 圆周 6 个索引位置，彼此 60°，交替深导槽／浅支承位 */
  indexCount: 6,
  /** 每完成一次按压释放推进 60°（按下 30°＋释放 30°） */
  stepPerCycleDeg: 60,
  pressStepDeg: 30,
  releaseStepDeg: 30,
  /** 深导槽：允许退回到收芯高度 */
  deepSlotDeg: [0, 120, 240] as const,
  /** 浅锁止位：在出芯高度提供轴向支承 */
  shallowStopDeg: [60, 180, 300] as const,

  rotorBodyDiameter: 4.8,
  rotorLugEnvelopeDiameter: 6.4,
  rotorLength: 7.0,
  guideOuterDiameter: 8.2,
  guideChannelEnvelopeDiameter: 6.8,

  /** 前端复位弹簧：L(x) = 15.5 − x */
  springFreeLength: 18.0,
  springInstalledLength: 15.5,
  springOuterDiameter: 4.2,
  springWireDiameter: 0.35,
  springTurns: 10,
  refillNeckDiameter: 2.3,
  springFrontSeatZ: 5.0,
  springRearSeatZRetracted: 20.5,
} as const

/* =========================================================================
   派生量：全部是 x 的函数，界面不许自己再算一遍
   ========================================================================= */

/** 笔尖（球珠）轴向位置 Z = 0.8 − x */
export const tipZ = (x: number): number => PEN.tipZRetracted - x

/** 弹簧装配长度 L(x) = 15.5 − x */
export const springLength = (x: number): number => PEN.springInstalledLength - x

/** 弹簧压缩量 = 自由长度 − 当前长度 */
export const springCompression = (x: number): number => PEN.springFreeLength - springLength(x)

/** 按帽顶端 Z（按帽随手上一体移动，出芯状态比收芯低 2.2 mm） */
export const buttonTopZ = (x: number): number => PEN.nominalLength - x

/** 机构位移对应的笔芯伸缩量（相对收芯） */
export const tipExtension = (x: number): number => x

/* =========================================================================
   索引：两种稳定状态
   ========================================================================= */

/** R = 收芯（凸耳落在深导槽，笔尖在壳内）；E = 出芯（凸耳被浅支承面挡住） */
export type StableState = 'R' | 'E'

/** 完成 cycle 次按压释放之后的稳定状态：偶数次回收到 R，奇数次到 E */
export function stableOf(cycle: number): StableState {
  return cycle % 2 === 0 ? 'R' : 'E'
}

/** 该次循环结束后的静止位移 */
export function restXOf(cycle: number): number {
  return stableOf(cycle) === 'E' ? PEN.xExtended : PEN.xRetracted
}

/** 该次循环开始时的累计索引角（每循环 +60°；两次共 +120°，三重对称下外观等价） */
export function indexAngleOf(cycle: number): number {
  return cycle * PEN.stepPerCycleDeg
}

/** 索引位序号 0..5；偶数位是深导槽，奇数位是浅锁止位 */
export function slotIndexOf(theta: number): number {
  const mod = ((theta % 360) + 360) % 360
  return Math.round(mod / PEN.stepPerCycleDeg) % PEN.indexCount
}

export function slotKindOf(theta: number): 'deep' | 'shallow' {
  return slotIndexOf(theta) % 2 === 0 ? 'deep' : 'shallow'
}

/* =========================================================================
   姿态推导
   ========================================================================= */

/** down = 正在按压（x 增大）；up = 正在回位（x 减小） */
export type Leg = 'down' | 'up'

/** 一次按压释放过程中的阶段，与 03_运动与交互.md 的表格一一对应 */
export type Phase = 'idle' | 'pressing' | 'indexing' | 'releasing' | 'settling' | 'aborting'

/** 关键接触关系，用来高亮与写说明 */
export type Contact = 'collar' | 'plunger' | 'guide' | 'ramp' | 'stop'

export interface PoseInput {
  /** 本次操作开始时的已完成循环数（索引角基准） */
  baseCycle: number
  /** 已完成（已提交）的索引循环数；越过提交点后立刻 +1 */
  cycle: number
  /** 机构相对位移，0..xMax */
  x: number
  /** 运动方向 */
  leg: Leg
  /** 本次按压是否已经越过提交阈值（到达 xMax） */
  committed: boolean
  /** 是否还在动；静止时给 idle */
  moving: boolean
}

export interface Pose {
  phase: Phase
  /** 转子累计角（度） */
  theta: number
  /** 本次操作内已转过的角度（0..60），给展开图用 */
  cycleProgressDeg: number
  x: number
  tipZ: number
  tipExtension: number
  buttonZ: number
  springLength: number
  springCompression: number
  slotIndex: number
  slotKind: 'deep' | 'shallow'
  contact: Contact
  /** 当前瞄准的稳定状态（供字幕用） */
  targetState: StableState
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

/**
 * 唯一的姿态推导函数。
 *
 * 索引角的形状由两段斜面决定：
 *  - 按下时 x 从 xClear 到 xMax，转子转过 pressStep（30°）；
 *  - 释放时 x 从 xMax 回落到 xClear，再转 releaseStep（30°）。
 * 未提交的按压沿原路退回，索引角一并退回原来的整数位置，不会每次触碰都切换。
 */
export function derivePose({ baseCycle, cycle, x, leg, committed, moving }: PoseInput): Pose {
  const base = indexAngleOf(baseCycle)
  const span = PEN.xMax - PEN.xClear
  const indexProgress = clamp01((x - PEN.xClear) / span)

  let phase: Phase
  let theta = base
  let contact: Contact = 'collar'

  if (leg === 'down') {
    if (x > PEN.xClear + 1e-9) {
      phase = 'indexing'
      theta = base + PEN.pressStepDeg * indexProgress
      contact = 'ramp'
    } else if (moving && x > restXOf(baseCycle) + 1e-9) {
      phase = 'pressing'
      contact = x > 1e-9 ? 'guide' : 'plunger'
    } else {
      phase = 'idle'
      theta = indexAngleOf(cycle)
      contact = stableOf(cycle) === 'R' ? 'collar' : 'stop'
    }
  } else if (x >= PEN.xClear) {
    // 回程上半段：沿另一侧斜面继续转动
    if (committed) {
      phase = 'releasing'
      theta = base + PEN.pressStepDeg + PEN.releaseStepDeg * (1 - indexProgress)
      contact = 'ramp'
    } else {
      // 没按到底就松手：沿原斜面对称退回，索引角回退到起点
      phase = 'aborting'
      theta = base + PEN.pressStepDeg * indexProgress
      contact = 'ramp'
    }
  } else if (committed) {
    phase = 'settling'
    theta = base + PEN.stepPerCycleDeg
    contact = stableOf(cycle) === 'R' ? 'guide' : 'stop'
  } else {
    phase = 'aborting'
    theta = base
    contact = 'guide'
  }

  const cycleProgressDeg = Math.max(0, theta - base)

  return {
    phase,
    theta,
    cycleProgressDeg,
    x,
    tipZ: tipZ(x),
    tipExtension: tipExtension(x),
    buttonZ: buttonTopZ(x),
    springLength: springLength(x),
    springCompression: springCompression(x),
    slotIndex: slotIndexOf(theta),
    slotKind: slotKindOf(theta),
    contact,
    targetState: stableOf(cycle),
  }
}

/* =========================================================================
   导览步骤（「带我看懂」）
   ========================================================================= */

export interface PenStep {
  id: string
  title: string
  body: string
  /** 这一步要把模型摆到的状态 */
  state: {
    cycle: number
    x: number
    leg: Leg
    committed: boolean
  }
  /** 镜头：整笔还是机构特写 */
  view: 'whole' | 'mechanism'
}

export const PEN_STEPS: PenStep[] = [
  {
    id: 'rest',
    title: '① 收芯静止：三个凸耳停在深导槽里',
    body: '笔尖收在壳内 0.8 mm。弹簧已经预压 2.5 mm，把笔芯往上顶；顶住它的是按帽的轴肩，不是弹簧自己「记住了」状态。',
    state: { cycle: 0, x: 0, leg: 'down', committed: false },
    view: 'whole',
  },
  {
    id: 'press-guide',
    title: '② 沿导槽推进：这一段转子不能转',
    body: '按杆把转子连同笔芯一起推下去，x 从 0 走到 4.0 mm。凸耳被固定导向的导槽两面夹住，只许直上直下——所谓「锁」，第一层就是这段导槽。',
    state: { cycle: 0, x: PEN.xClear, leg: 'down', committed: false },
    view: 'mechanism',
  },
  {
    id: 'index-down',
    title: '③ 脱离导向：斜面把 0.8 mm 行程换成 30°',
    body: '凸耳滑出导槽，落到固定导向下端的斜面上。再往下压 0.8 mm，斜面就把轴向推进换成转动：转子转过 30°。',
    state: { cycle: 0, x: PEN.xMax, leg: 'down', committed: true },
    view: 'mechanism',
  },
  {
    id: 'index-up',
    title: '④ 松手：另一侧斜面再转 30°',
    body: '弹簧往回推，凸耳沿另一侧斜面往上爬，又转 30°。两次加起来 60°，正好落到下一个索引位置。',
    state: { cycle: 0, x: PEN.xClear, leg: 'up', committed: true },
    view: 'mechanism',
  },
  {
    id: 'lock-out',
    title: '⑤ 落在浅支承面：笔尖留在外面',
    body: '60° 之后对准的是浅锁止位，凸耳被支承面挡住，只能停在 x=2.2 mm。笔尖因此伸出 1.4 mm 并保持住——保持它的是几何支承，不是没弹力了。',
    state: { cycle: 1, x: PEN.xExtended, leg: 'down', committed: false },
    view: 'whole',
  },
  {
    id: 'second-press',
    title: '⑥ 再按一次：又是一段导槽加 60°',
    body: '从 2.2 mm 一路压到 4.8 mm，再转 30°；松手回程再转 30°。这次对准的是深导槽。',
    state: { cycle: 2, x: PEN.xClear, leg: 'up', committed: true },
    view: 'mechanism',
  },
  {
    id: 'retract',
    title: '⑦ 沿深导槽退回壳内',
    body: '深导槽从 x=4.0 一直通到 x=0，没有任何支承面拦它，弹簧把整条链推回原位，笔尖回到壳内 0.8 mm。一次完整的伸缩循环结束。',
    state: { cycle: 2, x: 0, leg: 'down', committed: false },
    view: 'whole',
  },
]

/** 这个机构可以演示的“一次完整按压”关键位移 */
export const KEYFRAMES = {
  retracted: PEN.xRetracted,
  extended: PEN.xExtended,
  clearance: PEN.xClear,
  bottom: PEN.xMax,
} as const
