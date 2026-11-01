/**
 * 魔丸号的轻量模型：自行车 + 后置涡扇 + 骑手。
 *
 * 与变速器展品的关系：
 *  - 几何思路沿用它（实车锚点、单位圆柱摆位、实例化辐条），但这里不追求机构精确，
 *    只保留「看得懂、动得对」的那一层：车轮转、曲柄跟着转、链条沿闭合环走、
 *    发动机风扇随车速转。
 *  - 不加载整台展品，几何量小、材质共享，适合每帧跑。
 *
 * 局部坐标：X 朝车前，Y 向上，Z 朝车身右侧；轮胎落在地面 Y = 0。
 * 转向、倾斜、摔车由外层组负责，几何本身不写世界坐标。
 */

import * as THREE from 'three'
import type { GameView } from './model'

const UP = new THREE.Vector3(0, 1, 0)
const UNIT_CYLINDER = new THREE.CylinderGeometry(1, 1, 1, 12, 1)

/** 车辆锚点（m）：和变速器展品同一套比例，只保留游戏需要的尺寸 */
export const BIKE = {
  wheelRadius: 0.365,
  rearAxle: { x: -0.52, y: 0.365 },
  frontAxle: { x: 0.56, y: 0.365 },
  bb: { x: -0.02, y: 0.285 },
  seatTop: { x: -0.16, y: 0.78 },
  headTop: { x: 0.4, y: 0.84 },
  headBottom: { x: 0.45, y: 0.7 },
  saddle: { x: -0.2, y: 0.9 },
  bar: { x: 0.46, y: 0.97 },
  crankLength: 0.17,
  chainringRadius: 0.085,
  cogRadius: 0.045,
  chainlineZ: 0.055,
  /** 发动机吊舱：座位后面、后轮上方，不挡前方视线 */
  engine: { x: -0.36, y: 1.07, z: 0 },
  engineRadius: 0.185,
  engineLength: 0.6,
} as const

interface Materials {
  frame: THREE.MeshStandardMaterial
  frameDark: THREE.MeshStandardMaterial
  steel: THREE.MeshStandardMaterial
  alu: THREE.MeshStandardMaterial
  tire: THREE.MeshStandardMaterial
  rim: THREE.MeshStandardMaterial
  saddle: THREE.MeshStandardMaterial
  chain: THREE.MeshStandardMaterial
  jacket: THREE.MeshStandardMaterial
  trouser: THREE.MeshStandardMaterial
  skin: THREE.MeshStandardMaterial
  helmet: THREE.MeshStandardMaterial
  /** 头盔本体：北航蓝 */
  cap: THREE.MeshStandardMaterial
  nacelle: THREE.MeshStandardMaterial
  nacelleDark: THREE.MeshStandardMaterial
  hot: THREE.MeshStandardMaterial
  glow: THREE.MeshStandardMaterial
  blade: THREE.MeshStandardMaterial
}

