import {
  indexAngleOf,
  PEN,
  restXOf,
  slotKindOf,
  springLength,
  type Pose,
} from './model'
import type { PenSnapshot } from './controller'
import { CONTACT_INFO, PHASE_INFO } from './content'

/**
 * 凸轮展开教学图。
 *
 * 横轴 = 圆周角，纵轴 = 轴向位移 x（越往下压得越深）。
 * 图上画的不是一条与三维无关的正弦波，而是这次操作真正会走的那条路径：
 * 导槽里的直段 → 索引斜面 → 回程斜面 → 落到支承面。
 */

const PLOT = { left: 104, right: 366, top: 30, bottom: 150 }
const MAX_X = PEN.xMax

const tx = (theta: number) => PLOT.left + (theta / 360) * (PLOT.right - PLOT.left)
const ty = (x: number) => PLOT.top + (x / MAX_X) * (PLOT.bottom - PLOT.top)

interface CamDiagramProps {
  snapshot: PenSnapshot
}

export function CamDiagram({ snapshot }: CamDiagramProps) {
  const pose: Pose = snapshot.pose
  const base = indexAngleOf(snapshot.baseCycle)
  const next = base + PEN.stepPerCycleDeg
  const restNow = restXOf(snapshot.baseCycle)
  const restNext = restXOf(snapshot.cycle)

  const currentX = tx(pose.theta)
  const currentY = ty(pose.x)

  const channelCenters = Array.from({ length: PEN.indexCount }, (_, i) => i * PEN.stepPerCycleDeg)
  const bandHalf = 9

  // 本次操作的四个阶段，用于高亮
  const phases = {
    pressing: `M ${tx(base)} ${ty(restNow)} L ${tx(base)} ${ty(PEN.xClear)}`,
    indexing: `M ${tx(base)} ${ty(PEN.xClear)} L ${tx(base + PEN.pressStepDeg)} ${ty(PEN.xMax)}`,
    releasing: `M ${tx(base + PEN.pressStepDeg)} ${ty(PEN.xMax)} L ${tx(next)} ${ty(PEN.xClear)}`,
    settling: `M ${tx(next)} ${ty(PEN.xClear)} L ${tx(next)} ${ty(restNext)}`,
  }
  const activePath =
    pose.phase === 'pressing'
      ? phases.pressing
      : pose.phase === 'indexing'
        ? phases.indexing
        : pose.phase === 'releasing'
          ? phases.releasing
          : pose.phase === 'settling'
            ? phases.settling
            : null

  const phase = PHASE_INFO[pose.phase]
  const kindLabel = slotKindOf(pose.theta) === 'deep' ? '深导槽' : '浅锁止位'

  return (
    <div className="cam-diagram">
      <svg viewBox="0 0 400 196" role="img" aria-label={`凸轮展开图：当前索引角 ${pose.theta.toFixed(0)} 度，位移 ${pose.x.toFixed(2)} 毫米`}>
        <defs>
          <pattern id="lockHatch" width="5" height="5" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="0" y2="5" stroke="var(--signal)" strokeWidth="0.8" opacity="0.35" />
          </pattern>
        </defs>

        {/* 三条高度参考线 */}
        {[
          { x: PEN.xRetracted, label: '0 收芯' },
          { x: PEN.xExtended, label: '2.2 出芯' },
          { x: PEN.xClear, label: '4.0 解除导向' },
          { x: PEN.xMax, label: '4.8 按到底' },
        ].map((line) => (
          <g key={line.label}>
            <line
              x1={PLOT.left}
              x2={PLOT.right}
              y1={ty(line.x)}
              y2={ty(line.x)}
              stroke="var(--rule-strong)"
              strokeWidth="0.8"
              strokeDasharray={line.x === PEN.xRetracted || line.x === PEN.xMax ? '4 3' : '2 3'}
            />
            <text x={PLOT.left - 6} y={ty(line.x) + 3} textAnchor="end" className="cam-diagram__axis">
              {line.label}
            </text>
          </g>
        ))}

        {/* 6 个索引位置：深导槽通到底，浅锁止位上方是实体支承 */}
        {channelCenters.map((deg) => {
          const kind = slotKindOf(deg)
          const deep = kind === 'deep'
          const bandTop = deep ? 0 : PEN.xExtended
          return (
            <g key={deg}>
              <rect
                x={tx(deg) - bandHalf}
                y={ty(bandTop)}
                width={bandHalf * 2}
                height={ty(PEN.xClear) - ty(bandTop)}
                fill={deep ? 'rgba(24,166,163,0.1)' : 'rgba(100,117,139,0.12)'}
              />
              {!deep && (
                <rect
                  x={tx(deg) - bandHalf}
                  y={ty(0)}
                  width={bandHalf * 2}
                  height={ty(PEN.xExtended) - ty(0)}
                  fill="url(#lockHatch)"
                />
              )}
              <text
                x={tx(deg)}
                y={PLOT.bottom + 34}
                textAnchor="middle"
                className="cam-diagram__tick"
              >
                {deg}°
              </text>
              <text x={tx(deg)} y={PLOT.top - 8} textAnchor="middle" className="cam-diagram__kind">
                {deep ? '深' : '浅'}
              </text>
            </g>
          )
        })}

        {/* 索引斜面：脊在导槽中心，谷在 30°+60°k */}
        <path
          d={Array.from({ length: PEN.indexCount * 2 + 1 }, (_, i) => {
            const theta = i * (PEN.stepPerCycleDeg / 2)
            const y = i % 2 === 0 ? PEN.xClear : PEN.xMax
            return `${i === 0 ? 'M' : 'L'} ${tx(theta)} ${ty(y)}`
          }).join(' ')}
          fill="none"
          stroke="#64758b"
          strokeWidth="1.2"
          opacity="0.75"
        />

        {/* 本次操作的完整路径 */}
        <path
          d={`${phases.pressing} ${phases.indexing.replace('M', 'L')} ${phases.releasing.replace('M', 'L')} ${phases.settling.replace('M', 'L')}`}
          fill="none"
          stroke="var(--ink)"
          strokeWidth="1"
          strokeDasharray="3 3"
          opacity="0.35"
        />
        {activePath && (
          <path d={activePath} fill="none" stroke="var(--signal)" strokeWidth="2.4" strokeLinecap="round" />
        )}

        {/* 当前位置 */}
        <line
          x1={currentX}
          x2={currentX}
          y1={PLOT.top - 2}
          y2={PLOT.bottom}
          stroke="var(--signal)"
          strokeWidth="0.6"
          opacity="0.35"
        />
        <circle cx={currentX} cy={currentY} r="4.6" fill="var(--signal)" />
        <circle cx={currentX} cy={currentY} r="7.4" fill="none" stroke="var(--signal)" strokeWidth="1" opacity="0.4" />

        {/* 坐标轴 */}
        <line x1={PLOT.left} x2={PLOT.right} y1={PLOT.bottom + 8} y2={PLOT.bottom + 8} stroke="var(--rule-strong)" strokeWidth="0.8" />
        <text x={4} y={14} className="cam-diagram__tick">
          x / mm
        </text>
        <text x={4} y={PLOT.bottom + 34} textAnchor="start" className="cam-diagram__tick">
          圆周角 θ →
        </text>
      </svg>

      <dl className="cam-diagram__legend">
        <div>
          <dt>当前</dt>
          <dd>
            索引角 <span className="mono">{pose.theta.toFixed(0)}°</span> · {kindLabel} · 位移{' '}
            <span className="mono">{pose.x.toFixed(2)}</span> mm
          </dd>
        </div>
        <div>
          <dt>阶段</dt>
          <dd>
            {phase.label} —— {phase.caption}
          </dd>
        </div>
        <div>
          <dt>关键接触</dt>
          <dd>
            {CONTACT_INFO[pose.contact].label} · {CONTACT_INFO[pose.contact].note}
          </dd>
        </div>
        <div>
          <dt>弹簧</dt>
          <dd>
            L = 15.5 − {pose.x.toFixed(2)} = <span className="mono">{springLength(pose.x).toFixed(2)}</span> mm
            （压缩 {(PEN.springFreeLength - springLength(pose.x)).toFixed(2)} mm）
          </dd>
        </div>
      </dl>
    </div>
  )
}
