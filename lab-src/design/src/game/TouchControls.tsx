/**
 * 触屏控制：左右两个大按钮 + 冲刺。
 *
 * 只在运行与倒计时出现；桌面（精确指针）下由 CSS 整个隐藏，键盘操作不受影响。
 * 按住即持续转向，松开立刻回正——和键盘的语义完全一致。
 */

import type { PointerEvent as ReactPointerEvent } from 'react'

interface TouchControlsProps {
  onSteer: (value: number) => void
  onBoost: (active: boolean) => void
}

interface HoldProps {
  className: string
  label: string
  sub?: string
  ariaLabel: string
  onPress: () => void
  onRelease: () => void
}

function HoldButton({ className, label, sub, ariaLabel, onPress, onRelease }: HoldProps) {
  const press = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    onPress()
  }
  return (
    <button
      type="button"
      className={`mowan-touch__button ${className}`}
      aria-label={ariaLabel}
      onPointerDown={press}
      onPointerUp={onRelease}
      onPointerCancel={onRelease}
      onLostPointerCapture={onRelease}
      onContextMenu={(event) => event.preventDefault()}
    >
      <span className="mowan-touch__glyph" aria-hidden="true">
        {label}
      </span>
      {sub && <span className="mowan-touch__sub">{sub}</span>}
    </button>
  )
}

export function TouchControls({ onSteer, onBoost }: TouchControlsProps) {
  return (
    <div className="mowan-touch" aria-label="触屏控制">
      <div className="mowan-touch__steer">
        <HoldButton
          className="mowan-touch__button--left"
          label="◀"
          sub="左"
          ariaLabel="向左转"
          onPress={() => onSteer(-1)}
          onRelease={() => onSteer(0)}
        />
        <HoldButton
          className="mowan-touch__button--right"
          label="▶"
          sub="右"
          ariaLabel="向右转"
          onPress={() => onSteer(1)}
          onRelease={() => onSteer(0)}
        />
      </div>
      <HoldButton
        className="mowan-touch__button--boost"
        label="冲刺"
        sub="按住"
        ariaLabel="按住冲刺"
        onPress={() => onBoost(true)}
        onRelease={() => onBoost(false)}
      />
    </div>
  )
}
