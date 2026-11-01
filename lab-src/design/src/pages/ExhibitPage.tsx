import { lazy, Suspense, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ModeSwitch } from '../components/ModeSwitch'
import { PageLoading } from '../components/PageLoading'
import { StatusBadge } from '../components/StatusBadge'
import { UnderConstruction } from '../components/UnderConstruction'
import { exhibitNeighbours, getExhibit } from '../exhibits/registry'
import type { ExhibitMode } from '../exhibits/types'
import { NotFoundPage } from './NotFoundPage'

export default function ExhibitPage() {
  const { id } = useParams<{ id: string }>()
  const meta = getExhibit(id)
  const [mode, setMode] = useState<ExhibitMode>('guide')

  // 展品模块按需加载：进入哪件才下载哪件的代码（three.js 也在这一步才进来）
  const LazyModule = useMemo(() => {
    const loader = meta?.component
    return loader ? lazy(loader) : null
  }, [meta])

  if (!meta) return <NotFoundPage />

  const { prev, next } = exhibitNeighbours(meta.id)

  return (
    <main id="main" className="page-exhibit">
      <div className="shell">
        <nav className="breadcrumb" aria-label="面包屑">
          <Link to="/" className="breadcrumb__link">
            ← 全部展品
          </Link>
        </nav>

        <header className="exhibit-head">
          <p className="eyebrow">
            <span className="eyebrow__index">{meta.index}</span>
            <span className="eyebrow__text">{meta.subtitle}</span>
          </p>
          <h1 className="exhibit-head__title">{meta.title}</h1>
          <p className="exhibit-head__question">{meta.question}</p>

          <div className="exhibit-head__bar">
            <div className="exhibit-head__flags">
              <StatusBadge status={meta.status} label={meta.statusLabel} />
              <span className="exhibit-head__view">
                {meta.view === '3d' ? '三维模型' : '二维图表'}
              </span>
            </div>
            {meta.status === 'ready' && <ModeSwitch mode={mode} onChange={setMode} />}
          </div>
        </header>

        {meta.component && LazyModule ? (
          <Suspense fallback={<PageLoading label={`正在加载「${meta.title}」…`} />}>
            <LazyModule meta={meta} mode={mode} onModeChange={setMode} />
          </Suspense>
        ) : (
          <UnderConstruction meta={meta} />
        )}

        <nav className="exhibit-nav" aria-label="展品导航">
          <Link className="exhibit-nav__item" to={`/exhibit/${prev.id}`}>
            <span className="exhibit-nav__dir">← 上一件</span>
            <span className="exhibit-nav__title">
              <span className="mono">{prev.index}</span> {prev.title}
            </span>
          </Link>
          <Link className="exhibit-nav__item exhibit-nav__item--next" to={`/exhibit/${next.id}`}>
            <span className="exhibit-nav__dir">下一件 →</span>
            <span className="exhibit-nav__title">
              <span className="mono">{next.index}</span> {next.title}
            </span>
          </Link>
        </nav>
      </div>
    </main>
  )
}
