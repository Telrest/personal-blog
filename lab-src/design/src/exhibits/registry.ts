import type { ComponentType } from 'react'
import type { ExhibitId, ExhibitMeta, ExhibitModuleProps } from './types'

/**
 * 展品登记表。
 *
 * 这个文件是唯一知道「有哪些展品」的地方：首页、导航、路由、上一件/下一件
 * 全部从这里读，不各自维护一份列表。数组顺序 = 展品顺序 = 首页问题顺序。
 *
 * 标题统一为「……的秘密」，编号随之连续。
 * component 为 undefined 表示模型还没实现，ExhibitPage 会渲染诚实的「制作中」页，
 * 并且不会加载 three.js（未完成展品零 3D 开销）。
 */
export interface ExhibitEntry extends ExhibitMeta {
  /** 懒加载的展品模块；未实现时不填 */
  component?: () => Promise<{ default: ComponentType<ExhibitModuleProps> }>
}

export const EXHIBITS: ExhibitEntry[] = [
  {
    id: 'pen',
    index: '01',
    title: '按动圆珠笔的秘密',
    subtitle: '凸轮索引锁止',
    question: '按一下笔芯探出头，再按一下它又缩回去——同一个按键，怎么做出两种结果？',
    deck: '尾部只有按帽、推杆、转子、固定导向和一根弹簧。每按一次，转子被斜面推着转过 60°，落进下一个索引位：深导槽放它退回，浅锁止面把它挡住。',
    planned: [
      '笔身剖切：按帽／按杆、转子、固定导向、笔芯与弹簧的相对位置',
      '按下、松开、保持伸出、再次按下、保持缩回：明确状态机记录锁止与提交',
      '弹簧长度、机构位移与笔尖位置的实时读数',
    ],
    status: 'ready',
    statusLabel: '已开放',
    note: '外观参考 ZEBRA SARASA CLIP JJ15，内部为简化教学模型；索引位置与行程为教学设定。',
    view: '3d',
    component: () => import('./pen'),
  },
  {
    id: 'derailleur',
    index: '02',
    title: '变速的秘密',
    subtitle: '后拨与齿比',
    question: '上坡换到大飞轮，为什么踩起来更轻？',
    deck: '链条在前盘和飞轮之间挪动位置，改变的是「踩一圈能带轮子转多少」。后拨的四连杆把链条横向送到目标齿片，摆臂转动收放链条余量——同一根链条，12 个挡位都能闭合。',
    planned: [
      '单前盘 30T 与 12 片飞轮 10–51T 的稳态传动：齿比、后轮转速、理论车速、理想轮端力矩与功率',
      '后拨四连杆的横向换挡、导轮与张紧轮的分工、摆臂按链长守恒求解姿态',
      '停踩排队、驱动/滑行、暂停与慢放、镜头切换与零件讲解',
    ],
    status: 'ready',
    statusLabel: '已开放',
    note: '外观参考 GIANT Talon 0（2025 英国版 M 码 29 英寸），变速结构参考 Shimano Deore M6100 1×12；几何与换挡过渡为简化教学模型。',
    view: '3d',
    component: () => import('./derailleur'),
  },
  {
    id: 'gpa',
    index: '03',
    title: 'GPA 的秘密',
    subtitle: 'GPA 可视化 · 学分加权',
    question: '同样提高五分，为什么有的课程影响更大？',
    deck: 'GPA 是学分加权平均：一门课的权重是它的学分，不是它的难度。而"提五分"能带来多少变化，还取决于这门课现在离满绩有多远。',
    planned: [
      '二维主视图：学分权重、当前贡献、提分实验、满绩差距',
      '拖动某一门课的分数，看总 GPA 的斜率（敏感度）',
      '课程本地保存与 JSON 导入导出',
    ],
    status: 'ready',
    statusLabel: '已开放',
    note: '按约定主视图使用二维图表，不启动三维场景；绩点规则为可替换配置，默认北航本科公式。',
    view: '2d',
    component: () => import('./gpa'),
  },
  {
    id: 'bone',
    index: '04',
    title: '骨骼的秘密',
    subtitle: '小脚趾的结构与修复',
    question: '看似坚硬的骨头，怎样承受力量，又怎样修复？',
    deck: '右足最外侧那一根小趾，靠近脚掌的一节叫近节趾骨。它的基底部可以出现预制裂面：换个方向施力，整根趾与断端的反应不同；修复则按血肿、软骨痂、骨性骨痂、重塑四个通用阶段发生。',
    planned: [
      '整足骨架 → 定位到第 5 趾近节趾骨基底部（真实足骨模型，非示意图）',
      '预制裂面与可调的裂隙／横移／旋转，剖切可见皮质与松质骨',
      '归一化 λ 的三种受力方向，形变夸张显示、不给断裂阈值',
      '通用修复四阶段（血肿／软骨痂／骨性骨痂／重塑）与独立对位场景',
    ],
    status: 'ready',
    statusLabel: '已开放',
    note: '部位参考右第 5 近节趾骨基底部骨折；形态、受力与修复过程为通用教学示意。',
    view: '3d',
    component: () => import('./bone'),
  },
  {
    id: 'engine',
    index: '05',
    title: '航空发动机的秘密',
    subtitle: '双转子同轴结构',
    question: '空气向后流，动力怎样传回前面的风扇？两套转子又为什么能各转各的？',
    deck: '低压轴从高压轴内部穿过去：风扇、低压压气机与低压涡轮一条轴，高压压气机与高压涡轮另一条轴，两条轴各自被自己的涡轮驱动，因此可以各转各的。',
    planned: [
      '涵道与核心机的气流路径、风扇与两级涡轮的位置关系',
      '剖切观察：外涵道、内涵道、燃烧室与双轴嵌套',
      '独立双轴运动、气流追踪、组件拆解与相对总温总压趋势',
    ],
    status: 'ready',
    statusLabel: '已开放',
    note: '通用教学结构；CC0 转子模型经拆分改造，双轴与机匣重新构建。速度、响应与温压趋势为标明假设的示意，不提供实际型号性能。',
    view: '3d',
    component: () => import('./engine'),
  },
]

export const EXHIBIT_IDS: ExhibitId[] = EXHIBITS.map((exhibit) => exhibit.id)

export function getExhibit(id: string | undefined): ExhibitEntry | undefined {
  return EXHIBITS.find((exhibit) => exhibit.id === id)
}

export function exhibitNeighbours(id: ExhibitId): { prev: ExhibitEntry; next: ExhibitEntry } {
  const index = EXHIBITS.findIndex((exhibit) => exhibit.id === id)
  const total = EXHIBITS.length
  return {
    prev: EXHIBITS[(index - 1 + total) % total],
    next: EXHIBITS[(index + 1) % total],
  }
}

export const EXHIBIT_STATS = {
  total: EXHIBITS.length,
  ready: EXHIBITS.filter((exhibit) => exhibit.status === 'ready').length,
  building: EXHIBITS.filter((exhibit) => exhibit.status !== 'ready').length,
}
