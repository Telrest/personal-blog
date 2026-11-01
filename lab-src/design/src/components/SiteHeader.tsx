import { NavLink } from 'react-router-dom'

/** 站名标记：与主站同一套线性图标语言（24 视框 / 1.6 描边 / 圆角） */
function BrandMark() {
  return (
    <svg className="brand__mark" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 3v18M16 3v18M3 8h18M3 16h18" stroke="currentColor" strokeWidth="0.9" opacity="0.45" />
      <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}

export function SiteHeader() {
  return (
    <header className="site-header">
      {/* 子站上下文：说明这是一座挂在博客实验室下的展馆，而不是独立站点。 */}
      <div className="blog-context">
        <div className="shell blog-context__inner">
          <a className="blog-context__back" href="../../">
            <span aria-hidden="true">←</span> Telrest 的博客
          </a>
          <span className="blog-context__sep" aria-hidden="true">/</span>
          <a className="blog-context__crumb" href="../../lab/">实验室</a>
          <span className="blog-context__sep" aria-hidden="true">/</span>
          <span className="blog-context__current">实验 003 · 设计的秘密</span>
        </div>
      </div>
      <div className="shell site-header__inner">
        <NavLink to="/" className="brand" aria-label="设计的秘密 · 返回首页">
          <BrandMark />
          <span className="brand__text">
            <span className="brand__name">设计的秘密</span>
            <span className="brand__sub">一座可以亲手操作的原理展馆</span>
          </span>
        </NavLink>

        <nav className="site-nav" aria-label="主导航">
          <NavLink to="/" end className={({ isActive }) => `site-nav__link${isActive ? ' is-active' : ''}`}>
            首页
          </NavLink>
          <NavLink to="/game" className={({ isActive }) => `site-nav__link site-nav__link--play${isActive ? ' is-active' : ''}`}>
            魔丸模式
          </NavLink>
          <NavLink to="/about" className={({ isActive }) => `site-nav__link${isActive ? ' is-active' : ''}`}>
            关于展馆
          </NavLink>
        </nav>
      </div>
    </header>
  )
}
