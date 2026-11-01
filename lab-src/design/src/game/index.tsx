/**
 * 魔丸模式：把五件展品串成一款第三人称无尽躲避游戏。
 *
 * 组合方式：
 *  - 自行车（02 变速的秘密）→ 轻量整车，车轮、曲柄、链条联动；
 *  - 航空发动机（02）→ 后置吊舱，带支架、风扇与尾焰；
 *  - GPA（04）→ 满绩渐近线计分；
 *  - 骨折（03）→ 摔车演出里的 X 光片，复用那根真实的近节趾骨模型；
 *  - 按动笔（01）→ 首版不做（彩蛋留到以后：车把上的启动键）。
 *
 * 这里只做组合：模型在 model.ts，画面在 world.ts / track.ts / ride.ts，
 * 界面在 Hud.tsx / Overlays.tsx，音效在 audio.ts。
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  enterFullscreen,
  exitFullscreen,
  getFullscreenElement,
  isFullscreenSupported,
  subscribeFullscreen,
} from '../lib/fullscreen'
import { createGameAudio, type GameAudio } from './audio'
import { CONFIG } from './config'
import { Hud } from './Hud'
import { CountdownOverlay, CrashOverlay, PauseOverlay, ResultOverlay, TitleOverlay } from './Overlays'
import { createGame, type Game } from './model'
import { GameStage } from './stage'
import { loadBest, loadMuted, saveBest, saveMuted } from './storage'
import { TouchControls } from './TouchControls'
import type { Quality } from './track'

/** 窄屏 + 触屏优先按「低」画质起步，用户可以随时在暂停菜单里切回来 */
function detectQuality(): Quality {
  if (typeof window === 'undefined') return 'high'
  const coarse = window.matchMedia?.('(pointer: coarse)').matches === true
  const cores = navigator.hardwareConcurrency ?? 6
  const small = Math.min(window.innerWidth, window.innerHeight) < 540
  return coarse && (small || cores <= 6) ? 'low' : 'high'
}

function SpectatorBar({ onExit }: { onExit: () => void }) {
  return (
    <div className="mowan-spectator">
      <p className="mowan-spectator__text">
        <strong>旁观者模式</strong>：游戏已暂停。点击画面锁定鼠标 · WASD 移动 · 鼠标环顾 · Q/E 升降 · Shift 加速 · Esc
        退出
      </p>
      <button type="button" className="mowan-tool" onClick={onExit}>
        退出旁观
      </button>
    </div>
  )
}

