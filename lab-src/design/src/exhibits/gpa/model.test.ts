import { describe, expect, it } from 'vitest'
import {
  BUAA_RULE,
  computeGpa,
  fmtDelta,
  fmtNumber,
  fmtPercent,
  parseCredits,
  parseScore,
  parseTargetScore,
  type CourseRecord,
} from './model'

let seq = 0
const course = (over: Partial<CourseRecord> = {}): CourseRecord => ({
  id: `c${(seq += 1)}`,
  name: '课程',
  creditsText: '4',
  scoreText: '80',
  targetText: '',
  included: true,
  ...over,
})

const g = (s: number) => BUAA_RULE.gradePoint(s)

describe('绩点规则', () => {
  it('60 分对应 1，100 分对应 4，低于 60 分对应 0', () => {
    expect(g(60)).toBeCloseTo(1, 10)
    expect(g(100)).toBeCloseTo(4, 10)
    expect(g(59)).toBe(0)
    expect(g(0)).toBe(0)
    expect(g(100)).toBe(BUAA_RULE.maxGradePoint)
  })

  it('中间值符合公式', () => {
    expect(g(80)).toBeCloseTo(3.25, 10)
    expect(g(90)).toBeCloseTo(3.8125, 10)
    expect(g(85)).toBeCloseTo(3.578125, 10)
  })

  it('输入超出 0–100 时按边界处理，不会算出负绩点', () => {
    expect(g(-10)).toBe(0)
    expect(g(120)).toBe(4)
  })
})

describe('手算验收样例', () => {
  // A：4 学分 80 分（3.25）；B：2 学分 90 分（3.8125）
  const result = computeGpa([
    course({ name: 'A', creditsText: '4', scoreText: '80' }),
    course({ name: 'B', creditsText: '2', scoreText: '90' }),
  ])

  it('总 GPA 为 3.4375', () => {
    expect(result.gpa).toBeCloseTo(3.4375, 10)
    expect(result.totalCredits).toBe(6)
  })

  it('单门课程绩点正确', () => {
    expect(result.courses[0].gradePoint).toBeCloseTo(3.25, 10)
    expect(result.courses[1].gradePoint).toBeCloseTo(3.8125, 10)
  })

  it('学分权重是 4/6 与 2/6', () => {
    expect(result.courses[0].weight).toBeCloseTo(4 / 6, 10)
    expect(result.courses[1].weight).toBeCloseTo(2 / 6, 10)
  })

  it('加总贡献相加等于 GPA', () => {
    expect(result.courses[0].contribution).toBeCloseTo(13 / 6, 10)
    expect(result.courses[1].contribution).toBeCloseTo(7.625 / 6, 10)
    expect(result.contributionSum).toBeCloseTo(3.4375, 10)
    expect(result.contributionSum).toBeCloseTo(result.gpa as number, 10)
  })

  it('满绩缺口相加等于 4 − GPA', () => {
    expect(result.headroomTotal).toBeCloseTo(4 - 3.4375, 10)
    expect(result.courses[0].headroom).toBeCloseTo(0.5, 10)
    expect(result.courses[1].headroom).toBeCloseTo(0.0625, 10)
  })
})

describe('权重与贡献的性质', () => {
  it('权重之和为 1，贡献之和等于总 GPA', () => {
    const result = computeGpa([
      course({ creditsText: '5', scoreText: '82' }),
      course({ creditsText: '3.5', scoreText: '77' }),
      course({ creditsText: '0.5', scoreText: '100' }),
    ])
    expect(result.weightSum).toBeCloseTo(1, 12)
    expect(result.contributionSum).toBeCloseTo(result.gpa as number, 12)
  })

  it('单门课程时总 GPA 等于该课程绩点', () => {
    const result = computeGpa([course({ creditsText: '2.5', scoreText: '73' })])
    expect(result.gpa).toBeCloseTo(g(73), 12)
    expect(result.courses[0].weight).toBeCloseTo(1, 12)
  })

  it('学分改变后所有结果同步重算', () => {
    const before = computeGpa([
      course({ name: 'A', creditsText: '4', scoreText: '80' }),
      course({ name: 'B', creditsText: '2', scoreText: '90' }),
    ])
    const after = computeGpa([
      course({ name: 'A', creditsText: '8', scoreText: '80' }),
      course({ name: 'B', creditsText: '2', scoreText: '90' }),
    ])
    const expected = (8 * g(80) + 2 * g(90)) / 10
    expect(after.gpa).toBeCloseTo(expected, 12)
    expect(after.courses[0].weight).toBeCloseTo(0.8, 12)
    expect(after.totalCredits).toBe(10)
    expect(before.gpa).not.toBeCloseTo(after.gpa as number, 6)
    expect(after.contributionSum).toBeCloseTo(after.gpa as number, 12)
  })

  it('排除课程后分母与所有权重同步变化', () => {
    const all = computeGpa([
      course({ name: 'A', creditsText: '4', scoreText: '80' }),
      course({ name: 'B', creditsText: '2', scoreText: '90' }),
    ])
    const withoutB = computeGpa([
      course({ name: 'A', creditsText: '4', scoreText: '80' }),
      course({ name: 'B', creditsText: '2', scoreText: '90', included: false }),
    ])
    expect(withoutB.totalCredits).toBe(4)
    expect(withoutB.gpa).toBeCloseTo(g(80), 12)
    expect(withoutB.courses[0].weight).toBeCloseTo(1, 12)
    expect(withoutB.excludedCount).toBe(1)
    expect(all.totalCredits).toBe(6)
  })
})

