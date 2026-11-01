import { useId } from 'react'
import { fmt } from '../../lib/format'
import type { SourceKind } from '../../lib/source'
import { SourceTag } from '../SourceTag'

interface SliderControlProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  unit?: string
  /** 这个数值的可信度来源 */
  source?: SourceKind
  /** 一行补充说明，会挂到 input 的 aria-describedby */
  hint?: string
  /** 自定义显示，例如「1.25 圈」「第 3 档」 */
  display?: string
  disabled?: boolean
  onChange: (value: number) => void
}

/**
 * 带文字的滑块。
 * 标签、当前值、单位、量程端点全部用文字写出来，滑块本身只是操作区。
 */
export function SliderControl({
  label,
  value,
  min,
  max,
  step = 0.01,
  unit,
  source,
  hint,
  display,
  disabled = false,
  onChange,
}: SliderControlProps) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined

  return (
    <div className={`control control--slider${disabled ? ' is-disabled' : ''}`}>
      <div className="control__row">
        <label className="control__label" htmlFor={id}>
          {label}
          {source && <SourceTag kind={source} compact />}
        </label>
        <span className="control__value" aria-live="off">
          {display ?? fmt(value, 2)}
          {unit && <span className="control__unit">{unit}</span>}
        </span>
      </div>

      <input
        id={id}
        className="control__range"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-describedby={hintId}
        onChange={(event) => onChange(Number(event.target.value))}
      />

      <div className="control__scale" aria-hidden="true">
        <span>{fmt(min)}</span>
        <span>
          {fmt(max)}
          {unit}
        </span>
      </div>

      {hint && (
        <p className="control__hint" id={hintId}>
          {hint}
        </p>
      )}
    </div>
  )
}
