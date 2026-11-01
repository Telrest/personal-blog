import { NavLink } from 'react-router-dom'
import {useEffect,useRef} from 'react'
import {ThemeToggle} from './ThemeToggle'

/** 站名标记：直接使用主站的图标（森林绿圆角 + 米白 T + 叶片） */
function BrandMark() {
  return (
    <svg className="brand__mark" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <rect width="64" height="64" rx="20" fill="#163e35" />
      <path d="M17 20h30v7H36v22h-8V27H17z" fill="#eff7dc" />
      <path d="M42 12c10 1 11 7 5 12-7-1-8-6-5-12" fill="#c5dc8b" />
    </svg>
  )
}

export function SiteHeader() {
  const header=useRef<HTMLElement>(null)
  useEffect(()=>{const node=header.current;if(!node)return;const update=()=>document.documentElement.style.setProperty('--site-header-height',node.getBoundingClientRect().height+'px');update();const observer=new ResizeObserver(update);observer.observe(node);return()=>observer.disconnect()},[])

  return (
    <header className="site-header" ref={header}>
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

        <div className="site-header__actions"><nav className="site-nav" aria-label="主导航">
          <NavLink to="/" end className={({ isActive }) => `site-nav__link${isActive ? ' is-active' : ''}`}>
            首页
          </NavLink>
          <NavLink to="/game" className={({ isActive }) => `site-nav__link site-nav__link--play${isActive ? ' is-active' : ''}`}>
            魔丸模式
          </NavLink>
          <NavLink to="/about" className={({ isActive }) => `site-nav__link${isActive ? ' is-active' : ''}`}>
            关于展馆
          </NavLink>
        </nav><ThemeToggle /></div>
      </div>
    </header>
  )
}