describe('空成绩、零分与无效输入', () => {
  it('零分是有效成绩，会参与计算', () => {
    const result = computeGpa([course({ creditsText: '4', scoreText: '0' })])
    expect(result.hasData).toBe(true)
    expect(result.gpa).toBe(0)
    expect(result.courses[0].usable).toBe(true)
  })

  it('空成绩不参与计算，并被说明原因', () => {
    const result = computeGpa([
      course({ name: 'A', creditsText: '4', scoreText: '' }),
      course({ name: 'B', creditsText: '2', scoreText: '90' }),
    ])
    expect(result.courses[0].usable).toBe(false)
    expect(result.courses[0].reason).toContain('缺成绩')
    expect(result.totalCredits).toBe(2)
    expect(result.gpa).toBeCloseTo(g(90), 12)
    expect(result.invalidCount).toBe(1)
  })

  it('空学分不参与计算', () => {
    const result = computeGpa([course({ creditsText: '', scoreText: '80' })])
    expect(result.hasData).toBe(false)
    expect(result.courses[0].reason).toContain('缺学分')
  })

  it('非法与越界输入被判为无效', () => {
    expect(parseCredits('abc').issue).toBe('invalid')
    expect(parseCredits('0').issue).toBe('range')
    expect(parseCredits('-1').issue).toBe('range')
    expect(parseScore('101').issue).toBe('range')
    expect(parseScore('-0.5').issue).toBe('range')
    expect(parseScore('0').value).toBe(0)
    expect(parseScore('').issue).toBe('empty')
  })

  it('空列表、全部排除、无有效成绩：结果为「无数据」而不是 0', () => {
    for (const courses of [
      [] as CourseRecord[],
      [course({ included: false })],
      [course({ scoreText: '' }), course({ creditsText: '' })],
    ]) {
      const result = computeGpa(courses)
      expect(result.hasData).toBe(false)
      expect(result.gpa).toBeNull()
      expect(result.targetGpa).toBeNull()
      expect(result.delta).toBeNull()
      expect(Number.isNaN(result.totalCredits)).toBe(false)
      expect(result.plusFive).toHaveLength(0)
    }
  })

  it('59→60 的跨及格线变化按公式真实反映', () => {
    const result = computeGpa([
      course({ name: 'A', creditsText: '4', scoreText: '59', targetText: '60' }),
      course({ name: 'B', creditsText: '4', scoreText: '80' }),
    ])
    // 4/8 × (1 − 0) = 0.5
    expect(result.courses[0].deltaGpa).toBeCloseTo(0.5, 12)
    expect(result.delta).toBeCloseTo(0.5, 12)
    expect(result.gpa).toBeCloseTo(((4 * 0 + 4 * 3.25) / 8), 12)
    expect(result.targetGpa).toBeCloseTo(((4 * 1 + 4 * 3.25) / 8), 12)
  })
})

