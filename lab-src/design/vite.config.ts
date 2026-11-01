import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base: './' 让 dist 可以挂在任意子路径下（学校服务器 / GitHub Pages 都省事）。
// 路由使用 HashRouter，因此静态托管不需要任何 URL 重写规则。
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    target: 'es2020',
    assetsInlineLimit: 2048,
  },
  server: {
    port: 5183,
    host: '127.0.0.1',
  },
  preview: {
    port: 5184,
    host: '127.0.0.1',
  },
})
