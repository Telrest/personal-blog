import { useRef, type ChangeEvent } from 'react'
import type { CourseRecord } from './model'
import { courseColor } from './content'

interface CourseEditorProps {
  courses: CourseRecord[]
  /** 计算结果的 id 索引，用来显示每门课当前的绩点或问题 */
  statusOf: (id: string) => { label: string; tone: 'ok' | 'warn'; detail?: string }
  selectedId: string | null
  onSelect: (id: string | null) => void
  onChange: (id: string, patch: Partial<CourseRecord>) => void
  onRemove: (id: string) => void
  onAdd: () => void
  onResetTargets: () => void
  onLoadSample: () => void
  onClear: () => void
  onExport: () => void
  onImportFile: (file: File) => void
  notice: { tone: 'error' | 'info'; text: string } | null
  onDismissNotice: () => void
}

const SCORE_STEP = 0.5

export function CourseEditor({
  courses,
  statusOf,
  selectedId,
  onSelect,
  onChange,
  onRemove,
  onAdd,
  onResetTargets,
  onLoadSample,
  onClear,
  onExport,
  onImportFile,
  notice,
  onDismissNotice,
}: CourseEditorProps) {
  const fileRef = useRef<HTMLInputElement | null>(null)

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) onImportFile(file)
    event.target.value = ''
  }

  return (
    <section className="gpa-editor" aria-label="课程列表">
      <header className="gpa-editor__head">
        <div>
          <h2 className="gpa-editor__title">我的课程</h2>
          <p className="gpa-editor__sub">
            共 {courses.length} 门。学分和成绩都可以留空——留空的课程会保留在列表里，只是暂不参与计算。
          </p>
        </div>
        <div className="gpa-editor__tools">
          <button type="button" className="btn btn--primary btn--sm" onClick={onAdd}>
            新增课程
          </button>
          <button type="button" className="btn btn--sm" onClick={onResetTargets}>
            恢复全部假设成绩
          </button>
          <button type="button" className="btn btn--sm" onClick={onExport} disabled={courses.length === 0}>
            导出 JSON
          </button>
          <button type="button" className="btn btn--sm" onClick={() => fileRef.current?.click()}>
            导入 JSON
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="sr-only"
            onChange={handleFile}
            aria-label="选择要导入的 JSON 文件"
          />
          <button type="button" className="btn btn--sm" onClick={onLoadSample}>
            加载示例
          </button>
          <button type="button" className="btn btn--sm btn--quiet" onClick={onClear}>
            清空列表
          </button>
        </div>
      </header>

      {notice && (
        <p className={`gpa-notice gpa-notice--${notice.tone}`} role={notice.tone === 'error' ? 'alert' : 'status'}>
          {notice.text}
          <button type="button" className="gpa-notice__close" onClick={onDismissNotice} aria-label="关闭提示">
            ×
          </button>
        </p>
      )}

      {courses.length === 0 ? (
        <div className="gpa-editor__empty">
          <p>列表里还没有课程。点「新增课程」开始，或者「加载示例」看看怎么用。</p>
        </div>
      ) : (
        <ul className="gpa-courses">
          {courses.map((course, index) => (
            <CourseCard
              key={course.id}
              course={course}
              index={index}
              status={statusOf(course.id)}
              selected={selectedId === course.id}
              onSelect={() => onSelect(selectedId === course.id ? null : course.id)}
              onChange={(patch) => onChange(course.id, patch)}
              onRemove={() => onRemove(course.id)}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

interface CourseCardProps {
  course: CourseRecord
  index: number
  status: { label: string; tone: 'ok' | 'warn'; detail?: string }
  selected: boolean
  onSelect: () => void
  onChange: (patch: Partial<CourseRecord>) => void
  onRemove: () => void
}

function CourseCard({ course, index, status, selected, onSelect, onChange, onRemove }: CourseCardProps) {
  const scoreValue = Number(course.scoreText)
  const targetValue = Number(course.targetText)
  const sliderScore = Number.isFinite(scoreValue) && course.scoreText.trim() !== '' ? Math.min(100, Math.max(0, scoreValue)) : 0
  const sliderTarget = Number.isFinite(targetValue) && course.targetText.trim() !== '' ? Math.min(100, Math.max(0, targetValue)) : sliderScore

  return (
    <li className={`gpa-course${selected ? ' is-active' : ''}`}>
      <div
        className="gpa-course__top"
        onClick={onSelect}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onSelect()
          }
        }}
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        aria-label={`选中第 ${index + 1} 门课程 ${course.name}`}
      >
        <span className="gpa-row__swatch" style={{ background: courseColor(index) }} aria-hidden="true">
          {index + 1}
        </span>
        <span className={`gpa-course__status gpa-course__status--${status.tone}`}>{status.label}</span>
        <span className="gpa-course__hint">点这一行可在图表里高亮</span>
      </div>

      <div className="gpa-course__grid">
        <label className="gpa-field gpa-field--name">
          <span className="gpa-field__label">课程名称</span>
          <input
            className="gpa-input"
            type="text"
            value={course.name}
            autoComplete="off"
            onChange={(event) => onChange({ name: event.target.value })}
            placeholder="例如 高等数学（上）"
          />
        </label>

        <label className="gpa-field gpa-field--num">
          <span className="gpa-field__label">学分</span>
          <input
            className="gpa-input"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={course.creditsText}
            onChange={(event) => onChange({ creditsText: event.target.value })}
            placeholder="如 4"
            aria-describedby={`credits-hint-${course.id}`}
          />
          <span className="sr-only" id={`credits-hint-${course.id}`}>
            必须是大于 0 的数字，可以带小数
          </span>
        </label>

        <label className="gpa-field gpa-field--num">
          <span className="gpa-field__label">原始成绩</span>
          <input
            className="gpa-input"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={course.scoreText}
            onChange={(event) => onChange({ scoreText: event.target.value })}
            placeholder="0–100"
          />
        </label>

        <label className="gpa-field gpa-field--num">
          <span className="gpa-field__label">假设成绩</span>
          <input
            className="gpa-input"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={course.targetText}
            onChange={(event) => onChange({ targetText: event.target.value })}
            placeholder="留空=不改"
          />
        </label>
      </div>

      <div className="gpa-course__sliders">
        <label className="gpa-slider">
          <span className="gpa-slider__label">原始成绩滑块</span>
          <input
            type="range"
            min={0}
            max={100}
            step={SCORE_STEP}
            value={sliderScore}
            onChange={(event) => onChange({ scoreText: event.target.value })}
            aria-label={`${course.name} 原始成绩`}
          />
          <span className="gpa-slider__value">{course.scoreText.trim() === '' ? '未填' : sliderScore}</span>
        </label>

        <label className="gpa-slider">
          <span className="gpa-slider__label">假设成绩滑块</span>
          <input
            type="range"
            min={0}
            max={100}
            step={SCORE_STEP}
            value={sliderTarget}
            onChange={(event) => onChange({ targetText: event.target.value })}
            aria-label={`${course.name} 假设成绩`}
          />
          <span className="gpa-slider__value">{course.targetText.trim() === '' ? '同原始' : sliderTarget}</span>
        </label>
      </div>

      <div className="gpa-course__bottom">
        <label className="gpa-check">
          <input
            type="checkbox"
            checked={course.included}
            onChange={(event) => onChange({ included: event.target.checked })}
          />
          <span>{course.included ? '参与计算' : '不参与计算'}</span>
        </label>
        {status.detail && <span className="gpa-course__detail">{status.detail}</span>}
        <button type="button" className="btn btn--sm btn--quiet gpa-course__remove" onClick={onRemove}>
          删除
        </button>
      </div>
    </li>
  )
}
