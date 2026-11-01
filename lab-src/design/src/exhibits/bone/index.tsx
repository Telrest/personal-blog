import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { ExhibitWorkspace } from '../../components/ExhibitWorkspace'
import { ModelStage } from '../../components/ModelStage'
import { StepGuide, useGuideIndex } from '../../components/guide/StepGuide'
import { SegmentedControl } from '../../components/controls/SegmentedControl'
import type { StageFactory, StageRuntime } from '../../lib/stageContract'
import { exitFullscreen } from '../../lib/fullscreen'
import { BoneControls } from './controls'
import { BoneFallback } from './diagrams'
import {
  BONE_STEPS,
  BOUNDARIES,
  CAMERA_LABELS,
  LOAD_COPY,
  MODEL_NOTE,
  REFERENCES,
  REPAIR_BOUNDARY,
  REPAIR_COPY,
  STRUCTURE_COPY,
  TAB_COPY,
  TERM_COPY,
  stepState,
} from './content'
import { repairStageIndex, type TabId } from './model'
import {
  DEFAULT_CAMERA,
  createBoneStore,
  createRepairClock,
  resetTab,
  type BoneState,
  type CameraId,
} from './state'
import type { BoneLabelRequest, BoneStageState, ScreenLabel } from './scene'
import type { ExhibitModuleProps } from '../types'

/* ========================================================================
   标注
   ======================================================================== */

interface BoneLabel {
  id: string
  text: string
  anchor: string
  dx: number
  dy: number
  /** right：把标签放在锚点左侧（用 -100% 位移） */
  align?: 'left' | 'right'
  tone?: 'target' | 'muted' | 'callus'
}

function labelsFor(state: BoneState, progress: number): BoneLabel[] {
  if (state.tab === 'structure') {
    if (state.camera === 'local') {
      return state.structure.fractured ? [
        { id: 'base', text: '基底片段', anchor: 'pp5-base', dx: -12, dy: 20, align: 'right', tone: 'target' },
        { id: 'target', text: '远端片段 · 随参数移动', anchor: 'pp5-mid', dx: 18, dy: 0, tone: 'target' },
        { id: 'distal', text: '中节与末节', anchor: 'mp5', dx: 18, dy: -18, tone: 'muted' },
      ] : [
        { id: 'joint', text: '跖趾关节', anchor: 'mtp-joint', dx: -12, dy: 14, align: 'right', tone: 'muted' },
        { id: 'target', text: '近节趾骨 · 目标', anchor: 'pp5-mid', dx: 18, dy: 0, tone: 'target' },
        { id: 'distal', text: '中节与末节', anchor: 'mp5', dx: 18, dy: -18, tone: 'muted' },
      ]
    }
    return [
      { id: 'foot', text: '右足', anchor: 'heel', dx: -22, dy: 26, align: 'right' },
      { id: 'medial', text: '内侧 · 拇趾侧', anchor: 'medial', dx: -14, dy: 4, align: 'right', tone: 'muted' },
      { id: 'lateral', text: '外侧 · 小趾侧', anchor: 'lateral', dx: 14, dy: 34, tone: 'muted' },
      { id: 'mt5', text: '第 5 跖骨（对照）', anchor: 'mt5', dx: 14, dy: 30, tone: 'muted' },
      { id: 'target', text: '第 5 近节趾骨（目标）', anchor: 'pp5-mid', dx: 22, dy: -40, tone: 'target' },
    ]
  }
  if (state.tab === 'load') {
    const copy = LOAD_COPY.find((item) => item.id === state.load.mode) ?? LOAD_COPY[0]
    return [
      {
        id: 'load',
        text: `${copy.label} · λ ${Math.round(state.load.load * 100)}%`,
        anchor: 'arrow',
        dx: 12,
        dy: -30,
        tone: 'muted',
      },
      { id: 'fixed', text: '跖骨参照 · 固定', anchor: 'mt5', dx: 16, dy: 8, tone: 'muted' },
    ]
  }
  const stage = repairStageIndex(progress)
  return [
    {
      id: 'callus',
      text: `${REPAIR_COPY[stage].name}（示意）`,
      anchor: 'callus',
      dx: 14,
      dy: -10,
      tone: 'callus',
    },
  ]
}

