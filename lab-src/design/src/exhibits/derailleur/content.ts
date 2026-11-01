/**
 * 变速器的讲解内容：零件说明、镜头、导览步骤、出处。
 *
 * 只放文案与镜头数据，不放计算；数值一律从模型算出来后格式化。
 * 任何「教学设定」都在文字里写清楚，不冒充厂家尺寸或实测。
 */

import { DRIVE } from './chainPath'
import type { PartId } from './geometry'

export type CameraViewId = 'whole' | 'side' | 'rear' | 'derailleur' | 'chain'

export interface CameraPose {
  position: [number, number, number]
  target: [number, number, number]
}

/** 镜头（米）。整车约 1.16 m 长，传动侧在 +Z。 */
export const CAMERA_VIEWS: Record<CameraViewId, { label: string; hint: string; pose: CameraPose }> = {
  whole: {
    label: '整车',
    hint: '从传动侧斜看整车',
    pose: { position: [1.35, 1.18, 1.95], target: [0.04, 0.5, 0] },
  },
  side: {
    label: '传动侧',
    hint: '侧视：看清上、下链条与前后齿盘',
    pose: { position: [0.12, 0.56, 1.62], target: [-0.16, 0.32, 0.04] },
  },
  rear: {
    label: '后方',
    hint: '从车后看飞轮排成一列与后拨横向移动',
    pose: { position: [-1.32, 0.66, 0.52], target: [-0.42, 0.33, 0.05] },
  },
  derailleur: {
    label: '后拨放大',
    hint: '四连杆、导板、导向轮与张紧轮',
    pose: { position: [-0.44, 0.42, 0.5], target: [-0.46, 0.22, 0.05] },
  },
  chain: {
    label: '链条路径',
    hint: '俯视整圈链环：前盘 → 张力轮 → 导向轮 → 飞轮',
    pose: { position: [0.12, 1.05, 0.86], target: [-0.22, 0.31, 0.03] },
  },
}

/** 零件说明：写「它在当前状态里做什么」，不只写名字 */
export const PART_INFO: Record<PartId, { label: string; role: string }> = {
  crank: {
    label: '曲柄与脚踏',
    role: '踩踏从这里输入。曲柄和 30T 前盘同轴同速；踏频 0 时整条链都停下，但后轮可以继续滑行。',
  },
  chainring: {
    label: '前盘（30T）',
    role: '链条在这一圈上被「拉走」。它每转一圈，链条前进 30 个节距，与小齿片的齿数无关——决定踩一圈链条走多远的是它。',
  },
  chain: {
    label: '链条',
    role: '闭合的一圈：前盘 → 下段 → 张力轮 → 导向轮 → 飞轮 → 上段回到前盘。链速处处相同，所以前盘与飞轮的表面线速度必须相等，齿比才成立。',
  },
  cassette: {
    label: '后飞轮（12 片）',
    role: '10T 到 51T 整体是一组：驱动时 12 片同轴同速一起转，只有链条接触的那一片传递链力。齿数越少，后轮同样转一圈需要的链条越长。',
  },
  guidePulley: {
    label: '导向轮（上导轮）',
    role: '把链条从飞轮引向下方张力轮，并跟着平行四边形的横向移动，把链条送到所选齿片所在的平面。它不决定齿比。',
  },
  tensionPulley: {
    label: '张紧轮（下导轮）',
    role: '和导板一起兜住链条，把多余的链条收进来。换到不同的齿片时，链条路径总长会变，靠摆臂转动把差额吃掉——链长本身不变。',
  },
  cage: {
    label: '导板（摆臂）',
    role: '两块夹住两个导轮。它绕导向轮轴摆动：大齿片要绕的链条更长，摆臂就转到另一个角度，保证同一根链条仍然闭合。',
  },
  parallelogram: {
    label: '四连杆（平行四边形）',
    role: '两根等长连杆让运动端「平移而不转动」：换挡时导向轮横向移动，去对齐目标齿片。它不主动转轮子，只是把链条推到该去的位置。',
  },
  bKnuckle: {
    label: '后拨安装体（B 关节）',
    role: '挂在尾钩上，承受整条链的反力，并提供四连杆的固定铰点。B 螺丝在这里调整导向轮与齿片的间隙。',
  },
  frame: {
    label: '车架',
    role: '后下叉 455 mm、五通下降 55 mm 决定了前后轴与飞轮的位置；链条从五通下方向后经过后拨，再回到前盘上方。',
  },
  wheel: {
    label: '后轮',
    role: '通过单向离合与飞轮相连：踩踏时一起转；滑行时后轮继续转、飞轮和链条停下。轮径约 370 mm 只是教学近似。',
  },
}

/** 页面上必须出现的说明 */
export const DISPLAY_NOTE =
  '外观参考 GIANT Talon 0（2025 英国版 M 码 29 英寸），变速结构参考 Shimano Deore M6100 1×12；几何与换挡过渡为简化教学模型。'

/** 链条与换挡的简化说明 */
export const SIMPLIFICATION_NOTE = [
  '齿形是按 12.7 mm 节距画的近似齿；链节沿弧长均匀排布，不追求每个滚子精确落进每个齿谷。',
  '换挡过渡是示意运动学：链条在这段时间里横向离开原齿片，落到目标齿片后才切换传动比，不做齿面接触与受力求解。',
  '链长固定为 120 节（1524 mm），12 个挡位用同一根链条；换挡时摆臂转角由链长方程解出，不是手调的。',
]

/** 资料来源（页码按 PDF 查看器） */
export interface Reference {
  id: string
  label: string
  url?: string
  note: string
}