function createMaterials(): Materials {
  return {
    frame: new THREE.MeshStandardMaterial({ color: 0x2b3d54, metalness: 0.4, roughness: 0.42 }),
    frameDark: new THREE.MeshStandardMaterial({ color: 0x1c2733, metalness: 0.45, roughness: 0.38 }),
    steel: new THREE.MeshStandardMaterial({ color: 0xb9bec2, metalness: 0.72, roughness: 0.34 }),
    alu: new THREE.MeshStandardMaterial({ color: 0xcdd1d3, metalness: 0.6, roughness: 0.3 }),
    tire: new THREE.MeshStandardMaterial({ color: 0x23262a, metalness: 0.02, roughness: 0.95 }),
    rim: new THREE.MeshStandardMaterial({ color: 0xa9aeb2, metalness: 0.56, roughness: 0.36 }),
    saddle: new THREE.MeshStandardMaterial({ color: 0x1f2429, metalness: 0.05, roughness: 0.8 }),
    chain: new THREE.MeshStandardMaterial({ color: 0x5d6469, metalness: 0.78, roughness: 0.46 }),
    jacket: new THREE.MeshStandardMaterial({ color: 0x33475e, metalness: 0.05, roughness: 0.85 }),
    trouser: new THREE.MeshStandardMaterial({ color: 0x2c3236, metalness: 0.02, roughness: 0.9 }),
    skin: new THREE.MeshStandardMaterial({ color: 0xd8ab86, metalness: 0, roughness: 0.72 }),
    helmet: new THREE.MeshStandardMaterial({ color: 0xb8432d, metalness: 0.15, roughness: 0.5 }),
    cap: new THREE.MeshStandardMaterial({ color: 0x1d4f8f, metalness: 0.18, roughness: 0.44 }),
    nacelle: new THREE.MeshStandardMaterial({ color: 0xa8b4bd, metalness: 0.55, roughness: 0.38 }),
    nacelleDark: new THREE.MeshStandardMaterial({ color: 0x4b565f, metalness: 0.6, roughness: 0.42 }),
    hot: new THREE.MeshStandardMaterial({
      color: 0x8c5a3a,
      metalness: 0.7,
      roughness: 0.45,
      emissive: 0x35180c,
      emissiveIntensity: 0.6,
    }),
    glow: new THREE.MeshStandardMaterial({
      color: 0xffb066,
      emissive: 0xff7a2e,
      emissiveIntensity: 1.1,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    blade: new THREE.MeshStandardMaterial({ color: 0x8d99a2, metalness: 0.72, roughness: 0.4 }),
  }
}

/* ---------------------------------------------------------------- 基础构件 */

type Point = { x: number; y: number; z?: number }

function bar(from: Point, to: Point, radius: number, material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(UNIT_CYLINDER, material)
  const a = new THREE.Vector3(from.x, from.y, from.z ?? 0)
  const b = new THREE.Vector3(to.x, to.y, to.z ?? 0)
  const direction = new THREE.Vector3().subVectors(b, a)
  const length = Math.max(1e-4, direction.length())
  mesh.scale.set(radius, length, radius)
  mesh.position.copy(a).addScaledVector(direction, 0.5)
  mesh.quaternion.setFromUnitVectors(UP, direction.normalize())
  mesh.castShadow = true
  return mesh
}

function box(
  width: number,
  height: number,
  depth: number,
  material: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material)
  mesh.position.set(x, y, z)
  mesh.castShadow = true
  return mesh
}

function cylinder(
  radius: number,
  length: number,
  material: THREE.Material,
  axis: 'x' | 'y' | 'z' = 'z',
  segments = 16,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, segments, 1), material)
  if (axis === 'z') mesh.rotation.x = Math.PI / 2
  if (axis === 'x') mesh.rotation.z = Math.PI / 2
  mesh.castShadow = true
  return mesh
}

/** 车轮：轮胎 + 轮圈 + 实例化辐条 + 花鼓 */
function buildWheel(materials: Materials): THREE.Group {
  const group = new THREE.Group()
  const radius = BIKE.wheelRadius
  const tire = new THREE.Mesh(new THREE.TorusGeometry(radius - 0.028, 0.028, 8, 40), materials.tire)
  tire.castShadow = true
  group.add(tire)

  const rim = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.82, radius * 0.82, 0.021, 36, 1, true),
    materials.rim,
  )
  rim.rotation.x = Math.PI / 2
  group.add(rim)

  const spokeGeometry = new THREE.CylinderGeometry(0.0014, 0.0014, 1, 4, 1)
  const spokes = new THREE.InstancedMesh(spokeGeometry, materials.alu, 16)
  const matrix = new THREE.Matrix4()
  const quaternion = new THREE.Quaternion()
  const scale = new THREE.Vector3(1, 1, 1)
  for (let i = 0; i < 16; i += 1) {
    const angle = (i / 16) * Math.PI * 2
    const side = i % 2 === 0 ? 1 : -1
    const start = new THREE.Vector3(Math.cos(angle) * 0.03, Math.sin(angle) * 0.03, side * 0.022)
    const end = new THREE.Vector3(
      Math.cos(angle + 0.15) * radius * 0.82,
      Math.sin(angle + 0.15) * radius * 0.82,
      0,
    )
    const direction = new THREE.Vector3().subVectors(end, start)
    quaternion.setFromUnitVectors(UP, direction.clone().normalize())
    scale.set(1, direction.length(), 1)
    matrix.compose(start.clone().addScaledVector(direction, 0.5), quaternion, scale)
    spokes.setMatrixAt(i, matrix)
  }
  group.add(spokes)
  group.add(cylinder(0.026, 0.12, materials.alu, 'z'))
  return group
}

/**
 * 闭合链环：前盘与飞轮的两条公切线 + 两段外包圆弧。
 *
 * 用「外公切线 + 等半径近似」的简化画法：前盘 85 mm、飞轮 45 mm，
 * 半径差对切线角的影响不到 5°，游戏镜头下看不出来，也不参与任何计算。
 * 变速器展品里的那套精确解在 chainPath.ts，两者互不影响。
 */
