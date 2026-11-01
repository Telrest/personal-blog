import { SOURCES, type SourceKind } from '../lib/source'

interface SourceTagProps {
  kind: SourceKind
  /** 紧凑模式只显示短标签（实测 / 文献 / 假设 / 视觉） */
  compact?: boolean
}

/**
 * 数据来源标签。
 * 每个数值旁边都要能回答「这个数从哪来」，所以标签是文字，不是色块。
 */
export function SourceTag({ kind, compact = false }: SourceTagProps) {
  const meta = SOURCES[kind]
  return (
    <span className={`source-tag source-tag--${kind}`} title={meta.description}>
      <span className="source-tag__kind">{compact ? meta.short : meta.label}</span>
    </span>
  )
}

export function SourceLegend() {
  return (
    <ul className="source-legend">
      {(Object.keys(SOURCES) as SourceKind[]).map((kind) => (
        <li key={kind} className="source-legend__item">
          <SourceTag kind={kind} />
          <p className="source-legend__desc">{SOURCES[kind].description}</p>
        </li>
      ))}
    </ul>
  )
}