export const REFERENCES: Reference[] = [
  {
    id: 'B01',
    label: 'GIANT Talon 0（2025 英国版）官方产品页',
    url: 'https://www.giant-bicycles.com/gb/talon-0-2025',
    note: '整车几何锚点：轴距 1164、后下叉 455、五通下降 55、座管 420、Stack 606、Reach 436、头管 105 / 67.5°、曲柄 170，29 英寸版前盘 30T，配 Deore M6100 1×12。',
  },
  {
    id: 'B02',
    label: 'Shimano CS-M6100-12 官方规格',
    url: 'https://productinfo.shimano.com/ja/product/CS-M6100-12',
    note: '12 片齿数：10/12/14/16/18/21/24/28/33/39/45/51。本模型直接使用这组齿数。',
  },
  {
    id: 'B03',
    label: 'Shimano 经销商手册 DM-MARD001-06（含 RD-M6100）',
    url: 'https://si.shimano.com/en/pdfs/dm/MARD001/DM-MARD001-06-ENG.pdf',
    note: '后拨外形与安装关系、穿链顺序、导向轮/张力轮与摆臂结构。第 9–11 页安装与高限位、13–14 页链长与穿链、20–22 页低限位与 B 调整、25 页导轮、33–35 页摆臂。',
  },
  {
    id: 'B04',
    label: 'CS-M6100 官方爆炸图 EV-CS-M6100-4666B',
    url: 'https://si.shimano.com/en/pdfs/ev/CS-M6100-4666/EV-CS-M6100-4666B.pdf',
    note: '飞轮片组成与排列：大齿片靠车轮中心一侧，小齿片更靠外。',
  },
]

/**
 * 哪些是教学设定（与厂家数据无关）：
 * 换挡过渡时长、齿片间距 3.55 mm、前盘链线 Z = 52、导轮 13T 的中心距 118 mm、
 * 导轮与齿片的视觉间隙 12 mm、四连杆铰点与连杆长 45 mm / 铰距 28 mm、
 * 轮胎外半径 370 mm、链条 120 节、传动效率 0.97。
 */
export const TEACHING_VALUES = {
  chainPitch: DRIVE.chainPitch,
  cogSpacing: DRIVE.cogSpacingZ,
  chainline: DRIVE.chainlineZ,
  pulleyTeeth: DRIVE.pulleyTeeth,
  pulleyCenterDistance: DRIVE.pulleyCenterDistance,
  pulleyGap: DRIVE.pulleyToCogGap,
  wheelRadius: DRIVE.wheelRadius,
  chainPitchCount: DRIVE.chainPitchCount,
}

/* =========================================================================
   导览
   ========================================================================= */

export type CompareMode = 'cadence' | 'torque'

export interface GuideSetup {
  cogIndex?: number
  cadenceRpm?: number
  torqueNm?: number
  cameraView?: CameraViewId
  compare?: CompareMode
  hideWheel?: boolean
  hideFrame?: boolean
  select?: PartId | null
  mode?: 'drive' | 'coast'
}

export interface GuideStep {
  id: string
  title: string
  body: string
  setup: GuideSetup
}

/**
 * 「带我看懂」五步。每一步只改一件事，并明确写出现在固定的是什么。
 * 导览用独立示例，退出后回到自由探索的原始状态。
 */
export const GUIDE_STEPS: GuideStep[] = [
  {
    id: 'drive',
    title: '前盘通过链条驱动后飞轮',
    body:
      '先把镜头放在传动侧。踩踏让 30T 前盘转动，链条把力送到后飞轮，飞轮带着后轮一起转。注意链条是闭合的一圈：上段从飞轮回到前盘，下段经过两个导轮再回到前盘。',
    setup: { cogIndex: 6, cadenceRpm: 60, torqueNm: 30, cameraView: 'side', compare: 'cadence', hideWheel: false, hideFrame: false },
  },
  {
    id: 'shift-easy',
    title: '保持踏频，换到更大的后齿片',
    body:
      '踏频仍然是 60 rpm，什么都不改，只按「换轻挡」把链条移到大齿片。换挡必须有链条在移动：停踩时这个请求会排队，等链条转起来才执行。',
    setup: { cogIndex: 11, cameraView: 'side', compare: 'cadence' },
  },
  {
    id: 'wheel-slower',
    title: '观察后轮转速降低',
    body:
      '同样是 60 rpm 的踏频：10T 时后轮每分钟 180 圈，51T 时只有约 35 圈。前盘每圈带走的链条长度不变，大齿片的周长更长，所以后轮被「分到」的圈数更少，理论车速也更低。',
    setup: { cogIndex: 0, cameraView: 'side', compare: 'cadence' },
  },
  {
    id: 'torque',
    title: '保持输入力矩，观察理想轮端力矩',
    body:
      '换一个条件再来一次：这次固定曲柄力矩 30 N·m（踏频只是观察用）。齿比越大，轮端力矩越小；换到 51T，同样的踩踏力矩在轮端被放大得更多。两种比较不能混在一起讲。',
    setup: { cogIndex: 11, cameraView: 'side', compare: 'torque', torqueNm: 30 },
  },
  {
    id: 'derailleur',
    title: '单独看后拨的导向与张紧',
    body:
      '隐藏车架和后轮，只看后拨：四连杆（平行四边形）让导向轮横向平移对齐目标齿片；摆臂绕导向轮转动，把链条路径长短的差额吃掉，所以同一根链条在 12 个挡位上都闭合。导向轮负责「送到哪一片」，张紧轮与摆臂负责「收放多少链条」，这两件事不是一回事。',
    setup: { cogIndex: 4, cameraView: 'derailleur', hideWheel: true, hideFrame: true, select: 'parallelogram' },
  },
]
