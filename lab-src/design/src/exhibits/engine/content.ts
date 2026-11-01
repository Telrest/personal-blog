import type { CameraId, EnginePart, EngineView, FlowMode, Isolation } from './model'

export const PARTS: Record<EnginePart, { label: string; short: string; role: string; connection: string }> = {
  nacelle: { label: '进气口与外机匣', short: '外壳', role: '进气唇口把空气引向风扇；外机匣围出外涵道。剖视移去朝向你的四分之一。', connection: '风扇之后，空气分成外涵道与核心两路。' },
  fan: { label: '风扇', short: '风扇', role: '大直径叶片推动较大范围的空气。进入核心的只是其中一路。', connection: '低压轴连接后方的低压涡轮；两者属于低压转子。' },
  lpc: { label: '低压压气机', short: '低压压气机', role: '核心入口的增压级。旋转叶片与固定导向叶片交错排列。', connection: '与风扇和低压涡轮同属低压轴系。' },
  hpc: { label: '高压压气机', short: '高压压气机', role: '多级压缩使核心空气总压与总温继续上升。静子改变气流方向，自己不旋转。', connection: '由高压涡轮经外侧中空的高压轴驱动。' },
  combustor: { label: '环形燃烧室', short: '燃烧室', role: '燃料与高压空气混合燃烧，主要提高气流总温，同时有总压损失。', connection: '火焰位于环形腔内，中心通道留给双轴。' },
  hpt: { label: '高压涡轮', short: '高压涡轮', role: '从高温气流中取出功，驱动高压压气机；气流总温和总压随之降低。', connection: '高压涡轮 → 高压轴 → 高压压气机。' },
  lpt: { label: '低压涡轮', short: '低压涡轮', role: '继续从气流中取出功，把动力传回前方风扇与低压压气机。', connection: '低压涡轮 → 内侧低压轴 → 低压压气机与风扇。' },
  'lp-shaft': { label: '低压轴', short: '内侧低压轴', role: '细长的内轴从中空高压轴内部穿过，把低压涡轮与前方组件连接起来。', connection: '蓝色：风扇、低压压气机、低压涡轮。' },
  'hp-shaft': { label: '高压轴', short: '外侧高压轴', role: '套在低压轴外面的中空轴，连接高压压气机与高压涡轮。', connection: '橙色：高压压气机、高压涡轮。两根轴不互相刚性锁定。' },
  nozzle: { label: '分流排气喷口', short: '喷口', role: '外涵道与核心气流分别排出。喷口将可用的气流能量转化为定向运动。', connection: '本模型不求解喷口流动与推力；相对总温不在喷口再次上升。' },
}

export const CAMERAS: Record<CameraId, { label: string; pose: { position: [number, number, number]; target: [number, number, number] } }> = {
  overview: { label: '整机', pose: { position: [-3.3, 2.25, 4.85], target: [0, -0.12, 0] } },
  side: { label: '侧面剖视', pose: { position: [-0.25, 1.15, 5.7], target: [0, 0, 0] } },
  front: { label: '风扇正视', pose: { position: [-5.2, 0.24, 0.3], target: [-1.08, 0, 0] } },
  compressor: { label: '压气机', pose: { position: [-1.4, 1.12, 2.15], target: [-0.27, 0, 0] } },
  combustor: { label: '燃烧室', pose: { position: [-0.55, 0.94, 1.65], target: [0.49, 0, 0] } },
  shafts: { label: '双轴特写', pose: { position: [-1.1, 1.05, 3.1], target: [0.04, 0, 0] } },
  rear: { label: '涡轮与喷口', pose: { position: [2.75, 1.25, 2.2], target: [1.0, 0, 0] } },
  exploded: { label: '拆解全景', pose: { position: [-2.4, 3.35, 10.1], target: [0.25, 0.65, 0] } },
}

export const GUIDE: Array<{ id: string; title: string; body: string; view: EngineView; isolate: Isolation; flow: FlowMode; camera: CameraId; selected: EnginePart | null }> = [
  { id: 'whole', title: '① 先认方向：前面进气，后面排气', body: '左前方的大风扇把空气送入发动机。先转动模型看看，再打开剖面观察内部。这里展示的是通用教学结构。', view: 'cutaway', isolate: 'all', flow: 'off', camera: 'overview', selected: null },
  { id: 'paths', title: '② 一次进气，分成两条路径', body: '蓝色外涵道绕过核心机，从外侧喷口排出。另一条进入核心，经过压缩、燃烧和涡轮后排出。', view: 'cutaway', isolate: 'all', flow: 'both', camera: 'side', selected: 'fan' },
  { id: 'compression', title: '③ 会转的叶片之间，还有不转的叶片', body: '低压与高压压气机属于不同轴系。每一级的转子在转，安装在机匣上的静子保持固定。暂停或慢放，观察它们的区别。', view: 'cutaway', isolate: 'all', flow: 'core', camera: 'compressor', selected: 'hpc' },
  { id: 'burner', title: '④ 火焰在环形腔里，不在中心轴上', body: '燃烧使总温上升；总压会有损失，并非继续升高。两根轴从燃烧室中心穿过，与环形燃烧空间分开。', view: 'cutaway', isolate: 'all', flow: 'core', camera: 'combustor', selected: 'combustor' },
  { id: 'power', title: '⑤ 空气向后走，动力沿轴传回前方', body: '蓝色内轴连接低压组件，橙色中空轴连接高压组件。现在只显示两根轴；切换“低压系统”与“高压系统”查看它们分别驱动谁。', view: 'cutaway', isolate: 'shafts', flow: 'off', camera: 'shafts', selected: 'lp-shaft' },
  { id: 'explore', title: '⑥ 改变工况，观察两套转子的响应', body: '拖动工况滑块，留意两套转子的响应时间不同。观察速度只是慢放，不改变设定工况。下方曲线表示教学总量趋势，不是实测性能。', view: 'cutaway', isolate: 'all', flow: 'both', camera: 'overview', selected: null },
]

export const REFERENCES = [
  { title: 'NASA · 涡扇、双轴与两路气流', url: 'https://www.grc.nasa.gov/www/k-12/BGP/turbfan.html' },
  { title: 'NASA · 压气机原理', url: 'https://www.grc.nasa.gov/www/k-12/airplane/compress.html' },
  { title: 'NASA · 环形燃烧室与总压损失', url: 'https://www.grc.nasa.gov/www/k-12/airplane/burner.html' },
  { title: 'NASA · 喷口与分流排气', url: 'https://www.grc.nasa.gov/www/k-12/airplane/nozzle.html' },
  { title: 'Grab3D · CC0 叶轮几何来源（已拆分并改造）', url: 'https://grab3d.com/models/vehicles/jet-engine/' },
]