export default function MowanGame() {
  const audioRef = useRef<GameAudio | null>(null)
  const keysRef = useRef<Set<string>>(new Set())
  const shellRef = useRef<HTMLDivElement | null>(null)

  const [muted, setMuted] = useState<boolean>(() => loadMuted())
  const [quality, setQuality] = useState<Quality>(() => detectQuality())
  const [ready, setReady] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [fullscreenSupported] = useState(() => isFullscreenSupported())

  const [game] = useState<Game>(() =>
    createGame({
      best: loadBest(),
      onEvent: (event) => {
        audioRef.current?.play(event)
        if (event.type === 'record') saveBest(event.best)
      },
    }),
  )
  const snapshot = useSyncExternalStore(game.subscribe, game.getSnapshot, game.getSnapshot)

  // 开发用把手：控制台里可以 __mowan.debugTeleport(1500) 直接看高里程的计分与节点门。
  // 生产构建里这段不会存在。
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const host = window as unknown as { __mowan?: Game }
    host.__mowan = game
    return () => {
      delete host.__mowan
    }
  }, [game])

  /* ---------------- 音效 ---------------- */

  useEffect(() => {
    const audio = createGameAudio(muted)
    audioRef.current = audio
    return () => {
      audio.dispose()
      audioRef.current = null
    }
    // 只在挂载时建一次；静音状态由下面的 effect 单独同步
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    audioRef.current?.setMuted(muted)
    saveMuted(muted)
  }, [muted])

  const ensureAudio = useCallback(() => {
    audioRef.current?.resume()
  }, [])

  const startGame = useCallback(() => {
    ensureAudio()
    keysRef.current.clear()
    game.start()
  }, [ensureAudio, game])

  /* ---------------- 键盘 ---------------- */

  useEffect(() => {
    const applySteer = () => {
      const keys = keysRef.current
      const left = keys.has('KeyA') || keys.has('ArrowLeft')
      const right = keys.has('KeyD') || keys.has('ArrowRight')
      game.setControls({ steer: (right ? 1 : 0) - (left ? 1 : 0) })
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      if (typing) return

      const phase = game.getPhase()
      const steeringKey = ['KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight'].includes(event.code)
      if (steeringKey) {
        event.preventDefault()
        keysRef.current.add(event.code)
        applySteer()
        return
      }

      if (event.code === 'Space') {
        event.preventDefault()
        if (phase === 'idle' || phase === 'result') {
          startGame()
          return
        }
        if (phase === 'crash') {
          game.skipCutscene()
          return
        }
        keysRef.current.add('Space')
        game.setControls({ boost: true })
        return
      }

      if (event.code === 'Enter') {
        if (phase === 'idle' || phase === 'result') {
          event.preventDefault()
          startGame()
        }
        return
      }

      if (event.code === 'Escape' || event.code === 'KeyP') {
        event.preventDefault()
        if (phase === 'spectator') game.exitSpectator()
        else if (phase === 'running' || phase === 'countdown') game.pause()
        else if (phase === 'paused') game.resume()
        else if (phase === 'crash') game.skipCutscene()
      }
    }

    const onKeyUp = (event: KeyboardEvent) => {
      if (['KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
        keysRef.current.delete(event.code)
        applySteer()
      }
      if (event.code === 'Space') {
        keysRef.current.delete('Space')
        game.setControls({ boost: false })
      }
    }

    const releaseAll = () => {
      keysRef.current.clear()
      game.setControls({ steer: 0, boost: false })
    }

    const onVisibility = () => {
      if (document.hidden) {
        game.handleHidden()
        releaseAll()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', releaseAll)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', releaseAll)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [game, startGame])

  /* ---------------- 全屏 ---------------- */

  useEffect(() => {
    if (!fullscreenSupported) return
    return subscribeFullscreen(() => setFullscreen(getFullscreenElement() === shellRef.current))
  }, [fullscreenSupported])

  const toggleFullscreen = async () => {
    if (getFullscreenElement()) await exitFullscreen()
    else if (shellRef.current) {
      ensureAudio()
      await enterFullscreen(shellRef.current)
    }
  }

  /* ---------------- 每帧：发动机声 ---------------- */

  const onFrame = useCallback(() => {
    const view = game.getView()
    const speedNorm = Math.min(1, Math.max(0, (view.speed - 10) / Math.max(1, CONFIG.speed.max - 10)))
    const active = view.phase === 'running' || view.phase === 'countdown'
    audioRef.current?.engine(speedNorm, view.boosting, active)
  }, [game])

  const phase = snapshot.phase
  const showTouch = phase === 'running' || phase === 'countdown'

  return (
    <div className="mowan" ref={shellRef}>
      <div className="mowan-viewport">
        <GameStage
          game={game}
          quality={quality}
          onFrame={onFrame}
          onReady={() => setReady(true)}
          onExitSpectator={() => game.exitSpectator()}
          ariaLabel="魔丸模式：第三人称无尽躲避游戏，骑着一辆装了航空发动机的自行车躲开一排排低矮的连跳墙"
          className="mowan-stage--play"
          fallback={
            <div>
              <p>
                这台设备没有可用的 WebGL，三维跑道无法显示。游戏本身仍然可用：距离与魔丸 GPA 由文本读数给出，
                「满绩渐近线」规则不变——前 1 000 m 从 0 涨到 3.9，之后每 500 m 多一个 9，永远小于 4.0。
              </p>
              <p>建议打开浏览器硬件加速后刷新；或者用电脑上的 Chrome / Edge 打开这一页。</p>
            </div>
          }
        >
          <Hud
            snapshot={snapshot}
            muted={muted}
            onToggleMuted={() => setMuted((value) => !value)}
            fullscreen={fullscreen}
            fullscreenSupported={fullscreenSupported}
            onToggleFullscreen={() => void toggleFullscreen()}
            onPause={() => {
              if (phase === 'paused') game.resume()
              else game.pause()
            }}
            dimmed={phase === 'idle' || phase === 'result'}
          />

          {phase === 'idle' && (
            <TitleOverlay
              bestDistanceText={snapshot.bestText}
              bestGpaText={snapshot.bestGpa.text}
              bestNines={snapshot.bestGpa.nines}
              muted={muted}
              onToggleMuted={() => setMuted((value) => !value)}
              onStart={startGame}
              loaded={ready}
            />
          )}

          {phase === 'countdown' && <CountdownOverlay text={snapshot.countdownText} />}

          {phase === 'paused' && (
            <PauseOverlay
              snapshot={snapshot}
              quality={quality}
              muted={muted}
              onResume={() => game.resume()}
              onRestart={startGame}
              onSpectate={() => {
                ensureAudio()
                game.enterSpectator()
              }}
              onQualityChange={setQuality}
              onToggleMuted={() => setMuted((value) => !value)}
            />
          )}

          {phase === 'spectator' && <SpectatorBar onExit={() => game.exitSpectator()} />}

          {phase === 'crash' && <CrashOverlay onSkip={() => game.skipCutscene()} />}

          {phase === 'result' && <ResultOverlay snapshot={snapshot} onRestart={startGame} />}

          {showTouch && (
            <TouchControls
              onSteer={(value) => game.setControls({ steer: value })}
              onBoost={(active) => game.setControls({ boost: active })}
            />
          )}
        </GameStage>
      </div>

    </div>
  )
}
