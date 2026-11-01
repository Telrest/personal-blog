/**
 * 骨骼展品的内容层：文案、图例、资料出处与「带我看懂」步骤。
 * 纯数据，不含 three.js。所有数字的教学性质都在这里写清楚。
 */

import { DEFAULT_POSE, type LoadMode, type TabId } from './model'
import type { BoneState, CameraId, LoadState, RepairState, StructureState } from './state'

/* ========================================================================
   页签
   ======================================================================== */

export interface TabCopy {
  id: TabId
  label: string
  /** 页签下方的一行引导 */
  lead: string
}

export const TAB_COPY: TabCopy[] = [
  {
    id: 'structure',
    label: '结构与断端',
    lead: '先在整足中定位，再放大完整的第 5 趾列，比较完整骨与预制断端。',
  },
  {
    id: 'load',
    label: '受力示意',
    lead: '保留灰蓝色跖骨作为固定参照，比较轴向、侧向和外展三种方向。',
  },
  {
    id: 'repair',
    label: '通用修复',
    lead: '先选一个阶段停住看，再播放组织的出现、连接和重塑。',
  },
]

/** 页面只出现一次的那句模型说明 */
export const MODEL_NOTE =
  '部位参考右第 5 近节趾骨基底部骨折；形态、受力与修复过程为通用教学示意。'

/* ========================================================================
   结构
   ======================================================================== */

export const STRUCTURE_COPY = {
  lead: '右足外侧这一根小趾由三节趾骨组成。靠近脚掌的一节是近节趾骨，它靠身体的一端叫基底。',
  wholeFoot: '整足骨架：26 块骨按来源模型的比例摆放。橙红是目标骨，灰蓝是第 5 跖骨（对照）。',
  local: '局部：第 5 跖骨头、跖趾关节与第 5 近节趾骨基底的相邻关系。',
  intact: '完整骨对照：基底膨大、骨干细、远端有头；默认不显示裂面。',
  fractured: '基底部骨折示意：裂面由同一张网格切开，两片断面来自同一个切割面。',
  cutawayNote: '剖切面是示意补充：源模型是表面网格，皮质层厚度与松质骨外观为教学表现。',
  isolateNote: '隐藏其他骨后，仍可旋转、缩放与点击目标骨。',
  resetNote: '「恢复演示姿态」只是回到初始演示参数（裂隙 0.6 mm、横移 1 mm、旋转 8°），不代表可以对自己的脚趾实施复位。',
} as const

/** 可点击的关键结构（编号与模型节点一致） */
export interface StructureInfo {
  id: string
  label: string
  role: string
}

export const KEY_STRUCTURES: StructureInfo[] = [
  {
    id: 'FMA32640',
    label: '第 5 近节趾骨',
    role: '小趾最靠脚掌的一节趾骨，也是本模型的目标骨。它靠近身体的一端是基底，与第 5 跖骨头相接形成跖趾关节。',
  },
  {
    id: 'FMA24515',
    label: '第 5 跖骨',
    role: '从足跟侧走向小趾的长骨，远离身体的一端是第 5 跖骨头。它与近节趾骨基底相邻，但本模型的裂面只落在近节趾骨上。',
  },
  {
    id: 'mtp-joint',
    label: '第 5 跖趾关节',
    role: '第 5 跖骨头与第 5 近节趾骨基底之间的关节。基底骨折就发生在这个关节的趾骨一侧。',
  },
]

/** 用于“近节 / 基底”这类名词解释 */
export const TERM_COPY = [
  { term: '近节', text: '脚趾三节里靠近跖骨的那一节，也就是离脚掌最近的一节。' },
  { term: '基底', text: '一节趾骨靠身体的一端（与上一块骨相接的一端），另一端叫头。' },
  { term: '对位', text: '两段断端大致回到原来的相对位置。本展品的修复页签使用对位场景，和上面可调的断端姿态分开保存。' },
]

/* ========================================================================
   受力
   ======================================================================== */

export interface LoadCopy {
  id: LoadMode
  label: string
  where: string
  constraint: string
  deformation: string
  note: string
}

