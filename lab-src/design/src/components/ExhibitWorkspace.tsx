import type { ReactNode } from 'react'

interface ExhibitWorkspaceProps {
  /** 模型 / 图表，视觉中心 */
  stage: ReactNode
  /** 侧边控制栏 */
  controls: ReactNode
  /** 模型下方的解释内容 */
  notes?: ReactNode
  /** 舞台上方的一行提示（例如当前导览步骤的标题） */
  banner?: ReactNode
}

/**
 * 展品工作区布局。
 *
 * 桌面端：模型占主列，控制栏固定在右侧（模型是视觉中心，文字让位）。
 * 移动端：改为上下排列，模型在上、控制在下，粘性定位取消。
 * 断点写在 CSS 里（.workspace），这里只负责结构。
 */
export function ExhibitWorkspace({ stage, controls, notes, banner }: ExhibitWorkspaceProps) {
  return (
    <div className="workspace">
      <div className="workspace__main">
        {banner && <div className="workspace__banner">{banner}</div>}
        <div className="workspace__stage">{stage}</div>
        {notes && <div className="workspace__notes">{notes}</div>}
      </div>
      <aside className="workspace__side" aria-label="展品控制">
        {controls}
      </aside>
    </div>
  )
}
