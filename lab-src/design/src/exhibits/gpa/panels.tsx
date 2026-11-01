import {
  changeWord,
  fmtDelta,
  fmtNumber,
  fmtPercent,
  type CourseResult,
  type GpaResult,
  type GradeRule,
} from './model'
import { COPY, FORMULAS } from './content'

/* ------------------------------------------------------------------ 顶部 */

interface SummaryProps {
  result: GpaResult
  sample: boolean
  saved: boolean
  restored: boolean
}

export function GpaSummary({ result, sample, saved, restored }: SummaryProps) {
  const delta = result.delta
  const tone = delta === null ? 'flat' : delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'

  return (
    <section className="gpa-summary" aria-label="GPA 概览">
      <div className="gpa-summary__grid">
        <div className="gpa-metric">
          <p className="gpa-metric__label">原始 GPA</p>
          <p className="gpa-metric__value mono">{result.hasData ? fmtNumber(result.gpa) : '—'}</p>
          <p className="gpa-metric__note">
            {result.hasData ? `按原始成绩加权，满分 ${result.rule.maxGradePoint}` : COPY.noDataTitle}
          </p>
        </div>

        <div className="gpa-metric">
          <p className="gpa-metric__label">假设 GPA</p>
          <p className="gpa-metric__value mono">{result.hasData ? fmtNumber(result.targetGpa) : '—'}</p>
          <p className="gpa-metric__note">
            {result.hasData
              ? result.courses.some((course) => course.targetChanged)
                ? '把假设成绩全部代入后的结果'
                : '还没改假设成绩，与原始相同'
              : COPY.noDataTitle}
          </p>
        </div>

        <div className="gpa-metric">
          <p className="gpa-metric__label">变化量</p>
          <p className={`gpa-metric__value mono gpa-delta--${tone}`}>
            {result.hasData ? fmtDelta(delta) : '—'}
          </p>
          <p className="gpa-metric__note">{result.hasData ? changeWord(delta) : '—'}</p>
        </div>

        <div className="gpa-metric">
          <p className="gpa-metric__label">参与计算的总学分</p>
          <p className="gpa-metric__value mono">{result.hasData ? fmtNumber(result.totalCredits, 2) : '—'}</p>
          <p className="gpa-metric__note">
            {result.usable.length} 门课计入
            {result.excludedCount > 0 ? ` · ${result.excludedCount} 门已排除` : ''}
            {result.invalidCount > 0 ? ` · ${result.invalidCount} 门待补全` : ''}
          </p>
        </div>
      </div>

      <div className="gpa-summary__foot">
        <span className="gpa-check-line">
          {result.hasData ? (
            <>
              Σw<sub>i</sub> = <span className="mono">{result.weightSum.toFixed(4)}</span>
              <span className="gpa-check-line__ok">（应为 1）</span>
              <span className="gpa-check-line__sep" aria-hidden="true">
                ·
              </span>
              Σq<sub>i</sub> = <span className="mono">{fmtNumber(result.contributionSum, 4)}</span>
              <span className="gpa-check-line__ok">（= 总 GPA）</span>
            </>
          ) : (
            '还没有可以计算的数据'
          )}
        </span>
        <span className="gpa-summary__badges">
          {sample && <span className="gpa-badge gpa-badge--sample">{COPY.sampleBadge}</span>}
          {restored && !sample && <span className="gpa-badge">{COPY.savedBadge}</span>}
          {!saved && restored && <span className="gpa-badge gpa-badge--warn">保存失败：浏览器拒绝了本地存储</span>}
        </span>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ 侧栏 */

interface SidePanelProps {
  result: GpaResult
  selected: CourseResult | null
  rule: GradeRule
}

export function GpaSidePanel({ result, selected, rule }: SidePanelProps) {
  return (
    <div className="gpa-side">
      <section className="gpa-side__block">
        <h2 className="gpa-side__title">这门课怎么了</h2>
        {selected ? (
          <CourseExplanation course={selected} result={result} />
        ) : (
          <p className="gpa-side__hint">
            点图表里的任一条，或上面课程列表的编号，就会在这里展开它的算法：权重、绩点、贡献、提分影响各是多少。
          </p>
        )}
      </section>

      <section className="gpa-side__block gpa-side__block--rule">
        <h2 className="gpa-side__title">当前规则</h2>
        <p className="gpa-side__rule">{rule.name}</p>
        <p className="gpa-side__hint">
          只对普通百分制课程有效；通过/不通过、缓考、重修等特殊记分方式不套用。具体范围以本人学校规定为准。
        </p>
        <a className="gpa-side__link" href={rule.sourceUrl} target="_blank" rel="noreferrer noopener">
          查看公开依据 ↗
        </a>
      </section>
    </div>
  )
}

interface CourseExplanationProps {
  course: CourseResult
  result: GpaResult
}

function CourseExplanation({ course, result }: CourseExplanationProps) {
  if (!course.usable) {
    return (
      <div className="gpa-explain">
        <p className="gpa-explain__name">{course.name}</p>
        <p className="gpa-explain__body">
          这门课现在不参与计算：{course.reason}。它仍然留在列表里，补全之后会自动回到计算中。
        </p>
      </div>
    )
  }

  const plus5 = result.plusFive.find((row) => row.id === course.id)

  return (
    <div className="gpa-explain">
      <p className="gpa-explain__name">{course.name}</p>

      <p className="gpa-explain__body">
        它占参与计算总学分（<span className="mono">{fmtNumber(result.totalCredits, 2)}</span>）的{' '}
        <strong className="mono">{fmtPercent(course.weight, 1)}</strong>，权重只看学分。
      </p>

      <p className="gpa-explain__body">
        原始成绩 <span className="mono">{fmtNumber(course.score)}</span> 分 → 课程绩点{' '}
        <strong className="mono">{fmtNumber(course.gradePoint)}</strong>；它给总 GPA 贡献{' '}
        <strong className="mono">{fmtNumber(course.contribution)}</strong> 绩点（单位是绩点，不是百分比）。
      </p>

      {course.targetChanged ? (
        <p className="gpa-explain__body">
          假设成绩 <span className="mono">{fmtNumber(course.target)}</span> 分：绩点{' '}
          <span className="mono">{fmtNumber(course.gradePoint)}</span> →{' '}
          <span className="mono">{fmtNumber(course.targetPoint)}</span>，贡献{' '}
          <span className="mono">{fmtNumber(course.targetContribution)}</span>，总 GPA{' '}
          <span className="mono">{fmtNumber(result.gpa)}</span> →{' '}
          <span className="mono">{fmtNumber(result.targetGpa)}</span>（
          <span className={`mono gpa-delta--${(course.deltaGpa ?? 0) >= 0 ? 'up' : 'down'}`}>
            {fmtDelta(course.deltaGpa)}
          </span>
          ）。
        </p>
      ) : (
        plus5 && (
          <p className="gpa-explain__body">
            如果只把这门课从 <span className="mono">{fmtNumber(plus5.fromScore)}</span> 提到{' '}
            <span className="mono">{fmtNumber(plus5.toScore)}</span>（+{fmtNumber(plus5.added)} 分），
            总 GPA 变化 <strong className="mono">{fmtDelta(plus5.delta)}</strong>。
          </p>
        )
      )}

      <p className="gpa-explain__note">
        离满分绩点还差 <span className="mono">{fmtNumber(course.headroom)}</span> 绩点的缺口——这是「还能拿到多少」，
        和上面的「已经贡献多少」是两件事。
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ 底部 */

interface RuleSectionProps {
  rule: GradeRule
}

export function GpaRuleSection({ rule }: RuleSectionProps) {
  return (
    <section className="gpa-rule" aria-label="规则与依据">
      <div className="gpa-rule__grid">
        <div className="gpa-rule__block">
          <h2 className="gpa-rule__title">{COPY.ruleTitle}</h2>
          <p className="gpa-rule__rule">{rule.name}</p>
          <ul className="gpa-rule__formula">
            {rule.formula.map((line) => (
              <li key={line} className="mono">
                {line}
              </li>
            ))}
          </ul>
          <p className="gpa-rule__body">{rule.scopeNote}</p>
          <p className="gpa-rule__source">
            <span>参考依据：</span>
            <a href={rule.sourceUrl} target="_blank" rel="noreferrer noopener">
              {rule.sourceLabel}
            </a>
          </p>
        </div>

        <div className="gpa-rule__block">
          <h2 className="gpa-rule__title">{COPY.formulaTitle}</h2>
          <dl className="gpa-formulas">
            {FORMULAS.map((item) => (
              <div className="gpa-formulas__row" key={item.label}>
                <dt>{item.label}</dt>
                <dd>
                  <span className="mono">{item.text}</span>
                  <span className="gpa-formulas__note">{item.note}</span>
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="gpa-rule__block gpa-rule__block--meta">
          <h2 className="gpa-rule__title">关于数据</h2>
          <ul className="gpa-rule__list">
            <li>课程与成绩只保存在这台设备的浏览器本地（localStorage），不上传、没有后端。</li>
            <li>换浏览器或清空站点数据会丢失，需要自己导出 JSON 备份。</li>
            <li>GPA 用完整精度计算，只在显示时舍入。</li>
            <li>空成绩与 0 分是两回事：空表示没填，0 分是有效成绩、会拉低 GPA。</li>
            <li>本页不生成任何学习建议，也不预测个人成绩。</li>
          </ul>
        </div>
      </div>
    </section>
  )
}