export const LOAD_COPY: LoadCopy[] = [
  {
    id: 'axial',
    label: '轴向',
    where: '从趾尖沿骨轴压向基底',
    constraint: '足部其余部分作为约束（第 5 跖趾关节一侧固定）',
    deformation: '整根趾轻微压缩，满量程约 0.35 mm，画面已夸张显示',
    note: '只表示方向，不计算真实压缩量，也不判断这样的力会不会造成骨折。',
  },
  {
    id: 'lateral',
    label: '侧向',
    where: '从外侧压向趾骨中段',
    constraint: '足部其余部分作为约束（第 5 跖趾关节一侧固定）',
    deformation: '中节与末节相对近节轻微弯曲，满量程约 3°，画面已夸张显示',
    note: '侧向受力与「外展」看起来相似，区别在于力的作用点与整根趾是否一起摆动。',
  },
  {
    id: 'abduction',
    label: '外展',
    where: '在趾尖向外侧（小趾方向）拉',
    constraint: '足部其余部分作为约束（第 5 跖趾关节一侧固定）',
    deformation: '整根趾在关节处向外侧摆动，满量程约 3°，画面已夸张显示',
    note: '资料里提到小趾骨折可能与轴向载荷或碰到固定物后的外展有关；本模型不据此判断任何人的受伤原因。',
  },
]

export const LOAD_COPY_COMMON = {
  lambda: 'λ 是归一化载荷（0–100%），不是牛顿、公斤或任何真实承重值。',
  compareIntact: '完整轮廓：整根趾一起动，关节处最多 3°（示意）。',
  compareFractured:
    '预设骨折：远端片段相对基底出现轻微错动，最多 0.8°（示意）。两种画面只是不同几何示意，不构成对比诊断。',
  noThreshold: '本页不提供断裂阈值、疼痛预测或「能不能承重」的结论。',
} as const

/* ========================================================================
   骨折参数
   ======================================================================== */

export const FRACTURE_COPY = {
  presetTitle: '预制形态示意',
  presetBody:
    '裂面是在目标骨上按教学设定切出来的：位于基底向远端约 18% 处，裂面法线与骨长轴成 20°。它不是从任何影像或报告里提取的骨折形态。',
  poseBody:
    '裂隙、横移、旋转是三个互相独立的模型参数。零位移时两片断面完全贴合（可以自己拖到 0 验证）。',
  defaultNote: '默认演示值：裂隙 0.6 mm、横移 1 mm、旋转 8°。数值可统一调整，但不能称作个人测量。',
} as const

/* ========================================================================
   修复
   ======================================================================== */

export interface RepairStageCopy {
  name: string
  short: string
  change: string
  plain: string
  difference: string
}

export const REPAIR_COPY: RepairStageCopy[] = [
  {
    name: '血肿与早期反应',
    short: '血肿',
    change: '断端之间与周围出现半透明血肿，局部血供被打断，断端附近的骨细胞死亡。',
    plain: '先堵住出血，再由身体开始清理断端。',
    difference: '这是受伤后的第一个阶段：还没有任何连接组织，两段骨头之间是血块。',
  },
  {
    name: '软骨痂',
    short: '软骨痂',
    change: '断端之间与骨表面出现柔和的桥接外形，纤维软骨把两端暂时粘住。',
    plain: '长出柔软的「胶」，先把两段骨头固定在一起。',
    difference: '与血肿期相比，这时已经有了有形状的连接组织，而不是血块。',
  },
  {
    name: '骨性骨痂',
    short: '骨性骨痂',
    change: '桥接结构逐渐呈骨样外观，软骨被编织骨替换，连接由软变硬。',
    plain: '「胶」慢慢变成骨头，断端被真正连起来。',
    difference: '与软骨痂期相比，连接组织从可弯曲的软骨变成了较硬的骨。',
  },
  {
    name: '重塑',
    short: '重塑',
    change: '多余的骨痂被吸收，外形逐渐调整，逐步接近原来的骨干轮廓。',
    plain: '把临时加固的多余部分慢慢修整掉。',
    difference: '与骨性骨痂期相比，这一段不再是临时支架，而是在长期改建。',
  },
]

