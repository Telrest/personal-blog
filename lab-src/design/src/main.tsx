import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { router } from './router'
import './styles/tokens.css'
import './styles/base.css'
import './styles/ui.css'
import './styles/pages.css'
import './styles/pen.css'
import './styles/gpa.css'
import './styles/bone.css'
import './styles/derailleur.css'
import './styles/mowan.css'
import './styles/rainbow.css'
import './styles/blog-alignment.css'
import { startRainbowControls } from './lib/rainbow'

const container = document.getElementById('root')

if (!container) {
  throw new Error('找不到 #root 挂载点')
}

createRoot(container).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)

startRainbowControls()