function buildChainLoop(): {
  length: number
  sample: (s: number, position: THREE.Vector3, tangent: THREE.Vector3) => void
} {
  const z = BIKE.chainlineZ
  const c1 = new THREE.Vector2(BIKE.bb.x, BIKE.bb.y)
  const c2 = new THREE.Vector2(BIKE.rearAxle.x, BIKE.rearAxle.y)
  const r1 = BIKE.chainringRadius
  const r2 = BIKE.cogRadius
  const delta = new THREE.Vector2().subVectors(c2, c1)
  const distance = delta.length()
  const u = delta.clone().normalize()
  const n = new THREE.Vector2(-u.y, u.x)
  const alpha = Math.asin(Math.min(1, Math.max(-1, (r1 - r2) / distance)))
  const ca = Math.cos(alpha)
  const sa = Math.sin(alpha)

  const upper1 = new THREE.Vector2().copy(c1).addScaledVector(u, r1 * sa).addScaledVector(n, r1 * ca)
  const upper2 = new THREE.Vector2().copy(c2).addScaledVector(u, r2 * sa).addScaledVector(n, r2 * ca)
  const lower1 = new THREE.Vector2().copy(c1).addScaledVector(u, -r1 * sa).addScaledVector(n, -r1 * ca)
  const lower2 = new THREE.Vector2().copy(c2).addScaledVector(u, -r2 * sa).addScaledVector(n, -r2 * ca)

  const angleOf = (center: THREE.Vector2, point: THREE.Vector2) =>
    Math.atan2(point.y - center.y, point.x - center.x)
  const TAU = Math.PI * 2
  const norm = (angle: number) => ((angle % TAU) + TAU) % TAU

  /** 从 from 转到 to，选择经过 through 的那个方向 */
  const arcPoints = (
    center: THREE.Vector2,
    radius: number,
    from: number,
    to: number,
    through: number,
    segments: number,
  ): THREE.Vector2[] => {
    const ccwSweep = norm(to - from)
    const ccwContains = norm(through - from) <= ccwSweep
    const sweep = ccwContains ? ccwSweep : -(TAU - ccwSweep)
    const out: THREE.Vector2[] = []
    for (let i = 1; i <= segments; i += 1) {
      const angle = from + (sweep * i) / segments
      out.push(new THREE.Vector2(center.x + Math.cos(angle) * radius, center.y + Math.sin(angle) * radius))
    }
    return out
  }

  const backward = Math.atan2(u.y, u.x)
  const forward = Math.atan2(-u.y, -u.x)

  const loop: THREE.Vector2[] = [upper1]
  loop.push(...arcPoints(c2, r2, angleOf(c2, upper2), angleOf(c2, lower2), backward, 12))
  loop.push(...arcPoints(c1, r1, angleOf(c1, lower1), angleOf(c1, upper1), forward, 14))
  // 两端切线由上面的圆弧端点自然连成（直线段就是相邻点之间的连线）

  const cumulative: number[] = [0]
  for (let i = 1; i <= loop.length; i += 1) {
    const previous = loop[i - 1]
    const current = loop[i % loop.length]
    cumulative.push(cumulative[i - 1] + previous.distanceTo(current))
  }
  const length = cumulative[cumulative.length - 1]

  const sample = (s: number, position: THREE.Vector3, tangent: THREE.Vector3): void => {
    const target = ((s % length) + length) % length
    let index = 0
    while (index < cumulative.length - 2 && cumulative[index + 1] <= target) index += 1
    const a = loop[index]
    const b = loop[(index + 1) % loop.length]
    const segment = Math.max(1e-6, cumulative[index + 1] - cumulative[index])
    const t = Math.min(1, Math.max(0, (target - cumulative[index]) / segment))
    position.set(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, z)
    tangent.set(b.x - a.x, b.y - a.y, 0).normalize()
  }

  return { length, sample }
}

/* ---------------------------------------------------------------- 整车 */

export interface Ride {
  root: THREE.Group
  update(view: GameView): void
  dispose(): void
}

