/**
 * 无 WebGL 时的图文替代：结构 / 受力 / 修复阶段图。
 *
 * 这些 SVG 只画关系与标签，不冒充影像；与三维视图共享同一份状态取值，
 * 所以「切到骨折、剖开、改载荷、换阶段」在图文版里同样能看出来。
 */

import { LOAD_COPY, REPAIR_COPY } from './content'
import type { LoadMode, TabId } from './model'

const INK = 'var(--ink)'
const INK_2 = 'var(--ink-2)'
const INK_3 = 'var(--ink-3)'
const RULE = 'var(--rule-strong)'
const BONE = '#e2dac7'
const BONE_LINE = '#b9ae95'
const TARGET = '#bf6a3d'
const COMPARE = '#6f8798'
const CANCELLOUS = '#c9b48d'
const ARROW = 'var(--ink)'
const HEMATOMA = '#7d3a4a'
const SOFT = '#d8bd7e'
const BONY = '#b08a52'

const label = (x: number, y: number, text: string, size = 11, fill = INK_3) => (
  <text x={x} y={y} fontSize={size} fill={fill}>
    {text}
  </text>
)

interface StructureDiagramProps {
  fractured: boolean
  cutaway: boolean
}

/** 第 5 趾列示意图：跖骨头 → 近节（含基底）→ 中节 → 末节 */
export function StructureDiagram({ fractured, cutaway }: StructureDiagramProps) {
  const shiftX = fractured ? 10 : 0
  const shiftY = fractured ? 3 : 0
  const baseX = 116
  const headX = 300
  const cutX = baseX + 0.18 * (headX - baseX)
  const toeY = 96
  const toeH = 62
  return (
    <svg viewBox="0 0 560 250" role="img" aria-label="第 5 趾列结构示意">
      <defs>
        <pattern id="cancellous-pattern" width="7" height="7" patternUnits="userSpaceOnUse">
          <rect width="7" height="7" fill={CANCELLOUS} />
          <path d="M0 3.5 H7 M3.5 0 V7" stroke={BONE_LINE} strokeWidth="0.6" opacity="0.75" />
        </pattern>
      </defs>

      {/* 第 5 跖骨头（对照色） */}
      <g>
        <path
          d={`M24 ${toeY + 20} Q24 ${toeY - 2} 54 ${toeY - 2} Q96 ${toeY - 4} 100 ${toeY + toeH / 2}
             Q96 ${toeY + toeH + 4} 54 ${toeY + toeH + 2} Q24 ${toeY + toeH + 2} 24 ${toeY + 20} Z`}
          fill={COMPARE}
          opacity="0.9"
        />
        {label(18, toeY + toeH + 26, '第 5 跖骨头')}
        <rect x="104" y={toeY + 6} width="8" height={toeH - 12} fill="none" stroke={RULE} strokeDasharray="3 3" />
        {label(88, toeY - 16, '跖趾关节')}
      </g>

      {/* 近节趾骨：基底膨大、骨干细、远端有头 */}
      <g>
        <path
          d={`M${baseX} ${toeY + 6} C${baseX + 26} ${toeY} ${baseX + 60} ${toeY + 18} ${baseX + 96} ${toeY + 20}
             L${headX - 22} ${toeY + 20} C${headX - 6} ${toeY + 20} ${headX} ${toeY + 28} ${headX} ${toeY + 32}
             L${headX} ${toeY + toeH - 4} C${headX} ${toeY + toeH} ${headX - 6} ${toeY + toeH}
             ${headX - 22} ${toeY + toeH}
             L${baseX + 96} ${toeY + toeH} C${baseX + 60} ${toeY + toeH + 2} ${baseX + 26} ${toeY + toeH + 4}
             ${baseX} ${toeY + toeH - 2}
             C${baseX - 12} ${toeY + toeH - 10} ${baseX - 12} ${toeY + 16} ${baseX} ${toeY + 6} Z`}
          fill={TARGET}
          opacity={fractured ? 0.26 : 0.95}
        />
        {fractured ? (
          <g transform={`translate(${shiftX} ${shiftY})`}>
            <path
              d={`M${cutX} ${toeY - 4} L${cutX + 26} ${toeY - 4} L${headX} ${toeY + 20}
                 L${headX} ${toeY + toeH} L${cutX + 26} ${toeY + toeH + 4} L${cutX} ${toeY + toeH + 4} Z`}
              fill={TARGET}
            />
          </g>
        ) : null}
        {fractured ? (
          <line x1={cutX} y1={toeY - 10} x2={cutX + 24} y2={toeY + toeH + 12} stroke={INK} strokeWidth="1.4" />
        ) : null}
        {label(baseX + 34, toeY + toeH + 26, '第 5 近节趾骨（含基底）')}
      </g>

      {/* 中节 / 末节 */}
      <g transform={`translate(${shiftX} ${shiftY})`}>
        <path
          d={`M${headX + 10} ${toeY + 22} L${headX + 54} ${toeY + 26} L${headX + 54} ${toeY + toeH - 6}
             L${headX + 10} ${toeY + toeH - 2} Z`}
          fill={TARGET}
          opacity="0.92"
        />
        <path
          d={`M${headX + 64} ${toeY + 28} L${headX + 98} ${toeY + 34} L${headX + 98} ${toeY + toeH - 14}
             L${headX + 64} ${toeY + toeH - 10} Z`}
          fill={TARGET}
          opacity="0.86"
        />
        {label(headX + 14, toeY + toeH + 26, '中节', 10)}
        {label(headX + 66, toeY + toeH + 26, '末节', 10)}
      </g>

      {/* 剖切示意：皮质环 + 松质核心 */}
      {cutaway ? (
        <g transform="translate(472 96)">
          <circle r="26" fill={BONE} stroke={INK} strokeWidth="1.1" />
          <circle r="20" fill="url(#cancellous-pattern)" stroke={BONE_LINE} />
          {label(-42, 46, '剖切示意', 10, INK_2)}
          {label(-42, 60, '外圈：皮质约 0.8 mm', 10)}
          {label(-42, 74, '内部：松质骨（纹理示意）', 10)}
        </g>
      ) : null}

      {fractured ? (
        <text x="116" y="230" fontSize="11" fill={INK_2}>
          预制裂面：距基底约 18%，法线与骨长轴成 20°（教学设定，不是影像测量）
        </text>
      ) : (
        <text x="116" y="230" fontSize="11" fill={INK_3}>
          完整骨对照：基底膨大、骨干变细、远端有头
        </text>
      )}
    </svg>
  )
}

