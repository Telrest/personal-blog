import { Button } from './Button'
import { SegmentedControl } from './SegmentedControl'

interface TransportBarProps {
  playing: boolean
  speed: number
  onToggle: () => void
  onReset: () => void
  onSpeedChange: (speed: number) => void
  /** 模型时间读数，例如「3.24 s」；只显示，不参与控制 */
  timeLabel?: string
  /** 读数前缀。按动笔这类没有周期时间的展品用「机构位移」更准确 */
  timeLabelPrefix?: string
  /** 可选的速度档位 */
  speeds?: readonly number[]
  disabled?: boolean
}

const DEFAULT_SPEEDS = [0.25, 0.5, 1, 2] as const

/**
 * 播放控制条：暂停 / 重置 / 观察速度。
 * 这三个是所有展品都必须支持的，所以做成统一组件，
 * 免得每个展品各写一套、行为不一致。
 */
export function TransportBar({
  playing,
  speed,
  onToggle,
  onReset,
  onSpeedChange,
  timeLabel,
  timeLabelPrefix = '模型时间',
  speeds = DEFAULT_SPEEDS,
  disabled = false,
}: TransportBarProps) {
  return (
    <div className="transport">
      <div className="transport__buttons">
        <Button variant="primary" onClick={onToggle} disabled={disabled}>
          {playing ? '暂停' : '播放'}
        </Button>
        <Button onClick={onReset} disabled={disabled}>
          重置
        </Button>
        {timeLabel && (
          <span className="transport__time">
            <span className="transport__time-label">{timeLabelPrefix}</span>
            <span className="mono">{timeLabel}</span>
          </span>
        )}
      </div>

      <div className="transport__speed">
        <span className="transport__speed-label" id="speed-label">
          观察速度
        </span>
        <SegmentedControl
          label="观察速度"
          value={String(speed)}
          options={speeds.map((item) => ({ value: String(item), label: `${item}×` }))}
          onChange={(next) => onSpeedChange(Number(next))}
        />
      </div>
    </div>
  )
}
