/**
 * 游戏画布容器。
 *
 * 和展品用的 ModelStage 是同一套路子（懒加载 three、单一帧循环、离场释放、
 * 没有 WebGL 就给图文替代），区别只有两点：
 *  - 不建轨道控制，镜头由世界自己管；
 *  - 全屏按钮在外层页面，不放这里。
 *
 * three.js 与游戏世界只在进入这个页面后才下载，首页仍然完全不碰它。
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { StageHooks, StageRuntime } from '../lib/stageContract'
import { detectWebGL, isSoftwareRenderer, type WebGLReport } from '../lib/webgl'
import type { Game } from './model'
import type { Quality } from './track'
import type { WorldState } from './world'

type StageStatus = 'booting' | 'ready' | 'unsupported' | 'failed'

interface GameStageProps {
  game: Game
  quality: Quality
  ariaLabel: string
  fallback: ReactNode
  /** 旁观者模式的指针锁定被解除（Esc）时通知页面 */
  onExitSpectator: () => void
  /** 每帧回调：音效、跨帧统计这类不进模型的东西 */
  onFrame?: (dt: number) => void
  onReady?: () => void
  className?: string
  /** 叠在画布上的界面（HUD、结算面板、触屏按钮） */
  children?: ReactNode
}

export function GameStage({
  game,
  quality,
  ariaLabel,
  fallback,
  onExitSpectator,
  onFrame,
  onReady,
  className,
  children,
}: GameStageProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const qualityRef = useRef(quality)
  const frameRef = useRef(onFrame)
  const exitSpectatorRef = useRef(onExitSpectator)
  const readyRef = useRef(onReady)
  const [report] = useState<WebGLReport>(() => detectWebGL())
  const [status, setStatus] = useState<StageStatus>(report.ok ? 'booting' : 'unsupported')
  const [errorText, setErrorText] = useState<string | null>(null)
  const [restartKey, setRestartKey] = useState(0)

  qualityRef.current = quality
  frameRef.current = onFrame
  exitSpectatorRef.current = onExitSpectator
  readyRef.current = onReady

  useEffect(() => {
    if (!report.ok) return
    const host = hostRef.current
    if (!host) return

    let cancelled = false
    let raf = 0
    let runtime: StageRuntime<WorldState> | null = null
    let observer: ResizeObserver | null = null
    let last = performance.now()

    // 每次启动一块新画布：上下文一旦丢失，旧 canvas 不能复用
    const canvas = document.createElement('canvas')
    canvas.className = 'mowan-stage__canvas'
    canvas.setAttribute('role', 'img')
    canvas.setAttribute('aria-label', ariaLabel)
    host.prepend(canvas)

    const contextLost = (event: Event) => {
      event.preventDefault()
      cancelAnimationFrame(raf)
      setStatus('failed')
      setErrorText('显卡上下文被浏览器回收了，刷新或重新加载三维场景即可恢复。')
    }
    canvas.addEventListener('webglcontextlost', contextLost)

    const loop = (now: number) => {
      if (cancelled) return
      raf = requestAnimationFrame(loop)
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000))
      last = now
      if (document.hidden || !runtime) return
      game.advance(dt)
      runtime.update({ view: game.getView(), quality: qualityRef.current })
      runtime.render()
      frameRef.current?.(dt)
    }

    const boot = async () => {
      try {
        setStatus('booting')
        const hooks: StageHooks = { onUserOrbit: () => {} }
        const { createWorld } = await import('./world')
        const created = await createWorld(canvas, hooks, {
          onExitSpectator: () => exitSpectatorRef.current(),
        })
        if (cancelled) {
          created.dispose()
          return
        }
        runtime = created
        const rect = host.getBoundingClientRect()
        created.resize(rect.width, rect.height, window.devicePixelRatio || 1)
        if (typeof ResizeObserver !== 'undefined') {
          observer = new ResizeObserver((entries) => {
            const box = entries[0]?.contentRect
            if (!box) return
            created.resize(box.width, box.height, window.devicePixelRatio || 1)
          })
          observer.observe(host)
        }
        setStatus('ready')
        readyRef.current?.()
        last = performance.now()
        raf = requestAnimationFrame(loop)
      } catch (error) {
        if (cancelled) return
        setErrorText(error instanceof Error ? error.message : String(error))
        setStatus('failed')
      }
    }

    void boot()

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      observer?.disconnect()
      canvas.removeEventListener('webglcontextlost', contextLost)
      runtime?.dispose()
      runtime = null
      canvas.remove()
    }
  }, [game, report.ok, restartKey, ariaLabel])

  const software = status === 'ready' && isSoftwareRenderer(report.renderer)

  return (
    <div className={`mowan-stage${className ? ` ${className}` : ''}`} ref={hostRef} data-status={status}>
      {status === 'booting' && (
        <div className="mowan-stage__overlay">
          <p className="mowan-stage__loading">正在装发动机…</p>
          <p className="mowan-stage__sub">第一次进入要下载三维世界，之后会快很多</p>
        </div>
      )}

      {status === 'ready' && software && (
        <p className="mowan-stage__hint">当前为软件渲染，帧率可能偏低；在暂停菜单里把画质调到「低」会好一些</p>
      )}

      {status === 'unsupported' && (
        <div className="mowan-stage__overlay mowan-stage__overlay--fallback">
          <p className="mowan-stage__title">这台设备无法显示三维场景</p>
          <p className="mowan-stage__reason">{report.reason ?? '浏览器没有提供 WebGL。'}</p>
          <div className="mowan-stage__body">{fallback}</div>
        </div>
      )}

      {status === 'failed' && (
        <div className="mowan-stage__overlay mowan-stage__overlay--fallback">
          <p className="mowan-stage__title">三维场景没能启动</p>
          <p className="mowan-stage__reason">{errorText ?? '创建场景时出错。'}</p>
          <div className="mowan-stage__body">{fallback}</div>
          <button type="button" className="btn btn--sm" onClick={() => setRestartKey((value) => value + 1)}>
            重新加载三维场景
          </button>
        </div>
      )}

      {children}
    </div>
  )
}
