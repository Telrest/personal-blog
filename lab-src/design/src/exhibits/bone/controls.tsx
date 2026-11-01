/**
 * 骨骼展品的控制面板：三个页签各有一套控制，不混在一起。
 * 这里只把用户操作写回状态，不另存显示数值。
 */

import { Button } from '../../components/controls/Button'
import { CameraBar } from '../../components/controls/CameraBar'
import { ControlPanel, ControlSection } from '../../components/controls/ControlPanel'
import { Readout } from '../../components/controls/Readout'
import { SegmentedControl } from '../../components/controls/SegmentedControl'
import { SliderControl } from '../../components/controls/SliderControl'
import { ToggleControl } from '../../components/controls/ToggleControl'
import { TransportBar } from '../../components/controls/TransportBar'
import {
  CAMERA_LABELS,
  FRACTURE_COPY,
  KEY_STRUCTURES,
  LOAD_COPY,
  LOAD_COPY_COMMON,
  REPAIR_BOUNDARY,
  REPAIR_COPY,
  STRUCTURE_CAMERAS,
  STRUCTURE_COPY,
  TAB_COPY,
  legendFor,
} from './content'
import { DEFAULT_POSE, repairStageIndex, type FracturePose, type LoadMode } from './model'
import {
  REPAIR_SPEEDS,
  type BoneState,
  type CameraId,
  type LoadState,
  type RepairClockState,
  type StructureState,
} from './state'

export interface BoneControlsProps {
  state: BoneState
  repairClock: RepairClockState
  cameraMoved: boolean
  /** 当前页签的实时说明（结构 / 受力 / 修复各一句） */
  onStructureChange: (patch: Partial<StructureState>) => void
  onPoseChange: (patch: Partial<FracturePose>) => void
  onLoadChange: (patch: Partial<LoadState>) => void
  onRepairChange: (patch: Partial<BoneState['repair']>) => void
  onFindTarget: () => void
  onWholeFoot: () => void
  onCameraChange: (camera: CameraId) => void
  onResetCamera: () => void
  onResetTab: () => void
  onSelect: (id: string | null) => void
  onRepairStage: (index: number) => void
  onRepairProgress: (progress: number) => void
  onRepairPlayToggle: () => void
  onRepairSpeed: (speed: number) => void
  onRepairReset: () => void
}

export function BoneControls({
  state,
  repairClock,
  cameraMoved,
  onStructureChange,
  onPoseChange,
  onLoadChange,
  onRepairChange,
  onFindTarget,
  onWholeFoot,
  onCameraChange,
  onResetCamera,
  onResetTab,
  onSelect,
  onRepairStage,
  onRepairProgress,
  onRepairPlayToggle,
  onRepairSpeed,
  onRepairReset,
}: BoneControlsProps) {
  const tabCopy = TAB_COPY.find((item) => item.id === state.tab) ?? TAB_COPY[0]
  const legend = legendFor(state.tab)

  return (
    <ControlPanel
      title="骨骼控制"
      subtitle={tabCopy.label}
      actions={
        <Button size="sm" variant="quiet" onClick={onResetTab}>
          重置本实验
        </Button>
      }
    >
      {state.tab === 'structure' ? (
        <StructureControls
          structure={state.structure}
          camera={state.camera}
          cameraMoved={cameraMoved}
          onStructureChange={onStructureChange}
          onPoseChange={onPoseChange}
          onFindTarget={onFindTarget}
          onWholeFoot={onWholeFoot}
          onCameraChange={onCameraChange}
          onResetCamera={onResetCamera}
          onSelect={onSelect}
        />
      ) : null}

      {state.tab === 'load' ? (
        <LoadControls
          load={state.load}
          cameraMoved={cameraMoved}
          onLoadChange={onLoadChange}
          onCameraChange={onCameraChange}
          onResetCamera={onResetCamera}
        />
      ) : null}

      {state.tab === 'repair' ? (
        <RepairControls
          repairClock={repairClock}
          repair={state.repair}
          cameraMoved={cameraMoved}
          onRepairChange={onRepairChange}
          onRepairStage={onRepairStage}
          onRepairProgress={onRepairProgress}
          onRepairPlayToggle={onRepairPlayToggle}
          onRepairSpeed={onRepairSpeed}
          onRepairReset={onRepairReset}
          onResetCamera={onResetCamera}
        />
      ) : null}

      <ControlSection title="图例（本页）">
        <ul className="bone-legend">
          {legend.map((entry) => (
            <li key={entry.label} className="bone-legend__item">
              <span className="bone-legend__swatch" style={{ background: entry.color }} aria-hidden="true" />
              <span className="bone-legend__label">{entry.label}</span>
              {entry.note ? <span className="bone-legend__note">{entry.note}</span> : null}
            </li>
          ))}
        </ul>
        <p className="bone-hint">颜色只在本页里表示这一件事；换页签时图例会跟着换。</p>
      </ControlSection>
    </ControlPanel>
  )
}

