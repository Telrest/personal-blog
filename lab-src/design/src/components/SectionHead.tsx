import type { ReactNode } from 'react'

interface SectionHeadProps {
  /** 章节编号，例如「01」 */
  index?: string
  /** 小眉标，等宽字体，大写字母间距 */
  eyebrow?: string
  title: string
  lead?: ReactNode
  /** 右侧附加信息，例如进度统计 */
  aside?: ReactNode
  id?: string
}

export function SectionHead({ index, eyebrow, title, lead, aside, id }: SectionHeadProps) {
  return (
    <header className="section-head" id={id}>
      <div className="section-head__main">
        {(index || eyebrow) && (
          <p className="eyebrow">
            {index && <span className="eyebrow__index">{index}</span>}
            {eyebrow && <span className="eyebrow__text">{eyebrow}</span>}
          </p>
        )}
        <h2 className="section-head__title">{title}</h2>
        {lead && <div className="section-head__lead">{lead}</div>}
      </div>
      {aside && <div className="section-head__aside">{aside}</div>}
    </header>
  )
}