export const REPAIR_BOUNDARY = {
  stages: '四个阶段的区间（0–0.2 / 0.2–0.5 / 0.5–0.8 / 0.8–1）只用于导演节奏。',
  notDays:
    '教材给出的是通用时间窗（例如数小时内形成血肿、约两天出现软骨痂、之后数周骨性骨痂、最后重塑）。本模型的进度条不对应这些天数，也不代表任何人的愈合速度。',
  notStrength: '视觉进度不是强度、不是承重能力、不是可以运动的许可。动画走完不代表可以负重或停止治疗。',
  overlap: '真实过程各阶段互相重叠、因人而异；这里是概念顺序，不是严格的分段。',
  scene: '修复页签使用单独的对位场景，播放进度不会把上面页签里的移位骨块自动吸回原位。',
  surface: '源模型是表面网格，没有真实的髓腔与皮质内层；剖开看到的是示意补充结构。',
} as const

/* ========================================================================
   图例
   ======================================================================== */

export interface LegendEntry {
  color: string
  label: string
  where: TabId[]
  note?: string
}

export const LEGEND: LegendEntry[] = [
  { color: '#d9d2c3', label: '其他骨', where: ['structure'], note: '降低饱和度，让目标骨更清楚' },
  { color: '#bf6a3d', label: '目标骨（第 5 近节趾骨）', where: ['structure', 'repair'] },
  { color: '#6f8798', label: '第 5 跖骨（对照）', where: ['structure'], note: '裂面不落在它上面' },
  { color: '#e8dfca', label: '断面皮质环', where: ['structure', 'repair'], note: '约 0.8 mm，示意厚度' },
  { color: '#c9b48d', label: '断面松质骨', where: ['structure', 'repair'], note: '网格纹理为示意' },
  { color: '#cf8a5c', label: '基底部标记', where: ['structure'], note: '小点，标出目标区域' },
  { color: '#e6efe2', label: '载荷箭头', where: ['load'], note: '方向与相对强弱，不是真实力值' },
  { color: '#5c5f61', label: '约束符号', where: ['load'], note: '足部其余部分作为约束' },
  { color: '#7d3a4a', label: '血肿', where: ['repair'] },
  { color: '#d8bd7e', label: '软骨痂', where: ['repair'] },
  { color: '#b08a52', label: '骨性骨痂', where: ['repair'] },
]

export function legendFor(tab: TabId): LegendEntry[] {
  return LEGEND.filter((entry) => entry.where.includes(tab))
}

/* ========================================================================
   资料与边界
   ======================================================================== */

export interface Reference {
  id: string
  label: string
  url?: string
  note: string
}

export const REFERENCES: Reference[] = [
  {
    id: 'F00',
    label: '用户提供的报告摘录（仅部位与侧别）',
    note: '影像诊断文字提到「右第 5 近节趾骨基底部骨折」。本包只使用部位、趾序与侧别，没有报告原图、姓名或病历号，也不据此认定断端形态、分型或移位量。',
  },
  {
    id: 'F01',
    label: 'AAOS：Toe and Forefoot Fractures',
    url: 'https://orthoinfo.aaos.org/en/diseases--conditions/toe-and-forefoot-fractures/',
    note: '跖骨与趾骨的区分、近节趾骨的部位参考。',
  },
  {
    id: 'F02',
    label: 'AO Surgery Reference：Lesser toe fractures（definition）',
    url: 'https://surgeryreference.aofoundation.org/orthopedic-trauma/adult-trauma/foot-phalanges/lesser-toe-fractures/definition',
    note: '小趾骨折的一般受力背景（轴向载荷、碰到固定物后的外展）。本模型不据此判断受伤原因，也不做手术操作教程。',
  },
  {
    id: 'F03',
    label: 'OpenStax A&P 2e 6.5 Fractures: Bone Repair',
    url: 'https://openstax.org/books/anatomy-and-physiology-2e/pages/6-5-fractures-bone-repair',
    note: '骨折修复的四个阶段：血肿、内／外骨痂、软骨被编织骨替换、重塑。本页阶段名称与顺序按此节。',
  },
  {
    id: 'F04',
    label: 'OpenStax A&P 2e 8.4 Bones of the Lower Limb',
    url: 'https://openstax.org/books/anatomy-and-physiology-2e/pages/8-4-bones-of-the-lower-limb',
    note: '足骨分组与标准教学骨数（7 跗骨 + 5 跖骨 + 14 趾骨）。采用标准骨数不代表已确认任何人的解剖变异。',
  },
  {
    id: 'M01',
    label: 'BodyParts3D（DBCLS）：右足 26 块骨骼',
    url: 'https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html',
    note: '模型来源。BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International。已提取右足、合并重复顶点、重算法线、统一朝向并转为米制 GLB；本展品另外做了目标骨细分与教学切分。',
  },
  {
    id: 'M02',
    label: '本模块资料包（建模参数与验收边界）',
    note: '位置、尺寸比例、裂面与断端默认值、修复阶段区间、页面边界均来自该资料包；数值为教学设定。',
  },
]

