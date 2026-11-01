/**
 * 游戏内 HUD：只突出要求里那四项——魔丸 GPA、距离、速度、冲刺余量。
 * 其余按钮（暂停、声音、全屏）放在右侧一小排，不抢数字的地方。
 */

import type { GameSnapshot } from './model'
import { groupDigits } from './score'

interface HudProps {
  snapshot: GameSnapshot
  muted: boolean
  onToggleMuted: () => void
  fullscreen: boolean
  fullscreenSupported: boolean
  onToggleFullscreen: () => void
  onPause: () => void
  /** 有全屏遮罩（标题 / 结算）时把 HUD 收起来 */
  dimmed: boolean
}

export function Hud({
  snapshot,
  muted,
  onToggleMuted,
  fullscreen,
  fullscreenSupported,
  onToggleFullscreen,
  onPause,
  dimmed,
}: HudProps) {
  const { gpa, phase } = snapshot
  const playing = phase === 'running' || phase === 'countdown' || phase === 'paused' || phase === 'spectator'
  const staminaPercent = Math.round(snapshot.stamina * 100)
  const progressPercent = Math.round(gpa.progress * 100)
  const nextLabel = gpa.reached
    ? `再骑 ${Math.max(0, Math.round(gpa.remaining))} m 拿到第 ${groupDigits(gpa.nines + 1)} 个 9`
    : `距 3.90 还有 ${Math.max(0, Math.round(gpa.remaining))} m`

  return (
    <div className={`mowan-hud${dimmed ? ' is-dimmed' : ''}`} data-phase={phase}>
      <div className="mowan-hud__top">
        <div className="mowan-gpa">
          <p className="mowan-gpa__label">魔丸 GPA</p>
          <p className="mowan-gpa__value" data-reached={gpa.reached ? 'yes' : 'no'}>
            <span key={gpa.text} className="mowan-gpa__digits">
              {gpa.text}
            </span>
          </p>
          <p className="mowan-gpa__note">
            {snapshot.nineNote ?? '还没到 3.9'} · {nextLabel}
          </p>
        </div>

        <div className="mowan-metrics">
          <div className="mowan-metric">
            <p className="mowan-metric__label">距离</p>
            <p className="mowan-metric__value">
              <span className="mono">{snapshot.distanceText}</span>
              <span className="mowan-metric__unit">m</span>
            </p>
          </div>
          <div className="mowan-metric">
            <p className="mowan-metric__label">速度</p>
            <p className="mowan-metric__value">
              <span className="mono">{Math.round(snapshot.speedKmh)}</span>
              <span className="mowan-metric__unit">km/h</span>
            </p>
          </div>
          <div className="mowan-metric mowan-metric--boost">
            <p className="mowan-metric__label">
              冲刺余量
              <span className="mowan-metric__extra mono">{staminaPercent}%</span>
            </p>
            <div
              className="mowan-boost"
              data-state={snapshot.boosting ? 'boosting' : snapshot.stamina < 0.22 ? 'empty' : 'ready'}
              role="meter"
              aria-label="冲刺余量"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={staminaPercent}
            >
              <span className="mowan-boost__fill" style={{ width: `${staminaPercent}%` }} />
            </div>
          </div>
        </div>

        <div className="mowan-tools">
          <button
            type="button"
            className="mowan-tool"
            onClick={onPause}
            disabled={!playing}
            aria-label="暂停"
          >
            {phase === 'paused' ? '继续' : '暂停'}
          </button>
          <button type="button" className="mowan-tool" onClick={onToggleMuted} aria-pressed={!muted}>
            声音：{muted ? '关' : '开'}
          </button>
          {fullscreenSupported && (
            <button type="button" className="mowan-tool" onClick={onToggleFullscreen}>
              {fullscreen ? '退出全屏' : '全屏'}
            </button>
          )}
        </div>
      </div>

      <div className="mowan-hud__bottom">
        {snapshot.hint && playing && <p className="mowan-hint">{snapshot.hint}</p>}
        <div className="mowan-progress" aria-hidden="true">
          <span className="mowan-progress__fill" style={{ width: `${progressPercent}%` }} />
        </div>
        <p className="mowan-hud__keys">
          A / D 或 ← → 转向 · 空格冲刺 · Esc 暂停{snapshot.spectator ? ' · 旁观者模式中' : ''}
        </p>
      </div>
    </div>
  )
}
