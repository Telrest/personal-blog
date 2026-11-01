import type { PenSnapshot } from './controller'
import { CONTACT_INFO, PART_INFO, STABLE_INFO, VIEW_MODE_INFO, CAMERA_VIEWS, type CameraViewId } from './content'
import type { PartId, ViewMode } from './geometry'
import { PEN } from './model'
import { Button } from '../../components/controls/Button'
import { CameraBar } from '../../components/controls/CameraBar'
import { ControlPanel, ControlSection } from '../../components/controls/ControlPanel'
import { Readout } from '../../components/controls/Readout'
import { SegmentedControl } from '../../components/controls/SegmentedControl'
import { SliderControl } from '../../components/controls/SliderControl'
import { TransportBar } from '../../components/controls/TransportBar'

export interface PenControlsProps {
  snapshot: PenSnapshot
  playing: boolean
  speed: number
  onTogglePlay: () => void
  onReset: () => void
  onSpeedChange: (speed: number) => void
  onPressOnce: () => void
  onHoldDown: () => void
  onHoldRelease: () => void
  onAbortDemo: () => void
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  cameraView: CameraViewId
  onCameraViewChange: (view: CameraViewId) => void
  cameraMoved: boolean
  onResetCamera: () => void
  clipOpen: number
  onClipOpenChange: (value: number) => void
  selected: PartId | null
  onSelect: (part: PartId | null) => void
}

const PART_ORDER: PartId[] = ['cap', 'plunger', 'rotor', 'guide', 'refill', 'spring', 'barrel', 'clip', 'cone']

export function PenControls({
  snapshot,
  playing,
  speed,
  onTogglePlay,
  onReset,
  onSpeedChange,
  onPressOnce,
  onHoldDown,
  onHoldRelease,
  onAbortDemo,
  viewMode,
  onViewModeChange,
  cameraView,
  onCameraViewChange,
  cameraMoved,
  onResetCamera,
  clipOpen,
  onClipOpenChange,
  selected,
  onSelect,
}: PenControlsProps) {
  const busy = snapshot.moving || snapshot.dragging
  const stable = STABLE_INFO[snapshot.stable]
  const contact = CONTACT_INFO[snapshot.pose.contact]

  return (
    <ControlPanel
      title="按动笔控制"
      subtitle="按钮操作和直接用鼠标按帽，走的是同一套模型"
      actions={
        <Button size="sm" variant="quiet" onClick={onReset}>
          全部重置
        </Button>
      }
    >
      <ControlSection title="按动" hint="按帽可以直接用鼠标按住往下拖；松手时由机构决定这次算不算数。">
        <div className="pen-actions">
          <Button variant="primary" onClick={onPressOnce} disabled={busy}>
            按一下
          </Button>
          <Button onClick={onHoldDown} disabled={snapshot.dragging}>
            按住不放
          </Button>
          <Button onClick={onHoldRelease} disabled={!snapshot.dragging}>
            松开
          </Button>
          <Button variant="quiet" onClick={onAbortDemo} disabled={busy}>
            按到一半就松手
          </Button>
        </div>
        <p className="pen-hint">
          「按到一半就松手」演示未达到提交条件：索引角会沿原路退回，伸缩状态不变。
        </p>
      </ControlSection>

      <ControlSection title="观察">
        <TransportBar
          playing={playing}
          speed={speed}
          onToggle={onTogglePlay}
          onReset={onReset}
          onSpeedChange={onSpeedChange}
          timeLabel={`${snapshot.pose.x.toFixed(2)} mm`}
          timeLabelPrefix="机构位移"
          speeds={[0.25, 0.5, 1] as const}
        />
        <CameraBar cameraMoved={cameraMoved} onResetCamera={onResetCamera} />
      </ControlSection>

      <ControlSection title="查看方式">
        <SegmentedControl<ViewMode>
          label="展示方式"
          value={viewMode}
          onChange={onViewModeChange}
          orientation="vertical"
          options={[
            { value: 'exterior', label: VIEW_MODE_INFO.exterior.label, hint: VIEW_MODE_INFO.exterior.hint },
            { value: 'cutaway', label: VIEW_MODE_INFO.cutaway.label, hint: VIEW_MODE_INFO.cutaway.hint },
            { value: 'exploded', label: VIEW_MODE_INFO.exploded.label, hint: VIEW_MODE_INFO.exploded.hint },
          ]}
        />
        <SegmentedControl<CameraViewId>
          label="预设视角"
          value={cameraView}
          onChange={onCameraViewChange}
          options={(Object.keys(CAMERA_VIEWS) as CameraViewId[]).map((id) => ({
            value: id,
            label: CAMERA_VIEWS[id].label,
          }))}
        />
      </ControlSection>

      <ControlSection title="笔夹（与锁止无关）">
        <SliderControl
          label="抬起角度"
          value={clipOpen}
          min={0}
          max={PEN.clipOpenAngleMax}
          step={1}
          unit="°"
          source="assumption"
          hint="独立演示，不影响按动锁止——笔夹抬起时笔芯不会跟着缩回。"
          onChange={onClipOpenChange}
        />
      </ControlSection>

      <ControlSection title="零件">
        <ul className="part-list">
          {PART_ORDER.map((id) => (
            <li key={id}>
              <button
                type="button"
                className={`part-chip${selected === id ? ' is-active' : ''}`}
                aria-pressed={selected === id}
                onClick={() => onSelect(selected === id ? null : id)}
              >
                <span className="part-chip__dot" aria-hidden="true">
                  {selected === id ? '●' : '○'}
                </span>
                {PART_INFO[id].label}
              </button>
            </li>
          ))}
        </ul>
        <p className="pen-hint">
          {selected ? (
            <>
              <strong>{PART_INFO[selected].label}</strong>：{PART_INFO[selected].role}
            </>
          ) : (
            '点模型上的零件或上面的按钮选中它，会高亮并说明作用。'
          )}
        </p>
      </ControlSection>

      <ControlSection title="当前状态">
        <Readout
          items={[
            { label: '稳定状态', value: `${stable.label}`, hint: stable.detail },
            {
              label: '转子索引角 θ',
              value: `${snapshot.pose.theta.toFixed(1)}°`,
              source: 'assumption',
              hint: `第 ${snapshot.pose.slotIndex + 1} 个索引位（${snapshot.pose.slotKind === 'deep' ? '深导槽' : '浅锁止位'}）`,
            },
            {
              label: '机构位移 x',
              value: snapshot.pose.x.toFixed(2),
              unit: 'mm',
              source: 'assumption',
            },
            {
              label: '笔尖 Z',
              value: snapshot.pose.tipZ.toFixed(2),
              unit: 'mm',
              source: 'assumption',
              hint: snapshot.pose.tipZ < 0 ? '伸出出芯口' : '收在出芯口内',
            },
            {
              label: '弹簧长度',
              value: snapshot.pose.springLength.toFixed(2),
              unit: 'mm',
              source: 'assumption',
              hint: `压缩 ${snapshot.pose.springCompression.toFixed(2)} mm（自由长度 18 mm）`,
            },
            { label: '关键接触', value: contact.label, hint: contact.note },
            { label: '完成循环', value: String(snapshot.cycle), unit: '次' },
          ]}
        />
      </ControlSection>
    </ControlPanel>
  )
}
