import { SegmentedControl } from '../../components/controls/SegmentedControl'
import { fmt, fmtFixed } from '../../lib/format'
import type { CompareMode } from './content'
import { cadenceForWheelRpm, ratioOf, wheelRpmOf, wheelTorqueOf, type GearInfo } from './model'

export interface CompareProps {
  gears: GearInfo[]
  engaged: number
  cadenceRpm: number
  torqueNm: number
  efficiency: number
  chainringTeeth: number
  mode: CompareMode
  wheelRadiusMm: number
  onModeChange: (mode: CompareMode) => void
}

/** 补充说明用的参考后轮转速：只是想说明「同一车速要多少踏频」，不推断体力 */
const REFERENCE_WHEEL_RPM = 90

/**
 * 两种比较模式，明确分开：
 *  固定踏频 —— 只换挡位，看后轮转速怎么变；
 *  固定输入曲柄力矩 —— 只换挡位，看理想轮端力矩怎么变。
 * 两条曲线横轴一样、纵轴完全不同，不能混着读。
 */
export function ComparePanel({
  gears,
  engaged,
  cadenceRpm,
  torqueNm,
  efficiency,
  chainringTeeth,
  mode,
  wheelRadiusMm,
  onModeChange,
}: CompareProps) {
  const rows = gears.map((gear) => {
    if (mode === 'cadence') {
      const rpm = wheelRpmOf(cadenceRpm, gear.ratio)
      return {
        index: gear.index,
        teeth: gear.teeth,
        value: rpm,
        label: `${fmtFixed(rpm, 1)} rpm`,
        speed: 2 * Math.PI * (wheelRadiusMm / 1000) * rpm * 0.06,
      }
    }
    const torque = wheelTorqueOf(torqueNm, gear.ratio, efficiency)
    return {
      index: gear.index,
      teeth: gear.teeth,
      value: torque,
      label: `${fmtFixed(torque, 2)} N·m`,
      speed: 0,
    }
  })

  const max = Math.max(...rows.map((row) => row.value), 1e-6)
  const neededCadence = cadenceForWheelRpm(REFERENCE_WHEEL_RPM)

  return (
    <section className="drv-compare" aria-label="挡位比较">
      <header className="drv-compare__head">
        <div>
          <h3 className="drv-compare__title">挡位比较</h3>
          <p className="drv-compare__sub">
            {mode === 'cadence'
              ? cadenceRpm > 0
                ? `固定踏频 ${cadenceRpm} rpm：只换挡位，看后轮转速。`
                : '踏频为 0：所有挡位的后轮转速都是 0，先把踏频调起来。'
              : `固定输入曲柄力矩 ${fmt(torqueNm, 0)} N·m：只换挡位，看理想轮端力矩。`}
          </p>
        </div>
        <SegmentedControl<CompareMode>
          label="比较模式"
          value={mode}
          onChange={onModeChange}
          options={[
            { value: 'cadence', label: '固定踏频', hint: '比较后轮转速' },
            { value: 'torque', label: '固定输入力矩', hint: '比较理想轮端力矩' },
          ]}
        />
      </header>

      <ol className="drv-bars">
        {rows.map((row) => {
          const width = Math.max(2, (row.value / max) * 100)
          const isCurrent = row.index === engaged
          return (
            <li
              key={row.index}
              className={`drv-bar${isCurrent ? ' is-current' : ''}`}
              aria-current={isCurrent ? 'true' : undefined}
            >
              <span className="drv-bar__teeth">{row.teeth}T</span>
              <span className="drv-bar__track">
                <span className="drv-bar__fill" style={{ width: `${width}%` }} />
              </span>
              <span className="drv-bar__value mono">{row.label}</span>
              {mode === 'cadence' && (
                <span className="drv-bar__extra mono">{fmtFixed(row.speed, 1)} km/h</span>
              )}
              {mode === 'torque' && (
                <span className="drv-bar__extra mono">
                  齿比 {fmt(ratioOf(chainringTeeth, row.teeth), 2)}
                </span>
              )}
            </li>
          )
        })}
      </ol>

      <div className="drv-compare__legend">
        {mode === 'cadence' ? (
          <>
            <p>
              保持的是踏频（{cadenceRpm} rpm）。齿比越大，后轮转得越快、理论车速越高；
              换到大齿片后轮就慢下来，但每转过一圈能带动的轮端力矩更大。
            </p>
            <p className="drv-compare__aside">
              补充：想把后轮保持在 {REFERENCE_WHEEL_RPM} rpm，各挡需要的踏频从{' '}
              <span className="mono">{fmtFixed(neededCadence[0], 0)}</span> rpm（10T）到{' '}
              <span className="mono">{fmtFixed(neededCadence[gears.length - 1], 0)}</span> rpm（51T）。
              这只是换算，不代表谁累不累。
            </p>
          </>
        ) : (
          <>
            <p>
              保持的是曲柄输入力矩（{fmt(torqueNm, 0)} N·m）。齿比越大，同样的踩踏力矩在轮端被缩得越小；
              换到大齿片，理想轮端力矩变大——这就是「上坡换大飞轮更省力」的那一半。
            </p>
            <p className="drv-compare__aside">
              两个模式保持的条件不同：固定踏频看的是转速，固定力矩看的是力矩。
              变速不凭空增加功率，只是重新分配「转速」和「力矩」的组合。
            </p>
          </>
        )}
      </div>
    </section>
  )
}