export function createRide(): Ride {
  const materials = createMaterials()
  const root = new THREE.Group()
  root.name = 'mowan-ride'

  // 世界朝向：yawGroup 负责偏航，body 负责倾角与摔车，model 把「X 朝前」转成「Z 朝后」
  const yawGroup = new THREE.Group()
  const body = new THREE.Group()
  const model = new THREE.Group()
  model.rotation.y = Math.PI / 2
  root.add(yawGroup)
  yawGroup.add(body)
  body.add(model)

  const geometries: THREE.BufferGeometry[] = []
  const keep = <T extends THREE.BufferGeometry>(geometry: T): T => {
    geometries.push(geometry)
    return geometry
  }

  const rearAxle = { x: BIKE.rearAxle.x, y: BIKE.rearAxle.y }
  const frontAxle = { x: BIKE.frontAxle.x, y: BIKE.frontAxle.y }
  const bb = { x: BIKE.bb.x, y: BIKE.bb.y }
  const seatTop = { x: BIKE.seatTop.x, y: BIKE.seatTop.y }
  const headTop = { x: BIKE.headTop.x, y: BIKE.headTop.y }
  const headBottom = { x: BIKE.headBottom.x, y: BIKE.headBottom.y }

  /* ---------------- 车架 ---------------- */

  const frame = new THREE.Group()
  frame.add(bar(headBottom, bb, 0.021, materials.frame))
  frame.add(bar(bb, seatTop, 0.019, materials.frame))
  frame.add(bar(seatTop, headTop, 0.016, materials.frame))
  frame.add(bar(headTop, headBottom, 0.022, materials.frameDark))
  for (const side of [1, -1]) {
    frame.add(bar(bb, { ...rearAxle, z: side * 0.055 }, 0.011, materials.frame))
    frame.add(
      bar({ x: seatTop.x, y: seatTop.y - 0.03, z: side * 0.02 }, { ...rearAxle, z: side * 0.055 }, 0.009, materials.frame),
    )
  }
  const bottomBracket = cylinder(0.028, 0.07, materials.frameDark, 'z')
  bottomBracket.position.set(bb.x, bb.y, 0)
  frame.add(bottomBracket)

  frame.add(bar(seatTop, { x: BIKE.saddle.x, y: BIKE.saddle.y - 0.02 }, 0.012, materials.frameDark))
  const saddle = box(0.24, 0.035, 0.12, materials.saddle, BIKE.saddle.x, BIKE.saddle.y, 0)
  saddle.rotation.z = 0.05
  frame.add(saddle)

  const barTube = cylinder(0.013, 0.56, materials.frameDark, 'z')
  barTube.position.set(BIKE.bar.x, BIKE.bar.y, 0)
  frame.add(barTube)
  frame.add(bar(headTop, { x: BIKE.bar.x, y: BIKE.bar.y }, 0.014, materials.frameDark))
  for (const side of [1, -1]) {
    const grip = cylinder(0.019, 0.11, materials.saddle, 'z')
    grip.position.set(BIKE.bar.x + 0.02, BIKE.bar.y, side * 0.24)
    frame.add(grip)
  }
  model.add(frame)

  /* ---------------- 前叉与前轮（转向组） ---------------- */

  const steerGroup = new THREE.Group()
  steerGroup.position.set(headTop.x, headTop.y, 0)
  for (const side of [1, -1]) {
    steerGroup.add(
      bar(
        { x: headBottom.x - headTop.x, y: headBottom.y - headTop.y, z: side * 0.055 },
        { x: frontAxle.x - headTop.x, y: frontAxle.y - headTop.y, z: side * 0.055 },
        0.014,
        materials.frameDark,
      ),
    )
  }
  const frontWheel = buildWheel(materials)
  frontWheel.position.set(frontAxle.x - headTop.x, frontAxle.y - headTop.y, 0)
  steerGroup.add(frontWheel)
  model.add(steerGroup)

  const rearWheel = buildWheel(materials)
  rearWheel.position.set(rearAxle.x, rearAxle.y, 0)
  model.add(rearWheel)

  /* ---------------- 传动 ---------------- */

  const chainring = new THREE.Group()
  chainring.position.set(bb.x, bb.y, BIKE.chainlineZ)
  chainring.add(new THREE.Mesh(keep(new THREE.TorusGeometry(BIKE.chainringRadius, 0.008, 6, 32)), materials.alu))
  for (let i = 0; i < 5; i += 1) {
    const angle = (i / 5) * Math.PI * 2
    const spider = box(BIKE.chainringRadius * 1.7, 0.014, 0.008, materials.alu)
    spider.position.set(Math.cos(angle) * 0.033, Math.sin(angle) * 0.033, 0)
    spider.rotation.z = angle
    chainring.add(spider)
  }
  model.add(chainring)

  const crank = new THREE.Group()
  crank.position.set(bb.x, bb.y, 0)
  for (const side of [1, -1]) {
    crank.add(box(BIKE.crankLength, 0.026, 0.012, materials.alu, BIKE.crankLength / 2, 0, side * 0.075))
  }
  model.add(crank)

  const pedals: THREE.Mesh[] = []
  for (const side of [1, -1]) {
    const pedal = box(0.1, 0.018, 0.075, materials.saddle, 0, 0, side * 0.11)
    model.add(pedal)
    pedals.push(pedal)
  }

  const cassette = new THREE.Group()
  cassette.position.set(rearAxle.x, rearAxle.y, BIKE.chainlineZ)
  cassette.add(new THREE.Mesh(keep(new THREE.TorusGeometry(BIKE.cogRadius, 0.006, 5, 24)), materials.steel))
  model.add(cassette)

  const chainCount = 26
  const chain = new THREE.InstancedMesh(keep(new THREE.BoxGeometry(0.026, 0.019, 0.02)), materials.chain, chainCount)
  chain.frustumCulled = false
  chain.castShadow = false
  model.add(chain)

  /* ---------------- 发动机与吊架 ---------------- */

  const engine = new THREE.Group()
  engine.position.set(BIKE.engine.x, BIKE.engine.y, BIKE.engine.z)

  const nacelle = new THREE.Mesh(
    keep(new THREE.CylinderGeometry(BIKE.engineRadius, BIKE.engineRadius * 0.86, BIKE.engineLength, 28, 1, true)),
    materials.nacelle,
  )
  nacelle.rotation.z = Math.PI / 2
  nacelle.castShadow = true
  engine.add(nacelle)

  const lip = new THREE.Mesh(keep(new THREE.TorusGeometry(BIKE.engineRadius, 0.016, 8, 28)), materials.nacelleDark)
  lip.rotation.y = Math.PI / 2
  lip.position.x = BIKE.engineLength / 2
  engine.add(lip)

  const intake = new THREE.Mesh(
    keep(new THREE.CylinderGeometry(BIKE.engineRadius * 0.88, BIKE.engineRadius * 0.88, 0.02, 28, 1)),
    materials.nacelleDark,
  )
  intake.rotation.z = Math.PI / 2
  intake.position.x = BIKE.engineLength / 2 - 0.012
  engine.add(intake)

  // 风扇：实例化叶片，整体绕轴转（一个 draw call）
  const bladeCount = 14
  const blades = new THREE.InstancedMesh(keep(new THREE.BoxGeometry(0.012, 0.115, 0.052)), materials.blade, bladeCount)
  const bladeMatrix = new THREE.Matrix4()
  const bladeQuat = new THREE.Quaternion()
  const bladeScale = new THREE.Vector3(1, 1, 1)
  const bladeAxis = new THREE.Vector3(1, 0, 0)
  for (let i = 0; i < bladeCount; i += 1) {
    const angle = (i / bladeCount) * Math.PI * 2
    bladeQuat.setFromAxisAngle(bladeAxis, angle)
    const position = new THREE.Vector3(
      BIKE.engineLength / 2 - 0.075,
      Math.cos(angle) * BIKE.engineRadius * 0.5,
      Math.sin(angle) * BIKE.engineRadius * 0.5,
    )
    bladeMatrix.compose(position, bladeQuat, bladeScale)
    blades.setMatrixAt(i, bladeMatrix)
  }
  engine.add(blades)

  const spinner = new THREE.Mesh(keep(new THREE.ConeGeometry(0.045, 0.11, 16)), materials.nacelleDark)
  spinner.rotation.z = -Math.PI / 2
  spinner.position.x = BIKE.engineLength / 2 + 0.02
  engine.add(spinner)

  const nozzle = new THREE.Mesh(
    keep(new THREE.CylinderGeometry(BIKE.engineRadius * 0.62, BIKE.engineRadius * 0.44, 0.16, 24, 1, true)),
    materials.hot,
  )
  nozzle.rotation.z = Math.PI / 2
  nozzle.position.x = -BIKE.engineLength / 2 - 0.07
  engine.add(nozzle)

  // 机身上的一圈朱红标识 + 尾喷口的一圈橙色发光：远看也知道这是个「改过的发动机」
  const stripe = new THREE.Mesh(
    keep(new THREE.CylinderGeometry(BIKE.engineRadius * 1.01, BIKE.engineRadius * 1.01, 0.07, 28, 1, true)),
    materials.helmet,
  )
  stripe.rotation.z = Math.PI / 2
  stripe.position.x = -BIKE.engineLength / 2 + 0.09
  engine.add(stripe)

  // 从追尾镜头看过去，发动机最显眼的是尾喷口：一块暗色挡板 + 一圈橙光
  const exhaustPlug = new THREE.Mesh(
    keep(new THREE.CylinderGeometry(BIKE.engineRadius * 0.46, BIKE.engineRadius * 0.46, 0.03, 20)),
    materials.nacelleDark,
  )
  exhaustPlug.rotation.z = Math.PI / 2
  exhaustPlug.position.x = -BIKE.engineLength / 2 - 0.13
  engine.add(exhaustPlug)

  const nozzleGlow = new THREE.Mesh(
    keep(new THREE.TorusGeometry(BIKE.engineRadius * 0.46, 0.014, 6, 24)),
    materials.glow,
  )
  nozzleGlow.rotation.y = Math.PI / 2
  nozzleGlow.position.x = -BIKE.engineLength / 2 - 0.15
  engine.add(nozzleGlow)

  const flame = new THREE.Mesh(
    keep(new THREE.ConeGeometry(BIKE.engineRadius * 0.42, 0.42, 16, 1, true)),
    materials.glow,
  )
  flame.rotation.z = Math.PI / 2
  flame.position.x = -BIKE.engineLength / 2 - 0.32
  flame.visible = false
  engine.add(flame)

  // 吊架：从货架/后轴拉到吊舱下沿，外加一块安装板，让人看出它不是浮着的
  for (const side of [1, -1]) {
    engine.add(
      bar(
        { x: 0.13, y: -BIKE.engineRadius + 0.01, z: side * 0.075 },
        { x: 0.32, y: -0.3, z: side * 0.06 },
        0.012,
        materials.frameDark,
      ),
    )
    engine.add(
      bar(
        { x: -0.17, y: -BIKE.engineRadius + 0.01, z: side * 0.075 },
        { x: -0.3, y: -0.22, z: side * 0.055 },
        0.012,
        materials.frameDark,
      ),
    )
  }
  engine.add(box(0.32, 0.018, 0.2, materials.frameDark, 0.02, -BIKE.engineRadius - 0.006, 0))
  engine.add(box(0.1, 0.07, 0.07, materials.nacelleDark, -0.02, -BIKE.engineRadius - 0.055, 0.11))
  model.add(engine)

  // 后货架：两根杆从座管下方伸到后轴上方，吊舱坐在上面
  for (const side of [1, -1]) {
    model.add(
      bar(
        { x: seatTop.x - 0.01, y: seatTop.y - 0.06, z: side * 0.045 },
        { x: rearAxle.x + 0.05, y: rearAxle.y + 0.28, z: side * 0.05 },
        0.011,
        materials.frameDark,
      ),
    )
  }

  /* ---------------- 骑手 ---------------- */

  const rider = new THREE.Group()
  const hip = { x: bb.x - 0.02, y: 0.88 }
  const shoulder = { x: 0.16, y: 1.3 }

  const torsoMesh = new THREE.Mesh(keep(new THREE.CapsuleGeometry(0.115, 0.3, 4, 12)), materials.jacket)
  torsoMesh.position.set((hip.x + shoulder.x) / 2, (hip.y + shoulder.y) / 2, 0)
  torsoMesh.rotation.z = Math.atan2(shoulder.y - hip.y, shoulder.x - hip.x) - Math.PI / 2
  torsoMesh.castShadow = true
  rider.add(torsoMesh)

  const head = new THREE.Mesh(keep(new THREE.SphereGeometry(0.1, 16, 12)), materials.skin)
  head.position.set(shoulder.x + 0.09, shoulder.y + 0.12, 0)
  head.castShadow = true
  rider.add(head)
  const helmet = new THREE.Mesh(
    keep(new THREE.SphereGeometry(0.115, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.62)),
    materials.cap,
  )
  helmet.position.copy(head.position).add(new THREE.Vector3(0, 0.025, 0))
  helmet.castShadow = true
  rider.add(helmet)

  /* ---------------- 头盔上的北航校徽 ----------------
   * 贴片贴在头盔后半部、朝后上方，追尾镜头正好看得见。
   * 朝向用一组正交基算：法线朝后上，向右就是车身的 +Z，这样校徽的字是正的。
   */
  const logoTexture = createLogoTexture(`${import.meta.env.BASE_URL}mowan/beihang-logo.jpg`)
  const logoMaterial = new THREE.MeshStandardMaterial({
    map: logoTexture,
    roughness: 0.55,
    metalness: 0.05,
  })
  const logoGeometry = keep(makeCapGeometry(0.118, 0.085))
  const badge = new THREE.Mesh(logoGeometry, logoMaterial)
  const badgeNormal = new THREE.Vector3(-0.9, 0.44, 0).normalize()
  const badgeRight = new THREE.Vector3(0, 0, 1)
  const badgeDepth = new THREE.Vector3().crossVectors(badgeRight, badgeNormal).normalize()
  // 贴片的 +Y 极轴指向「后上方」，+X 指向车身右侧，所以校徽从追尾镜头看是正的
  badge.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(badgeRight, badgeNormal, badgeDepth))
  badge.position.copy(helmet.position)
  badge.castShadow = false
  rider.add(badge)

  for (const side of [1, -1]) {
    const shoulderPoint = { x: shoulder.x, y: shoulder.y, z: side * 0.16 }
    const elbow = { x: shoulder.x + 0.1, y: shoulder.y - 0.1, z: side * 0.2 }
    const hand = { x: BIKE.bar.x + 0.01, y: BIKE.bar.y, z: side * 0.21 }
    rider.add(bar(shoulderPoint, elbow, 0.042, materials.jacket))
    rider.add(bar(elbow, hand, 0.036, materials.jacket))
    const fist = new THREE.Mesh(keep(new THREE.SphereGeometry(0.045, 10, 8)), materials.skin)
    fist.position.set(hand.x, hand.y, hand.z)
    rider.add(fist)
  }

  const legs = [1, -1].map((side) => ({
    side,
    thigh: bar({ x: 0, y: 0 }, { x: 0, y: 0.4 }, 0.052, materials.trouser),
    shin: bar({ x: 0, y: 0 }, { x: 0, y: 0.4 }, 0.042, materials.trouser),
    foot: box(0.09, 0.035, 0.06, materials.saddle),
  }))
  for (const leg of legs) rider.add(leg.thigh, leg.shin, leg.foot)

  const riderRig = new THREE.Group()
  riderRig.add(rider)
  model.add(riderRig)

  /* ---------------- 每帧 ---------------- */

  const chainPath = buildChainLoop()
  const linkMatrix = new THREE.Matrix4()
  const linkQuat = new THREE.Quaternion()
  const linkPos = new THREE.Vector3()
  const linkTangent = new THREE.Vector3()
  const linkScale = new THREE.Vector3(1, 1, 1)
  const segmentStart = new THREE.Vector3()
  const segmentEnd = new THREE.Vector3()
  const segmentDirection = new THREE.Vector3()
  const segmentAxis = new THREE.Vector3(0, 0, 1)

  function placeLeg(
    leg: (typeof legs)[number],
    hipPoint: { x: number; y: number },
    footPoint: { x: number; y: number },
    z: number,
  ): void {
    const thighLength = 0.42
    const shinLength = 0.42
    const dx = footPoint.x - hipPoint.x
    const dy = footPoint.y - hipPoint.y
    const raw = Math.hypot(dx, dy)
    const distance = Math.min(thighLength + shinLength - 1e-3, Math.max(Math.abs(thighLength - shinLength) + 1e-3, raw))
    const ux = dx / (raw || 1)
    const uy = dy / (raw || 1)
    const a = (thighLength * thighLength - shinLength * shinLength + distance * distance) / (2 * distance)
    const h = Math.sqrt(Math.max(0, thighLength * thighLength - a * a))
    const base = { x: hipPoint.x + ux * distance, y: hipPoint.y + uy * distance }
    const kneeA = { x: hipPoint.x + ux * a - uy * h, y: hipPoint.y + uy * a + ux * h }
    const kneeB = { x: hipPoint.x + ux * a + uy * h, y: hipPoint.y + uy * a - ux * h }
    const knee = kneeA.x > kneeB.x ? kneeA : kneeB
    void base
    placeSegment(leg.thigh, hipPoint, knee, z, 0.052)
    placeSegment(leg.shin, knee, footPoint, z, 0.042)
    leg.foot.position.set(footPoint.x, footPoint.y + 0.02, z)
    leg.foot.rotation.z = 0
  }

  function placeSegment(
    mesh: THREE.Mesh,
    from: { x: number; y: number },
    to: { x: number; y: number },
    z: number,
    radius: number,
  ): void {
    segmentStart.set(from.x, from.y, z)
    segmentEnd.set(to.x, to.y, z)
    segmentDirection.subVectors(segmentEnd, segmentStart)
    const length = Math.max(1e-3, segmentDirection.length())
    mesh.scale.set(radius, length, radius)
    mesh.position.copy(segmentStart).addScaledVector(segmentDirection, 0.5)
    mesh.quaternion.setFromUnitVectors(UP, segmentDirection.normalize())
  }

  function update(view: GameView): void {
    root.position.x = view.lateral
    root.position.y = 0

    // 转向：横向速度决定偏航，输入决定前轮转角（模型坐标里 +Y 转向左，所以要取负）
    const leanNorm = view.lean / 0.46
    yawGroup.rotation.y = -leanNorm * 0.14
    steerGroup.rotation.y = -view.steer * 0.2 - leanNorm * 0.1

    // 车身姿态（世界轴：X 右、Y 上、Z 后）
    let crash = 0
    if (view.phase === 'crash' || view.phase === 'result') {
      const raw = Math.min(1, view.crashElapsed / 2.4)
      crash = raw
      const fall = easeOutCubic(Math.min(1, raw / 0.85))
      body.rotation.z = -view.lean * (1 - fall) - 1.32 * fall
      body.rotation.x = -0.85 * fall
      body.position.set(0, 0.16 * Math.sin(Math.PI * Math.min(1, fall * 1.15)), -0.7 * fall)
      riderRig.position.set(0.3 * fall, 0.6 * Math.sin(Math.PI * Math.min(1, fall)) - 0.3 * fall * fall, 0.2 * fall)
      riderRig.rotation.set(2.1 * fall, 0, -1.4 * fall)
    } else {
      body.rotation.set(0, 0, -view.lean)
      body.position.set(0, 0, 0)
      riderRig.position.set(0, 0, 0)
      riderRig.rotation.set(0, 0, 0)
    }

    // 轮子、曲柄、链条、风扇：全部由模型给的角度驱动
    rearWheel.rotation.z = -view.wheelAngle
    frontWheel.rotation.z = -view.wheelAngle
    crank.rotation.z = -view.crankAngle
    chainring.rotation.z = -view.crankAngle
    cassette.rotation.z = -view.wheelAngle
    blades.rotation.x = view.fanAngle
    // 发动机只要在跑就有热流；冲刺时喷口更亮更长
    const running = view.speed > 2 || view.phase === 'countdown' || crash > 0
    flame.visible = running
    const flameScale = view.boosting ? 1.5 : 0.55 + Math.min(0.5, view.speed * 0.015)
    flame.scale.set(flameScale, flameScale, flameScale)
    nozzleGlow.visible = true

    // 脚踏与双腿：曲柄角决定脚的位置，踏板保持水平
    const cos = Math.cos(view.crankAngle)
    const sin = Math.sin(view.crankAngle)
    for (let i = 0; i < 2; i += 1) {
      const side = i === 0 ? 1 : -1
      const px = bb.x + cos * BIKE.crankLength * side
      const py = bb.y + sin * BIKE.crankLength * side
      const pedal = pedals[i]
      pedal.position.set(px, py, side * 0.11)
      placeLeg(legs[i], hip, { x: px, y: py }, side * 0.11)
    }

    // 链条：沿闭合环按弧长排布链板
    const total = chainPath.length
    const travel = ((view.chainTravel % total) + total) % total
    for (let i = 0; i < chainCount; i += 1) {
      const s = ((i / chainCount) * total + travel) % total
      chainPath.sample(s, linkPos, linkTangent)
      linkQuat.setFromUnitVectors(segmentAxis, linkTangent)
      linkMatrix.compose(linkPos, linkQuat, linkScale)
      chain.setMatrixAt(i, linkMatrix)
    }
    chain.instanceMatrix.needsUpdate = true
  }

  return {
    root,
    update,
    dispose() {
      for (const geometry of geometries) geometry.dispose()
      chain.dispose()
      logoTexture.dispose()
      logoMaterial.dispose()
      for (const material of Object.values(materials)) material.dispose()
      root.clear()
    },
  }
}

