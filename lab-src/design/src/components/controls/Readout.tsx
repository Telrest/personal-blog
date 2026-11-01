import type { SourceKind } from '../../lib/source'
import { SourceTag } from '../SourceTag'

export interface ReadoutItem {
  label: string
  value: string
  unit?: string
  /** 补充说明，例如「压缩到 62%」 */
  hint?: string
  source?: SourceKind
}

interface ReadoutProps {
  title?: string
  items: ReadoutItem[]
  /** 竖排（读数表）还是横排（关键数字） */
  layout?: 'rows' | 'grid'
}

/**
 * 读数表。
 * 数值全部由模型状态格式化而来（不算第二遍），单位和来源都写在旁边。
 */
export function Readout({ title, items, layout = 'rows' }: ReadoutProps) {
  return (
    <div className={`readout readout--${layout}`}>
      {title && <p className="readout__title">{title}</p>}
      <dl className="readout__list">
        {items.map((item) => (
          <div className="readout__row" key={item.label}>
            <dt className="readout__label">
              {item.label}
              {item.source && <SourceTag kind={item.source} compact />}
            </dt>
            <dd className="readout__value">
              <span className="mono">{item.value}</span>
              {item.unit && <span className="readout__unit">{item.unit}</span>}
            </dd>
            {item.hint && <p className="readout__hint">{item.hint}</p>}
          </div>
        ))}
      </dl>
    </div>
  )
}
