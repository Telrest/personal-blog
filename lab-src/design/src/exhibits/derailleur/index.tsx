import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { ExhibitWorkspace } from '../../components/ExhibitWorkspace'
import { ModelStage } from '../../components/ModelStage'
import { StepGuide, useGuideIndex } from '../../components/guide/StepGuide'
import { createSimClock } from '../../lib/clock'
import { fmt, fmtFixed } from '../../lib/format'
import type { StageFactory, StageRuntime } from '../../lib/stageContract'
import { ComparePanel } from './Compare'
import {
  DISPLAY_NOTE,
  GUIDE_STEPS,
  REFERENCES,
  SIMPLIFICATION_NOTE,
  type CameraViewId,
  type CompareMode,
} from './content'
import { DerailleurControls } from './controls'
import {
  createDrivetrainController,
  type DrivetrainSnapshot,
  type DrivetrainState,
} from './controller'
import { CHAIN_LENGTH, DRIVE } from './chainPath'
import { cogPlaneZ, type PartId } from './geometry'
import { COAST, coastWheelRpm, driveResult, gearTable, shiftFrame } from './model'
import type { DerailleurSceneState } from './scene'
import type { ExhibitModuleProps } from '../types'

/** 顶部状态条：模型、图表、读数读的是同一份状态，所以这里不会和三维对不上 */
function StatusStrip({
  snapshot,
  wheelRpm,
  ratio,
  teeth,
}: {
  snapshot: DrivetrainSnapshot
  wheelRpm: number
  ratio: number
  teeth: number
}) {
  const tone = snapshot.mode === 'coast' ? 'coast' : snapshot.shifting ? 'shift' : snapshot.waiting ? 'wait' : 'drive'
  const stateText =
    snapshot.mode === 'coast'
      ? '滑行：飞轮与链条停转'
      : snapshot.shifting
        ? '换挡中（示意过渡）'
        : snapshot.waiting
          ? '等待踩踏：请求已排队'
          : '已啮合，稳态驱动'

  return (
    <div className={`drv-strip drv-strip--${tone}`}>
      <p className="drv-strip__state">
        <span className="drv-strip__dot" aria-hidden="true" />
        {stateText}
      </p>
      <p className="drv-strip__detail">
        第 <span className="mono">{snapshot.engaged + 1}</span> 挡 · <span className="mono">{teeth}T</span> · 齿比{' '}
        <span className="mono">{fmt(ratio, 3)}</span>
      </p>
      <p className="drv-strip__detail">
        {snapshot.mode === 'coast' ? '后轮' : '后轮'} <span className="mono">{fmtFixed(wheelRpm, 1)}</span> rpm · 踏频{' '}
        <span className="mono">{snapshot.cadenceRpm}</span> rpm
      </p>
    </div>
  )
}

const INITIAL_FREE: Partial<DrivetrainState> = {
  cadenceRpm: 60,
  torqueNm: 30,
  efficiency: 0.97,
}

