import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { ExhibitWorkspace } from '../../components/ExhibitWorkspace'
import { ModelStage } from '../../components/ModelStage'
import { StepGuide, useGuideIndex } from '../../components/guide/StepGuide'
import { createSimClock } from '../../lib/clock'
import type { StageFactory, StageRuntime } from '../../lib/stageContract'
import { CamDiagram } from './CamDiagram'
import { PenControls } from './controls'
import { createPenController, type PenSnapshot } from './controller'
import { DISPLAY_NOTE, PHASE_INFO, REFERENCES, STABLE_INFO, type CameraViewId } from './content'
import type { PartId, ViewMode } from './geometry'
import { PEN_STEPS } from './model'
import type { PenSceneState } from './scene'
import type { ExhibitModuleProps } from '../types'

/** 阶段条：模型、图表、字幕读的是同一个状态，所以这里不会和三维对不上 */
function PhaseStrip({ snapshot }: { snapshot: PenSnapshot }) {
  const phase = PHASE_INFO[snapshot.pose.phase]
  const stable = STABLE_INFO[snapshot.stable]
  return (
    <div className={`phase-strip phase-strip--${phase.tone}`}>
      <p className="phase-strip__phase">
        <span className="phase-strip__dot" aria-hidden="true" />
        {phase.label}
      </p>
      <p className="phase-strip__caption">{phase.caption}</p>
      <p className="phase-strip__stable">
        {stable.label} · θ {snapshot.pose.theta.toFixed(0)}° · x {snapshot.pose.x.toFixed(2)} mm
      </p>
    </div>
  )
}

