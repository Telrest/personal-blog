import { Suspense, lazy } from 'react'
import { createHashRouter } from 'react-router-dom'
import { SiteShell } from './App'
import { PageLoading } from './components/PageLoading'
import AboutPage from './pages/AboutPage'
import ExhibitPage from './pages/ExhibitPage'
import HomePage from './pages/HomePage'
import { NotFoundPage } from './pages/NotFoundPage'

// 自检页里会用到 three.js，单独切一个 chunk，首页完全不碰它
const StageCheckPage = lazy(() => import('./pages/StageCheckPage'))
// 魔丸模式（独立游戏入口）：同样是懒加载，首页与展品页都不会带上它
const GamePage = lazy(() => import('./pages/GamePage'))

/**
 * 使用 HashRouter（#/exhibit/pen）：静态托管不需要任何 URL 重写规则，
 * 直接把 dist 扔到学校服务器或 GitHub Pages 上就能跑。
 */
export const router = createHashRouter([
  {
    path: '/',
    element: <SiteShell />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'exhibit/:id', element: <ExhibitPage /> },
      {
        path: 'game',
        element: (
          <Suspense fallback={<PageLoading label="正在装发动机…" />}>
            <GamePage />
          </Suspense>
        ),
      },
      { path: 'about', element: <AboutPage /> },
      {
        path: 'stage-check',
        element: (
          <Suspense fallback={<PageLoading label="正在加载自检页…" />}>
            <StageCheckPage />
          </Suspense>
        ),
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
