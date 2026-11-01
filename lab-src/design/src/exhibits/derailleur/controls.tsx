import { Button } from '../../components/controls/Button'
import { CameraBar } from '../../components/controls/CameraBar'
import { ControlPanel, ControlSection } from '../../components/controls/ControlPanel'
import { Readout, type ReadoutItem } from '../../components/controls/Readout'
import { SegmentedControl } from '../../components/controls/SegmentedControl'
import { SliderControl } from '../../components/controls/SliderControl'
import { ToggleControl } from '../../components/controls/ToggleControl'
import { TransportBar } from '../../components/controls/TransportBar'
import { fmt, fmtFixed } from '../../lib/format'
import { CAMERA_VIEWS, PART_INFO, type CameraViewId } from './content'
import type { DrivetrainSnapshot } from './controller'
import type { PartId } from './geometry'
import type { DriveResult, GearInfo } from './model'

const PART_ORDER: PartId[] = [
  'chainring',
  'crank',
  'chain',
  'cassette',
  'guidePulley',
  'tensionPulley',
  'cage',
  'parallelogram',
  'bKnuckle',
  'wheel',
  'frame',
]

export interface DerailleurControlsProps {
  snapshot: DrivetrainSnapshot
  drive: DriveResult
  gears: GearInfo[]
  /** 滑行时的后轮转速（rpm），驱动时等于 drive.wheelRpm */
  coastRpm: number
  playing: boolean
  speed: number
  cameraView: CameraViewId
  cameraMoved: boolean
  /** 旁观者模式：指针锁定 + WASD 自由飞行 */
  spectator: boolean
  showWheel: boolean
  showFrame: boolean
  chainHighlight: boolean
  selected: PartId | null
  onTogglePlay: () => void
  onReset: () => void
  onSpeedChange: (speed: number) => void
  onCadenceChange: (rpm: number) => void
  onTorqueChange: (nm: number) => void
  onEfficiencyChange: (value: number) => void
  onRequestGear: (index: number) => void
  onStepGear: (delta: number) => void
  onModeChange: (mode: 'drive' | 'coast') => void
  onCameraViewChange: (view: CameraViewId) => void
  onResetCamera: () => void
  onSpectatorChange: (value: boolean) => void
  onShowWheelChange: (value: boolean) => void
  onShowFrameChange: (value: boolean) => void
  onChainHighlightChange: (value: boolean) => void
  onSelect: (part: PartId | null) => void
}

