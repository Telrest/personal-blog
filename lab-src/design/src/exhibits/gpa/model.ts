/**
 * GPA 计算模型（纯 TypeScript）。
 *
 * 只做计算，不依赖 React / 图表组件。页面上的每一个数字、每一段条形、
 * 每一句解释都从这里读，不另外算第二遍。
 *
 * 记号：
 *   c_i 学分     s_i 百分制成绩     g(s_i) 课程绩点     C 参与计算的总学分
 *   GPA = Σ[c_i × g(s_i)] / C
 *   学分权重     w_i = c_i / C          （Σw_i = 1）
 *   加总贡献     q_i = c_i × g(s_i) / C （Σq_i = GPA，单位是绩点）
 *   满绩缺口     d_i = c_i × [4 − g(s_i)] / C（Σd_i = 4 − GPA）
 *   单科提分影响 ΔGPA = c_i / C × [g(新) − g(旧)]（课程集合与学分不变时）
 *
 * 注意：q_i 不是百分比，「当前贡献大」也不等于「继续提分的收益大」。
 */

/* =========================================================================
   绩点规则
   ========================================================================= */

export interface GradeRule {
  id: string
  /** 界面显示的名称 */
  name: string
  /** 满绩点（这条规则下是 4） */
  maxGradePoint: number
  /** 有效成绩区间 */
  minScore: number
  maxScore: number
  /** 百分制 → 课程绩点 */
  gradePoint: (score: number) => number
  /** 公式（分行，界面上用等宽字体显示） */
  formula: string[]
  /** 来源说明 */
  sourceLabel: string
  sourceUrl: string
  /** 适用范围说明，必须原文照实写，不扩大适用范围 */
  scopeNote: string
}

/**
 * 北航本科成绩换算公式（候选预设）。
 *
 *   0 ≤ s < 60 : g(s) = 0
 *   60 ≤ s ≤ 100: g(s) = 4 − 3(100 − s)² / 1600
 *
 * 依据：北京航空航天大学教务部公开说明（见 sourceUrl）。
 * 本规则只对「普通百分制课程、按该公式换算」的情形成立；
 * 不宣称适用于所有年级、学院、课程，也不处理通过/不通过、缓考、重修等特殊记分方式。
 */
export const BUAA_RULE: GradeRule = {
  id: 'buaa-4.0',
  name: '北航本科换算公式（4.0 制）',
  maxGradePoint: 4,
  minScore: 0,
  maxScore: 100,
  gradePoint(score: number) {
    const s = Math.min(100, Math.max(0, score))
    if (s < 60) return 0
    return 4 - (3 * (100 - s) ** 2) / 1600
  },
  formula: ['0 ≤ s < 60：g(s) = 0', '60 ≤ s ≤ 100：g(s) = 4 − 3(100 − s)² / 1600'],
  sourceLabel: '北京航空航天大学教务部 · 成绩与绩点换算说明',
  sourceUrl: 'https://sge.buaa.edu.cn/info/1221/2957.htm',
  scopeNote:
    '本展品按这条公开公式计算，只用于普通百分制课程。不等于适用于所有年级、学院或全部课程；具体以本人所在学校、学院当年的规定为准。',
}

/** 可替换的规则表：第一版只有一种，结构上留好扩展位 */
export const GRADE_RULES: GradeRule[] = [BUAA_RULE]
export const DEFAULT_RULE_ID = BUAA_RULE.id

export function getRule(id: string): GradeRule {
  return GRADE_RULES.find((rule) => rule.id === id) ?? BUAA_RULE
}

/* =========================================================================
   课程记录：输入用文本保存，才能区分「空」与「0」
   ========================================================================= */

export interface CourseRecord {
  id: string
  name: string
  /** 学分原文（可能为空或非法） */
  creditsText: string
  /** 原始成绩原文 */
  scoreText: string
  /** 假设成绩原文；空表示与原始成绩相同 */
  targetText: string
  /** 是否参与计算 */
  included: boolean
}

export type ParseIssue = 'empty' | 'invalid' | 'range' | null

export interface ParsedInput {
  value: number | null
  issue: ParseIssue
}

const EMPTY: ParsedInput = { value: null, issue: 'empty' }

/** 解析学分：必须是有限正数 */
export function parseCredits(text: string): ParsedInput {
  const raw = text.trim()
  if (raw === '') return EMPTY
  const value = Number(raw)
  if (!Number.isFinite(value)) return { value: null, issue: 'invalid' }
  if (value <= 0) return { value: null, issue: 'range' }
  return { value, issue: null }
}