describe('假设成绩与提分实验', () => {
  it('只改一门时 ΔGPA = c_i/C × [g(新) − g(旧)]', () => {
    const result = computeGpa([
      course({ name: 'A', creditsText: '4', scoreText: '80', targetText: '85' }),
      course({ name: 'B', creditsText: '2', scoreText: '90' }),
    ])
    const expected = (4 / 6) * (g(85) - g(80))
    expect(result.courses[0].deltaGpa).toBeCloseTo(expected, 12)
    expect(result.delta).toBeCloseTo(expected, 12)
  })

  it('多门同时修改时，总变化与逐门之和一致（分母不变）', () => {
    const result = computeGpa([
      course({ name: 'A', creditsText: '4', scoreText: '80', targetText: '85' }),
      course({ name: 'B', creditsText: '2', scoreText: '90', targetText: '88' }),
      course({ name: 'C', creditsText: '2', scoreText: '60', targetText: '61' }),
    ])
    const sum = result.courses.reduce((acc, c) => acc + (c.deltaGpa ?? 0), 0)
    expect(result.delta).toBeCloseTo(sum, 12)
    expect(result.targetGpa).toBeCloseTo((result.gpa as number) + (result.delta as number), 12)
  })

  it('假设成绩超出 100 会被截断，并在 plusFive 里体现实际增加分数', () => {
    const result = computeGpa([
      course({ name: 'A', creditsText: '4', scoreText: '98' }),
      course({ name: 'B', creditsText: '2', scoreText: '90' }),
    ])
    const row = result.plusFive.find((item) => item.name === 'A')
    expect(row?.toScore).toBe(100)
    expect(row?.added).toBe(2)
    expect(row?.delta).toBeCloseTo((4 / 6) * (4 - g(98)), 12)
  })

  it('假设成绩页面输入 105 会按 100 计', () => {
    const result = computeGpa([course({ creditsText: '4', scoreText: '80', targetText: '105' })])
    expect(result.courses[0].target).toBe(100)
    expect(result.targetGpa).toBeCloseTo(4, 12)
    expect(parseTargetScore('105').value).toBe(100)
  })

  it('「各科分别提高 5 分」按增益排序，且每行只改自己那一门', () => {
    const result = computeGpa([
      course({ name: 'A', creditsText: '4', scoreText: '80' }),
      course({ name: 'B', creditsText: '2', scoreText: '90' }),
      course({ name: 'C', creditsText: '1', scoreText: '60' }),
    ])
    const rows = result.plusFive
    // 增益最大的是 A（学分大），其次是 C（60 分附近曲线陡），最后是 B（已在高分平台）
    expect(rows.map((r) => r.name)).toEqual(['A', 'C', 'B'])
    for (const row of rows) {
      expect(row.delta).toBeCloseTo(
        ((row.toPoint - row.fromPoint) * creditsOf(result, row.id)) / result.totalCredits,
        12,
      )
    }
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i - 1].delta).toBeGreaterThanOrEqual(rows[i].delta)
    }
  })

  it('学分不同、成绩相同：同样提 5 分的 ΔGPA 之比等于学分之比', () => {
    const result = computeGpa([
      course({ name: '重', creditsText: '6', scoreText: '80' }),
      course({ name: '轻', creditsText: '1', scoreText: '80' }),
    ])
    const heavy = result.plusFive.find((row) => row.name === '重')
    const light = result.plusFive.find((row) => row.name === '轻')
    expect(heavy).toBeDefined()
    expect(light).toBeDefined()
    expect((heavy as { delta: number }).delta / (light as { delta: number }).delta).toBeCloseTo(6, 9)
  })
})

function creditsOf(result: ReturnType<typeof computeGpa>, id: string): number {
  return result.courses.find((course) => course.id === id)?.credits ?? 0
}

describe('格式化', () => {
  it('只在显示时舍入，并去掉尾随零', () => {
    expect(fmtNumber(3.4375)).toBe('3.4375')
    expect(fmtNumber(3.25)).toBe('3.25')
    expect(fmtNumber(4)).toBe('4')
    expect(fmtNumber(null)).toBe('—')
    expect(fmtNumber(4 / 3, 3)).toBe('1.333')
  })

  it('变化量带符号，零不带符号', () => {
    expect(fmtDelta(0.0625)).toBe('+0.0625')
    expect(fmtDelta(-0.15)).toBe('−0.15')
    expect(fmtDelta(0)).toBe('0')
    expect(fmtDelta(null)).toBe('—')
  })

  it('百分比两位整理', () => {
    expect(fmtPercent(4 / 6)).toBe('66.7%')
    expect(fmtPercent(0.25)).toBe('25.0%')
  })
})