/**
 * 校徽贴图：先在 canvas 上加工一遍。
 * 原图的白底占了大半面积，头盔上只有十几像素宽时几乎看不出是枚校徽；
 * 这里把外圈加粗成北航蓝，远看也能认出「一枚校徽」。
 */
function createLogoTexture(url: string): THREE.CanvasTexture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  const context = canvas.getContext('2d')
  const image = new Image()
  image.onload = () => {
    if (!context) return
    context.clearRect(0, 0, size, size)
    context.filter = 'saturate(1.4) contrast(1.15)'
    context.drawImage(image, 0, 0, size, size)
    context.filter = 'none'
    context.strokeStyle = '#18508c'
    context.lineWidth = size * 0.05
    context.beginPath()
    context.arc(size / 2, size / 2, size * 0.455, 0, Math.PI * 2)
    context.stroke()
    texture.needsUpdate = true
  }
  image.src = url
  return texture
}

/**
 * 贴在球面上的圆形贴片：用球冠几何 + 以「到圆心距离」重算的 UV，
 * 这样校徽贴在头盔上不会拉成方块，也不会像一块平板浮在球面上。
 */
function makeCapGeometry(radius: number, capRadius: number): THREE.BufferGeometry {
  const capAngle = Math.asin(Math.min(1, capRadius / radius))
  const geometry = new THREE.SphereGeometry(radius, 36, 18, 0, Math.PI * 2, 0, capAngle)
  const position = geometry.attributes.position as THREE.BufferAttribute
  const uv = geometry.attributes.uv as THREE.BufferAttribute
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i)
    const z = position.getZ(i)
    uv.setXY(i, 0.5 + x / (2 * capRadius), 0.5 - z / (2 * capRadius))
  }
  uv.needsUpdate = true
  return geometry
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}
