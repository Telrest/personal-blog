import type { ReactNode } from 'react'
import {
  changeWord,
  fmtDelta,
  fmtNumber,
  fmtPercent,
  type CourseResult,
  type GpaResult,
} from './model'
import { courseColor, VIEW_INFO, type GpaView } from './content'

const SCALE_WIDTH = 1000

/* ------------------------------------------------------------------ 刻度条 */

interface ScaleSegment {
  id: string
  value: number
  color: string
  /** 选中其他课程时变淡 */
  dimmed?: boolean
  selected?: boolean
}

interface ScaleBarProps {
  segments: ScaleSegment[]
  max: number
  /** 等距刻度值，用于画竖线；标签在下方 HTML 里 */
  ticks?: number[]
  /** 竖线标记（例如总 GPA） */
  marker?: number | null
  height?: number
  ariaLabel: string
}

/** 固定标尺的堆叠条：0 在左，max 在右，刻度不随数据缩放 */
function ScaleBar({ segments, max, ticks = [], marker = null, height = 30, ariaLabel }: ScaleBarProps) {
  let cursor = 0
  const rects = segments.map((segment) => {
    const width = Math.max(0, (segment.value / max) * SCALE_WIDTH)
    const x = cursor
    cursor += width
    return { ...segment, x, width }
  })

  return (
    <svg
      className="gpa-scale"
      viewBox={`0 0 ${SCALE_WIDTH} 40`}
      preserveAspectRatio="none"
      height={height}
      role="img"
      aria-label={ariaLabel}
    >
      <rect x={0} y={0} width={SCALE_WIDTH} height={40} className="gpa-scale__track" />
      {rects.map((rect) => (
        <rect
          key={rect.id}
          x={rect.x}
          y={0}
          width={rect.width}
          height={40}
          fill={rect.color}
          opacity={rect.dimmed ? 0.28 : 1}
          className={rect.selected ? 'gpa-scale__segment is-selected' : 'gpa-scale__segment'}
        />
      ))}
      {ticks.map((tick) => (
        <line
          key={tick}
          x1={(tick / max) * SCALE_WIDTH}
          x2={(tick / max) * SCALE_WIDTH}
          y1={0}
          y2={40}
          className="gpa-scale__tick"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {marker !== null && (
        <line
          x1={(Math.min(max, Math.max(0, marker)) / max) * SCALE_WIDTH}
          x2={(Math.min(max, Math.max(0, marker)) / max) * SCALE_WIDTH}
          y1={-4}
          y2={44}
          className="gpa-scale__marker"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  )
}

interface ScaleAxisProps {
  ticks: number[]
  format: (value: number) => string
  caption?: ReactNode
}

function ScaleAxis({ ticks, format, caption }: ScaleAxisProps) {
  return (
    <div className="gpa-axis">
      <div className="gpa-axis__ticks">
        {ticks.map((tick) => (
          <span key={tick} className="gpa-axis__tick">
            {format(tick)}
          </span>
        ))}
      </div>
      {caption && <p className="gpa-axis__caption">{caption}</p>}
    </div>
  )
}

/* ------------------------------------------------------------------ 行 */

interface CourseRowProps {
  course: CourseResult
  color: string
  index: number
  selected: boolean
  onSelect: () => void
  stat: ReactNode
  bar: ReactNode
  footnote?: ReactNode
}

function CourseRow({ course, color, index, selected, onSelect, stat, bar, footnote }: CourseRowProps) {
  return (
    <li>
      <button
        type="button"
        className={`gpa-row${selected ? ' is-active' : ''}${course.usable ? '' : ' is-inactive'}`}
        aria-pressed={selected}
        onClick={onSelect}
      >
        <span className="gpa-row__head">
          <span className="gpa-row__swatch" style={{ background: color }} aria-hidden="true">
            {index + 1}
          </span>
          <span className="gpa-row__name">{course.name}</span>
          <span className="gpa-row__stat">{stat}</span>
        </span>
        <span className="gpa-row__bar">{bar}</span>
        {footnote && <span className="gpa-row__note">{footnote}</span>}
      </button>
    </li>
  )
}

/** 行内条形：用 HTML 而不是缩放过的 SVG，文字与条形不会互相拉伸 */
function RowBar({
  value,
  max,
  color,
  markerAt,
}: {
  value: number
  max: number
  color: string
  markerAt?: number | null
}) {
  const pct = (v: number) => `${Math.max(0, Math.min(1, max === 0 ? 0 : v / max)) * 100}%`
  return (
    <span className="gpa-bar" aria-hidden="true">
      <span className="gpa-bar__fill" style={{ width: pct(value), background: color }} />
      {markerAt !== undefined && markerAt !== null && (
        <span className="gpa-bar__marker" style={{ left: pct(markerAt) }} />
      )}
    </span>
  )
}

/* ------------------------------------------------------------------ 视图 */

interface ViewProps {
  result: GpaResult
  selectedId: string | null
  onSelect: (id: string | null) => void
  focusId?: string | null
}

/** 导览的 focus 可能是 all，表示整条；这时不做任何压暗 */
function activeIdOf(selectedId: string | null, focusId?: string | null): string | null {
  const focus = focusId && focusId !== 'all' ? focusId : null;
  return selectedId ?? focus;
}

function usableCourses(result: GpaResult): CourseResult[] {
  return result.courses.filter((course) => course.usable)
}

function noDataBlock() {
  return (
    <div className="gpa-empty" role="status">
      <p className="gpa-empty__title">暂无可计算数据</p>
      <p className="gpa-empty__body">
        至少需要一门课程同时填好「学分」和「成绩」，才会算出 GPA。只填一项不算，分数为 0 也算有效。
      </p>
    </div>
  )
}

/** 视图一：学分权重 */
function WeightView({ result, selectedId, onSelect, focusId }: ViewProps) {
  if (!result.hasData) return noDataBlock()
  const rows = usableCourses(result)
  const active = activeIdOf(selectedId, focusId)
  const activeCourse = rows.find((row) => row.id === active) ?? null
  const maxWeight = Math.max(...rows.map((row) => row.weight ?? 0), 1e-9)

  return (
    <div className="gpa-view">
      <ScaleBar
        ariaLabel={`学分权重合计 100%，${rows.length} 门课`}
        max={1}
        ticks={[0, 0.25, 0.5, 0.75, 1]}
        segments={rows.map((row) => ({
          id: row.id,
          value: row.weight ?? 0,
          color: courseColor(row.colorIndex),
          dimmed: Boolean(active && active !== row.id),
          selected: active === row.id,
        }))}
      />
      <ScaleAxis
        ticks={[0, 0.25, 0.5, 0.75, 1]}
        format={(value) => `${Math.round(value * 100)}%`}
        caption={
          activeCourse ? (
            <>
              「{activeCourse.name}」{fmtNumber(activeCourse.credits, 2)} 学分 ÷ 总学分{' '}
              {fmtNumber(result.totalCredits, 2)} ={' '}
              <strong>{fmtPercent(activeCourse.weight, 1)}</strong>。权重只看学分，和这门课考多少分无关。
            </>
          ) : (
            <>
              {rows.length} 门课共 {fmtNumber(result.totalCredits, 2)} 学分，每一门的权重 = 它的学分 ÷
              总学分。权重只看学分，和考多少分无关。
            </>
          )
        }
      />

      <ol className="gpa-rows">
        {result.courses.map((course, index) => (
          <CourseRow
            key={course.id}
            course={course}
            index={index}
            color={courseColor(course.colorIndex)}
            selected={selectedId === course.id}
            onSelect={() => onSelect(selectedId === course.id ? null : course.id)}
            stat={
              course.usable ? (
                <>
                  <span className="gpa-row__num">{fmtNumber(course.credits, 2)} 学分</span>
                  <span className="gpa-row__hl">{fmtPercent(course.weight, 1)}</span>
                </>
              ) : (
                <span className="gpa-row__muted">{course.reason}</span>
              )
            }
            bar={
              <RowBar
                value={course.weight ?? 0}
                max={maxWeight}
                color={courseColor(course.colorIndex)}
              />
            }
          />
        ))}
      </ol>
      <p className="gpa-view__foot">
        逐条条形按本视图最大值等比缩放；数值以文字为准。不参与计算的课程保留在列表里，便于随时改回来。
      </p>
    </div>
  )
}

/** 视图二：当前贡献 */
function ContributionView({ result, selectedId, onSelect, focusId }: ViewProps) {
  if (!result.hasData) return noDataBlock()
  const rows = usableCourses(result)
  const active = activeIdOf(selectedId, focusId)
  const maxQ = Math.max(...rows.map((row) => row.contribution ?? 0), 1e-9)
  const gpa = result.gpa ?? 0

  return (
    <div className="gpa-view">
      <ScaleBar
        ariaLabel={`贡献相加等于总 GPA ${fmtNumber(gpa)}，满分 4`}
        max={4}
        ticks={[0, 1, 2, 3, 4]}
        marker={gpa}
        segments={rows.map((row) => ({
          id: row.id,
          value: row.contribution ?? 0,
          color: courseColor(row.colorIndex),
          dimmed: Boolean(active && active !== row.id),
          selected: active === row.id,
        }))}
      />
      <ScaleAxis
        ticks={[0, 1, 2, 3, 4]}
        format={(value) => fmtNumber(value, 1)}
        caption={
          <>
            这条 0–4 的标尺固定不动。所有 q<sub>i</sub> 加起来正好是总 GPA：
            <strong> {fmtNumber(gpa)}</strong>（竖线位置）。单位是绩点，不是百分比。
          </>
        }
      />

      <ol className="gpa-rows">
        {result.courses.map((course, index) => {
          const dimmed = Boolean(active && active !== course.id)
          return (
            <CourseRow
              key={course.id}
              course={course}
              index={index}
              color={courseColor(course.colorIndex)}
              selected={selectedId === course.id}
              onSelect={() => onSelect(selectedId === course.id ? null : course.id)}
              stat={
                course.usable ? (
                  <>
                    <span className="gpa-row__num">绩点 {fmtNumber(course.gradePoint)}</span>
                    <span className="gpa-row__hl">贡献 {fmtNumber(course.contribution)}</span>
                  </>
                ) : (
                  <span className="gpa-row__muted">{course.reason}</span>
                )
              }
              bar={
                <RowBar
                  value={course.contribution ?? 0}
                  max={maxQ}
                  color={courseColor(course.colorIndex)}
                />
              }
              footnote={
                dimmed && course.usable
                  ? `学分权重 ${fmtPercent(course.weight, 1)} · 乘上绩点 ${fmtNumber(course.gradePoint)} 就是它的贡献`
                  : undefined
              }
            />
          )
        })}
      </ol>
      <p className="gpa-view__foot">
        零贡献的课程（例如 0 分或成绩未填）仍然留在上面，只是条形长度为 0。
      </p>
    </div>
  )
}

/** 视图三：提分实验 */
function TargetView({ result, selectedId, onSelect, focusId }: ViewProps) {
  if (!result.hasData) return noDataBlock()
  const rows = usableCourses(result)
  const maxQ = Math.max(...rows.map((row) => Math.max(row.contribution ?? 0, row.targetContribution ?? 0)), 1e-9)
  const changed = rows.filter((row) => row.targetChanged)
  const maxDelta = Math.max(...result.plusFive.map((row) => row.delta), 1e-9)
  const delta = result.delta ?? 0

  return (
    <div className="gpa-view">
      <div className="gpa-target-head">
        <p className="gpa-target-head__line">
          原始 <strong>{fmtNumber(result.gpa)}</strong> → 假设 <strong>{fmtNumber(result.targetGpa)}</strong>
          ，<span className={`gpa-delta gpa-delta--${delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'}`}>
            {changeWord(delta)} {fmtDelta(delta)}
          </span>
        </p>
        <p className="gpa-target-head__note">
          {changed.length === 0
            ? '还没有设假设成绩。在下面的课程列表里改「假设成绩」，或看下面「各科分别提高 5 分」。'
            : `同时改了 ${changed.length} 门课，上面显示的是全部改完之后的联合结果。`}
        </p>
      </div>

      <ol className="gpa-rows">
        {result.courses.map((course, index) => {
          const deltaForRow = course.deltaGpa ?? 0
          return (
            <CourseRow
              key={course.id}
              course={course}
              index={index}
              color={courseColor(course.colorIndex)}
              selected={selectedId === course.id}
              onSelect={() => onSelect(selectedId === course.id ? null : course.id)}
              stat={
                course.usable ? (
                  <>
                    <span className="gpa-row__num">
                      {course.targetChanged
                        ? `绩点 ${fmtNumber(course.gradePoint)} → ${fmtNumber(course.targetPoint)}`
                        : `绩点 ${fmtNumber(course.gradePoint)}`}
                    </span>
                    <span className={`gpa-row__hl gpa-delta--${deltaForRow > 0 ? 'up' : deltaForRow < 0 ? 'down' : 'flat'}`}>
                      ΔGPA {fmtDelta(deltaForRow)}
                    </span>
                  </>
                ) : (
                  <span className="gpa-row__muted">{course.reason}</span>
                )
              }
              bar={
                <RowBar
                  value={course.contribution ?? 0}
                  max={maxQ}
                  color={courseColor(course.colorIndex)}
                  markerAt={course.targetContribution}
                />
              }
              footnote={
                course.targetChanged
                  ? `贡献 ${fmtNumber(course.contribution)} → ${fmtNumber(course.targetContribution)}（刻度上的竖线是假设位置）`
                  : index === 0
                    ? '没有改假设成绩的课程，条形与竖线重合'
                    : undefined
              }
            />
          )
        })}
      </ol>

      <section className="gpa-plus5" aria-label="各科分别提高 5 分的比较">
        <h3 className="gpa-plus5__title">各科分别提高 5 分</h3>
        <p className="gpa-plus5__note">
          每次只改一门，其他保持原始成绩；超过 100 分按 100 计。这里只说明「同样 +5 分对总 GPA 的影响」，
          不是投入产出比，也不代表该把时间花在哪门课上。
        </p>
        {result.plusFive.length === 0 ? (
          <p className="gpa-plus5__empty">没有可比较的课程。</p>
        ) : (
          <ol className="gpa-plus5__list">
            {result.plusFive.map((row, index) => (
              <li
                key={row.id}
                className={`gpa-plus5__item${focusId === row.id ? ' is-focus' : ''}`}
              >
                <span className="gpa-plus5__rank">{index + 1}</span>
                <span className="gpa-plus5__name">
                  <span
                    className="gpa-row__swatch gpa-row__swatch--sm"
                    style={{ background: courseColor(row.colorIndex) }}
                    aria-hidden="true"
                  />
                  {row.name}
                </span>
                <span className="gpa-plus5__score">
                  {fmtNumber(row.fromScore)} → {fmtNumber(row.toScore)}
                  <span className="gpa-plus5__added">（+{fmtNumber(row.added)}）</span>
                </span>
                <span className="gpa-plus5__delta">{fmtDelta(row.delta)}</span>
                <span className="gpa-plus5__bar">
                  <RowBar value={row.delta} max={maxDelta} color={courseColor(row.colorIndex)} />
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}

/** 视图四：满绩差距 */
function HeadroomView({ result, selectedId, onSelect, focusId }: ViewProps) {
  if (!result.hasData) return noDataBlock()
  const rows = usableCourses(result)
  const active = activeIdOf(selectedId, focusId)
  const maxD = Math.max(...rows.map((row) => row.headroom ?? 0), 1e-9)
  const gpa = result.gpa ?? 0
  const headroom = result.headroomTotal ?? 0

  return (
    <div className="gpa-view">
      <ScaleBar
        ariaLabel={`已获得 ${fmtNumber(gpa)} 绩点，离满绩还差 ${fmtNumber(headroom)} 绩点`}
        max={4}
        ticks={[0, 1, 2, 3, 4]}
        marker={gpa}
        segments={[
          { id: 'gained', value: gpa, color: 'var(--rule)' },
          ...rows.map((row) => ({
            id: row.id,
            value: row.headroom ?? 0,
            color: courseColor(row.colorIndex),
            dimmed: Boolean(active && active !== row.id),
            selected: active === row.id,
          })),
        ]}
      />
      <ScaleAxis
        ticks={[0, 1, 2, 3, 4]}
        format={(value) => fmtNumber(value, 1)}
        caption={
          <>
            浅色段是已经拿到的 <strong>{fmtNumber(gpa)}</strong>，彩色段是各门课还能补的缺口，加起来是{' '}
            <strong>{fmtNumber(headroom)}</strong> = 4 − {fmtNumber(gpa)}。它和上面的「当前贡献」是两件事。
          </>
        }
      />

      <ol className="gpa-rows">
        {result.courses.map((course, index) => (
          <CourseRow
            key={course.id}
            course={course}
            index={index}
            color={courseColor(course.colorIndex)}
            selected={selectedId === course.id}
            onSelect={() => onSelect(selectedId === course.id ? null : course.id)}
            stat={
              course.usable ? (
                <>
                  <span className="gpa-row__num">绩点 {fmtNumber(course.gradePoint)}</span>
                  <span className="gpa-row__hl">还差 {fmtNumber(course.headroom)}</span>
                </>
              ) : (
                <span className="gpa-row__muted">{course.reason}</span>
              )
            }
            bar={
              <RowBar value={course.headroom ?? 0} max={maxD} color={courseColor(course.colorIndex)} />
            }
          />
        ))}
      </ol>
      <p className="gpa-view__foot">
        满绩差距算的是 c<sub>i</sub> × [4 − g(s<sub>i</sub>)] / C：学分越大、绩点越低，缺口越大。
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ 面板 */

interface ChartPanelProps {
  result: GpaResult
  view: GpaView
  selectedId: string | null
  onSelect: (id: string | null) => void
  focusId?: string | null
}

export function ChartPanel({ result, view, selectedId, onSelect, focusId }: ChartPanelProps) {
  const info = VIEW_INFO[view]
  const View =
    view === 'weight'
      ? WeightView
      : view === 'contribution'
        ? ContributionView
        : view === 'target'
          ? TargetView
          : HeadroomView

  return (
    <section className="gpa-chart" aria-label={`${info.label}图表`}>
      <header className="gpa-chart__head">
        <div>
          <p className="gpa-chart__eyebrow">视图</p>
          <h2 className="gpa-chart__title">{info.label}</h2>
        </div>
        <p className="gpa-chart__formula mono">{info.formula}</p>
      </header>
      <p className="gpa-chart__hint">{info.hint}</p>
      <View result={result} selectedId={selectedId} onSelect={onSelect} focusId={focusId} />
    </section>
  )
}
