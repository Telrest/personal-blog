import type { ExhibitStatus } from '../exhibits/types'

interface StatusBadgeProps {
  status: ExhibitStatus
  /** 状态文字，例如「制作中」「已开放」 */
  label: string
  size?: 'sm' | 'md'
}

/**
 * 状态标记。
 * 颜色只是辅助，文字永远在场——色盲用户与黑白打印都能看懂。
 */
export function StatusBadge({ status, label, size = 'md' }: StatusBadgeProps) {
  return (
    <span className={`status status--${status} status--${size}`}>
      <span className="status__glyph" aria-hidden="true">
        {status === 'ready' ? '●' : status === 'building' ? '◐' : '○'}
      </span>
      <span className="status__text">{label}</span>
    </span>
  )
}
