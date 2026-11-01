import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { SiteFooter } from './components/SiteFooter'
import { SiteHeader } from './components/SiteHeader'

/** 站壳：页头 + 页面 + 页脚，并负责换页时回到顶部 */
export function SiteShell() {
  const { pathname } = useLocation()

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [pathname])

  // 魔丸模式是独立游戏入口：占满一屏，不挂展馆页脚，退出时用页头或页面里的「返回展馆」
  const immersive = pathname === '/game'

  // 游戏模式标记用于布局；按钮与主站共用交互样式。
  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('is-game', immersive)
    return () => root.classList.remove('is-game')
  }, [immersive])

  return (
    <>
      <a className="skip-link" href="#main">
        跳到主要内容
      </a>
      <SiteHeader />
      <Outlet />
      {!immersive && <SiteFooter />}
    </>
  )
}
