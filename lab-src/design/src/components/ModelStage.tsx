import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  enterFullscreen,
  exitFullscreen,
  getFullscreenElement,
  hasSeenFullscreenHint,
  isFullscreenSupported,
  markFullscreenHintSeen,
  subscribeFullscreen,
} from '../lib/fullscreen'
import type { StageFactory, StageRuntime } from '../lib/stageContract'
import { detectWebGL, isSoftwareRenderer, type WebGLReport } from '../lib/webgl'

type StageStatus = 'booting' | 'ready' | 'unsupported' | 'failed' | 'lost'

interface ModelStageProps<S> {
  /**
   * 创建场景的工厂函数。必须是稳定引用（模块级函数或 useCallback），
   * 否则每次渲染都会重建整个三维场景。
   * three.js 只在这个模块里被动态 import，所以首页永远不会加载它。
   */
  factory: StageFactory<S>
  /** 每帧回调：推进时间、从 store 派生状态、推给场景。返回后组件会渲染一帧。 */
  onFrame: (dt: number, runtime: StageRuntime<S>) => void
  /** 用户第一次自己动镜头时触发；页面据此把「自动回正」彻底关掉 */
  onUserOrbit?: () => void
  /** 数值变化即执行一次「回到默认视角」 */
  resetCameraNonce?: number
  /** 进入 / 退出全屏时通知（展品据此自动切到旁观者模式） */
  onFullscreenChange?: (fullscreen: boolean) => void
  /** 三维不可用时的图文替代内容 */
  fallback: ReactNode
  ariaLabel: string
  className?: string
  /** 舞台左下角的操作提示 */
  hint?: string
  /** 舞台顶部的状态条，例如「现在处于导览模式」+ 退出按钮 */
  notice?: ReactNode
}

/**
 * 三维舞台容器。所有 3D 展品都套这一层，因此这些行为全站一致：
 *  - 懒加载：three.js 与展品几何只在进入展品页后加载；
 *  - 不可用兜底：没有 WebGL 就显示图文替代，不给黑屏；
 *  - 单一帧循环：整个页面只有这里一处在 requestAnimationFrame；
 *  - 暂停不停止渲染：暂停只停「模型时间」，镜头仍然可以转；
 *  - 离开即释放：卸载时取消动画、断开监听、dispose 场景与 GPU 资源；
 *  - 标签页不可见时不渲染，省电，也避免后台空转。
 *
 * canvas 由这里亲手创建、卸载时移除：WebGL 上下文一旦丢失，同一个 canvas
 * 就无法再次获得上下文，所以每次启动都必须是一块全新的画布。
 */