export const BOUNDARIES: Array<{ title: string; body: string }> = [
  {
    title: '模型不是个人影像重建',
    body: '整足骨架来自公开解剖数据集，保留来源比例；报告只提供了部位与侧别。没有 X 线或 CT 时，本展品不重建个人裂面、移位量、关节面或愈合状态。',
  },
  {
    title: '断裂形态是预制的',
    body: '裂面按教学设定切出（距基底约 18%、法线与骨长轴成 20°）。裂隙、横移、旋转是独立的可视参数，不用于判断严重程度，也不是复位指导。',
  },
  {
    title: '受力只有示意',
    body: 'λ 控制箭头长度与极小的示意形变（≤3°，片段活动 ≤0.8°）。没有应力计算、没有断裂阈值、没有疼痛或可承重预测。',
  },
  {
    title: '修复是通用过程',
    body: '四个阶段来自通用教材描述；阶段区间只用于讲解节奏，不对应天数、愈合率或承重能力。动画走完不代表可以运动或停止治疗。',
  },
  {
    title: '没有做的事',
    body: '没有软组织轮廓、韧带与肌腱、内固定器材（钢板／螺钉／克氏针）、疼痛评分、恢复时间预测或任何自我复位步骤。',
  },
]

/* ========================================================================
   镜头
   ======================================================================== */

export const CAMERA_LABELS: Record<CameraId, string> = {
  dorsal: '足背',
  plantar: '足底',
  lateral: '外侧',
  local: '局部',
  load: '受力局部',
  repair: '修复局部',
}

export const STRUCTURE_CAMERAS: CameraId[] = ['dorsal', 'plantar', 'lateral', 'local']

/* ========================================================================
   「带我看懂」
   ======================================================================== */

export interface BoneStepPatch {
  tab?: TabId
  camera?: CameraId
  structure?: Partial<StructureState>
  load?: Partial<LoadState>
  repair?: Partial<RepairState>
  repairProgress?: number
}

export interface BoneStep {
  id: string
  title: string
  body: string
  patch: BoneStepPatch
}

