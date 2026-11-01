/**
 * 骨折模拟：右足小脚趾（第 5 近节趾骨基底部）的教学模型——纯逻辑部分。
 *
 * 不 import three.js / React，可单测。内容：
 *  1. 现成足骨模型的坐标、尺度与关键节点编号；
 *  2. 目标骨与预制裂面：位置、方向、断端姿态的数学；
 *  3. 受力示意（归一化 λ）与修复分期的**无量纲**曲线。
 *
 * 三条边界（与资料包一致）：
 *  - 模型来自公开解剖数据集，尺寸是来源比例，不是任何人的测量值；
 *  - 裂面是预设几何，不做「载荷 → 裂纹」求解，不给任何断裂阈值；
 *  - 修复进度只表示讲解走到哪，不是天数、愈合率或承重能力。
 */

export type Vec3 = readonly [number, number, number]

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function smoothstep(t: number): number {
  const x = clamp(t, 0, 1)
  return x * x * (3 - 2 * x)
}

export function ramp(value: number, from: number, to: number): number {
  if (to === from) return value < from ? 0 : 1
  return clamp((value - from) / (to - from), 0, 1)
}

export function vec3(x: number, y: number, z: number): Vec3 {
  return [x, y, z]
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

export function mul(a: Vec3, k: number): Vec3 {
  return [a[0] * k, a[1] * k, a[2] * k]
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

export function vecLength(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2])
}

export function normalize(a: Vec3): Vec3 {
  const l = vecLength(a) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}

/* ========================================================================
   0. 现成足骨模型：节点、坐标、尺度
   ======================================================================== */

/**
 * 模型来源：BodyParts3D（DBCLS）右足 26 块骨骼，CC BY 4.0。
 * GLB 内坐标：米，Y 轴向上（足背向上、足底向下），+Z 指向足趾，−X 为外侧（小趾侧）。
 *
 * 展台坐标：为了让「足背视图」正对观众并把足趾朝上，整足统一做一次旋转：
 *   展台 (x, y, z) = (−glbX, glbZ, glbY) × 20
 * 20 = 每米 20 个展台单位，即 1 单位 = 50 mm。这里只换单位与朝向，
 * 不改变骨与骨之间的比例（资料包要求保留来源比例）。
 */
export const SCENE_SCALE = 20

export const FOOT_MODEL = {
  /** 整足 26 骨（相对当前模块的路径在 geometry 层解析） */
  footGlb: 'right-foot-26-bones.glb',
  /** 单独导出的目标骨（本展品不使用，保留说明用途） */
  targetGlb: 'right-fifth-proximal-phalanx.glb',
  /** 右第 5 趾近节趾骨（目标骨） */
  targetFma: 'FMA32640',
  /** 右第 5 跖骨（对照骨，不切） */
  fifthMetatarsalFma: 'FMA24515',
  /** 右第 5 趾中节趾骨（随远端片段一起动） */
  fifthMiddleFma: 'FMA230986',
  /** 右第 5 趾末节趾骨（随远端片段一起动） */
  fifthDistalFma: 'FMA32658',
} as const

export function toScene(p: Vec3): Vec3 {
  // 0 - x 而不是 -x：避免把 +0 写成 -0（读数与断言都不能出现负零）
  return [0 - p[0] * SCENE_SCALE, p[2] * SCENE_SCALE, p[1] * SCENE_SCALE]
}

/** 展台坐标 → 模型坐标（用于把镜头目标换算回模型检查） */
export function toModel(p: Vec3): Vec3 {
  return [-p[0] / SCENE_SCALE, p[2] / SCENE_SCALE, p[1] / SCENE_SCALE]
}

/**
 * 目标骨的几何提示（模型坐标，米），由资料包 target-selection.json 给出：
 * 长轴用 PCA 求得、方向背离第 5 跖骨质心；基底／远端端点为投影边界。
 * 这些是几何起点，不是临床定位。
 */
export const TARGET_HINT = {
  /** 单位长轴（基底 → 远端） */
  axis: normalize([-0.5095236385342101, -0.05487280393811338, 0.8587052096981997]),
  base: [-0.04074730644916993, -0.03207478690258506, 0.02139111570634151] as Vec3,
  distal: [-0.053919107894453006, -0.0334933151583065, 0.043589682498479505] as Vec3,
  /** 从基底算起的切分比例（资料包建议 0.18） */
  cutFraction: 0.18,
  /** 裂面法线与骨长轴夹角（度） */
  planeTiltDeg: 20,
} as const

