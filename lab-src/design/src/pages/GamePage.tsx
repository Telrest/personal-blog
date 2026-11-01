import { lazy, Suspense } from 'react'
import { PageLoading } from '../components/PageLoading'

/**
 * 魔丸模式的页面外壳。
 *
 * 游戏本体是一整块独立模块（src/game），按需懒加载：不进这个入口就不会下载
 * three.js，也不会影响任何展品页面。路由与展馆共用 HashRouter，
 * 所以静态托管依然不需要 URL 重写。
 */
const MowanGame = lazy(() => import('../game'))

export default function GamePage() {
  return (
    <main id="main" className="page-game">
      <Suspense
        fallback={
          <div className="page-game__loading">
            <PageLoading label="正在装发动机…" />
          </div>
        }
      >
        <MowanGame />
      </Suspense>
    </main>
  )
}