/** 解析百分制成绩：0 是有效成绩，空才是未填写 */
export function parseScore(text: string): ParsedInput {
  const raw = text.trim()
  if (raw === '') return EMPTY
  const value = Number(raw)
  if (!Number.isFinite(value)) return { value: null, issue: 'invalid' }
  if (value < 0 || value > 100) return { value: null, issue: 'range' }
  return { value, issue: null }
}

/**
 * 解析「假设成绩」：允许输入超出 0–100 的数字，超出的截断到边界，
 * 这样用户写 105 时看到的是「按 100 计」，而不是悄悄失效。
 */
export function parseTargetScore(text: string): ParsedInput {
  const raw = text.trim()
  if (raw === '') return EMPTY
  const value = Number(raw)
  if (!Number.isFinite(value)) return { value: null, issue: 'invalid' }
  return { value: Math.min(100, Math.max(0, value)), issue: null }
}

/* =========================================================================
   计算结果
   ========================================================================= */

export interface CourseResult {
  id: string
  name: string
  /** 颜色索引，跨视图保持一致 */
  colorIndex: number
  included: boolean
  credits: number | null
  score: number | null
  /** 截断到 0–100 之后的假设成绩；没填就是原始成绩 */
  target: number | null
  /** 假设成绩输入的解析结果 */
  targetIssue: ParseIssue
  /** 假设成绩是否真的与原始成绩不同 */
  targetChanged: boolean
  usable: boolean
  /** 不参与计算的原因（中文） */
  reason: string | null
  gradePoint: number | null
  targetPoint: number | null
  /** w_i = c_i / C */
  weight: number | null
  /** q_i = c_i × g(s_i) / C */
  contribution: number | null
  /** 假设情形下的贡献 */
  targetContribution: number | null
  /** d_i = c_i × [4 − g(s_i)] / C */
  headroom: number | null
  /** 只改这一门时对总 GPA 的影响 */
  deltaGpa: number | null
}

export interface PlusFiveRow {
  id: string
  name: string
  colorIndex: number
  fromScore: number
  toScore: number
  /** 实际增加的分数（可能因 100 分封顶而小于 5） */
  added: number
  fromPoint: number
  toPoint: number
  /** 这一门单独提分带来的 ΔGPA */
  delta: number
}

export interface GpaResult {
  rule: GradeRule
  courses: CourseResult[]
  /** 参与计算且数据有效的课程 */
  usable: CourseResult[]
  /** C：参与计算的总学分 */
  totalCredits: number
  /** 原始 GPA；没有可算数据时为 null（不是 0） */
  gpa: number | null
  /** 假设 GPA */
  targetGpa: number | null
  /** 假设 − 原始 */
  delta: number | null
  /** Σw_i，正常应为 1 */
  weightSum: number
  /** Σq_i，正常应等于 gpa */
  contributionSum: number
  /** 4 − GPA */
  headroomTotal: number | null
  /** 是否有可计算的数据 */
  hasData: boolean
  /** 各科单独提高 5 分的影响，按 ΔGPA 从大到小 */
  plusFive: PlusFiveRow[]
  excludedCount: number
  /** 参与勾选但数据不完整的课程数 */
  invalidCount: number
}

const ISSUE_TEXT: Record<Exclude<ParseIssue, null>, string> = {
  empty: '未填写',
  invalid: '不是有效数字',
  range: '超出范围',
}

function reasonFor(
  included: boolean,
  credits: ParsedInput,
  score: ParsedInput,
  rule: GradeRule,
): string | null {
  if (!included) return '已设为不参与计算'
  if (credits.issue === 'empty') return '缺学分，暂不计入'
  if (credits.issue) return `学分${ISSUE_TEXT[credits.issue]}，暂不计入`
  if (score.issue === 'empty') return '缺成绩，暂不计入'
  if (score.issue === 'invalid') return '成绩不是有效数字，暂不计入'
  if (score.issue === 'range') return `成绩需在 ${rule.minScore}–${rule.maxScore} 之间，暂不计入`
  return null
}

/**
 * 唯一的计算入口。
 * 中间结果保留完整精度，只在格式化时舍入。
 */
