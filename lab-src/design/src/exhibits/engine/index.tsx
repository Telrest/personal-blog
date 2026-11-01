import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { ExhibitWorkspace } from '../../components/ExhibitWorkspace'
import { ModelStage } from '../../components/ModelStage'
import { Button } from '../../components/controls/Button'
import { ControlPanel, ControlSection } from '../../components/controls/ControlPanel'
import { SliderControl } from '../../components/controls/SliderControl'
import { SegmentedControl } from '../../components/controls/SegmentedControl'
import { ToggleControl } from '../../components/controls/ToggleControl'
import { TransportBar } from '../../components/controls/TransportBar'
import { StepGuide, useGuideIndex } from '../../components/guide/StepGuide'
import { createSimClock } from '../../lib/clock'
import type { StageFactory, StageRuntime } from '../../lib/stageContract'
import type { ExhibitModuleProps } from '../types'
import { CAMERAS, GUIDE, PARTS, REFERENCES } from './content'
import { createEngineController, type CameraId, type EngineDisplay, type EnginePart, type EngineView, type FlowMode, type Isolation } from './model'
import { EngineFallback, TrendPanel } from './TrendPanel'
import type { EngineSceneState } from './scene'
import './engine.css'

const INITIAL: EngineDisplay = { view: 'cutaway', isolate: 'all', flow: 'off', selected: null, camera: 'overview', explode: 0, quality: 'standard' }