export default function PenExhibit({ mode, onModeChange }: ExhibitModuleProps) {
  const [controller] = useState(() => createPenController())
  const [clock] = useState(() => createSimClock({ playing: true, speed: 1, notifyHz: 15 }))
  const controllerRef = useRef(controller)
  controllerRef.current = controller

  const snapshot = useSyncExternalStore(controller.subscribe, controller.get, controller.get)
  const clockState = useSyncExternalStore(clock.subscribe, clock.get, clock.get)

  const [viewMode, setViewMode] = useState<ViewMode>('exterior')
  const [cameraView, setCameraView] = useState<CameraViewId>('whole')
  const [selected, setSelected] = useState<PartId | null>(null)
  const [clipOpen, setClipOpen] = useState(0)
  const [cameraMoved, setCameraMoved] = useState(false)
  const [resetNonce, setResetNonce] = useState(0)

  const guide = useGuideIndex(PEN_STEPS.length)

  // 帧循环每帧都读这几个值，但不希望它们触发重渲染，所以放进 ref
  const configRef = useRef({ viewMode, cameraView, selected, clipOpen })
  configRef.current = { viewMode, cameraView, selected, clipOpen }
  const explodeRef = useRef(0)
  const pausedBeforeExplode = useRef(false)

  const applyStep = useCallback(
    (index: number) => {
      const step = PEN_STEPS[index]
      if (!step) return
      controllerRef.current.applyStatic(step.state)
      setCameraView(step.view === 'whole' ? 'whole' : 'mechanism')
      setViewMode(step.view === 'mechanism' ? 'cutaway' : 'exterior')
    },
    [setCameraView],
  )

  // 「带我看懂」暂停时钟并摆到当前步骤；切回自由探索时恢复播放
  useEffect(() => {
    if (mode === 'guide') {
      clock.pause()
      applyStep(guide.index)
    } else {
      clock.play()
    }
    // 只在切换模式时触发；步骤变化由 StepGuide 自己处理
  }, [mode])

  const changeViewMode = (next: ViewMode) => {
    setViewMode(next)
    if (next === 'exploded') {
      pausedBeforeExplode.current = clock.get().playing
      clock.pause()
      setCameraView('explode')
    } else if (pausedBeforeExplode.current) {
      clock.play()
      pausedBeforeExplode.current = false
    }
  }

  /* ---------------- 直接操作：拖动按帽 ---------------- */

  const factory = useCallback<StageFactory<PenSceneState>>(async (canvas, hooks) => {
    const { createPenScene } = await import('./scene')
    return createPenScene(canvas, hooks, {
      onCapPressStart: () => controllerRef.current.beginDrag(),
      onCapDrag: (x) => controllerRef.current.dragTo(x),
      onCapRelease: (dragged) => {
        if (dragged) controllerRef.current.endDrag()
        else controllerRef.current.press()
      },
      onPick: (partId) => setSelected(partId),
    })
  }, [])

  const onFrame = useCallback(
    (dt: number, runtime: StageRuntime<PenSceneState>) => {
      clock.tick(dt)
      const clockNow = clock.get()
      controller.tick(clockNow.playing ? dt * clockNow.speed : 0)

      // 爆开过渡用真实时间，暂停机构时它仍然可以动
      const target = configRef.current.viewMode === 'exploded' ? 1 : 0
      const next = explodeRef.current + (target - explodeRef.current) * Math.min(1, dt * 7)
      explodeRef.current = Math.abs(target - next) < 0.003 ? target : next

      const snap = controller.get()
      runtime.update({
        x: snap.pose.x,
        theta: snap.pose.theta,
        contact: snap.pose.contact,
        viewMode: configRef.current.viewMode,
        explode: explodeRef.current,
        selected: configRef.current.selected,
        clipOpen: configRef.current.clipOpen,
        cameraView: configRef.current.cameraView,
      })
    },
    [clock],
  )

  const pressOnce = () => {
    if (mode === 'guide') {
      // 导览模式下按一下也要生效：先把时钟放开一格
      clock.play()
    }
    controller.press()
  }

  return (
    <ExhibitWorkspace
      banner={
        mode === 'guide' ? (
          <StepGuide
            steps={PEN_STEPS.map((step) => ({ id: step.id, title: step.title, body: step.body }))}
            index={guide.index}
            onIndexChange={(index) => {
              guide.setIndex(index)
              applyStep(index)
            }}
            onExit={() => {
              // 「看完，自己动手」/「退出导览」都要真的切回自由探索，
              // 只恢复时钟的话页面还停在导览卡片上，看起来像没反应。
              clock.play()
              onModeChange?.('free')
            }}
          />
        ) : (
          <PhaseStrip snapshot={snapshot} />
        )
      }
      stage={
        <ModelStage<PenSceneState>
          className="pen-stage"
          factory={factory}
          onFrame={onFrame}
          ariaLabel="按动笔三维模型：可以拖动旋转视角，直接按住尾部按帽往下压"
          hint={`${viewMode === 'cutaway' ? '红色短弧：接触位置（教学标记） · ' : ''}拖动空白处旋转 · 按住按帽往下拖 = 按压 · 单击零件 = 选中`}
          notice={
            mode === 'guide' ? (
              <>
                <p className="stage-notice__text">现在处于导览模式，退出导览模式以自由操作</p>
                <button
                  type="button"
                  className="stage-notice__action"
                  onClick={() => onModeChange?.('free')}
                >
                  退出导览
                </button>
              </>
            ) : undefined
          }
          resetCameraNonce={resetNonce}
          onUserOrbit={() => setCameraMoved(true)}
          fallback={
            <div>
              <p>
                这台设备没有可用的 WebGL，三维视图无法显示。你可以先用下面的凸轮展开图和读数理解机构：
                按帽推动推杆，推到 4.0 mm 时凸耳脱离导槽，再压 0.8 mm 由斜面换成 30° 转动；
                松手时沿另一侧斜面再转 30°，总共 60°，落进下一个索引位——深导槽就收芯，浅锁止位就出芯。
              </p>
              <p>
                五件零件的关系：按帽／按杆 → 转子（3 凸耳）→ 固定导向（6 个索引位）→ 笔芯；复位弹簧从前面把整条链顶回来。
              </p>
            </div>
          }
        />
      }
      controls={
        <PenControls
          snapshot={snapshot}
          playing={clockState.playing}
          speed={clockState.speed}
          onTogglePlay={() => clock.toggle()}
          onReset={() => {
            controller.reset()
            clock.reset()
            clock.play()
            setCameraView('whole')
          }}
          onSpeedChange={(speed) => clock.setSpeed(speed)}
          onPressOnce={pressOnce}
          onHoldDown={() => {
            clock.play()
            controller.beginDrag()
            controller.dragTo(4.8)
          }}
          onHoldRelease={() => controller.endDrag()}
          onAbortDemo={() => {
            clock.play()
            controller.beginDrag()
            controller.dragTo(4.4)
            controller.endDrag()
          }}
          viewMode={viewMode}
          onViewModeChange={changeViewMode}
          cameraView={cameraView}
          onCameraViewChange={(id) => {
            setCameraView(id)
            if (id === 'explode') changeViewMode('exploded')
            else if (id === 'mechanism' || id === 'tip' || id === 'side') changeViewMode('cutaway')
            else if (id === 'clip' || viewMode === 'exploded') changeViewMode('exterior')
          }}
          cameraMoved={cameraMoved}
          onResetCamera={() => {
            setCameraMoved(false)
            setCameraView('whole')
            clock.play()
            // 非零 nonce 会触发一次「回到默认视角」
            setResetNonce((value) => value + 1)
          }}
          clipOpen={clipOpen}
          onClipOpenChange={setClipOpen}
          selected={selected}
          onSelect={setSelected}
        />
      }
      notes={
        <>
          <CamDiagram snapshot={snapshot} />
          <p className="pen-source">
            {DISPLAY_NOTE}
            <br />
            尺寸：全长 141.0 mm、轴径 11.0 mm、球珠 0.5 mm、笔芯 111.1 mm（官方名义值）；
            索引位置、行程、弹簧与内部配合均为教学设定，可整体调整。没有可靠的按压力数据，所以页面不显示按压力。
          </p>
          <details className="pen-references">
            <summary>依据与出处</summary>
            <ol>
              {REFERENCES.map((reference) => (
                <li key={reference.id}>
                  <span className="mono">{reference.id}</span>{' '}
                  {reference.url ? (
                    <a href={reference.url} target="_blank" rel="noreferrer noopener">
                      {reference.label}
                    </a>
                  ) : (
                    reference.label
                  )}
                  —— {reference.note}
                </li>
              ))}
            </ol>
          </details>
        </>
      }
    />
  )
}
