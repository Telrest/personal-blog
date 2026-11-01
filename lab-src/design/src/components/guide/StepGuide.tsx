import { useCallback, useState, type ReactNode } from 'react'
import { Button } from '../controls/Button'

export interface GuideStep {
  id: string
  title: string
  body: ReactNode
}

interface StepGuideProps {
  steps: GuideStep[]
  index: number
  onIndexChange: (index: number) => void
  onExit: () => void
}

/**
 * 「带我看懂」的步骤卡。
 * 一步只讲一件事，并且明确写出「这一步改变了什么条件」。
 */
export function StepGuide({ steps, index, onIndexChange, onExit }: StepGuideProps) {
  const step = steps[index]
  if (!step) return null
  const atStart = index === 0
  const atEnd = index === steps.length - 1

  return (
    <section className="guide" aria-label="导览步骤">
      <header className="guide__head">
        <p className="guide__counter">
          第 <span className="mono">{index + 1}</span> 步 / 共 <span className="mono">{steps.length}</span> 步
        </p>
        <ol className="guide__dots" aria-hidden="true">
          {steps.map((item, i) => (
            <li key={item.id} className={`guide__dot${i === index ? ' is-current' : ''}`} />
          ))}
        </ol>
      </header>

      <h3 className="guide__title">{step.title}</h3>
      <div className="guide__body">{step.body}</div>

      <footer className="guide__actions">
        <Button size="sm" onClick={() => onIndexChange(index - 1)} disabled={atStart}>
          上一步
        </Button>
        {atEnd ? (
          <Button size="sm" variant="primary" onClick={onExit}>
            看完，自己动手
          </Button>
        ) : (
          <Button size="sm" variant="primary" onClick={() => onIndexChange(index + 1)}>
            下一步
          </Button>
        )}
        <Button size="sm" variant="quiet" onClick={onExit}>
          退出导览
        </Button>
      </footer>
    </section>
  )
}

/** 步骤索引的小状态容器；步骤副作用（改参数、摆镜头）由展品模块处理 */
export function useGuideIndex(total: number) {
  const [index, setIndex] = useState(0)

  const go = useCallback(
    (next: number) => setIndex(Math.max(0, Math.min(total - 1, next))),
    [total],
  )

  return {
    index: Math.min(index, Math.max(0, total - 1)),
    setIndex: go,
    reset: () => setIndex(0),
  }
}