export const BONE_STEPS: BoneStep[] = [
  {
    id: 'locate',
    title: '先找到它：右足最外侧的那一根',
    body:
      '这是右脚的骨架，足背朝向观众：足跟在下方、脚趾在上方，拇趾在左侧、小趾在右侧。' +
      '「右足／内侧／外侧」的标注固定挂在模型上，转动镜头也不会翻面。',
    patch: { tab: 'structure', camera: 'dorsal', structure: { isolate: false, fractured: false, cutaway: false, selected: null } },
  },
  {
    id: 'proximal',
    title: '近节与基底',
    body:
      '小趾由三节趾骨组成。靠近脚掌的一节叫近节趾骨，它靠身体的一端叫基底。' +
      '现在镜头靠近第 5 趾列，橙红色就是目标骨。',
    patch: {
      tab: 'structure',
      camera: 'local',
      structure: { isolate: true, fractured: false, cutaway: false, selected: 'FMA32640' },
    },
  },
  {
    id: 'joint',
    title: '它挨着谁：第 5 跖趾关节',
    body:
      '基底紧挨着第 5 跖骨头，两者之间是跖趾关节。灰蓝色的那根是第 5 跖骨，' +
      '它同样可能骨折，但本模型的裂面只落在近节趾骨上。',
    patch: {
      tab: 'structure',
      camera: 'local',
      structure: { isolate: true, fractured: false, cutaway: false, selected: 'mtp-joint' },
    },
  },
  {
    id: 'intact',
    title: '完整骨对照',
    body:
      '先看正常形状：基底膨大、骨干变细、远端有头。它同时是受力页签里「完整轮廓」的对照。',
    patch: {
      tab: 'structure',
      camera: 'local',
      structure: { isolate: true, fractured: false, cutaway: false, selected: 'FMA32640' },
    },
  },
  {
    id: 'fracture',
    title: '预制裂面与三个参数',
    body:
      '基底部出现一条预制裂面：距基底约 18%、法线与骨长轴成 20°。' +
      '裂隙、横移、旋转是三个独立参数，默认 0.6 mm、1 mm、8°，可以拖到 0 看两片断面完全贴合。',
    patch: {
      tab: 'structure',
      camera: 'local',
      structure: { isolate: true, fractured: true, cutaway: false, selected: null, pose: { ...DEFAULT_POSE } },
    },
  },
  {
    id: 'cutaway',
    title: '剖切看皮质与内部',
    body:
      '剖开足背侧一半，可以看到外面一层较薄的皮质（示意约 0.8 mm）和内部的松质骨。' +
      '源模型是表面网格，这两层剖面是按教学需要补出来的示意结构。',
    patch: {
      tab: 'structure',
      camera: 'local',
      structure: { isolate: true, fractured: true, cutaway: true, selected: null },
    },
  },
  {
    id: 'load',
    title: '三种受力方向',
    body:
      '轴向从趾尖沿骨轴压向基底；侧向从外侧压向趾骨中段；外展在趾尖向外侧拉。' +
      '拖动 λ 只改变箭头长度与极小的示意形变（最多 3°），不计算真实力值。',
    patch: {
      tab: 'load',
      camera: 'load',
      load: { mode: 'axial', load: 0.55, fractured: false },
    },
  },
  {
    id: 'deform',
    title: '形变是夸张显示',
    body:
      '真实趾骨在这样小的示意载荷下形变远小于画面。这里把形变放大，只是为了看清方向；' +
      '页面不给断裂阈值，也不判断这样的力会不会让谁的骨头断掉。',
    patch: {
      tab: 'load',
      camera: 'load',
      load: { mode: 'lateral', load: 0.9, fractured: false },
    },
  },
  {
    id: 'compare',
    title: '断口之后的差别',
    body:
      '切换到「预设骨折」再加载：远端片段会出现轻微的相对错动（最多 0.8°）。' +
      '这只是两种几何示意的对照，不能用来判断任何人的伤情。',
    patch: {
      tab: 'load',
      camera: 'load',
      load: { mode: 'lateral', load: 0.8, fractured: true },
    },
  },
  {
    id: 'repair',
    title: '修复是分阶段发生的',
    body:
      '血肿期先堵住出血；软骨痂把两端暂时粘住；骨性骨痂把软骨换成骨；最后重塑把多余的骨痂修整掉。' +
      '这里用单独的对位场景演示，进度只表示讲解走到哪，不是天数或愈合率。',
    patch: { tab: 'repair', camera: 'repair', repairProgress: 0.34, repair: { cutaway: false } },
  },
]

/* ========================================================================
   读数里要出现的固定数字（教学设定）
   ======================================================================== */

export const READOUT_LABELS = {
  targetLength: '目标骨长轴',
  cutFraction: '裂面位置（距基底）',
  planeTilt: '裂面法线与骨长轴',
  cortical: '断面皮质厚度（示意）',
  reference: '参考模型',
} as const

/** 展品状态 → 导览步骤需要的完整状态（供 index 应用） */
export function stepState(step: BoneStep, current: BoneState): BoneState {
  const patch = step.patch
  return {
    ...current,
    tab: patch.tab ?? current.tab,
    camera: patch.camera ?? current.camera,
    structure: { ...current.structure, ...patch.structure },
    load: { ...current.load, ...patch.load },
    repair: { ...current.repair, ...patch.repair },
  }
}