export default function EngineExhibit({ mode, onModeChange }: ExhibitModuleProps) {
  const [controller] = useState(createEngineController)
  const [clock] = useState(() => createSimClock({ playing: true, notifyHz: 8 }))
  const state = useSyncExternalStore(controller.subscribe, controller.get, controller.get)
  const clockState = useSyncExternalStore(clock.subscribe, clock.get, clock.get)
  const [display, setDisplay] = useState<EngineDisplay>(INITIAL)
  const [resetNonce, setResetNonce] = useState(0)
  const guide = useGuideIndex(GUIDE.length)
  const displayRef = useRef(display); displayRef.current = display
  const modelTime = useRef(0), explosion = useRef(0), resumeAfterExplode = useRef(true)
  const patch = (changes: Partial<EngineDisplay>) => setDisplay((old) => ({ ...old, ...changes }))

  useEffect(() => {
    if (mode !== 'guide') return
    const step = GUIDE[guide.index]
    setDisplay((old) => ({ ...old, view: step.view, isolate: step.isolate, flow: step.flow, selected: step.selected, camera: step.camera, explode: 0 }))
    controller.setLoad(0.38, true); clock.play()
  }, [mode, guide.index, clock, controller])

  function changeView(view: EngineView) {
    if (view === 'exploded') {
      if (display.view !== 'exploded') resumeAfterExplode.current = clock.get().playing
      clock.pause(); patch({ view, camera: 'exploded', isolate: 'all', explode: 0.85 })
    } else {
      if (display.view === 'exploded' && resumeAfterExplode.current) clock.play()
      patch({ view, explode: 0, camera: 'overview', isolate: 'all' })
    }
  }
  function changeCamera(camera: CameraId) {
    if (camera === 'exploded') { changeView('exploded'); return }
    if (display.view === 'exploded' && resumeAfterExplode.current) clock.play()
    patch({ camera, explode: 0, view: camera === 'front' ? 'exterior' : 'cutaway', isolate: camera === 'shafts' ? 'shafts' : 'all', selected: camera === 'combustor' ? 'combustor' : camera === 'compressor' ? 'hpc' : camera === 'front' ? 'fan' : null })
  }
  function isolate(value: Isolation) {
    if (display.view === 'exploded' && resumeAfterExplode.current) clock.play()
    patch({ isolate: value, view: 'cutaway', explode: 0, camera: value === 'shafts' ? 'shafts' : 'overview', selected: null })
  }
  const reset = () => {
    controller.reset(); clock.reset(); modelTime.current = 0; clock.play(); explosion.current = 0
    setDisplay(INITIAL); setResetNonce((n) => n + 1)
    guide.reset()
  }
  const factory = useCallback<StageFactory<EngineSceneState>>(async (canvas, hooks) => {
    const { createEngineScene } = await import('./scene')
    return createEngineScene(canvas, hooks, (selected) => setDisplay((old) => ({ ...old, selected })))
  }, [])
  const onFrame = useCallback((dt: number, runtime: StageRuntime<EngineSceneState>) => {
    clock.tick(dt)
    const time = clock.get().time
    controller.tick(Math.max(0, time - modelTime.current)); modelTime.current = time
    const config = displayRef.current
    explosion.current += (config.explode - explosion.current) * (1 - Math.exp(-dt * 7))
    if (Math.abs(config.explode - explosion.current) < 0.001) explosion.current = config.explode
    runtime.update({ model: controller.get(), display: { ...config, explode: explosion.current } })
  }, [clock, controller])

  const selected = display.selected ? PARTS[display.selected] : null
  return <ExhibitWorkspace
    banner={mode === 'guide' ? <StepGuide steps={GUIDE} index={guide.index} onIndexChange={guide.setIndex} onExit={() => onModeChange?.('free')} /> :
      <div className="engine-discovery"><span className="engine-overline">两路空气 · 两套转子</span><p>让空气向后流，看看动力怎样传回前方。</p><span className="engine-tag">通用教学结构</span></div>}
    stage={<div className="engine-stage-wrap">
      <div className="engine-quick" aria-label="快速探索">
        <button type="button" onClick={() => { patch({ view: 'cutaway', camera: 'side', isolate: 'all', flow: 'both', explode: 0 }); if (display.view === 'exploded' && resumeAfterExplode.current) clock.play() }}>追踪两路空气 <span>↗</span></button>
        <button type="button" onClick={() => isolate('shafts')}>只看两根轴 <span>↗</span></button>
        <button type="button" onClick={() => changeView(display.view === 'exploded' ? 'cutaway' : 'exploded')}>{display.view === 'exploded' ? '装回发动机' : '拆开看结构'} <span>↗</span></button>
      </div>
      <div className="engine-viewport">
        <ModelStage factory={factory} onFrame={onFrame} resetCameraNonce={resetNonce} className="engine-stage"
          ariaLabel="双转子涡扇发动机三维模型，可旋转、剖视、拆解并点击零件"
          hint="拖动旋转 · 滚轮缩放 · 点击零件查看作用" fallback={<EngineFallback />} />
        <div className="engine-stage-caption" aria-hidden="true"><span>02 / TURBOFAN</span><span>{display.isolate === 'shafts' ? '同轴嵌套 · 内轴与中空外轴' : display.view === 'exploded' ? '展示拆解 · 非维修顺序' : '进气 → 分流 → 压缩 → 燃烧 → 涡轮 → 排气'}</span></div>
      </div>
      <div className="engine-live-strip" aria-label="示意转子读数" data-model-time={state.time.toFixed(5)} data-lp-angle={state.lpAngle.toFixed(6)} data-hp-angle={state.hpAngle.toFixed(6)}>
        <div><span><i className="engine-dot engine-dot--lp" />低压转子</span><strong>{state.lpHz.toFixed(2)} <small>圈 / 模型秒</small></strong></div>
        <div><span><i className="engine-dot engine-dot--hp" />高压转子</span><strong>{state.hpHz.toFixed(2)} <small>圈 / 模型秒</small></strong></div>
        <p>示意转速，非实机参数。<br />观察速度 {clockState.speed}× · {clockState.playing ? '运行中' : '观察已暂停'}</p>
      </div>
    </div>}
    controls={<ControlPanel title="发动机实验台" subtitle="改变一个条件，看见部件之间的关系" actions={<Button size="sm" variant="quiet" onClick={reset}>全部重置</Button>}>
      <ControlSection title="运行与慢放">
        <SliderControl label="运行工况" source="assumption" value={state.load} min={0} max={1} step={0.01} display={`${Math.round(state.load * 100)}%`} onChange={(value) => controller.setLoad(value)} hint="0% 表示教学怠速端，100% 表示较高工况；不代表推力百分比。" />
        <TransportBar playing={clockState.playing} speed={clockState.speed} onToggle={() => clock.toggle()} onReset={reset} onSpeedChange={clock.setSpeed} speeds={[0.1, 0.25, 0.5, 1]} disabled={display.view === 'exploded'} />
        {display.view === 'exploded' && <p className="engine-small">拆解时冻结机构。装回后恢复拆解前的播放状态。</p>}
      </ControlSection>
      <ControlSection title="打开机器">
        <SegmentedControl<EngineView> label="发动机展示方式" value={display.view} onChange={changeView} options={[
          { value: 'exterior', label: '完整外观' }, { value: 'cutaway', label: '纵向剖视' }, { value: 'exploded', label: '组件拆解' },
        ]} />
        {display.view === 'exploded' && <SliderControl label="拆解程度" value={display.explode} min={0} max={1} display={`${Math.round(display.explode * 100)}%`} onChange={(explode) => patch({ explode })} />}
        <SegmentedControl<Isolation> label="轴系隔离" value={display.isolate} onChange={isolate} options={[
          { value: 'all', label: '全部结构' }, { value: 'lp', label: '低压系统' }, { value: 'hp', label: '高压系统' }, { value: 'shafts', label: '两根轴' },
        ]} />
        <div className="engine-legend"><span><i className="engine-dot--lp" />低压轴系</span><span><i className="engine-dot--hp" />高压轴系</span></div>
      </ControlSection>
      <ControlSection title="空气去了哪里">
        <SegmentedControl<FlowMode> label="气流路径" value={display.flow} onChange={(flow) => {
          if (flow !== 'off' && (display.isolate !== 'all' || display.view === 'exploded')) {
            if (display.view === 'exploded' && resumeAfterExplode.current) clock.play()
            patch({ flow, isolate: 'all', view: 'cutaway', explode: 0, camera: 'side' })
          } else patch({ flow })
        }} options={[
          { value: 'both', label: '两路气流' }, { value: 'core', label: '只看核心' }, { value: 'bypass', label: '只看外涵道' }, { value: 'off', label: '隐藏气流' },
        ]} />
        <p className="engine-small">冷空气为蓝色；核心气流经过燃烧室后转为暖色。粒子表达方向，不表示真实流量或速度。轴系隔离与拆解时暂时隐藏气流。</p>
      </ControlSection>
      <ControlSection title="镜头与画质">
        <SegmentedControl<CameraId> label="发动机预设镜头" value={display.camera} onChange={changeCamera} options={(Object.keys(CAMERAS) as CameraId[]).map((id) => ({ value: id, label: CAMERAS[id].label }))} />
        <Button size="sm" onClick={() => { patch({ camera: 'overview' }); setResetNonce((n) => n + 1) }}>回到整机视角</Button>
        <ToggleControl label="轻量画质" checked={display.quality === 'low'} onChange={(low) => patch({ quality: low ? 'low' : 'standard' })} hint="关闭动态阴影，降低画面分辨率与气流粒子数。" />
      </ControlSection>
      <ControlSection title="部件索引">
        <div className="engine-part-list">{(Object.keys(PARTS) as EnginePart[]).map((id) => <button type="button" key={id} aria-pressed={display.selected === id} onClick={() => patch({ selected: display.selected === id ? null : id })}>{PARTS[id].short}</button>)}</div>
      </ControlSection>
    </ControlPanel>}
    notes={<>
      <section className="engine-part-card" aria-live="polite"><p className="engine-overline">{selected ? '当前选中' : '从一个部件开始'}</p><h2>{selected?.label ?? '点选模型，顺着连接看原理'}</h2><p>{selected?.role ?? '也可以从右侧选择部件。先找到它，再看它连接谁、受谁驱动，以及是否旋转。'}</p>{selected && <p className="engine-connection">{selected.connection}</p>}</section>
      <TrendPanel state={state} selected={display.selected} onSelect={(selected) => patch({ selected })} />
      <details className="engine-sources"><summary>模型依据、开源许可与简化范围</summary>
        <p>通用双转子、分流排气教学模型，不对应某个真实型号。叶轮几何改造自 Grab3D CC0 模型：拆为风扇、低压压气机、高压压气机、高压涡轮、低压涡轮五组，移除原共用轴，重建同轴双轴、静子、机匣、燃烧室和交互。</p>
        <p>展示级数为 1 / 3 / 5 / 1 / 3，来自所选教学几何，不是实机配置。转速、响应时间、沿程温压均为教学设定。没有求解接触、燃烧、流体、转子力矩或发动机匹配；不输出推力、油耗和效率。</p>
        <p>旋转与粒子都已为观察而放慢；拆解布局不是维修操作顺序。剖视为纵向四分之一开口。</p>
        <ul>{REFERENCES.map((r) => <li key={r.url}><a href={r.url} target="_blank" rel="noreferrer noopener">{r.title}</a></li>)}</ul>
        <a href={`${import.meta.env.BASE_URL}engine/LICENSE.txt`} target="_blank" rel="noreferrer">查看原模型 CC0 许可</a>
      </details>
    </>} />
}
