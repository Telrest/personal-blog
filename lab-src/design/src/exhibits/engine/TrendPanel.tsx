import { PARTS } from './content'
import { trendStations, type EnginePart, type EngineSnapshot } from './model'

export function TrendPanel({ state, selected, onSelect }: { state: EngineSnapshot; selected: EnginePart | null; onSelect: (id: EnginePart) => void }) {
  const ceiling = trendStations(1, 1)
  const maxP = Math.max(...ceiling.map((s) => s.totalPressure)), maxT = Math.max(...ceiling.map((s) => s.totalTemperature))
  const x = (i: number) => 40 + i * 72
  const y = (v: number, max: number) => 150 - v / max * 112
  const points = (kind: 'totalPressure' | 'totalTemperature', max: number) => state.stations.map((s, i) => `${x(i)},${y(s[kind], max)}`).join(' ')
  return <section className="engine-trend" aria-label="核心气流总温与总压相对趋势">
    <div className="engine-note-head"><div><p className="eyebrow">沿核心气流 · 入口至喷口</p><h2>空气一路经历了什么？</h2></div><span className="engine-tag">教学趋势</span></div>
    <p className="engine-small">分别按各自固定上限归一化，只比较沿程变化。总温与总压不能直接比较大小；这里不是静压、流速或性能计算。</p>
    <svg viewBox="0 0 590 195" role="img" aria-label="总压先升高，在燃烧室和涡轮中下降；总温在燃烧室升高，再在涡轮中下降">
      {[38, 94, 150].map((v) => <line key={v} x1="34" y1={v} x2="556" y2={v} className="engine-chart-grid" />)}
      <polyline points={points('totalPressure', maxP)} fill="none" stroke="#347aa2" strokeWidth="2.3" />
      <polyline points={points('totalTemperature', maxT)} fill="none" stroke="#d99a6a" strokeWidth="2.3" />
      {state.stations.map((station, i) => <g key={station.id}>
        {selected === station.id && <line x1={x(i)} x2={x(i)} y1="22" y2="158" stroke="#c0ad8f" strokeDasharray="3 4" />}
        <circle cx={x(i)} cy={y(station.totalPressure, maxP)} r="3" fill="#347aa2" />
        <circle cx={x(i)} cy={y(station.totalTemperature, maxT)} r="3" fill="#d99a6a" />
        <text x={x(i)} y="176" textAnchor="middle" className="engine-chart-text">{['入口', '风扇', '低压压缩', '高压压缩', '燃烧', '高压涡轮', '低压涡轮', '喷口'][i]}</text>
      </g>)}
    </svg>
    <div className="engine-legend"><span><i style={{ background: '#347aa2' }} />相对总压</span><span><i style={{ background: '#d99a6a' }} />相对总温</span></div>
    <div className="engine-station-list">{state.stations.map((s) => <button type="button" key={s.id} onClick={() => onSelect(s.id)} aria-pressed={s.id === selected}>{PARTS[s.id].short}</button>)}</div>
    <p className="engine-small">燃烧室：总温升高、总压略降。喷口：本示意保持总温不变，总压计入小损失；实际静温、静压与出口速度需要另行求解。</p>
  </section>
}

export function EngineFallback() {
  return <div className="engine-fallback"><h3>一台机器，两路空气，两套转子</h3>
    <p>进气 → 风扇 → 外涵道 → 外侧喷口</p>
    <p>进气 → 风扇 → 低压压气机 → 高压压气机 → 燃烧室 → 高压涡轮 → 低压涡轮 → 核心喷口</p>
    <p>低压涡轮通过内轴驱动风扇与低压压气机；高压涡轮通过中空外轴驱动高压压气机。静子保持固定。</p>
    <p>可以结合下方的趋势图、部件说明和参考资料阅读原理。</p>
  </div>
}
