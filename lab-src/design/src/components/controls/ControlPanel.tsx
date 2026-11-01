import type { ReactNode } from 'react'

interface ControlPanelProps {
  title: string
  /** 面板副标题，交代这一组控制的作用 */
  subtitle?: string
  children: ReactNode
  /** 面板级操作，例如「全部重置」 */
  actions?: ReactNode
}

/** 侧边控制栏容器：桌面端固定在模型右侧，移动端移到模型下方 */
export function ControlPanel({ title, subtitle, children, actions }: ControlPanelProps) {
  return (
    <section className="control-panel" aria-label={title}>
      <header className="control-panel__head">
        <div>
          <h2 className="control-panel__title">{title}</h2>
          {subtitle && <p className="control-panel__subtitle">{subtitle}</p>}
        </div>
        {actions && <div className="control-panel__actions">{actions}</div>}
      </header>
      <div className="control-panel__body">{children}</div>
    </section>
  )
}

interface ControlSectionProps {
  title: string
  hint?: string
  children: ReactNode
}

/** 控制分组：一组相关参数，带小标题 */
export function ControlSection({ title, hint, children }: ControlSectionProps) {
  return (
    <fieldset className="control-section">
      <legend className="control-section__legend">{title}</legend>
      {hint && <p className="control-section__hint">{hint}</p>}
      <div className="control-section__body">{children}</div>
    </fieldset>
  )
}
