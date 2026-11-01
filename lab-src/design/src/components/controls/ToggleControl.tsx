import { useId } from 'react'

interface ToggleControlProps {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  /** 打开/关闭时的状态词，默认「开 / 关」——状态必须写出来 */
  onLabel?: string
  offLabel?: string
  hint?: string
  disabled?: boolean
}

/**
 * 开关。
 * 用原生 checkbox 保留键盘与读屏行为；开关右侧永远写出当前状态，
 * 不让「亮着就是开」成为唯一的信息来源。
 */
export function ToggleControl({
  label,
  checked,
  onChange,
  onLabel = '开',
  offLabel = '关',
  hint,
  disabled = false,
}: ToggleControlProps) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined

  return (
    <div className={`toggle${disabled ? ' is-disabled' : ''}`}>
      <label className="toggle__row" htmlFor={id}>
        <span className="toggle__label">{label}</span>
        <span className="toggle__state">{checked ? onLabel : offLabel}</span>
        <span className={`toggle__switch${checked ? ' is-on' : ''}`} aria-hidden="true">
          <span className="toggle__thumb" />
        </span>
      </label>
      <input
        id={id}
        className="sr-only toggle__input"
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-describedby={hintId}
        onChange={(event) => onChange(event.target.checked)}
      />
      {hint && (
        <p className="control__hint" id={hintId}>
          {hint}
        </p>
      )}
    </div>
  )
}
