import type { Phase, StableState } from './model'
import type { PartId } from './geometry'

/** 资料来源：资料包内编号与可访问链接 */
export interface Reference {
  id: string
  label: string
  url?: string
  note: string
}

export const REFERENCES: Reference[] = [
  {
    id: 'S01',
    label: 'ZEBRA 官方产品页（SARASA CLIP 0.5）',
    url: 'https://www.zebra.co.jp/pro/detail/sarasa-clip/?tab=lineup_sarasa-clip_05',
    note: '官方名义尺寸：全长 141.0 mm、轴径 11.0 mm、球珠 0.5 mm、质量 10.9 g。',
  },
  {
    id: 'S02',
    label: 'ZEBRA 官方替芯页（JF-0.5）',
    url: 'https://www.zebra.co.jp/pro/kaeshin/kaeshin_jel/',
    note: '官方笔芯长度 111.1 mm、最大直径 6.1 mm。',
  },
  {
    id: 'S04',
    label: 'SARASA CLIP 同系列实物拆解记录',
    url: 'https://blog.kamujp.com/2016/12/zebra.html',
    note: '个人拆解记录，支持「前部、复位弹簧、笔芯、后笔杆、按杆、回转子、笔夹」这一零件组成。不是厂家装配图。',
  },
  {
    id: 'S05',
    label: '斑马 JP2007083498A 专利（通用按动原理）',
    url: 'https://patents.google.com/patent/JP2007083498A/en',
    note: '背景部分介绍：按杆推动转子沿导槽前进，脱离约束后由斜面产生转动，释放时停在锁止位置。只借用这条通用原理，不采用专利里的静音切换机构。',
  },
  {
    id: 'S06',
    label: 'elvarofficial/teardown（建模与验收方法）',
    url: 'https://github.com/elvarofficial/teardown',
    note: '借鉴统一模型状态、剖切观察与按帧复核的做法。不是本型号的现成模型。',
  },
]

/** 界面上必须出现的那句话 */
export const DISPLAY_NOTE = '外观参考 ZEBRA SARASA CLIP JJ15，内部为简化教学模型。'

export const PART_INFO: Record<PartId, { label: string; role: string }> = {
  cap: {
    label: '按帽',
    role: '手指按的就是它。与推杆一体，收芯时轴肩压在笔杆口内台上，形成收芯止挡。',
  },
  plunger: {
    label: '按杆（推杆）',
    role: '把按帽的行程传给转子，只传递轴向推力，本身不产生转动。',
  },
  rotor: {
    label: '回转子',
    role: '3 个相隔 120° 的凸耳，决定笔芯只能停在高位（收芯）或低位（出芯），并把轴向推力换成转动。',
  },
  guide: {
    label: '固定导向',
    role: '6 个相隔 60° 的索引位置：0/120/240° 是深导槽，60/180/300° 是浅锁止支承面。下端斜面负责把轴向推进变成转动。',
  },
  refill: {
    label: '笔芯',
    role: 'JF-0.5，长 111.1 mm，球珠 0.5 mm。随转子一起前后移动，笔尖伸出量由它决定。',
  },
  spring: {
    label: '复位弹簧',
    role: '提供回推力。它不负责「记住」状态——保持状态的是转子与支承面。',
  },
  barrel: {
    label: '笔杆',
    role: '透明外壳，内部既装笔芯也充当固定导向的支座；剖视时隐藏朝向镜头的一半。',
  },
  clip: {
    label: '笔夹',
    role: '长形活动笔夹，自成一套弹性结构，与按动锁止互不影响。',
  },
  cone: {
    label: '前锥',
    role: '透明锥形收口，笔尖从这里伸出；收芯时球珠停在出芯口内 0.8 mm。',
  },
}

export const CONTACT_INFO: Record<
  'collar' | 'plunger' | 'guide' | 'ramp' | 'stop',
  { label: string; note: string }