export default function DerailleurExhibit({ mode, onModeChange }: ExhibitModuleProps) {
  // 导览用独立示例：自由探索的状态不会被导览改掉，退出导览就回到原样
  const [free] = useState(() => createDrivetrainController({ initialCog: 6, initialState: INITIAL_FREE }))
  const [guide] = useState(() => createDrivetrainController({ initialCog: 6, initialState: INITIAL_FREE }))
  const active = mode === 'guide' ? guide : free

  const activeRef = useRef(active)
  activeRef.current = active

  const snapshot = useSyncExternalStore(active.subscribe, active.get, active.get)

  const [clock] = useState(() => createSimClock({ playing: true, speed: 0.25, notifyHz: 15 }))
  const clockState = useSyncExternalStore(clock.subscribe, clock.get, clock.get)

  const [cameraView, setCameraView] = useState<CameraViewId>('whole')
  const [selected, setSelected] = useState<PartId | null>(null)
  const [showWheel, setShowWheel] = useState(true)
  const [showFrame, setShowFrame] = useState(true)
  const [chainHighlight, setChainHighlight] = useState(false)
  const [compare, setCompare] = useState<CompareMode>('cadence')
  const [cameraMoved, setCameraMoved] = useState(false)
  const [resetNonce, setResetNonce] = useState(0)
  /** 旁观者模式：指针锁定 + WASD 自由飞行，是独立的一种观看模式 */
  const [spectator, setSpectator] = useState(false)

  const guideNav = useGuideIndex(GUIDE_STEPS.length)
  /** 进入导览前记住自由探索的视图状态，退出时原样还回去 */
  const savedView = useRef<{
    cameraView: CameraViewId
    selected: PartId | null
    showWheel: boolean
    showFrame: boolean
    compare: CompareMode
    chainHighlight: boolean
  } | null>(null)

  /* ---------------- 导览步骤 ---------------- */

  const applyStep = useCallback((index: number) => {
    const step = GUIDE_STEPS[index]
    if (!step) return
    const { setup } = step
    const controller = activeRef.current
    if (setup.cadenceRpm !== undefined) controller.setCadence(setup.cadenceRpm)
    if (setup.torqueNm !== undefined) controller.setTorque(setup.torqueNm)
    if (setup.mode) controller.setMode(setup.mode)
    if (setup.cogIndex !== undefined) controller.requestGear(setup.cogIndex)
    if (setup.cameraView) {
      setSpectator(false)
      setCameraView(setup.cameraView)
    }
    if (setup.compare) setCompare(setup.compare)
    if (setup.hideWheel !== undefined) setShowWheel(!setup.hideWheel)
    if (setup.hideFrame !== undefined) setShowFrame(!setup.hideFrame)
    if (setup.select !== undefined) setSelected(setup.select)
  }, [])

  // 进入导览：重置独立示例并从第 1 步开始；退出导览：把自由探索的视图状态还回去
  useEffect(() => {
    if (mode === 'guide') {
      savedView.current = { cameraView, selected, showWheel, showFrame, compare, chainHighlight }
      guide.reset()
      guideNav.reset()
      clock.setSpeed(0.25)
      applyStep(0)
      return
    }
    const saved = savedView.current
    if (!saved) return
    savedView.current = null
    setCameraView(saved.cameraView)
    setSelected(saved.selected)
    setShowWheel(saved.showWheel)
    setShowFrame(saved.showFrame)
    setCompare(saved.compare)
    setChainHighlight(saved.chainHighlight)
    // 只在切换观看方式时触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  const goStep = (index: number) => {
    guideNav.setIndex(index)
    applyStep(index)
  }

  /* ---------------- 每帧 ---------------- */

  const configRef = useRef({
    cameraView,
    spectator,
    selected,
    showWheel,
    showFrame,
    chainHighlight,
  })
  configRef.current = { cameraView, spectator, selected, showWheel, showFrame, chainHighlight }

  const factory = useCallback<StageFactory<DerailleurSceneState>>(async (canvas, hooks) => {
    const { createDerailleurScene } = await import('./scene')
    return createDerailleurScene(canvas, hooks, {
      onPick: (part) => setSelected(part),
      onExitSpectator: () => setSpectator(false),
      onShiftStep: (delta) => activeRef.current.stepGear(delta),
    })
  }, [])

  const onFrame = useCallback(
    (dt: number, runtime: StageRuntime<DerailleurSceneState>) => {
      clock.tick(dt)
      const now = clock.get()
      activeRef.current.tick(now.playing ? dt * now.speed : 0)
      const snap = activeRef.current.get()

      // 换挡过渡的几何：后拨先横向到位，链条再抬过齿顶跨到目标齿片（见 model.shiftFrame）
      const frame = shiftFrame(snap.shiftState)

      runtime.update({
        engaged: snap.engaged,
        shiftFrame: frame,
        crankAngle: snap.crankAngle,
        wheelAngle: snap.wheelAngle,
        cassetteAngle: snap.cassetteAngle,
        chainTravel: snap.chainTravel,
        selected: configRef.current.selected,
        showWheel: configRef.current.showWheel,
        showFrame: configRef.current.showFrame,
        chainHighlight: configRef.current.chainHighlight,
        cameraView: configRef.current.cameraView,
        spectator: configRef.current.spectator,
      })
    },
    [clock],
  )

  /* ---------------- 派生读数 ---------------- */

  const gears = gearTable()
  const engagedGear = gears[snapshot.engaged] ?? gears[0]
  const drive = driveResult({
    chainringTeeth: DRIVE.chainringTeeth,
    cogIndex: snapshot.engaged,
    cadenceRpm: snapshot.cadenceRpm,
    torqueNm: snapshot.torqueNm,
    efficiency: snapshot.efficiency,
    wheelRadiusMm: DRIVE.wheelRadius,
  })
  const coastRpm = coastWheelRpm(COAST.initialWheelRpm, snapshot.coastSeconds)
  const shownWheelRpm = snapshot.mode === 'coast' ? coastRpm : drive.wheelRpm

  const performReset = () => {
    activeRef.current.reset()
    clock.reset()
    clock.play()
    setSpectator(false)
    setCameraView('whole')
    setSelected(null)
    setShowWheel(true)
    setShowFrame(true)
    setChainHighlight(false)
    setCompare('cadence')
  }

  return (
    <ExhibitWorkspace
      banner={
        mode === 'guide' ? (
          <StepGuide
            steps={GUIDE_STEPS.map((step) => ({ id: step.id, title: step.title, body: step.body }))}
            index={guideNav.index}
            onIndexChange={goStep}
            onExit={() => {
              clock.play()
              onModeChange?.('free')
            }}
          />
        ) : (
          <StatusStrip
            snapshot={snapshot}
            wheelRpm={shownWheelRpm}
            ratio={drive.ratio}
            teeth={engagedGear.teeth}
          />
        )
      }
      stage={
        <ModelStage<DerailleurSceneState>
          className="drv-stage"
          factory={factory}
          onFrame={onFrame}
          ariaLabel="自行车传动系统三维模型：可以拖动旋转视角，单击零件查看说明"
          hint={
            spectator
              ? '旁观者模式：点击画面锁定鼠标 · WASD 移动 · 鼠标环顾 · 滚轮换挡（上滚轻、下滚重） · Q/E 升降 · Shift 加速 · Esc 退出'
              : '拖动旋转 · 滚轮缩放 · 单击零件查看它在当前状态里做什么'
          }
          resetCameraNonce={resetNonce}
          onUserOrbit={() => setCameraMoved(true)}
          onFullscreenChange={(fullscreen) => setSpectator(fullscreen)}
          fallback={
            <div>
              <p>
                这台设备没有可用的 WebGL，三维视图无法显示。下面这张二维比较表与读数仍然完整：
                前盘 30T 与后飞轮 10–51T 决定齿比，保持踏频时后轮转速 = 踏频 × 齿比；
                保持输入力矩时理想轮端力矩 = η × 曲柄力矩 / 齿比。
              </p>
              <p>
                链条是闭合的一圈：前盘 → 下段 → 张力轮 → 导向轮 → 飞轮 → 上段回到前盘。
                换挡时后拨的四连杆把导向轮横向移到目标齿片所在的平面，摆臂转动收放链条，
                所以同一根 120 节链条在 12 个挡位上都能闭合。
              </p>
            </div>
          }
        />
      }
      controls={
        <DerailleurControls
          snapshot={snapshot}
          drive={drive}
          gears={gears}
          coastRpm={coastRpm}
          playing={clockState.playing}
          speed={clockState.speed}
          cameraView={cameraView}
          cameraMoved={cameraMoved}
          spectator={spectator}
          onSpectatorChange={(value) => setSpectator(value)}
          showWheel={showWheel}
          showFrame={showFrame}
          chainHighlight={chainHighlight}
          selected={selected}
          onTogglePlay={() => clock.toggle()}
          onReset={performReset}
          onSpeedChange={(speed) => clock.setSpeed(speed)}
          onCadenceChange={(rpm) => active.setCadence(rpm)}
          onTorqueChange={(nm) => active.setTorque(nm)}
          onEfficiencyChange={(value) => active.setEfficiency(value)}
          onRequestGear={(index) => active.requestGear(index)}
          onStepGear={(delta) => active.stepGear(delta)}
          onModeChange={(next) => active.setMode(next)}
          onCameraViewChange={(view) => {
            setSpectator(false)
            setCameraView(view)
          }}
          onResetCamera={() => {
            setSpectator(false)
            setCameraMoved(false)
            setCameraView('whole')
            setResetNonce((value) => value + 1)
          }}
          onShowWheelChange={setShowWheel}
          onShowFrameChange={setShowFrame}
          onChainHighlightChange={setChainHighlight}
          onSelect={setSelected}
        />
      }
      notes={
        <>
          <ComparePanel
            gears={gears}
            engaged={snapshot.engaged}
            cadenceRpm={snapshot.cadenceRpm}
            torqueNm={snapshot.torqueNm}
            efficiency={snapshot.efficiency}
            chainringTeeth={DRIVE.chainringTeeth}
            mode={compare}
            wheelRadiusMm={DRIVE.wheelRadius}
            onModeChange={setCompare}
          />

          <div className="drv-notes">
            <p className="drv-source">
              {DISPLAY_NOTE}
              <br />
              齿数组 10/12/14/16/18/21/24/28/33/39/45/51 来自 Shimano CS-M6100-12 官方规格；
              前盘 30T 与原车几何来自 GIANT 官方页。换挡过渡时长、齿片间距、链线、导轮中心距、
              四连杆铰点、轮胎外半径与效率都是教学设定，不是厂家尺寸或实测值。
            </p>
            <ul className="drv-simplify">
              {SIMPLIFICATION_NOTE.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
            <p className="drv-source">
              链长固定 {DRIVE.chainPitchCount} 节 = {fmt(CHAIN_LENGTH, 1)} mm；
              当前挡位所在齿片面 Z = {fmt(cogPlaneZ(snapshot.engaged), 1)} mm（Z 朝传动侧为正）。
              观察倍速 {clockState.speed}× 只改变你看到的快慢，读数里的 rpm 与 N·m 都是模型真实值。
            </p>

            <details className="drv-references">
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
          </div>
        </>
      }
    />
  )
}