interface LoadDiagramProps {
  mode: LoadMode
  load: number
  fractured: boolean
}

/** 三种受力方向 + 归一化强弱 */
export function LoadDiagram({ mode, load, fractured }: LoadDiagramProps) {
  const copy = LOAD_COPY.find((item) => item.id === mode) ?? LOAD_COPY[0]
  const strength = 22 + load * 44
  const arrow = (x1: number, y1: number, x2: number, y2: number) => (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={ARROW} strokeWidth="2.4" />
      <path
        d={`M ${x2} ${y2} l -9 -4.5 l 0 9 z`}
        fill={ARROW}
        transform={`rotate(${(Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI} ${x2} ${y2})`}
      />
    </g>
  )
  return (
    <svg viewBox="0 0 560 240" role="img" aria-label="受力方向示意">
      <g transform="translate(196 54) scale(0.72)">
        <path d="M0 26 Q0 8 24 8 Q58 6 62 32 Q58 60 24 58 Q0 58 0 26 Z" fill={COMPARE} opacity="0.9" />
        <path
          d="M74 14 C96 8 124 22 156 24 L196 24 C206 24 208 34 208 38 L208 86 C208 92 206 96 196 96
             L156 96 C124 98 96 110 74 104 C64 100 64 18 74 14 Z"
          fill={TARGET}
          opacity="0.9"
        />
        {fractured ? <line x1="98" y1="8" x2="108" y2="112" stroke={INK} strokeWidth="1.3" /> : null}
        {label(-6, 78, '第 5 跖骨头', 12)}
      </g>

      <g stroke={INK_2} strokeWidth="1.4">
        <line x1="196" y1="176" x2="242" y2="176" />
        {[0, 1, 2, 3, 4].map((i) => (
          <line key={i} x1="198 + i * 9" y1="176" x2="204 + i * 9" y2="184" />
        ))}
      </g>
      {label(192, 202, '足部其余部分作为约束（示意）', 10)}

      {mode === 'axial' ? arrow(504, 118, 504 - strength - 34, 118) : null}
      {mode === 'lateral' ? arrow(252, 34, 252 + strength, 34) : null}
      {mode === 'abduction' ? arrow(404, 84, 404 + strength + 24, 84) : null}

      {label(16, 22, `${copy.label} · ${copy.where}`, 12, INK_2)}
      {label(16, 42, `λ = ${Math.round(load * 100)}%（归一化示意，不是牛顿）`, 11, INK_3)}
      {label(
        16,
        232,
        fractured
          ? '预制骨折：远端片段另有 ≤0.8° 的相对错动（示意）'
          : '完整轮廓：整根趾在关节处形变（画面已夸张显示）',
        10,
        INK_3,
      )}
    </svg>
  )
}

