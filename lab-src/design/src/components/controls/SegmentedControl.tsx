import { useId } from 'react'

export interface SegmentOption<T extends string> {
  value: T
  label: string
  /** 选项的补充说明，显示在标签下方 */
  hint?: string
  disabled?: boolean
}

interface SegmentedControlProps<T extends string> {
  label: string
  value: T
  options: ReadonlyArray<SegmentOption<T>>
  onChange: (value: T) => void
  /** 选项较少时可以横排；默认横排 */
  orientation?: 'horizontal' | 'vertical'
}

/**
 * 单选组（展示方式 / 观察速度 / 视角切换都用它）。
 *
 * 用真实的 <input type="radio">：方向键切换、屏幕阅读器读「几选一」都是浏览器原生行为。
 * 选中态同时有三种表达：✓ 符号 + 加粗边框 + 深色文字，不只靠颜色。
 */
export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  orientation = 'horizontal',
}: SegmentedControlProps<T>) {
  const name = useId()

  return (
    <div
      className={`segmented segmented--${orientation}`}
      role="radiogroup"
      aria-label={label}
    >
      {options.map((option) => {
        const checked = option.value === value
        return (
          <label
            key={option.value}
            className={`segmented__item${checked ? ' is-active' : ''}${
              option.disabled ? ' is-disabled' : ''
            }`}
          >
            <input
              className="sr-only"
              type="radio"
              name={name}
              value={option.value}
              checked={checked}
              disabled={option.disabled}
              onChange={() => onChange(option.value)}
            />
            <span className="segmented__check" aria-hidden="true">
              {checked ? '✓' : '·'}
            </span>
            <span className="segmented__body">
              <span className="segmented__text">{option.label}</span>
              {option.hint && <span className="segmented__hint">{option.hint}</span>}
            </span>
          </label>
        )
      })}
    </div>
  )
}
