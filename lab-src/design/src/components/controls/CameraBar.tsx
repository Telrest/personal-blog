import { Button } from './Button'
import { SegmentedControl } from './SegmentedControl'

interface CameraBarProps {
  /** 用户是否已经自己动过镜头 */
  cameraMoved: boolean
  onResetCamera: () => void
  /** 可选预设视角 */
  views?: ReadonlyArray<{ value: string; label: string }>
  view?: string
  onViewChange?: (value: string) => void
  disabled?: boolean
}

/**
 * 镜头状态条。
 *
 * 「用户操作后不自动抢回镜头」这条规则在这里变成看得见的文字：
 * 一旦用户拖过镜头，状态就写「自由视角」，除了用户点按钮，没有任何代码
 * 会把镜头拉回去。点「回到默认视角」是唯一例外，因为那是用户的明确指令。
 */
export function CameraBar({
  cameraMoved,
  onResetCamera,
  views,
  view,
  onViewChange,
  disabled = false,
}: CameraBarProps) {
  return (
    <div className="camera-bar">
      <p className="camera-bar__state">
        <span className="camera-bar__glyph" aria-hidden="true">
          {cameraMoved ? '⤢' : '⌖'}
        </span>
        <span>
          镜头：<strong>{cameraMoved ? '自由视角' : '展馆视角'}</strong>
          {cameraMoved && <span className="camera-bar__note">（已停止自动回正）</span>}
        </span>
      </p>

      {views && views.length > 0 && view !== undefined && onViewChange && (
        <SegmentedControl label="预设视角" value={view} options={views} onChange={onViewChange} />
      )}

      <Button size="sm" onClick={onResetCamera} disabled={disabled}>
        回到默认视角
      </Button>
    </div>
  )
}