interface RepairDiagramProps {
  stage: number
}

/** 四个概念阶段并排；当前阶段加粗描边 */
export function RepairDiagram({ stage }: RepairDiagramProps) {
  return (
    <svg viewBox="0 0 560 176" role="img" aria-label="修复四阶段示意">
      {REPAIR_COPY.map((copy, index) => {
        const x = 8 + index * 138
        const active = index === stage
        return (
          <g key={copy.name} transform={`translate(${x} 8)`}>
            <rect width="128" height="128" fill="#1a2c23" stroke={active ? INK : RULE} strokeWidth={active ? 2 : 1} />
            <path d="M18 40 L58 40 L58 88 L18 88 Z" fill={BONE} stroke={BONE_LINE} />
            <path d="M70 40 L110 40 L110 88 L70 88 Z" fill={BONE} stroke={BONE_LINE} />
            {index === 0 ? <ellipse cx="64" cy="64" rx="22" ry="16" fill={HEMATOMA} opacity="0.8" /> : null}
            {index === 1 ? <ellipse cx="64" cy="64" rx="34" ry="22" fill={SOFT} opacity="0.75" /> : null}
            {index === 2 ? <ellipse cx="64" cy="64" rx="30" ry="20" fill={BONY} opacity="0.95" /> : null}
            {index === 3 ? (
              <g>
                <rect x="14" y="36" width="100" height="56" rx="8" fill={BONE} stroke={BONE_LINE} />
                <path d="M14 64 H114" stroke={BONE_LINE} strokeDasharray="2 3" />
              </g>
            ) : null}
            <text x="6" y="118" fontSize="10" fill={active ? INK : INK_3}>
              {copy.short}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

interface FallbackProps {
  tab: TabId
  fractured: boolean
  cutaway: boolean
  loadMode: LoadMode
  load: number
  repairStage: number
}

/** 三维不可用时的整块图文替代 */
export function BoneFallback({ tab, fractured, cutaway, loadMode, load, repairStage }: FallbackProps) {
  return (
    <div className="bone-fallback">
      <p className="bone-fallback__title">
        这台设备没有可用的 WebGL，三维视图无法显示。下面是同样的核心内容（图 + 文字）；
        切换页签、拖动参数时这些图也会跟着变。
      </p>

      <figure className="bone-fallback__figure">
        <figcaption>第 5 趾列结构（跖骨头 → 近节 → 中节 → 末节）。橙红为目标骨。</figcaption>
        <StructureDiagram fractured={fractured || tab === 'repair'} cutaway={cutaway} />
      </figure>

      <figure className="bone-fallback__figure">
        <figcaption>受力方向：箭头只表示方向与相对强弱，不做应力计算。</figcaption>
        <LoadDiagram mode={loadMode} load={load} fractured={fractured} />
      </figure>

      <figure className="bone-fallback__figure">
        <figcaption>
          修复四阶段：血肿 → 软骨痂 → 骨性骨痂 → 重塑。当前阶段：
          {REPAIR_COPY[Math.max(0, Math.min(3, repairStage))].name}。进度不是天数或愈合率。
        </figcaption>
        <RepairDiagram stage={repairStage} />
      </figure>
    </div>
  )
}