/* ========================================================================
   页签与实时说明
   ======================================================================== */

function ExperimentTabs({ tab, onChange }: { tab: TabId; onChange: (tab: TabId) => void }) {
  const copy = TAB_COPY.find((item) => item.id === tab) ?? TAB_COPY[0]
  return (
    <div className="bone-tabs">
      <SegmentedControl<TabId>
        label="实验页签"
        value={tab}
        onChange={onChange}
        options={TAB_COPY.map((item) => ({ value: item.id, label: item.label }))}
      />
      <p className="bone-tabs__lead">{copy.lead}</p>
    </div>
  )
}

function LiveCaption({ state, progress }: { state: BoneState; progress: number }) {
  const copy = TAB_COPY.find((item) => item.id === state.tab) ?? TAB_COPY[0]
  let text = ''
  if (state.tab === 'structure') {
    const pose = state.structure.pose
    text = state.structure.fractured
      ? `基底部骨折示意 · 裂隙 ${pose.gap.toFixed(1)} mm · 横移 ${pose.offset.toFixed(1)} mm · 旋转 ${pose.angulation.toFixed(0)}°`
      : `${state.camera === 'local' ? '局部' : '整足'} · 完整骨对照 · ${CAMERA_LABELS[state.camera]}视角`
  } else if (state.tab === 'load') {
    const load = LOAD_COPY.find((item) => item.id === state.load.mode) ?? LOAD_COPY[0]
    text = `${load.label} · λ ${Math.round(state.load.load * 100)}% · ${state.load.fractured ? '预设骨折' : '完整轮廓'}`
  } else {
    text = `第 ${repairStageIndex(progress) + 1} 阶段 ${REPAIR_COPY[repairStageIndex(progress)].short} · 概念进度 ${Math.round(progress * 100)}%`
  }
  return (
    <div className="bone-caption">
      <span className="bone-caption__tag">{copy.label}</span>
      <span className="bone-caption__text">{text}</span>
    </div>
  )
}

/* ========================================================================
   展品
   ======================================================================== */