export function DerailleurControls({
  snapshot,
  drive,
  gears,
  coastRpm,
  playing,
  speed,
  cameraView,
  cameraMoved,
  spectator,
  showWheel,
  showFrame,
  chainHighlight,
  selected,
  onTogglePlay,
  onReset,
  onSpeedChange,
  onCadenceChange,
  onTorqueChange,
  onEfficiencyChange,
  onRequestGear,
  onStepGear,
  onModeChange,
  onCameraViewChange,
  onResetCamera,
  onSpectatorChange,
  onShowWheelChange,
  onShowFrameChange,
  onChainHighlightChange,
  onSelect,
}: DerailleurControlsProps) {
  const engagedGear = gears[snapshot.engaged]
  const targetGear = gears[snapshot.target]
  const coasting = snapshot.mode === 'coast'
  const heavierBlocked = snapshot.target >= gears.length - 1
  const lighterBlocked = snapshot.target <= 0

  const shiftLabel = snapshot.shifting
    ? `换挡中 → ${targetGear?.teeth}T`
    : snapshot.waiting
      ? `等待踩踏：已请求 ${targetGear?.teeth}T`
      : `已啮合 ${engagedGear?.teeth}T`

  const readouts: ReadoutItem[] = coasting
    ? [
        { label: '当前状态', value: '滑行', hint: '后轮经单向离合与飞轮脱开，飞轮与链条停下，不套用稳态齿比关系。' },
        {
          label: '后轮转速',
          value: fmtFixed(coastRpm, 1),
          unit: 'rpm',
          source: 'assumption',
          hint: '教学阻尼下的示意值，不是实测滚阻。',
        },
        {
          label: '曲柄 / 飞轮',
          value: '不转',
          hint: '滑行时脚踏与链条可以停住，后轮继续转。',
        },
        { label: '当前挡位', value: `${snapshot.engaged + 1}`, unit: '挡', hint: `${engagedGear?.teeth}T · 齿比 ${fmt(drive.ratio, 3)}（驱动时才成立）` },
      ]
    : [
        {
          label: '当前挡位',
          value: `${snapshot.engaged + 1} / ${gears.length}`,
          hint: `${engagedGear?.teeth}T · 传动比 ${fmt(drive.ratio, 4)}`,
        },
        {
          label: '后轮转速',
          value: fmtFixed(drive.wheelRpm, 1),
          unit: 'rpm',
          hint: `= 踏频 ${snapshot.cadenceRpm} × 齿比 ${fmt(drive.ratio, 3)}`,
        },
        {
          label: '理论车速',
          value: fmtFixed(drive.speedKmh, 2),
          unit: 'km/h',
          source: 'assumption',
          hint: '理想稳态换算，不是爬坡速度预测；轮径按教学近似值。',
        },
        {
          label: '理想轮端力矩',
          value: fmtFixed(drive.wheelTorqueNm, 2),
          unit: 'N·m',
          source: 'assumption',
          hint: `= η ${fmt(snapshot.efficiency, 2)} × 曲柄力矩 ${fmt(snapshot.torqueNm, 0)} / 齿比 ${fmt(drive.ratio, 3)}`,
        },
        {
          label: '输入功率',
          value: fmtFixed(drive.inputPowerW, 1),
          unit: 'W',
          hint: `= ${fmt(snapshot.torqueNm, 0)} N·m × 2π × ${snapshot.cadenceRpm} / 60`,
        },
        {
          label: '输出功率',
          value: fmtFixed(drive.outputPowerW, 1),
          unit: 'W',
          hint:
            snapshot.efficiency >= 0.999
              ? '效率取 1 时与输入功率相等（理想无损耗）'
              : `= 输入功率 × η = ${fmtFixed(drive.inputPowerW * snapshot.efficiency, 1)} W`,
        },
        {
          label: '链条速度',
          value: fmtFixed(drive.chainSpeedMs, 3),
          unit: 'm/s',
          hint: '按 v = 节距 × 前齿数 × 踏频 / 60，忽略多边形效应的微小差别。',
        },
      ]

  return (
    <ControlPanel
      title="变速器控制"
      subtitle="换挡、踏频、力矩与镜头；读数全部来自同一个模型状态"
      actions={
        <Button size="sm" variant="quiet" onClick={onReset}>
          全部重置
        </Button>
      }
    >
      <ControlSection
        title="换挡"
        hint="先看目标与已啮合是否一致：停踩时请求会排队，链条转起来才执行。"
      >
        <div className="drv-shift">
          <Button
            variant="primary"
            onClick={() => onStepGear(1)}
            disabled={heavierBlocked}
            title="换到更大的后齿片"
          >
            换轻挡（更大后齿片）
          </Button>
          <Button onClick={() => onStepGear(-1)} disabled={lighterBlocked} title="换到更小的后齿片">
            换重挡（更小后齿片）
          </Button>
        </div>

        <p className={`drv-shift__state${snapshot.shifting ? ' is-shifting' : ''}${snapshot.waiting ? ' is-waiting' : ''}`}>
          <span className="drv-shift__dot" aria-hidden="true" />
          {shiftLabel}
        </p>

        <ul className="drv-cogs" aria-label="选择后飞轮齿片">
          {gears.map((gear) => {
            const isEngaged = gear.index === snapshot.engaged
            const isTarget = gear.index === snapshot.target && !isEngaged
            return (
              <li key={gear.index}>
                <button
                  type="button"
                  className={`drv-cog${isEngaged ? ' is-engaged' : ''}${isTarget ? ' is-target' : ''}`}
                  aria-pressed={isEngaged}
                  onClick={() => onRequestGear(gear.index)}
                >
                  <span className="drv-cog__teeth">{gear.teeth}T</span>
                  <span className="drv-cog__index">{gear.index + 1}</span>
                </button>
              </li>
            )
          })}
        </ul>
        <p className="drv-hint">
          深色实心 = 已完成啮合；虚线框 = 已请求但还没换过去。过渡中链条横向移动只是示意，落位后才改变传动比。
        </p>
      </ControlSection>

      <ControlSection title="踏频" hint="0 表示不踩：链条停下，换挡请求开始排队。">
        <div className="drv-cadence">
          <label className="drv-number" htmlFor="drv-cadence-input">
            <span>踏频</span>
            <input
              id="drv-cadence-input"
              type="number"
              min={0}
              max={120}
              step={1}
              value={snapshot.cadenceRpm}
              onChange={(event) => onCadenceChange(Number(event.target.value))}
            />
            <span className="drv-number__unit">rpm</span>
          </label>
        </div>
        <SliderControl
          label="踏频"
          value={snapshot.cadenceRpm}
          min={0}
          max={120}
          step={1}
          unit="rpm"
          onChange={onCadenceChange}
        />
        <p className="drv-hint">
          滑块与数字框同步。观察倍速只改变你看到的快慢，不改变这里的 rpm：踏频 {snapshot.cadenceRpm} rpm 就是模型里的真实转速。
        </p>
      </ControlSection>

      <ControlSection title="输入力矩（教学设定）">
        <SliderControl
          label="曲柄输入力矩"
          value={snapshot.torqueNm}
          min={5}
          max={60}
          step={1}
          unit="N·m"
          source="assumption"
          hint="只用于理想轮端力矩与功率的换算，不是实测踩踏力矩。"
          onChange={onTorqueChange}
        />
        <SegmentedControl
          label="传动效率"
          value={snapshot.efficiency >= 0.999 ? '1' : '0.97'}
          onChange={(value) => onEfficiencyChange(Number(value))}
          options={[
            { value: '1', label: '理想 η = 1', hint: '输入输出功率相等' },
            { value: '0.97', label: '假设 η = 0.97', hint: '资料包给的假设值，不是实测' },
          ]}
        />
      </ControlSection>

      <ControlSection title="观察">
        <TransportBar
          playing={playing}
          speed={speed}
          onToggle={onTogglePlay}
          onReset={onReset}
          onSpeedChange={onSpeedChange}
          timeLabel={`${fmtFixed(snapshot.chainTravel / 1000, 2)} m`}
          timeLabelPrefix="链条累计行程"
          speeds={[0.1, 0.25, 0.5, 1] as const}
        />
        <SegmentedControl<'drive' | 'coast'>
          label="驱动方式"
          value={snapshot.mode}
          onChange={onModeChange}
          options={[
            { value: 'drive', label: '踩踏驱动', hint: '链条带着后轮转' },
            { value: 'coast', label: '滑行演示', hint: '后轮转、链条与脚踏停' },
          ]}
        />
        {coasting && (
          <p className="drv-hint">
            滑行时后轮从 90 rpm 开始按教学阻尼衰减，飞轮与链条停住——这时候轮速不再等于踏频 × 齿比。
          </p>
        )}
      </ControlSection>

      <ControlSection title="视角">
        <SegmentedControl<CameraViewId>
          label="预设视角"
          value={cameraView}
          onChange={onCameraViewChange}
          options={(Object.keys(CAMERA_VIEWS) as CameraViewId[]).map((id) => ({
            value: id,
            label: CAMERA_VIEWS[id].label,
            hint: CAMERA_VIEWS[id].hint,
          }))}
          orientation="vertical"
        />
        <CameraBar cameraMoved={cameraMoved} onResetCamera={onResetCamera} />
      </ControlSection>

      <ControlSection
        title="旁观者模式"
        hint="关掉轨道镜头，像游戏那样自由走动：点击模型画面锁定鼠标后，WASD 平移、鼠标环顾、滚轮换挡（上滚换轻挡、下滚换重挡）、Q/E 升降、Shift 加速；按 Esc 退出。它是单独的一种观看模式，退出后回到预设视角的镜头。"
      >
        <ToggleControl
          label="旁观者模式"
          checked={spectator}
          onChange={onSpectatorChange}
          onLabel="开（自由飞行）"
          offLabel="关（轨道镜头）"
        />
      </ControlSection>

      <ControlSection title="显示" hint="隐藏轮圈与车架后才能看清链条与后拨的关系。">
        <ToggleControl label="显示后轮" checked={showWheel} onChange={onShowWheelChange} />
        <ToggleControl label="显示车架" checked={showFrame} onChange={onShowFrameChange} />
        <ToggleControl
          label="高亮链条"
          checked={chainHighlight}
          onChange={onChainHighlightChange}
          hint="把整圈链条标成暖色，便于跟踪它的闭合走向。"
        />
      </ControlSection>

      <ControlSection title="零件" hint="点模型上的零件或下面的按钮，会高亮并说明它在这一状态里做什么。">
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
        <p className="drv-hint">
          {selected ? (
            <>
              <strong>{PART_INFO[selected].label}</strong>：{PART_INFO[selected].role}
            </>
          ) : (
            '还没有选中零件。'
          )}
        </p>
      </ControlSection>

      <ControlSection title="读数">
        <Readout items={readouts} />
      </ControlSection>
    </ControlPanel>
  )
}
