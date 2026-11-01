/**
 * GPA 展品的文案、示例数据与导览步骤。
 *
 * 示例课程用常见课程名，但学分与成绩是编的，只用于演示；
 * 不声称对应任何学校、专业或培养方案。
 */

import { BUAA_RULE, type CourseRecord } from './model'

export type GpaView = 'weight' | 'contribution' | 'target' | 'headroom'

export const VIEW_INFO: Record<GpaView, { label: string; hint: string; formula: string }> = {
  weight: {
    label: '学分权重',
    hint: '每门课占总学分的比例。权重只和学分有关，和考多少分无关。',
    formula: 'w_i = c_i / C，Σw_i = 1',
  },
  contribution: {
    label: '当前贡献',
    hint: '每门课实际给总 GPA 加了多少绩点。这些贡献直接相加就是总 GPA。',
    formula: 'q_i = c_i × g(s_i) / C，Σq_i = GPA',
  },
  target: {
    label: '提分实验',
    hint: '把假设成绩放进来，看每一门的贡献怎么变、总 GPA 怎么动。',
    formula: 'ΔGPA = c_i / C × [g(新) − g(旧)]',
  },
  headroom: {
    label: '满绩差距',
    hint: '每门课离满分绩点还差多少绩点。它们相加就是 4 − GPA，和「当前贡献」不是一回事。',
    formula: 'd_i = c_i × [4 − g(s_i)] / C，Σd_i = 4 − GPA',
  },
}

export const VIEW_ORDER: GpaView[] = ['weight', 'contribution', 'target', 'headroom']

/** 课程配色：跨视图保持一致；颜色之外还有名称与编号，不靠颜色单独表意 */
export const COURSE_COLORS = [
  '#6aa6d6',
  '#cf8a5c',
  '#7fd0a4',
  '#8a6414',
  '#6b4c8a',
  '#1f6f78',
  '#8a5a3c',
  '#4a5568',
]

export function courseColor(index: number): string {
  return COURSE_COLORS[index % COURSE_COLORS.length]
}

/**
 * 首次进入时的示例数据。
 *
 * 来自用户提供的一份课程清单（gpa-courses-2026-11-01.json），
 * 课程名与学分按原样保留；它不是任何学校或专业的培养方案，也不代表官方口径。
 * 第一门带「假设成绩 100」，进来就能看到提分实验长什么样。
 */
export const SAMPLE_COURSES: CourseRecord[] = [
  { id: 'sample-1', name: '工科数学分析', creditsText: '5', scoreText: '90', targetText: '100', included: true },
  { id: 'sample-2', name: '程序设计基础', creditsText: '2', scoreText: '90', targetText: '', included: true },
  { id: 'sample-3', name: '高等代数', creditsText: '4', scoreText: '90', targetText: '', included: true },
  { id: 'sample-4', name: '大学英语（一）', creditsText: '2', scoreText: '90', targetText: '', included: true },
  { id: 'sample-5', name: '体育（一）', creditsText: '0.5', scoreText: '60', targetText: '', included: true },
]

export const SAMPLE_NOTE =
  '课程名与学分可以直接改成你自己的；示例本身不代表任何学校或专业的培养方案，也不是官方口径。'

/** 「带我看懂」用的独立示例：三门的学分与成绩都不同，便于讲清权重与曲线 */
export const GUIDE_COURSES: CourseRecord[] = [
  { id: 'guide-1', name: '高等数学（上）', creditsText: '4', scoreText: '80', targetText: '', included: true },
  { id: 'guide-2', name: '大学英语（一）', creditsText: '2', scoreText: '90', targetText: '', included: true },
  { id: 'guide-3', name: '体育（一）', creditsText: '2', scoreText: '60', targetText: '', included: true },
]

export interface GuideStep {
  id: string
  title: string
  body: string
  view: GpaView
  /** 'all' 或某门课的 id */
  focus: string
}

export const GUIDE_STEPS: GuideStep[] = [
  {
    id: 'grade',
    title: '① 分数先换成绩点',
    body: '同一把尺子：80 分是 3.25，90 分是 3.8125，60 分是 1.0，59 分及以下一律 0。换算只看分数，和学分无关。',
    view: 'contribution',
    focus: 'all',
  },
  {
    id: 'weight',
    title: '② 学分是权重，不是难度',
    body: '三门课共 4 + 2 + 2 = 8 学分，所以权重分别是 50%、25%、25%。学分高的课说话更响，跟课程难不难没关系。',
    view: 'weight',
    focus: 'all',
  },
  {
    id: 'weighted',
    title: '③ 加权求和',
    body: 'GPA = (4×3.25 + 2×3.8125 + 2×1.0) / 8 = 2.8281。每门课贡献的 q_i 相加，正好等于总 GPA。',
    view: 'contribution',
    focus: 'guide-1',
  },
  {
    id: 'plus5',
    title: '④ 同样提 5 分，效果不同',
    body: '高数 80→85，总 GPA 升 0.1641；英语 90→95 只升 0.0352；体育 60→65 升 0.1758——它学分最小，却在及格线附近，曲线最陡。',
    view: 'target',
    focus: 'guide-3',
  },
  {
    id: 'headroom',
    title: '⑤ 换个问题：离满绩还差多少',
    body: '把每门课的 c_i × [4 − g(s_i)] / C 加起来，正好是 4 − GPA。它和「当前贡献」是两件事：一个是已经拿到的，一个是还能拿到的。',
    view: 'headroom',
    focus: 'all',
  },
]

export const COPY = {
  ruleTitle: '绩点规则',
  scopeTitle: '适用范围',
  formulaTitle: '本页用到的关系',
  sourcesTitle: '参考依据',
  noDataTitle: '暂无可计算数据',
  noDataBody: '至少需要一门课程同时填好学分和成绩，才会算出 GPA。填好其中一项不算。',
  emptyBody: '列表里还没有课程。可以新增一门课，或者加载示例看看怎么用。',
  sampleBadge: '示例数据',
  savedBadge: '已保存在本浏览器',
  rule: BUAA_RULE,
}

/** 页面上「本页用到的关系」的公式表 */
export const FORMULAS: Array<{ label: string; text: string; note: string }> = [
  { label: '总 GPA', text: 'GPA = Σ[c_i × g(s_i)] / C', note: 'C 是参与计算且数据有效的课程总学分。' },
  { label: '学分权重', text: 'w_i = c_i / C', note: '所有参与课程的权重相加等于 1。' },
  { label: '加总贡献', text: 'q_i = c_i × g(s_i) / C', note: '单位是绩点。所有 q_i 相加等于总 GPA。' },
  { label: '提分影响', text: 'ΔGPA = c_i / C × [g(新) − g(旧)]', note: '课程集合与学分不变时成立。' },
  { label: '满绩差距', text: 'd_i = c_i × [4 − g(s_i)] / C', note: '所有 d_i 相加等于 4 − GPA。' },
]
