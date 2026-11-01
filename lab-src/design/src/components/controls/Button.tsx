import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'default' | 'primary' | 'quiet'
type Size = 'md' | 'sm'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  children: ReactNode
}

/** 全站统一按钮：文字永远可见，按下时有明确的状态变化 */
export function Button({ variant = 'default', size = 'md', className, children, ...rest }: ButtonProps) {
  const classes = ['btn', `btn--${variant}`, size === 'sm' ? 'btn--sm' : '', className ?? '']
    .filter(Boolean)
    .join(' ')

  return (
    <button type="button" className={classes} {...rest}>
      {children}
    </button>
  )
}