export function ModelStage<S>({
  factory,
  onFrame,
  onUserOrbit,
  resetCameraNonce = 0,
  onFullscreenChange,
  fallback,
  ariaLabel,
  className,
  hint = '拖拽旋转 · 滚轮缩放',
  notice,
}: ModelStageProps<S>) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const runtimeRef = useRef<StageRuntime<S> | null>(null)
  const frameRef = useRef(onFrame)
  const orbitRef = useRef(onUserOrbit)
  const fullscreenCbRef = useRef(onFullscreenChange)
  const lastNonceRef = useRef(resetCameraNonce)

  const [report] = useState<WebGLReport>(() => detectWebGL())
  const [status, setStatus] = useState<StageStatus>(report.ok ? 'booting' : 'unsupported')
  const [errorText, setErrorText] = useState<string | null>(null)
  /** 用户点「重新加载三维场景」时自增，重跑启动流程 */
  const [restartKey, setRestartKey] = useState(0)
  /** 全屏：只让这块舞台占满屏幕，页面其它部分照旧 */
  const [fullscreen, setFullscreen] = useState(false)
  const [fullscreenSupported] = useState(() => isFullscreenSupported())
  /** 退出提示：第一次进全屏时出现一次，之后不再出现 */
  const [hintStage, setHintStage] = useState<'hidden' | 'shown' | 'fading'>('hidden')

  // 每次渲染把最新回调存进 ref，帧循环里读最新版本，避免反复重建场景
  frameRef.current = onFrame
  orbitRef.current = onUserOrbit
  fullscreenCbRef.current = onFullscreenChange

  // 全屏状态以浏览器为准：按 Esc 退出时也要同步回来
  useEffect(() => {
    if (!fullscreenSupported) return
    const sync = () => {
      const isFull = getFullscreenElement() === hostRef.current
      setFullscreen(isFull)
      fullscreenCbRef.current?.(isFull)
    }
    sync()
    return subscribeFullscreen(sync)
  }, [fullscreenSupported])

  // Esc 退出。浏览器本来就会这么做，这里再拦一道：
  // 全屏里没有退出按钮，万一某个环境吞掉了这个键，也不能把人困在里面。
  useEffect(() => {
    if (!fullscreen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      void exitFullscreen()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [fullscreen])

  // 提示显示 2.6 s 后淡出，再用 0.3 s 收掉节点
  useEffect(() => {
    if (hintStage !== 'shown') return
    const fade = window.setTimeout(() => setHintStage('fading'), 2600)
    return () => window.clearTimeout(fade)
  }, [hintStage])

  useEffect(() => {
    if (hintStage !== 'fading') return
    const done = window.setTimeout(() => setHintStage('hidden'), 320)
    return () => window.clearTimeout(done)
  }, [hintStage])

  /** 进入全屏。退出统一交给 Esc（浏览器默认行为），不再放退出按钮 */
  const enterStageFullscreen = async () => {
    const host = hostRef.current
    if (!host) return
    const ok = await enterFullscreen(host)
    // 失败时保持原状，不做假切换
    if (!ok) setFullscreen(getFullscreenElement() === host)
    // 只在第一次成功进入时提示一次；提示一出现就记下，刷新也不会再来烦
    if (ok && hasSeenFullscreenHint() === false) {
      markFullscreenHintSeen()
      setHintStage('shown')
    }
  }

  useEffect(() => {
    if (!report.ok) return
    const host = hostRef.current
    if (!host) return

    let cancelled = false
    let raf = 0
    let lost = false
    let runtime: StageRuntime<S> | null = null
    let observer: ResizeObserver | null = null
    let last = performance.now()

    // 每次启动一块新画布：失去上下文后旧画布永久不可用
    const canvas = document.createElement('canvas')
    canvas.className = 'model-stage__canvas'
    canvas.setAttribute('role', 'img')
    canvas.setAttribute('aria-label', ariaLabel)
    host.prepend(canvas)

    const handleContextLost = (event: Event) => {
      // 必须 preventDefault，否则浏览器不会尝试恢复上下文
      event.preventDefault()
      lost = true
      cancelAnimationFrame(raf)
      setStatus('lost')
    }
    canvas.addEventListener('webglcontextlost', handleContextLost)

    const loop = (now: number) => {
      if (cancelled || lost) return
      raf = requestAnimationFrame(loop)
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000))
      last = now
      if (document.hidden) return
      if (!runtime) return
      frameRef.current(dt, runtime)
      runtime.render()
    }

    const boot = async () => {
      try {
        setStatus('booting')
        const created = await factory(canvas, { onUserOrbit: () => orbitRef.current?.() })
        if (cancelled) {
          created.dispose()
          return
        }
        runtime = created
        runtimeRef.current = created

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
      lost = true
      cancelAnimationFrame(raf)
      observer?.disconnect()
      canvas.removeEventListener('webglcontextlost', handleContextLost)
      runtime?.dispose()
      runtime = null
      runtimeRef.current = null
      canvas.remove()
    }
  }, [factory, report.ok, restartKey, ariaLabel])

  // 只有用户点了「回到默认视角」，nonce 才会变
  useEffect(() => {
    if (resetCameraNonce === lastNonceRef.current) return
    lastNonceRef.current = resetCameraNonce
    runtimeRef.current?.resetCamera()
  }, [resetCameraNonce])

  const software = status === 'ready' && isSoftwareRenderer(report.renderer)

  return (
    <div className={`model-stage${className ? ` ${className}` : ''}`} ref={hostRef} data-status={status}>
      {status === 'ready' && (
        <>
          {notice && <div className="model-stage__notice">{notice}</div>}
          <p className="model-stage__hint">
            {hint}
            {software ? ' · 当前为软件渲染，转动可能偏慢' : ''}
          </p>
          {/* 全屏里不放按钮：退出只走 Esc，第一次会给一次提示 */}
          {fullscreenSupported && !fullscreen && (
            <button
              type="button"
              className="model-stage__fs"
              onClick={enterStageFullscreen}
              title="把模型放大到整个屏幕（按 Esc 退出）"
            >
              <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
                <path
                  d="M2 5V2h3M10 7v3H7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              全屏
            </button>
          )}
          {hintStage !== 'hidden' && (
            <p
              className={`model-stage__fs-hint${hintStage === 'fading' ? ' is-fading' : ''}`}
              role="status"
            >
              按 Esc 退出全屏
            </p>
          )}
        </>
      )}

      {status === 'booting' && (
        <div className="model-stage__overlay">
          <p className="model-stage__loading">正在构建三维模型…</p>
        </div>
      )}

      {status === 'unsupported' && (
        <div className="model-stage__overlay model-stage__overlay--fallback">
          <p className="model-stage__fallback-title">这台设备无法显示三维模型</p>
          <p className="model-stage__fallback-reason">{report.reason ?? '浏览器没有提供 WebGL。'}</p>
          <div className="model-stage__fallback-body">{fallback}</div>
          <p className="model-stage__fallback-note">
            上面的图文说明包含同样的原理内容；打开浏览器硬件加速后刷新页面即可切回三维视图。
          </p>
        </div>
      )}

      {status === 'failed' && (
        <div className="model-stage__overlay model-stage__overlay--fallback">
          <p className="model-stage__fallback-title">三维场景没能启动</p>
          <p className="model-stage__fallback-reason">{errorText ?? '创建场景时出错。'}</p>
          <div className="model-stage__fallback-body">{fallback}</div>
          <p className="model-stage__fallback-note">
            <button
              type="button"
              className="btn btn--sm"
              onClick={() => setRestartKey((value) => value + 1)}
            >
              重新加载三维场景
            </button>
          </p>
        </div>
      )}

      {status === 'lost' && (
        <div className="model-stage__overlay model-stage__overlay--fallback">
          <p className="model-stage__fallback-title">显卡上下文被浏览器回收了</p>
          <p className="model-stage__fallback-reason">
            通常发生在切换显卡、系统休眠，或同时打开太多三维页面之后。
          </p>
          <div className="model-stage__fallback-body">{fallback}</div>
          <p className="model-stage__fallback-note">
            <button
              type="button"
              className="btn btn--sm"
              onClick={() => setRestartKey((value) => value + 1)}
            >
              重新加载三维场景
            </button>
          </p>
        </div>
      )}
    </div>
  )
}