> = {
  collar: { label: '按帽轴肩 ↔ 笔杆口内台', note: '收芯状态的止挡：按住整条链，不让它继续往后退。' },
  plunger: { label: '推杆下端面 ↔ 转子顶面', note: '按压从这里进入机构，只传轴向力。' },
  guide: { label: '凸耳 ↔ 导槽侧壁', note: '这一段转子被夹住，只能直上直下，不能转。' },
  ramp: { label: '凸耳 ↔ 索引斜面', note: '0.8 mm 的轴向行程在这里换成 30° 转动。' },
  stop: { label: '凸耳 ↔ 浅锁止支承面', note: '出芯状态的止挡：笔尖因此停在外面，不是弹簧没力了。' },
}

export const PHASE_INFO: Record<Phase, { label: string; caption: string; tone: 'idle' | 'work' | 'lock' }> = {
  idle: { label: '静止', caption: '停在某个索引位上，没有按压。', tone: 'idle' },
  pressing: {
    label: '沿导槽推进',
    caption: '凸耳在导槽里直着走，转子被锁住不转——这一段只准备位置，不切换状态。',
    tone: 'work',
  },
  indexing: {
    label: '脱离导向 · 索引',
    caption: '凸耳滑出导槽，落到斜面上；再往下 0.8 mm 就换成 30° 转动。',
    tone: 'work',
  },
  releasing: {
    label: '回程斜面',
    caption: '弹簧往回推，凸耳沿另一侧斜面再转 30°，两次共 60°。',
    tone: 'work',
  },
  settling: {
    label: '落到支承面',
    caption: '凸耳要么被浅锁止面挡住（出芯），要么顺着深导槽退到底（收芯）。',
    tone: 'lock',
  },
  aborting: {
    label: '未提交 · 原路退回',
    caption: '没按到底就松手，索引角沿原路退回去，这次操作不改变状态。',
    tone: 'idle',
  },
}

export const STABLE_INFO: Record<StableState, { label: string; detail: string }> = {
  R: { label: '收芯', detail: '凸耳落在深导槽，笔尖在壳内 0.8 mm，按帽处于高位。' },
  E: { label: '出芯', detail: '凸耳被浅锁止支承面挡住，笔尖伸出 1.4 mm，按帽比收芯低 2.2 mm。' },
}

/** 预设镜头（世界单位，1 单位 = 50 mm） */
export type CameraViewId = 'whole' | 'mechanism' | 'clip' | 'tip' | 'side' | 'explode'

export const CAMERA_VIEWS: Record<
  CameraViewId,
  { label: string; pose: { position: [number, number, number]; target: [number, number, number] } }
> = {
  whole: {
    label: '整笔',
    pose: { position: [3.55, 1.65, 2.4], target: [0, 0, 1.41] },
  },
  mechanism: {
    label: '机构特写',
    pose: { position: [0.57, 0.3, 2.42], target: [0, 0, 2.34] },
  },
  clip: {
    label: '笔夹细节',
    pose: { position: [0.34, 1.15, 2.46], target: [0, 0.06, 2.25] },
  },
  tip: {
    label: '笔尖弹簧',
    pose: { position: [0.73, 0.28, 0.23], target: [0, 0, 0.22] },
  },
  side: {
    label: '剖切正视',
    pose: { position: [3.1, 0.12, 1.41], target: [0, 0, 1.41] },
  },
  explode: {
    label: '拆解位',
    pose: { position: [5.0, 2.4, 2.25], target: [0, 0.18, 1.65] },
  },
}

export const VIEW_MODE_INFO = {
  exterior: { label: '外观', hint: '整笔外观，内部只留一点影子' },
  cutaway: { label: '剖视', hint: '去掉朝向镜头的半个外壳，露出机构' },
  exploded: { label: '拆解', hint: '外壳抬起，内部沿轴分开；机构暂停' },
} as const