/** 目标骨长轴长度（米）：约 25.85 mm */
export function targetLength(): number {
  return vecLength(sub(TARGET_HINT.distal, TARGET_HINT.base))
}

/** 裂面中心（模型坐标，米） */
export function cutCenter(): Vec3 {
  return add(TARGET_HINT.base, mul(TARGET_HINT.axis, targetLength() * TARGET_HINT.cutFraction))
}

/** 模型坐标系里的「足背」方向（+Y） */
export const MODEL_DORSAL: Vec3 = [0, 1, 0]

/* ========================================================================
   1. 预制裂面与断端姿态
   ======================================================================== */

export const FRACTURE = {
  /** 默认断端姿态（自拟演示值，不是任何人的测量） */
  defaultGap: 0.6,
  defaultOffset: 1,
  defaultAngulation: 8,
  /** 可探索范围（mm / 度） */
  gapRange: [0, 2.5] as const,
  offsetRange: [0, 3] as const,
  angulationRange: [-15, 15] as const,
  /** 裂面微小起伏幅度（mm，固定种子） */
  jitterMm: 0.05,
  /** 皮质层可视厚度（mm，仅剖切演示） */
  corticalThicknessMm: 0.8,
  /** 局部骨痂最大外扩（mm） */
  callusOutgrowthMm: 2,
  /** 骨痂沿骨轴的半长（mm） */
  callusHalfLengthMm: 9,
} as const

export interface FracturePose {
  /** 轴向裂隙（mm） */
  gap: number
  /** 横向偏移（mm，+ 为外侧 / 小趾侧） */
  offset: number
  /** 断端旋转（度，+ 为远端向外侧偏） */
  angulation: number
}

export const DEFAULT_POSE: FracturePose = {
  gap: FRACTURE.defaultGap,
  offset: FRACTURE.defaultOffset,
  angulation: FRACTURE.defaultAngulation,
}

export const ZERO_POSE: FracturePose = { gap: 0, offset: 0, angulation: 0 }

export function clampPose(pose: FracturePose): FracturePose {
  return {
    gap: clamp(pose.gap, FRACTURE.gapRange[0], FRACTURE.gapRange[1]),
    offset: clamp(pose.offset, FRACTURE.offsetRange[0], FRACTURE.offsetRange[1]),
    angulation: clamp(pose.angulation, FRACTURE.angulationRange[0], FRACTURE.angulationRange[1]),
  }
}

/**
 * 裂面（模型坐标）。法线由骨长轴绕「外侧方向」倾斜 20° 得到，
 * 于是断面朝足背侧敞开，从足背和外侧都能看见。
 */
export interface FracturePlaneSpec {
  center: Vec3
  normal: Vec3
}

export function fracturePlane(): FracturePlaneSpec {
  const tilt = (TARGET_HINT.planeTiltDeg * Math.PI) / 180
  // 先把「足背」方向对骨轴正交化，法线才真正与骨轴成 20°
  const dorsalAlong = dot(MODEL_DORSAL, TARGET_HINT.axis)
  const up = normalize(add(MODEL_DORSAL, mul(TARGET_HINT.axis, -dorsalAlong)))
  const normal = normalize(add(mul(TARGET_HINT.axis, Math.cos(tilt)), mul(up, Math.sin(tilt))))
  return { center: cutCenter(), normal }
}

/**
 * 裂面微小起伏（米）。只与断面内的位置有关，两端骨片用同一条函数，
 * 因此零位移时两断面完全贴合；数值确定，不会每帧变化。
 */
export function fractureJitter(pointOnPlane: Vec3): number {
  const p = pointOnPlane
  const a = 0.62 * Math.sin(38 * p[0] + 21 * p[2] + 0.7)
  const b = 0.38 * Math.sin(71 * p[0] - 57 * p[2] + 2.1)
  return (FRACTURE.jitterMm / 1000) * (a + b)
}

