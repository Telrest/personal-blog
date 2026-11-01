import type { ExhibitMode } from '../exhibits/types'
import { SegmentedControl } from './controls/SegmentedControl'

interface ModeSwitchProps {
  mode: ExhibitMode
  onChange: (mode: ExhibitMode) => void
}

/**
 * 观看方式切换：带我看懂 / 自由探索。
 * 两种模式共用同一套模型状态，区别只在「谁来改参数」：
 * 导览模式由展馆按步骤改，自由模式由用户改。
 */
export function ModeSwitch({ mode, onChange }: ModeSwitchProps) {
  return (
    <SegmentedControl<ExhibitMode>
      label="观看方式"
      value={mode}
      onChange={onChange}
      options={[
        { value: 'guide', label: '带我看懂', hint: '按步骤走，一次只改一个条件' },
        { value: 'free', label: '自由探索', hint: '参数和镜头都归你' },
      ]}
    />
  )
}
