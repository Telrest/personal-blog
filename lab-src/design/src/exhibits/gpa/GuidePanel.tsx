import { useMemo, useState } from 'react'
import { StepGuide } from '../../components/guide/StepGuide'
import { ChartPanel } from './charts'
import { GUIDE_COURSES, GUIDE_STEPS } from './content'
import { computeGpa, fmtNumber } from './model'
import { GpaSummary } from './panels'

interface GpaGuideProps {
  onExit: () => void
}

/**
 * 「带我看懂」。
 *
 * 用一个独立的小例子（三门课）讲清「分数→绩点→学分权重→加权」，
 * 完全不碰用户保存的课程：这份示例在内存里，退出导览后用户的课程原样还在。
 */
export function GpaGuide({ onExit }: GpaGuideProps) {
  const [index, setIndex] = useState(0)
  const [picked, setPicked] = useState<string | null>(null)
  const result = useMemo(() => computeGpa(GUIDE_COURSES), [])
  const step = GUIDE_STEPS[index] ?? GUIDE_STEPS[0]

  const goTo = (next: number) => {
    setPicked(null)
    setIndex(next)
  }

  return (
    <div className="gpa-guide">
      <div className="gpa-guide__banner">
        <StepGuide
          steps={GUIDE_STEPS}
          index={index}
          onIndexChange={goTo}
          onExit={onExit}
        />
        <p className="gpa-guide__note">
          导览用的是独立示例（三门课），不会读到或改动你保存的课程；点「退出导览」或上方的「自由探索」就回到自己的数据。
        </p>
      </div>

      <GpaSummary result={result} sample={false} saved restored={false} />

      <ChartPanel
        result={result}
        view={step.view}
        selectedId={picked}
        onSelect={setPicked}
        focusId={step.focus}
      />

      <div className="gpa-guide__detail">
        <h2 className="gpa-guide__detail-title">这一步的数字</h2>
        <StepNumbers stepId={step.id} result={result} />
      </div>
    </div>
  )
}

type GuideResult = ReturnType<typeof computeGpa>

/** 每一步配一张「算式明细」，数字全部来自同一个计算结果 */
function StepNumbers({ stepId, result }: { stepId: string; result: GuideResult }) {
  const rows = result.courses.filter((course) => course.usable)

  if (stepId === 'grade') {
    return (
      <ul className="gpa-guide__list">
        {rows.map((course) => (
          <li key={course.id}>
            {course.name}：{fmt(course.score)} 分 → 绩点 <strong>{fmt(course.gradePoint)}</strong>
          </li>
        ))}
      </ul>
    )
  }

  if (stepId === 'weight') {
    return (
      <ul className="gpa-guide__list">
        {rows.map((course) => (
          <li key={course.id}>
            {course.name}：{fmt(course.credits)} / {fmt(result.totalCredits)} ={' '}
            <strong>{((course.weight ?? 0) * 100).toFixed(1)}%</strong>
          </li>
        ))}
        <li>合计：{(result.weightSum * 100).toFixed(1)}%</li>
      </ul>
    )
  }

  if (stepId === 'weighted') {
    return (
      <ul className="gpa-guide__list">
        {rows.map((course) => (
          <li key={course.id}>
            {course.name}：{fmt(course.credits)} × {fmt(course.gradePoint)} / {fmt(result.totalCredits)} ={' '}
            <strong>{fmt(course.contribution)}</strong> 绩点
          </li>
        ))}
        <li>
          相加：Σq = <strong>{fmt(result.contributionSum)}</strong> = 总 GPA {fmt(result.gpa)}
        </li>
      </ul>
    )
  }

  if (stepId === 'plus5') {
    return (
      <ul className="gpa-guide__list">
        {result.plusFive.map((row) => (
          <li key={row.id}>
            {row.name}：{fmt(row.fromScore)} → {fmt(row.toScore)}（+{fmt(row.added)}），总 GPA{' '}
            <strong>{row.delta >= 0 ? '+' : '−'}{fmt(Math.abs(row.delta))}</strong>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <ul className="gpa-guide__list">
      {rows.map((course) => (
        <li key={course.id}>
          {course.name}：{fmt(course.credits)} × [4 − {fmt(course.gradePoint)}] / {fmt(result.totalCredits)} ={' '}
          <strong>{fmt(course.headroom)}</strong>
        </li>
      ))}
      <li>
        相加：Σd = <strong>{fmt(result.headroomTotal)}</strong> = 4 − {fmt(result.gpa)}
      </li>
    </ul>
  )
}

/** 导览里用同一个格式化函数，避免两处舍入规则不一致 */
const fmt = fmtNumber