/**
 * 断端姿态 → 远端片段的刚体变换（模型坐标）。
 *
 * 旋转枢轴取裂面中心：断端移动时以裂面附近为枢轴，不会把整根小脚趾甩开。
 * 平移 = 长轴方向 × 裂隙 + 外侧方向 × 横移。
 * 姿态为零时是严格恒等变换，两断面贴合。
 */
export interface FragmentTransform {
  /** 旋转角（弧度） */
  rotation: number
  /** 旋转轴（单位向量，模型坐标） */
  axis: Vec3
  /** 旋转枢轴（米） */
  pivot: Vec3
  /** 平移（米） */
  translate: Vec3
}

export function fragmentTransform(pose: FracturePose = DEFAULT_POSE): FragmentTransform {
  const p = clampPose(pose)
  return {
    // 绕模型 +Y 轴反向旋转：正角度让远端朝 −X（外侧 / 小趾侧）偏
    rotation: p.angulation === 0 ? 0 : -(p.angulation * Math.PI) / 180,
    axis: [0, 1, 0],
    pivot: cutCenter(),
    translate: add(mul(TARGET_HINT.axis, p.gap / 1000), [0 - p.offset / 1000, 0, 0]),
  }
}

/** 是否处于零位移（两断面贴合） */
export function isPoseClosed(pose: FracturePose): boolean {
  return pose.gap === 0 && pose.offset === 0 && pose.angulation === 0
}

/* ========================================================================
   2. 受力示意：三种方向、归一化 λ
   ======================================================================== */

export type LoadMode = 'axial' | 'lateral' | 'abduction'

export const LOAD_MODES: readonly LoadMode[] = ['axial', 'lateral', 'abduction'] as const

/**
 * 示意形变的上限（λ = 1 时）。全部是「夸张显示」的教学值：
 * 真实趾骨在这样的载荷下形变远小于此；页面不据此判断任何人的损伤。
 */
export const LOAD_LIMITS = {
  /** 完整趾在关节处的最大示意弯曲/外展角（度） */
  jointBendDeg: 3,
  /** 轴向示意压缩量（mm） */
  axialCompressionMm: 0.35,
  /** 预制骨折后远端片段的最大相对转动（度） */
  fragmentDeg: 0.8,
} as const

export interface LoadEffect {
  load: number
  /** 整根趾在关节处的转动（度），完整对照用 */
  jointDeg: number
  /** 轴向压缩（mm），完整对照用 */
  compressionMm: number
  /** 远端片段相对基底的转动（度），预制骨折示意用 */
  fragmentDeg: number
}

/**
 * λ → 示意形变。完整骨与预制骨折是两套几何，各自只取自己那一项，不叠加：
 *  - 完整对照：整根趾在关节处弯曲／外展（≤3°）或轴向轻微压缩（≤0.35 mm）；
 *  - 预制骨折：只让远端片段相对基底轻微错动（≤0.8°）。
 */
export function loadEffect(mode: LoadMode, load: number, fractured: boolean): LoadEffect {
  const lambda = clamp(load, 0, 1)
  const bend = mode === 'axial' ? 0 : LOAD_LIMITS.jointBendDeg * lambda
  return {
    load: lambda,
    jointDeg: fractured ? 0 : bend,
    compressionMm:
      mode === 'axial' && !fractured ? LOAD_LIMITS.axialCompressionMm * lambda : 0,
    fragmentDeg: fractured ? LOAD_LIMITS.fragmentDeg * lambda : 0,
  }
}

/** 施力方向（模型坐标，单位向量）与示意长度（米，λ = 1 时） */
export interface LoadPlacement {
  direction: Vec3
  arrowLength: number
  /** 载荷作用点相对目标骨基底的轴向偏置（米） */
  axialOffset: number
  /** 载荷作用点相对骨轴的横向偏置（米） */
  lateralOffset: number
}

/**
 * 三种方向的施力方式（全部作用在这根趾上，足部其余部分作为约束）：
 *  - 轴向：从趾尖沿骨轴压向基底；
 *  - 侧向：从外侧压向趾骨中段；
 *  - 外展：在趾尖向外侧拉。
 */