export function computeGpa(courses: CourseRecord[], rule: GradeRule = BUAA_RULE): GpaResult {
  const parsed = courses.map((course, index) => {
    const credits = parseCredits(course.creditsText)
    const score = parseScore(course.scoreText)
    const targetRaw = parseTargetScore(course.targetText)
    return { course, index, credits, score, targetRaw }
  })

  const usableRows = parsed.filter(
    (row) => row.course.included && row.credits.value !== null && row.score.value !== null,
  )
  const totalCredits = usableRows.reduce((sum, row) => sum + (row.credits.value ?? 0), 0)
  const hasData = usableRows.length > 0 && totalCredits > 0

  const base = parsed.map((row) => {
    const { course, index, credits, score, targetRaw } = row
    const included = course.included
    const reason = reasonFor(included, credits, score, rule)
    const usable = reason === null
    const gradePoint = usable && score.value !== null ? rule.gradePoint(score.value) : null

    // 假设成绩：空 → 与原始成绩相同；超出 0–100 的已经截断过
    let target: number | null = null
    if (score.value !== null) {
      target = targetRaw.value !== null ? targetRaw.value : score.value
    }
    const targetPoint = usable && target !== null ? rule.gradePoint(target) : null

    return {
      id: course.id,
      name: course.name,
      colorIndex: index,
      included,
      credits: credits.value,
      score: score.value,
      target,
      targetIssue: targetRaw.issue,
      targetChanged: target !== null && score.value !== null && Math.abs(target - score.value) > 1e-9,
      usable,
      reason,
      gradePoint,
      targetPoint,
      weight: null as number | null,
      contribution: null as number | null,
      targetContribution: null as number | null,
      headroom: null as number | null,
      deltaGpa: null as number | null,
    } satisfies CourseResult
  })

  let gpa: number | null = null
  let targetGpa: number | null = null

  if (hasData) {
    let weightedSum = 0
    let targetSum = 0
    for (const course of base) {
      if (!course.usable || course.gradePoint === null || course.credits === null) continue
      weightedSum += course.credits * course.gradePoint
      if (course.targetPoint !== null) targetSum += course.credits * course.targetPoint
    }
    gpa = weightedSum / totalCredits
    targetGpa = targetSum / totalCredits

    for (const course of base) {
      if (!course.usable || course.credits === null || course.gradePoint === null) continue
      const weight = course.credits / totalCredits
      course.weight = weight
      course.contribution = (course.credits * course.gradePoint) / totalCredits
      course.targetContribution =
        course.targetPoint === null
          ? course.contribution
          : (course.credits * course.targetPoint) / totalCredits
      course.headroom = (course.credits * (rule.maxGradePoint - course.gradePoint)) / totalCredits
      course.deltaGpa =
        course.targetPoint === null
          ? 0
          : (course.credits / totalCredits) * (course.targetPoint - course.gradePoint)
    }
  }

  const usable = base.filter((course) => course.usable)
  const weightSum = usable.reduce((sum, course) => sum + (course.weight ?? 0), 0)
  const contributionSum = usable.reduce((sum, course) => sum + (course.contribution ?? 0), 0)
  const headroomTotal =
    gpa === null ? null : usable.reduce((sum, course) => sum + (course.headroom ?? 0), 0)

  const plusFive: PlusFiveRow[] = (hasData ? usable : [])
    .filter(
      (course) => course.score !== null && course.gradePoint !== null && course.credits !== null,
    )
    .map((course) => {
      const fromScore = course.score as number
      const toScore = Math.min(rule.maxScore, fromScore + 5)
      const fromPoint = course.gradePoint as number
      const toPoint = rule.gradePoint(toScore)
      const delta = ((course.credits as number) / totalCredits) * (toPoint - fromPoint)
      return {
        id: course.id,
        name: course.name,
        colorIndex: course.colorIndex,
        fromScore,
        toScore,
        added: toScore - fromScore,
        fromPoint,
        toPoint,
        delta,
      }
    })
    .sort((a, b) => b.delta - a.delta || a.colorIndex - b.colorIndex)

  const excludedCount = base.filter((course) => !course.included).length
  const invalidCount = base.filter((course) => course.included && !course.usable).length

  return {
    rule,
    courses: base,
    usable,
    totalCredits,
    gpa,
    targetGpa,
    delta: gpa === null || targetGpa === null ? null : targetGpa - gpa,
    weightSum,
    contributionSum,
    headroomTotal,
    hasData,
    plusFive,
    excludedCount,
    invalidCount,
  }
}

/* =========================================================================
   格式化：只在显示时舍入
   ========================================================================= */

/** 去掉尾随零的数字文本，最多保留 digits 位小数 */
export function fmtNumber(value: number | null | undefined, digits = 4): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  const rounded = Number(value.toFixed(digits))
  if (Object.is(rounded, -0)) return '0'
  return String(rounded)
}

/** 带符号的变化量，例如 +0.0625 / −0.15 */
export function fmtDelta(value: number | null | undefined, digits = 4): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  const rounded = Number(value.toFixed(digits))
  if (rounded === 0) return '0'
  return `${rounded > 0 ? '+' : '−'}${fmtNumber(Math.abs(rounded), digits)}`
}

/** 百分比，例如 25.0% */
export function fmtPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return `${(value * 100).toFixed(digits)}%`
}

export function changeWord(value: number | null | undefined, threshold = 1e-9): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '无变化'
  if (value > threshold) return '上升'
  if (value < -threshold) return '下降'
  return '无变化'
}