/* ---------------------------------------------------------------- 结构 */

interface StructureControlsProps {
  structure: StructureState
  camera: CameraId
  cameraMoved: boolean
  onStructureChange: (patch: Partial<StructureState>) => void
  onPoseChange: (patch: Partial<FracturePose>) => void
  onFindTarget: () => void
  onWholeFoot: () => void
  onCameraChange: (camera: CameraId) => void
  onResetCamera: () => void
  onSelect: (id: string | null) => void
}

function StructureControls({
  structure,
  camera,
  cameraMoved,
  onStructureChange,
  onPoseChange,
  onFindTarget,
  onWholeFoot,
  onCameraChange,
  onResetCamera,
  onSelect,
}: StructureControlsProps) {
  const selectedInfo = KEY_STRUCTURES.find((item) => item.id === structure.selected)
  const local = camera === 'local'

  return (
    <>
      <ControlSection title="定位">
        <div className="bone-actions">
          <Button variant={local ? undefined : 'primary'} onClick={onFindTarget}>
            定位并放大小趾
          </Button>
          <Button variant={local ? 'quiet' : undefined} onClick={onWholeFoot}>
            回看整足
          </Button>
        </div>
        <p className="bone-hint">{local ? STRUCTURE_COPY.local : STRUCTURE_COPY.wholeFoot}</p>
      </ControlSection>

      <ControlSection title="对照与显示">
        <SegmentedControl<'intact' | 'fractured'>
          label="骨的状态"
          value={structure.fractured ? 'fractured' : 'intact'}
          onChange={(value) => onStructureChange({ fractured: value === 'fractured' })}
          options={[
            { value: 'intact', label: '完整对照' },
            { value: 'fractured', label: '基底部骨折示意' },
          ]}
        />
        <ToggleControl
          label="只看第 5 趾列"
          checked={structure.isolate}
          onChange={(value) => onStructureChange({ isolate: value })}
          onLabel="只看第 5 趾列"
          offLabel="显示全部 26 块"
          hint={STRUCTURE_COPY.isolateNote}
        />
        <ToggleControl
          label="剖切皮质与内部"
          checked={structure.cutaway}
          onChange={(value) => onStructureChange({ cutaway: value })}
          onLabel="已剖开足背侧一半"
          offLabel="完整外形"
          hint={STRUCTURE_COPY.cutawayNote}
        />
      </ControlSection>

      {structure.fractured ? <ControlSection title="断端姿态" hint={FRACTURE_COPY.poseBody}>
        <p className="bone-preset">{FRACTURE_COPY.presetTitle}</p>
        <SliderControl
          label="裂隙（沿骨轴）"
          value={structure.pose.gap}
          min={0}
          max={2.5}
          step={0.1}
          unit="mm"
          source="assumption"
          display={structure.pose.gap.toFixed(1)}
          onChange={(value) => onPoseChange({ gap: value })}
        />
        <SliderControl
          label="模型偏移（横向）"
          value={structure.pose.offset}
          min={0}
          max={3}
          step={0.1}
          unit="mm"
          source="assumption"
          display={structure.pose.offset.toFixed(1)}
          onChange={(value) => onPoseChange({ offset: value })}
        />
        <SliderControl
          label="模型角度（断端旋转）"
          value={structure.pose.angulation}
          min={-15}
          max={15}
          step={1}
          unit="°"
          source="assumption"
          display={structure.pose.angulation.toFixed(0)}
          onChange={(value) => onPoseChange({ angulation: value })}
        />
        <div className="bone-actions">
          <Button size="sm" onClick={() => onPoseChange({ gap: 0, offset: 0, angulation: 0 })}>
            对齐两片骨
          </Button>
          <Button size="sm" variant="quiet" onClick={() => onPoseChange({ ...DEFAULT_POSE })}>
            恢复演示姿态
          </Button>
        </div>
        <p className="bone-hint">{STRUCTURE_COPY.resetNote}</p>
      </ControlSection>
      : <p className="bone-hint">当前为完整对照。选择“基底部骨折示意”后，可调整三种断端参数。</p>}

      <ControlSection title="结构（可点击）">
        <ul className="bone-chips">
          {KEY_STRUCTURES.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={`bone-chip${structure.selected === item.id ? ' is-active' : ''}`}
                aria-pressed={structure.selected === item.id}
                onClick={() => onSelect(structure.selected === item.id ? null : item.id)}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
        <p className="bone-hint">
          {selectedInfo ? (
            <>
              <strong>{selectedInfo.label}</strong>：{selectedInfo.role}
            </>
          ) : (
            '点模型上的骨，或上面的按钮选中它；选中的结构会高亮并在模型旁标注。'
          )}
        </p>
      </ControlSection>

      <ControlSection title="读数">
        <Readout
          items={[
            {
              label: '目标骨长轴',
              value: '≈ 25.9',
              unit: 'mm',
              source: 'literature',
              hint: '来源模型比例；不是任何人的测量值。',
            },
            {
              label: '裂面位置',
              value: '18',
              unit: '% 距基底',
              source: 'assumption',
              hint: '教学设定，不是影像测量。',
            },
            { label: '裂面倾角', value: '20', unit: '°（与骨长轴）', source: 'assumption' },
            { label: '断面皮质厚度', value: '≈ 0.8', unit: 'mm', source: 'visual', hint: '仅剖切演示，不是实测厚度。' },
            {
              label: '当前断端姿态',
              value: `${structure.pose.gap.toFixed(1)} / ${structure.pose.offset.toFixed(1)} / ${structure.pose.angulation.toFixed(0)}`,
              hint: '裂隙 mm / 横移 mm / 旋转 °',
              source: 'assumption',
            },
          ]}
        />
      </ControlSection>

      <ControlSection title="镜头">
        <CameraBar
          cameraMoved={cameraMoved}
          onResetCamera={onResetCamera}
          views={STRUCTURE_CAMERAS.map((id) => ({ value: id, label: CAMERA_LABELS[id] }))}
          view={camera}
          onViewChange={(value) => onCameraChange(value as CameraId)}
        />
      </ControlSection>
    </>
  )
}

/* ---------------------------------------------------------------- 受力 */

interface LoadControlsProps {
  load: LoadState
  cameraMoved: boolean
  onLoadChange: (patch: Partial<LoadState>) => void
  onCameraChange: (camera: CameraId) => void
  onResetCamera: () => void
}

function LoadControls({ load, cameraMoved, onLoadChange, onResetCamera }: LoadControlsProps) {
  const copy = LOAD_COPY.find((item) => item.id === load.mode) ?? LOAD_COPY[0]
  return (
    <>
      <ControlSection title="施力方向">
        <SegmentedControl<LoadMode>
          label="受力方向"
          value={load.mode}
          orientation="vertical"
          onChange={(mode) => onLoadChange({ mode })}
          options={LOAD_COPY.map((item) => ({
            value: item.id,
            label: item.label,
            hint: item.where,
          }))}
        />
        <p className="bone-hint">{copy.note}</p>
      </ControlSection>

      <ControlSection title="强弱（归一化）">
        <SliderControl
          label="归一化载荷 λ"
          value={Math.round(load.load * 100)}
          min={0}
          max={100}
          step={1}
          unit="%"
          source="visual"
          display={`${Math.round(load.load * 100)}`}
          hint={LOAD_COPY_COMMON.lambda}
          onChange={(value) => onLoadChange({ load: value / 100 })}
        />
        <p className="bone-hint">
          <strong>施力</strong>：{copy.where}。<br />
          <strong>约束</strong>：{copy.constraint}。<br />
          <strong>形变</strong>：{copy.deformation}。
        </p>
      </ControlSection>

      <ControlSection title="对照">
        <SegmentedControl<'intact' | 'fractured'>
          label="对照几何"
          value={load.fractured ? 'fractured' : 'intact'}
          onChange={(value) => onLoadChange({ fractured: value === 'fractured' })}
          options={[
            { value: 'intact', label: '完整轮廓' },
            { value: 'fractured', label: '预设骨折' },
          ]}
        />
        <p className="bone-hint">
          {load.fractured ? LOAD_COPY_COMMON.compareFractured : LOAD_COPY_COMMON.compareIntact}
        </p>
        <p className="bone-hint">{LOAD_COPY_COMMON.noThreshold}</p>
      </ControlSection>

      <ControlSection title="读数">
        <Readout
          items={[
            { label: '归一化载荷 λ', value: `${Math.round(load.load * 100)}`, unit: '%', source: 'visual' },
            { label: '施力位置', value: copy.where, source: 'assumption' },
            { label: '约束方式', value: copy.constraint, source: 'assumption' },
            {
              label: '示意形变上限',
              value: load.fractured ? '0.8' : load.mode === 'axial' ? '0.35' : '3',
              unit: load.fractured || load.mode !== 'axial' ? '°' : 'mm',
              source: 'visual',
              hint: '画面已放大；不代表真实形变量。',
            },
          ]}
        />
      </ControlSection>

      <ControlSection title="镜头">
        <CameraBar cameraMoved={cameraMoved} onResetCamera={onResetCamera} />
      </ControlSection>
    </>
  )
}

/* ---------------------------------------------------------------- 修复 */

interface RepairControlsProps {
  repairClock: RepairClockState
  repair: BoneState['repair']
  cameraMoved: boolean
  onRepairChange: (patch: Partial<BoneState['repair']>) => void
  onRepairStage: (index: number) => void
  onRepairProgress: (progress: number) => void
  onRepairPlayToggle: () => void
  onRepairSpeed: (speed: number) => void
  onRepairReset: () => void
  onResetCamera: () => void
}

function RepairControls({
  repairClock,
  repair,
  cameraMoved,
  onRepairChange,
  onRepairStage,
  onRepairProgress,
  onRepairPlayToggle,
  onRepairSpeed,
  onRepairReset,
  onResetCamera,
}: RepairControlsProps) {
  const stageIndex = repairStageIndex(repairClock.progress)
  const stage = REPAIR_COPY[stageIndex]
  const percent = Math.round(repairClock.progress * 100)

  return (
    <>
      <ControlSection title="阶段（主控）" hint={REPAIR_BOUNDARY.stages}>
        <div className="bone-phases">
          {REPAIR_COPY.map((copy, index) => (
            <button
              key={copy.name}
              type="button"
              className={`bone-phase${index === stageIndex ? ' is-active' : ''}`}
              aria-pressed={index === stageIndex}
              onClick={() => onRepairStage(index)}
            >
              <span className="bone-phase__num mono">{index + 1}</span>
              <span className="bone-phase__name">{copy.name}</span>
            </button>
          ))}
        </div>
      </ControlSection>

      <ControlSection title="进度与播放">
        <TransportBar
          playing={repairClock.playing}
          speed={repairClock.speed}
          onToggle={onRepairPlayToggle}
          onReset={onRepairReset}
          onSpeedChange={onRepairSpeed}
          timeLabel={`${percent}%`}
          timeLabelPrefix="概念进度"
          speeds={REPAIR_SPEEDS}
        />
        <SliderControl
          label="拖动进度"
          value={percent}
          min={0}
          max={100}
          step={1}
          unit="%"
          source="visual"
          display={`${percent}`}
          hint="拖动会暂停；播放从当前位置继续，完成后可再次播放。"
          onChange={(value) => onRepairProgress(value / 100)}
        />
      </ControlSection>

      <ControlSection title="显示">
        <ToggleControl
          label="剖开看内骨痂"
          checked={repair.cutaway}
          onChange={(value) => onRepairChange({ cutaway: value })}
          onLabel="已剖开"
          offLabel="完整外形"
          hint={REPAIR_BOUNDARY.surface}
        />
      </ControlSection>

      <ControlSection title="当前阶段">
        <div className="bone-phase-card">
          <h3 className="bone-phase-card__title">{stage.name}</h3>
          <p className="bone-phase-card__line">{stage.change}</p>
          <p className="bone-phase-card__plain">{stage.plain}</p>
          <p className="bone-hint">与前一阶段的区别：{stage.difference}</p>
        </div>
        <p className="bone-hint">{REPAIR_BOUNDARY.notDays}</p>
        <p className="bone-hint">{REPAIR_BOUNDARY.notStrength}</p>
      </ControlSection>

      <ControlSection title="镜头">
        <CameraBar cameraMoved={cameraMoved} onResetCamera={onResetCamera} />
        <p className="bone-hint">{REPAIR_BOUNDARY.scene}</p>
      </ControlSection>
    </>
  )
}