export function loadPlacement(mode: LoadMode): LoadPlacement {
  const axis = TARGET_HINT.axis
  const length = targetLength()
  if (mode === 'lateral') {
    return {
      direction: [1, 0, 0],
      arrowLength: 0.016,
      axialOffset: length * 0.75,
      lateralOffset: 0.0045,
    }
  }
  if (mode === 'abduction') {
    return {
      direction: [-1, 0, 0],
      arrowLength: 0.018,
      axialOffset: length * 2.2,
      lateralOffset: 0.002,
    }
  }
  return {
    direction: mul(axis, -1),
    arrowLength: 0.0185,
    axialOffset: length * 2.3,
    lateralOffset: 0,
  }
}

/* ========================================================================
   3. 修复分期
   ======================================================================== */

export const REPAIR_STAGE_COUNT = 4

export interface RepairStageRange {
  from: number
  to: number
  /** 点阶段按钮时跳到的位置 */
  jump: number
}

/**
 * 四个概念阶段的进度区间（与资料包一致）。
 * 区间只是导演节奏：不表示各阶段等比例耗时，也不对应任何固定天数。
 */
export const REPAIR_STAGES: readonly RepairStageRange[] = [
  { from: 0, to: 0.2, jump: 0.1 },
  { from: 0.2, to: 0.5, jump: 0.34 },
  { from: 0.5, to: 0.8, jump: 0.64 },
  { from: 0.8, to: 1, jump: 0.9 },
] as const

/** 组织出现 / 消退的关键进度（教学示意） */
const CURVE = {
  hematomaOut: [0.16, 0.3] as const,
  softIn: [0.16, 0.3] as const,
  softSize: [0.18, 0.4] as const,
  softOut: [0.46, 0.62] as const,
  bonyIn: [0.46, 0.62] as const,
  bonySize: [0.48, 0.68] as const,
  remodel: [0.8, 0.97] as const,
}

export interface TissueState {
  /** 0..1 不透明度 */
  opacity: number
  /** 0..1 相对最终外扩量 */
  size: number
}

export interface RepairAppearance {
  stageIndex: number
  stageProgress: number
  hematoma: TissueState
  softCallus: TissueState
  bonyCallus: TissueState
  /** 骨痂颜色并回骨本色的比例（重塑期） */
  boneBlend: number
}

/** 修复进度 h → 各组织的可见度。h 的唯一含义是「讲解走到哪」。 */
export function repairAppearance(progress: number): RepairAppearance {
  const h = clamp(progress, 0, 1)
  const hematoma = 1 - smoothstep(ramp(h, CURVE.hematomaOut[0], CURVE.hematomaOut[1]))
  const soft =
    smoothstep(ramp(h, CURVE.softIn[0], CURVE.softIn[1])) *
    (1 - smoothstep(ramp(h, CURVE.softOut[0], CURVE.softOut[1])))
  const softSize = smoothstep(ramp(h, CURVE.softSize[0], CURVE.softSize[1]))
  const bony = smoothstep(ramp(h, CURVE.bonyIn[0], CURVE.bonyIn[1]))
  const bonyGrowth = smoothstep(ramp(h, CURVE.bonySize[0], CURVE.bonySize[1]))
  const remodel = smoothstep(ramp(h, CURVE.remodel[0], CURVE.remodel[1]))

  let stageIndex = 0
  for (let i = 0; i < REPAIR_STAGES.length; i += 1) {
    if (h >= REPAIR_STAGES[i].from) stageIndex = i
  }
  const range = REPAIR_STAGES[stageIndex]
  return {
    stageIndex,
    stageProgress: clamp((h - range.from) / (range.to - range.from), 0, 1),
    hematoma: { opacity: hematoma, size: 1 },
    softCallus: { opacity: soft, size: softSize },
    bonyCallus: { opacity: bony, size: bonyGrowth * (1 - 0.82 * remodel) },
    boneBlend: remodel,
  }
}

export function repairStageIndex(progress: number): number {
  return repairAppearance(progress).stageIndex
}

/* ========================================================================
   4. 页签与视图
   ======================================================================== */

export type TabId = 'structure' | 'load' | 'repair'

export const TABS: readonly TabId[] = ['structure', 'load', 'repair'] as const

export type StructureView = 'dorsal' | 'plantar' | 'lateral' | 'local'

export const STRUCTURE_VIEWS: readonly StructureView[] = ['dorsal', 'plantar', 'lateral', 'local'] as const
