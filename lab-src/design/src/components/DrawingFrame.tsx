import type { ReactNode } from 'react'

interface DrawingFrameProps {
  children: ReactNode
  className?: string
  /** 左上角小眉标 */
  label?: string
  /** 右下角标题栏：图号 / 比例 / 版次 这类图纸信息 */
  titleBlock?: Array<{ label: string; value: string }>
  /** 无障碍说明：这一块图纸在讲什么 */
  ariaLabel?: string
}

/**
 * 工程图纸框。
 * 四角刻度 + 细边框 + 标题栏，是全站「工程图纸细节」的主要载体。
 * 用 <figure> 而不是 <div>，因为里面通常是一张图或一个读数面板。
 */
export function DrawingFrame({ children, className, label, titleBlock, ariaLabel }: DrawingFrameProps) {
  return (
    <figure className={`drawing${className ? ` ${className}` : ''}`} aria-label={ariaLabel}>
      {label && <figcaption className="drawing__label">{label}</figcaption>}
      <div className="drawing__body">
        <span className="drawing__ticks" aria-hidden="true" />
        {children}
      </div>
      {titleBlock && titleBlock.length > 0 && (
        <dl className="title-block">
          {titleBlock.map((cell) => (
            <div key={cell.label} className="title-block__cell">
              <dt>{cell.label}</dt>
              <dd>{cell.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </figure>
  )
}

interface DimLineProps {
  /** 尺寸文字，例如「全长 142 mm」 */
  label: string
  note?: string
}

/**
 * 尺寸线：给模型或面板加一条带箭头的标注线。
 * 纯装饰，用 aria-hidden 隐藏，避免屏幕阅读器读出重复信息。
 */
export function DimLine({ label, note }: DimLineProps) {
  return (
    <div className="dim-line" aria-hidden="true">
      <span className="dim-line__rule" />
      <span className="dim-line__label">
        {label}
        {note && <span className="dim-line__note">{note}</span>}
      </span>
    </div>
  )
}