export default function BoneExhibit({ mode, onModeChange }: ExhibitModuleProps) {
  const [store] = useState(createBoneStore)
  const [clock] = useState(createRepairClock)
  const state = useSyncExternalStore(store.subscribe, store.get, store.get)
  const repairClock = useSyncExternalStore(clock.subscribe, clock.get, clock.get)

  const [cameraMoved, setCameraMoved] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)

  const [resetNonce, setResetNonce] = useState(0)
  const cameraNonce = useRef(0)
  const guide = useGuideIndex(BONE_STEPS.length)

  const overlayRef = useRef<HTMLDivElement | null>(null)
  const labelRefs = useRef(new Map<string, HTMLDivElement>())
  const lineRefs = useRef(new Map<string, SVGLineElement>())
  const dotRefs = useRef(new Map<string, SVGCircleElement>())

  const labels = useMemo(
    () => labelsFor(state, repairClock.progress),
    // 只在「标签内容会变」的字段上重算；连续进度只影响修复阶段的编号
    [state, repairClock.progress],
  )
  const labelRequestsRef = useRef<BoneLabelRequest[]>([])
  labelRequestsRef.current = labels.map((label) => ({ id: label.id, anchor: label.anchor }))
  const labelsRef = useRef<BoneLabel[]>(labels)
  labelsRef.current = labels

  /** 每帧把标注锚点写进 DOM（不经过 React 状态，避免 60 Hz 重渲染） */
  const updateScreenLabels = useCallback((screen: ScreenLabel[]) => {
    const positions = new Map(screen.map((item) => [item.id, item]))
    for (const label of labelsRef.current) {
      const element = labelRefs.current.get(label.id)
      const line = lineRefs.current.get(label.id)
      const dot = dotRefs.current.get(label.id)
      const position = positions.get(label.id)
      if (!element) continue
      if (!position || !position.visible) {
        element.style.opacity = '0'
        if (line) line.style.opacity = '0'
        if (dot) dot.style.opacity = '0'
        continue
      }
      const width = overlayRef.current?.clientWidth ?? 1
      const height = overlayRef.current?.clientHeight ?? 1
      const boxWidth = element.offsetWidth, boxHeight = element.offsetHeight
      const left = position.x + label.dx - (label.align === 'right' ? boxWidth : 0)
      const x = Math.max(8, Math.min(width - boxWidth - 8, left)) + (label.align === 'right' ? boxWidth : 0)
      const y = Math.max(38 + boxHeight / 2, Math.min(height - 38 - boxHeight / 2, position.y + label.dy))
      element.style.transform = `translate3d(${x}px, ${y}px, 0) translate(${label.align === 'right' ? '-100%' : '0'}, -50%)`
      element.style.opacity = '1'
      if (dot) {
        dot.setAttribute('cx', String(position.x))
        dot.setAttribute('cy', String(position.y))
        dot.style.opacity = '0.9'
      }
      if (line) {
        line.setAttribute('x1', String(position.x))
        line.setAttribute('y1', String(position.y))
        line.setAttribute('x2', String(label.align === 'right' ? x : position.x + label.dx * 0.4))
        line.setAttribute('y2', String(position.y + label.dy * 0.5))
        line.style.opacity = '0.5'
      }
    }
  }, [])

  const factory = useCallback<StageFactory<BoneStageState>>(
    async (canvas, hooks) => {
      const { createBoneScene } = await import('./scene')
      return createBoneScene(canvas, hooks, {
        onPick: (id) => {
          const current = store.get()
          store.patch({ structure: { ...current.structure, selected: id } })
        },
        onLabels: updateScreenLabels,
      })
    },
    [store, updateScreenLabels],
  )

  const onFrame = useCallback(
    (dt: number, runtime: StageRuntime<BoneStageState>) => {
      const snapshot = store.get()
      if (snapshot.tab === 'repair') clock.tick(dt)
      runtime.update({
        tab: snapshot.tab,
        camera: snapshot.camera,
        cameraNonce: cameraNonce.current,
        structure: snapshot.structure,
        load: snapshot.load,
        repair: { cutaway: snapshot.repair.cutaway, progress: clock.get().progress },
        labels: labelRequestsRef.current,
      })
    },
    [clock, store],
  )

  /* ---------------- 状态写回 ---------------- */

  const patchStructure = useCallback(
    (patch: Partial<BoneState['structure']>) => {
      const current = store.get()
      const local = patch.isolate === true || patch.cutaway === true || patch.fractured === true
      if (local && current.camera !== 'local') cameraNonce.current += 1
      store.patch({ structure: { ...current.structure, ...patch, ...(local ? { isolate: true } : {}) }, ...(local ? { camera: 'local' as const } : {}) })
    },
    [store],
  )

  const patchPose = useCallback(
    (patch: Partial<BoneState['structure']['pose']>) => {
      const current = store.get()
      if (current.camera !== 'local') cameraNonce.current += 1
      // 改断端参数时聚焦到骨折示意，保留同一实验内的自由镜头。
      store.patch({
        camera: 'local',
        structure: {
          ...current.structure,
          isolate: true,
          fractured: true,
          pose: { ...current.structure.pose, ...patch },
        },
      })
    },
    [store],
  )

  const patchLoad = useCallback(
    (patch: Partial<BoneState['load']>) => {
      const current = store.get()
      store.patch({ load: { ...current.load, ...patch } })
    },
    [store],
  )

  const patchRepair = useCallback(
    (patch: Partial<BoneState['repair']>) => {
      const current = store.get()
      store.patch({ repair: { ...current.repair, ...patch } })
    },
    [store],
  )

  const changeTab = useCallback(
    (tab: TabId) => {
      onModeChange?.('free')
      cameraNonce.current += 1
      store.patch({ tab, camera: DEFAULT_CAMERA[tab] })
      setCameraMoved(false)
      clock.pause()
    },
    [clock, store, onModeChange],
  )

  const changeCamera = useCallback(
    (camera: CameraId) => {
      onModeChange?.('free')
      cameraNonce.current += 1
      const current = store.get()
      store.patch({ camera, ...(current.tab === 'structure' ? { structure: { ...current.structure, isolate: camera === 'local', ...(camera !== 'local' ? { cutaway: false } : {}) } } : {}) })
      setCameraMoved(false)
    },
    [store, onModeChange],
  )

  const resetCamera = useCallback(() => {
    setCameraMoved(false)
    store.patch({ camera: DEFAULT_CAMERA[store.get().tab] })
    setResetNonce((value) => value + 1)
  }, [store])

  const resetCurrent = useCallback(() => {
    store.set(resetTab(store.get(), store.get().tab))
    cameraNonce.current += 1
    setCameraMoved(false)
    if (store.get().tab === 'repair') clock.reset()
  }, [clock, store])

  /* ---------------- 带我看懂 ---------------- */

  const applyStep = useCallback(
    (index: number) => {
      const step = BONE_STEPS[index]
      if (!step) return
      cameraNonce.current += 1
      store.set(stepState(step, store.get()))
      if (step.patch.repairProgress !== undefined) clock.setProgress(step.patch.repairProgress)
      clock.pause()
      setCameraMoved(false)
    },
    [clock, store],
  )

  useEffect(() => {
    if (mode === 'guide') applyStep(guide.index)
    else clock.pause()
    // 只在模式或步骤变化时应用；具体视口由 applyStep 设置
  }, [mode, guide.index, applyStep, clock])

  const explore = (kind: 'whole' | 'fracture' | 'load' | 'repair') => {
    onModeChange?.('free')
    clock.pause()
    if (kind === 'load' || kind === 'repair') { changeTab(kind); return }
    const current = store.get()
    cameraNonce.current += 1
    store.patch({ tab: 'structure', camera: kind === 'whole' ? 'dorsal' : 'local', structure: {
      ...current.structure, isolate: kind !== 'whole', cutaway: false, fractured: kind !== 'whole', selected: null,
    } })
    setCameraMoved(false)
  }
  const cutaway = state.tab === 'structure' ? state.structure.cutaway : state.tab === 'repair' && state.repair.cutaway
  const repairStage = REPAIR_COPY[repairStageIndex(repairClock.progress)]
  const loadCopy = LOAD_COPY.find((copy) => copy.id === state.load.mode) ?? LOAD_COPY[0]
  const sceneTitle = state.tab === 'repair' ? repairStage.name : state.tab === 'load' ? `${loadCopy.label}：看箭头指向哪里`
    : state.camera !== 'local' ? '整足定位：橙色这块骨在哪里？' : state.structure.fractured ? '断端特写：固定的基底与移动的远端' : '第 5 趾列：沿关节找到目标骨'
  const sceneBody = state.tab === 'repair' ? `${repairStage.plain} 点击下方阶段可停住观察。`
    : state.tab === 'load' ? `${loadCopy.where}。灰蓝跖骨保留为固定参照；把载荷从 0 调高，观察橙色趾骨的变化。`
    : state.camera !== 'local' ? '整足保留 26 块骨。先找到外侧小趾，再点“断端特写”看裂面。'
    : state.structure.fractured ? '调整裂隙、横移、旋转；后两节趾骨随远端一起移动。“对齐两片骨”可比较零位移。'
    : '灰蓝是跖骨，橙色是近节趾骨，浅色是中节与末节。切换骨折示意后可调整断端。'


  return (
    <ExhibitWorkspace
      banner={
        mode === 'guide' ? (
          <StepGuide
            steps={BONE_STEPS.map((step) => ({ id: step.id, title: step.title, body: step.body }))}
            index={guide.index}
            onIndexChange={(index) => {
              guide.setIndex(index)
              applyStep(index)
            }}
            onExit={() => {
              clock.pause()
              onModeChange?.('free')
            }}
          />
        ) : (
          <LiveCaption state={state} progress={repairClock.progress} />
        )
      }
      stage={
        <div className="bone-stage-shell">
          <ExperimentTabs tab={state.tab} onChange={changeTab} />
          <nav className="bone-route" aria-label="四个观察场景">
            <button onClick={() => explore('whole')}>① 整足定位</button>
            <button onClick={() => explore('fracture')}>② 断端特写</button>
            <button onClick={() => explore('load')}>③ 受力实验</button>
            <button onClick={() => explore('repair')}>④ 修复过程</button>
          </nav>
          <div className="bone-scene-brief" aria-live="polite">
            <h2>{sceneTitle}</h2><p>{sceneBody}</p>
            <div className="bone-scene-status">
              <span>{cutaway ? '剖切已开启：主动移除了足背侧一半' : '完整外形：未启用剖切'}</span>
              {cutaway ? <button onClick={() => state.tab === 'repair' ? patchRepair({ cutaway: false }) : patchStructure({ cutaway: false })}>恢复完整外形</button> : null}
            </div>
          </div>
          <div className="bone-stage-wrap">
            <ModelStage<BoneStageState>
              className="bone-stage"
              factory={factory}
              onFrame={onFrame}
              ariaLabel="右足骨骼三维模型：可旋转缩放，顶部可切换结构与断端、受力示意、通用修复三个页签"
              hint={state.tab === 'structure' ? '拖动旋转 · 滚轮缩放 · 单击骨选中 · Esc 退出全屏' : '拖动旋转 · 滚轮缩放 · Esc 退出全屏'}
              resetCameraNonce={resetNonce}
              onUserOrbit={() => setCameraMoved(true)}
              onFullscreenChange={setFullscreen}
              notice={<>
              {fullscreen ? <button className="bone-fullscreen-exit" onClick={() => void exitFullscreen()}>退出全屏</button> : null}
            <p className="bone-stage__meta" aria-hidden="true">
              右足 · 第 5 趾 · {CAMERA_LABELS[state.camera]}
            </p>
            <div className="bone-labels" ref={overlayRef} aria-hidden="true">
              <svg className="bone-labels__lines">
                {labels.map((label) => (
                  <g key={label.id}>
                    <line
                      ref={(element) => {
                        if (element) lineRefs.current.set(label.id, element)
                        else lineRefs.current.delete(label.id)
                      }}
                    />
                    <circle
                      r="2.4"
                      ref={(element) => {
                        if (element) dotRefs.current.set(label.id, element)
                        else dotRefs.current.delete(label.id)
                      }}
                    />
                  </g>
                ))}
              </svg>
              {labels.map((label) => (
                <div
                  key={label.id}
                  className={`bone-label bone-label--${label.tone ?? 'default'}`}
                  ref={(element) => {
                    if (element) labelRefs.current.set(label.id, element)
                    else labelRefs.current.delete(label.id)
                  }}
                >
                  {label.text}
                </div>
              ))}
            </div>
              </>}
              fallback={
                <BoneFallback
                  tab={state.tab}
                  fractured={state.structure.fractured}
                  cutaway={state.structure.cutaway}
                  loadMode={state.load.mode}
                  load={state.load.load}
                  repairStage={repairStageIndex(repairClock.progress)}
                />
              }
            />
          </div>
          {state.tab === 'repair' ? <div className="bone-stage-phases" aria-label="直接观察修复阶段">
            {REPAIR_COPY.map((copy, index) => <button key={copy.name} aria-pressed={index === repairStageIndex(repairClock.progress)} onClick={() => clock.setStage(index)}>{index + 1}. {copy.short}</button>)}
          </div> : null}
        </div>
      }
      controls={
        <BoneControls
          state={state}
          repairClock={repairClock}
          cameraMoved={cameraMoved}
          onStructureChange={patchStructure}
          onPoseChange={patchPose}
          onLoadChange={patchLoad}
          onRepairChange={patchRepair}
          onFindTarget={() => changeCamera('local')}
          onWholeFoot={() => changeCamera('dorsal')}
          onCameraChange={changeCamera}
          onResetCamera={resetCamera}
          onResetTab={resetCurrent}
          onSelect={(id) => patchStructure({ selected: id })}
          onRepairStage={(index) => clock.setStage(index)}
          onRepairProgress={(progress) => {
            clock.setProgress(progress)
            clock.pause()
          }}
          onRepairPlayToggle={() => clock.toggle()}
          onRepairSpeed={(speed) => clock.setSpeed(speed)}
          onRepairReset={() => clock.reset()}
        />
      }
      notes={
        <>
          <div className="bone-note">
            <p className="bone-note__lead">{MODEL_NOTE}</p>
            <p className="bone-note__body">
              {state.tab === 'structure' ? STRUCTURE_COPY.lead : null}
              {state.tab === 'load'
                ? '箭头只表示方向与相对强弱（归一化 λ）；画面里的形变经过放大，不是真实形变量。'
                : null}
              {state.tab === 'repair'
                ? '四个阶段来自通用教材描述；阶段区间只用于讲解节奏，不对应天数、愈合率或承重能力。'
                : null}
            </p>
          </div>

          <div className="bone-terms">
            {TERM_COPY.map((term) => (
              <div className="bone-term" key={term.term}>
                <p className="bone-term__name">{term.term}</p>
                <p className="bone-term__text">{term.text}</p>
              </div>
            ))}
          </div>

          {state.tab === 'structure' ? (
            <div className="bone-panel">
              <h2 className="bone-panel__title">结构与断端</h2>
              <p>
                目标骨是右足第 5 近节趾骨：基底膨大、骨干细、远端有头。{' '}
                {state.structure.fractured ? STRUCTURE_COPY.fractured : STRUCTURE_COPY.intact}
              </p>
              <p className="bone-panel__preset">
                <span className="bone-badge">预制形态示意</span>
                裂面由同一张骨网格切开，两片断面来自同一个切割面；裂隙、横移、旋转是独立的模型参数。
              </p>
              <p>{STRUCTURE_COPY.cutawayNote}</p>
              <p>{STRUCTURE_COPY.resetNote}</p>
            </div>
          ) : null}

          {state.tab === 'load' ? (
            <div className="bone-panel">
              <h2 className="bone-panel__title">受力示意</h2>
              <dl className="bone-load-list">
                {LOAD_COPY.map((copy) => (
                  <div key={copy.id} className="bone-load-item">
                    <dt>{copy.label}</dt>
                    <dd>
                      施力：{copy.where}；约束：{copy.constraint}；形变：{copy.deformation}。
                    </dd>
                  </div>
                ))}
              </dl>
              <p>
                λ 只控制箭头长度与极小的示意形变；本页不提供断裂阈值、疼痛预测或「能不能承重」的结论，
                三种方向也不用来判断任何人的受伤机制。
              </p>
            </div>
          ) : null}

          {state.tab === 'repair' ? (
            <div className="bone-panel">
              <h2 className="bone-panel__title">通用修复</h2>
              <ol className="bone-repair-list">
                {REPAIR_COPY.map((copy, index) => (
                  <li key={copy.name} className="bone-repair-item">
                    <p className="bone-repair-item__name">
                      <span className="mono">{index + 1}</span> {copy.name}
                    </p>
                    <p>{copy.change}</p>
                    <p className="bone-repair-item__plain">{copy.plain}</p>
                    <p className="bone-repair-item__diff">与前一阶段的区别：{copy.difference}</p>
                  </li>
                ))}
              </ol>
              <p>{REPAIR_BOUNDARY.notDays}</p>
              <p>{REPAIR_BOUNDARY.notStrength}</p>
              <p>{REPAIR_BOUNDARY.overlap}</p>
              <p>{REPAIR_BOUNDARY.scene}</p>
              <p>{REPAIR_BOUNDARY.surface}</p>
            </div>
          ) : null}

          <details className="bone-details">
            <summary>模型边界与未实现的内容</summary>
            <dl className="bone-boundaries">
              {BOUNDARIES.map((item) => (
                <div key={item.title} className="bone-boundary">
                  <dt>{item.title}</dt>
                  <dd>{item.body}</dd>
                </div>
              ))}
            </dl>
          </details>

          <details className="bone-details">
            <summary>资料与出处</summary>
            <ol className="bone-references">
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
