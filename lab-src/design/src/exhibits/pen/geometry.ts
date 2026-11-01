/**
 * 按动笔的几何展示层。
 *
 * 只负责把 `model.ts` 给出的状态摆成零件，不自己算位移、角度或锁止。
 * 单位：mm；笔轴沿世界 Z，笔尖在 Z=0，尾部在 Z≈141。
 *
 * 车削类零件先在本地 Y 轴生成（LatheGeometry 绕 Y 旋转），
 * 整个 root 再绕 X 转 +90°，于是「本地 y ≡ 世界 z」。
 * 最后 root 统一缩放到世界单位（1 单位 = 50 mm），几何数学仍按 mm 写。
 */

import * as THREE from 'three'
import { PEN } from './model'

export type PartId =
  | 'cap'
  | 'plunger'
  | 'rotor'
  | 'guide'
  | 'refill'
  | 'spring'
  | 'barrel'
  | 'clip'
  | 'cone'

export type ViewMode = 'exterior' | 'cutaway' | 'exploded'

export interface PenView {
  /** 机构相对位移（mm） */
  x: number
  /** 转子索引角（度） */
  theta: number
  /** 当前关键接触 */
  contact: 'collar' | 'plunger' | 'guide' | 'ramp' | 'stop'
  viewMode: ViewMode
  /** 0..1 爆开程度 */
  explode: number
  /** 选中零件 */
  selected: PartId | null
  /** 笔夹抬起角 0..18° */
  clipOpen: number
}

export interface PenModel {
  root: THREE.Group
  /** 1 mm 对应的世界单位 */
  scale: number
  update(view: PenView): void
  dispose(): void
  pick(raycaster: THREE.Raycaster): PartId | null
  /** 按帽命中体，用于拖动按压 */
  capHitArea: THREE.Object3D
}

/* ---------------------------------------------------------------- 尺寸约定 */

const R = {
  barrelOuter: PEN.rearBarrelOuterDiameter / 2,
  barrelInner: PEN.mechanismCavityDiameter / 2,
  gripOuter: PEN.gripMaxDiameter / 2,
  coneTip: PEN.coneTipDiameter / 2,
  button: PEN.buttonDiameter / 2,
  buttonCollar: 4.1,
  rod: 2.3,
  rotor: PEN.rotorBodyDiameter / 2,
  lugOuter: PEN.rotorLugEnvelopeDiameter / 2,
  guideOuter: PEN.guideOuterDiameter / 2,
  guidePocket: PEN.guideChannelEnvelopeDiameter / 2,
  refill: PEN.refillMaxDiameter / 2,
  neck: PEN.refillNeckDiameter / 2,
  springRadius: (PEN.springOuterDiameter - PEN.springWireDiameter) / 2,
}

const Z = {
  coneEnd: PEN.coneZ[1],
  gripStart: PEN.gripZ[0],
  gripEnd: PEN.gripZ[1],
  connectorStart: PEN.connectorZ[0],
  connectorEnd: PEN.connectorZ[1],
  barrelStart: PEN.rearBarrelZ[0],
  barrelEnd: PEN.rearBarrelZ[1],
  capTop: PEN.nominalLength,
  capCollarBottom: 127.6,
  rodBottom: 118.9,
  rotorTop: 118.9,
  guideTop: 118.9,
  guideBottom: 114.9,
  stopLevel: 116.7,
  rampTop: 113.7,
  rampDepth: 0.8,
  rampBaseBottom: 111.9,
  refillEnd: 111.9,
  springFrontSeat: PEN.springFrontSeatZ,
  clipPivot: 129,
}

const LUG_HEIGHT = 1.2
const CHANNEL_COUNT = 6
const CHANNEL_ARC = (26 * Math.PI) / 180
const TOOTH_ARC = (34 * Math.PI) / 180
/** 世界单位换算：1 单位 = 50 mm（笔长约 2.8 单位，正好落在舞台默认光照尺度里） */
export const PEN_WORLD_SCALE = 0.02

/* ---------------------------------------------------------------- 材质 */

type MaterialKey =
  | 'clear'
  | 'clearInner'
  | 'grip'
  | 'cap'
  | 'clip'
  | 'metal'
  | 'ink'
  | 'refillTube'
  | 'teachPlunger'
  | 'teachRotor'
  | 'teachGuide'
  | 'teachGuideRib'
  | 'teachRotorLug'
  | 'spring'
  | 'edge'

function createMaterials(): Record<MaterialKey, THREE.MeshStandardMaterial> {
  // Fresnel 轮廓：正面清透，掠射角保留塑料边缘，避免把透明壳画成灰色实心管。
  const clear = new THREE.MeshPhysicalMaterial({
    color: 0xe4eff4, roughness: 0.12, metalness: 0,
    transparent: true, opacity: 0.58, depthWrite: false,
    clearcoat: 1, clearcoatRoughness: 0.1, envMapIntensity: 1.15,
    side: THREE.FrontSide,
  })
  clear.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_begin>',
      '#include <normal_fragment_begin>\n diffuseColor.a *= 0.22 + 0.78 * pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 1.6);',
    )
  }
  clear.customProgramCacheKey = () => 'pen-fresnel-shell-v1'
  const clearInner = clear.clone()
  clearInner.opacity = 0.32
  clearInner.onBeforeCompile = clear.onBeforeCompile
  clearInner.customProgramCacheKey = clear.customProgramCacheKey
  return {
    clear,
    clearInner,
    grip: new THREE.MeshStandardMaterial({ color: 0x20262b, roughness: 0.68, metalness: 0 }),
    cap: new THREE.MeshPhysicalMaterial({ color: 0x111820, roughness: 0.29, clearcoat: 0.5, metalness: 0 }),
    clip: new THREE.MeshPhysicalMaterial({ color: 0x10171e, roughness: 0.23, clearcoat: 0.65, metalness: 0 }),
    metal: new THREE.MeshStandardMaterial({ color: 0xc0c9d1, roughness: 0.23, metalness: 0.92, envMapIntensity: 1.25 }),
    ink: new THREE.MeshStandardMaterial({ color: 0x232a33, roughness: 0.5, metalness: 0.05 }),
    refillTube: new THREE.MeshStandardMaterial({
      color: 0xe8eef2,
      roughness: 0.22,
      metalness: 0.05,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    }),
    teachPlunger: new THREE.MeshStandardMaterial({ color: 0xd8d3c8, roughness: 0.55, metalness: 0.05 }),
    teachRotor: new THREE.MeshStandardMaterial({ color: 0xe6e2d8, roughness: 0.5, metalness: 0.08 }),
    teachGuide: new THREE.MeshStandardMaterial({ color: 0xcfd2d6, roughness: 0.55, metalness: 0.12 }),
    teachGuideRib: new THREE.MeshStandardMaterial({ color: 0xbdc3cb, roughness: 0.5, metalness: 0.14 }),
    teachRotorLug: new THREE.MeshStandardMaterial({ color: 0xd7d3c9, roughness: 0.48, metalness: 0.1 }),
    spring: new THREE.MeshStandardMaterial({ color: 0xb4bec7, roughness: 0.25, metalness: 0.9 }),
    edge: new THREE.MeshStandardMaterial({ color: 0xa8bec8, roughness: 0.3, transparent: true, opacity: 0.45, depthWrite: false }),
  }
}

/** 教学配色只在剖视／拆解时出现，外观模式用中性色，不假称实物颜色 */
const TEACHING_COLORS: Array<[MaterialKey, number]> = [
  ['teachPlunger', 0xed8d38],
  ['teachRotor', 0x18a6a3],
  ['teachRotorLug', 0x3fc7c2],
  ['teachGuide', 0x64758b],
  ['teachGuideRib', 0x9aabbe],
]
const NEUTRAL_COLORS: Array<[MaterialKey, number]> = [
  ['teachPlunger', 0xd8d3c8],
  ['teachRotor', 0xe6e2d8],
  ['teachRotorLug', 0xe4e0d6],
  ['teachGuide', 0xcfd2d6],
  ['teachGuideRib', 0xc5cad0],
]

/* ---------------------------------------------------------------- 几何工具 */

function lathe(
  points: Array<[number, number]>,
  phiStart = 0,
  phiLength = Math.PI * 2,
): THREE.BufferGeometry {
  const profile = points.map(([radius, y]) => new THREE.Vector2(Math.max(radius, 0.0001), y))
  return new THREE.LatheGeometry(profile, 96, phiStart, phiLength)
}

function tubeProfile(
  outerRadius: number,
  innerRadius: number,
  y0: number,
  y1: number,
): Array<[number, number]> {
  return [
    [innerRadius, y0],
    [outerRadius, y0],
    [outerRadius, y1],
    [innerRadius, y1],
    [innerRadius, y0],
  ]
}

/** 索引斜面环：6 个 V 形斜面，脊在 60° 整数倍（导槽中心），谷在 30°+60°k */
function rampRingGeometry(): THREE.BufferGeometry {
  const perRamp = 12
  const rInner = R.rotor + 0.14
  const rOuter = R.guidePocket
  const step = (Math.PI * 2) / CHANNEL_COUNT
  const heightAt = (phi: number) => {
    const local = ((phi % step) + step) % step
    const t = local / step
    const tri = t <= 0.5 ? 1 - t / 0.5 : (t - 0.5) / 0.5
    return Z.rampTop - Z.rampDepth * tri
  }

  const positions: number[] = []
  const indices: number[] = []

  for (let tooth = 0; tooth < CHANNEL_COUNT; tooth += 1) {
    const base = tooth * step
    for (let i = 0; i < perRamp; i += 1) {
      const a0 = base + step * (i / perRamp)
      const a1 = base + step * ((i + 1) / perRamp)
      const h0 = heightAt(a0)
      const h1 = heightAt(a1)
      const start = positions.length / 3
      positions.push(
        Math.cos(a0) * rInner,
        h0,
        Math.sin(a0) * rInner,
        Math.cos(a0) * rOuter,
        h0,
        Math.sin(a0) * rOuter,
        Math.cos(a1) * rOuter,
        h1,
        Math.sin(a1) * rOuter,
        Math.cos(a1) * rInner,
        h1,
        Math.sin(a1) * rInner,
      )
      indices.push(start, start + 2, start + 1, start, start + 3, start + 2)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

/** 纵向凹槽直接写进握胶表面；两端渐隐，不用穿插的方条冒充凹槽。 */
function gripGeometry(): THREE.BufferGeometry {
  const radial = 128
  const axial = 88
  const positions: number[] = []
  const indices: number[] = []
  for (let j = 0; j <= axial; j += 1) {
    const t = j / axial
    const y = Z.gripStart + t * (Z.gripEnd - Z.gripStart)
    const end = Math.min(1, t / 0.12, (1 - t) / 0.08)
    const radius = 5.13 + (R.gripOuter - 5.13) * Math.sin(Math.max(0, end) * Math.PI / 2)
    const grooveWindow = Math.sin(Math.PI * Math.max(0, Math.min(1, (t - 0.12) / 0.75))) ** 0.35
    for (let i = 0; i <= radial; i += 1) {
      const phi = (i / radial) * Math.PI * 2
      const groove = Math.max(0, Math.cos(phi * 8)) ** 18
      const r = radius - 0.18 * groove * grooveWindow
      positions.push(Math.cos(phi) * r, y, Math.sin(phi) * r)
      if (j < axial && i < radial) {
        const a = j * (radial + 1) + i
        indices.push(a, a + radial + 1, a + 1, a + 1, a + radial + 1, a + radial + 2)
      }
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

/** 弹簧压缩时更新螺旋中心线，钢丝横截面不随轴向压扁。 */
function createSpring(): { geometry: THREE.BufferGeometry; setLength: (length: number) => void } {
  const segments = PEN.springTurns * 32
  const sides = 8
  const positions = new Float32Array((segments + 1) * (sides + 1) * 3)
  const normals = new Float32Array(positions.length)
  const indices: number[] = []
  for (let i = 0; i < segments; i += 1) for (let j = 0; j < sides; j += 1) {
    const a = i * (sides + 1) + j
    indices.push(a, a + 1, a + sides + 1, a + 1, a + sides + 2, a + sides + 1)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage))
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3).setUsage(THREE.DynamicDrawUsage))
  geometry.setIndex(indices)
  let previous = -1
  const setLength = (length: number) => {
    if (Math.abs(length - previous) < 1e-6) return
    previous = length
    const wire = PEN.springWireDiameter / 2
    const omega = PEN.springTurns * Math.PI * 2
    for (let i = 0; i <= segments; i += 1) {
      const t = i / segments
      const a = 0.075
      const fraction = t < a ? t * t / (2 * a * (1 - a)) : t > 1 - a
        ? 1 - (1 - t) ** 2 / (2 * a * (1 - a)) : (t - a / 2) / (1 - a)
      const derivative = Math.min(1, t / a, (1 - t) / a) / (1 - a)
      const phi = t * omega
      const c = Math.cos(phi), s = Math.sin(phi)
      const pitch = (length - 2 * wire) * derivative
      const speed = Math.hypot(pitch, R.springRadius * omega)
      for (let j = 0; j <= sides; j += 1) {
        const ring = (j / sides) * Math.PI * 2
        const u = Math.cos(ring), v = Math.sin(ring)
        const nx = c * u + (pitch * s / speed) * v
        const ny = (R.springRadius * omega / speed) * v
        const nz = s * u - (pitch * c / speed) * v
        const k = (i * (sides + 1) + j) * 3
        positions[k] = c * R.springRadius + wire * nx
        positions[k + 1] = wire + fraction * (length - 2 * wire) + wire * ny
        positions[k + 2] = s * R.springRadius + wire * nz
        normals[k] = nx; normals[k + 1] = ny; normals[k + 2] = nz
      }
    }
    geometry.attributes.position.needsUpdate = true
    geometry.attributes.normal.needsUpdate = true
    geometry.computeBoundingSphere()
  }
  setLength(PEN.springInstalledLength)
  return { geometry, setLength }
}

/** 标签仅近似照片中的普通文字，不另行请求网络字体或贴图。 */
function clipLabel(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = 256; canvas.height = 1536
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = '#e6eee9'; ctx.textAlign = 'center'
  ctx.font = '64px Arial'; ctx.fillText('0.5', 128, 130)
  ctx.save(); ctx.translate(111, 1030); ctx.rotate(-Math.PI / 2)
  ctx.font = '76px Georgia'; ctx.fillText('SARASA', 0, 0)
  ctx.font = '27px Arial'; ctx.fillText('ZEBRA', 285, 0)
  ctx.restore()
  ctx.save(); ctx.translate(181, 960); ctx.rotate(-Math.PI / 2)
  ctx.font = '34px Arial'; ctx.fillText('CLIP', 0, 0); ctx.restore()
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

/* ---------------------------------------------------------------- 主体 */

export function createPenModel(): PenModel {
  const M = createMaterials()
  const root = new THREE.Group()
  root.rotation.x = Math.PI / 2
  root.scale.setScalar(PEN_WORLD_SCALE)

  /**
   * 剖切面：世界 x ≤ 0 保留（x 是笔的径向，+x 朝向默认镜头）。
   * 固定导向用它切掉朝向镜头的半圈，才能看见导槽与斜面本身。
   */
  const cutPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0)

  const poseGroups = new Map<string, THREE.Group>()
  const explodeGroups: Array<{ group: THREE.Group; offset: THREE.Vector3 }> = []
  const ownedMaterials = new Set<THREE.Material>(Object.values(M))
  const shellMaterials: THREE.MeshStandardMaterial[] = []
  const partMaterials = new Map<PartId, Set<THREE.MeshStandardMaterial>>()
  const materialCopies = new Map<string, THREE.MeshStandardMaterial>()

  function partGroup(key: string, offset: [number, number, number]): THREE.Group {
    const explode = new THREE.Group()
    const pose = new THREE.Group()
    pose.name = `pen-${key}`
    explode.add(pose)
    root.add(explode)
    poseGroups.set(key, pose)
    explodeGroups.push({ group: explode, offset: new THREE.Vector3(...offset) })
    return pose
  }

  const mesh = (
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    part: PartId,
    pickThrough = false,
  ): THREE.Mesh => {
    // 分件材质：选中前锥不会连带点亮整个笔杆。
    let actual = material
    if (material instanceof THREE.MeshStandardMaterial) {
      const key = `${part}:${material.uuid}`
      let copy = materialCopies.get(key)
      if (!copy) {
        copy = material.clone()
        copy.onBeforeCompile = material.onBeforeCompile
        copy.customProgramCacheKey = material.customProgramCacheKey
        materialCopies.set(key, copy)
        ownedMaterials.add(copy)
        if (!partMaterials.has(part)) partMaterials.set(part, new Set())
        partMaterials.get(part)!.add(copy)
        if (part === 'barrel' || part === 'cone') shellMaterials.push(copy)
      }
      actual = copy
    }
    const item = new THREE.Mesh(geometry, actual)
    item.castShadow = !material.transparent
    item.receiveShadow = true
    if (material.transparent) item.renderOrder = part === 'refill' ? 1 : 3
    item.userData.partId = part
    item.userData.pickThrough = pickThrough
    item.userData.sourceMaterial = material.uuid
    return item
  }

  /** 方位角 → 让局部 +Z 指向该方位所需的绕 Y 旋转 */
  const azimuthRotation = (angle: number) => Math.PI / 2 - angle

  /* ---- 前锥 ---- */
  const coneGroup = partGroup('cone', [0, -24, -14])
  const coneProfile: Array<[number, number]> = [
    [R.coneTip, 0], [1.48, 0.55], [1.63, 1.5], [1.95, 3.3],
    [2.45, 5.4], [3.2, 7.5], [4.2, 9.8], [4.85, 11.1], [5.13, Z.coneEnd],
    [4.72, Z.coneEnd], [4.5, 11.1], [3.9, 9.8], [2.9, 7.5],
    [2.2, 5.4], [1.65, 3.3], [1.25, 1.0], [1.15, 0], [R.coneTip, 0],
  ]
  coneGroup.add(mesh(lathe(coneProfile), M.clear, 'cone', true))
  const frontSeat = mesh(lathe(tubeProfile(2.3, 1.35, Z.springFrontSeat - 0.35, Z.springFrontSeat)), M.clearInner, 'cone', true)
  frontSeat.name = 'spring-front-seat'
  coneGroup.add(frontSeat)

  /* ---- 握胶 ---- */
  const gripGroup = partGroup('grip', [0, -12, -16])
  gripGroup.add(
    mesh(
      gripGeometry(),
      M.grip,
      'barrel',
    ),
  )
  for (const [y, radius] of [[Z.gripStart, 5.13], [Z.gripEnd, 5.13]]) {
    gripGroup.add(mesh(lathe(tubeProfile(radius, 4.85, y, y + 0.12)), M.grip, 'barrel'))
  }

  /* ---- 透明连接区 + 螺纹环 ---- */
  const connectorGroup = partGroup('connector', [0, 3, -16])
  const connectorNear = mesh(
    lathe(tubeProfile(5.1, 4.2, Z.connectorStart, Z.connectorEnd), 0, Math.PI),
    M.clear,
    'barrel',
    true,
  )
  const connectorFar = mesh(
    lathe(tubeProfile(5.1, 4.2, Z.connectorStart, Z.connectorEnd), Math.PI, Math.PI),
    M.clearInner,
    'barrel',
    true,
  )
  connectorGroup.add(connectorNear, connectorFar)
  const threadPoints: THREE.Vector3[] = []
  for (let i = 0; i <= 320; i += 1) {
    const t = i / 320, angle = t * Math.PI * 12
    threadPoints.push(new THREE.Vector3(Math.cos(angle) * 4.78, 53 + 12 * t, Math.sin(angle) * 4.78))
  }
  connectorGroup.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(threadPoints), 320, 0.07, 5, false), M.edge, 'barrel', true))

  /* ---- 后笔杆 ---- */
  const barrelGroup = partGroup('barrel', [0, 16, -18])
  const barrelProfile: Array<[number, number]> = [
    [R.barrelInner, Z.barrelStart], [5.05, Z.barrelStart], [R.barrelOuter, 66.5],
    [R.barrelOuter, 126.8], [5.0, 128.6], [4.72, 130.0], [4.3, Z.barrelEnd],
    [2.95, Z.barrelEnd], [2.95, 129.9], [R.barrelInner, 128.4], [R.barrelInner, Z.barrelStart],
  ]
  const barrelNear = mesh(lathe(barrelProfile, 0, Math.PI), M.clear, 'barrel', true)
  const barrelFar = mesh(lathe(barrelProfile, Math.PI, Math.PI), M.clearInner, 'barrel', true)
  barrelGroup.add(barrelNear, barrelFar)
  for (const y of [66.25, 127.4, 129.1]) {
    barrelGroup.add(mesh(lathe(tubeProfile(y < 100 ? 5.12 : 4.92, y < 100 ? 4.96 : 4.72, y, y + 0.18)), M.edge, 'barrel', true))
  }

  // 笔杆口内台：按帽轴肩的止挡
  barrelGroup.add(
    mesh(
      lathe(tubeProfile(R.barrelInner, R.button, Z.barrelEnd - 0.05, Z.barrelEnd), 0, Math.PI * 2),
      M.clear,
      'barrel',
    ),
  )

  /* ---- 固定导向：导槽 + 浅锁止支承面 + 索引斜面 ---- */
  const guideGroup = partGroup('guide', [0, 36, 0])
  guideGroup.add(
    mesh(
      lathe(tubeProfile(R.guideOuter, R.guidePocket, Z.guideBottom, Z.guideTop), 0, Math.PI * 2),
      M.teachGuide,
      'guide',
    ),
  )

  const toothInner = R.rotor + 0.15
  for (let i = 0; i < CHANNEL_COUNT; i += 1) {
    const angle = (i * Math.PI * 2) / CHANNEL_COUNT + Math.PI / CHANNEL_COUNT
    const tooth = mesh(
      lathe(tubeProfile(R.guidePocket, toothInner, Z.guideBottom, Z.guideTop),
        Math.PI / 2 - angle - TOOTH_ARC / 2, TOOTH_ARC),
      M.teachGuideRib,
      'guide',
    )
    guideGroup.add(tooth)
  }

  for (let i = 0; i < CHANNEL_COUNT; i += 1) {
    if (i % 2 === 0) continue
    const angle = (i * Math.PI * 2) / CHANNEL_COUNT
    const bridge = mesh(
      lathe(tubeProfile(R.guidePocket, toothInner, Z.stopLevel, Z.guideTop),
        Math.PI / 2 - angle - CHANNEL_ARC / 2, CHANNEL_ARC),
      M.teachGuideRib,
      'guide',
    )
    guideGroup.add(bridge)
  }

  guideGroup.add(mesh(rampRingGeometry(), M.teachGuideRib, 'guide'))
  guideGroup.add(
    mesh(
      lathe(
        tubeProfile(R.guidePocket, R.rotor + 0.14, Z.rampBaseBottom, Z.rampTop - Z.rampDepth),
        0,
        Math.PI * 2,
      ),
      M.teachGuide,
      'guide',
    ),
  )

  /* ---- 转子 ---- */
  const rotorGroup = partGroup('rotor', [0, 27, 0])
  const rotorBody = mesh(
    lathe([[0.001, Z.rotorTop - PEN.rotorLength], [R.rotor - 0.18, Z.rotorTop - PEN.rotorLength],
      [R.rotor, Z.rotorTop - PEN.rotorLength + 0.25], [R.rotor, Z.rotorTop - 0.2],
      [R.rotor - 0.15, Z.rotorTop], [0.001, Z.rotorTop]]),
    M.teachRotor,
    'rotor',
  )
  rotorGroup.add(rotorBody)

  const lugRadial = R.lugOuter - R.rotor
  for (let i = 0; i < PEN.lugCount; i += 1) {
    const angle = (i * Math.PI * 2) / PEN.lugCount
    const lug = mesh(new THREE.BoxGeometry(1.0, LUG_HEIGHT, lugRadial), M.teachRotorLug, 'rotor')
    lug.position.set(
      Math.cos(angle) * (R.rotor + lugRadial / 2),
      Z.rotorTop - LUG_HEIGHT / 2,
      Math.sin(angle) * (R.rotor + lugRadial / 2),
    )
    lug.rotation.y = azimuthRotation(angle)
    rotorGroup.add(lug)
  }

  /* ---- 推杆 ---- */
  const plungerGroup = partGroup('plunger', [0, 46, 0])
  const rod = mesh(
    new THREE.CylinderGeometry(R.rod, R.rod, Z.capCollarBottom - Z.rodBottom, 32),
    M.teachPlunger,
    'plunger',
  )
  rod.position.y = (Z.capCollarBottom + Z.rodBottom) / 2
  plungerGroup.add(rod)
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2
    const rib = mesh(new THREE.BoxGeometry(0.32, 5.6, 0.35), M.teachPlunger, 'plunger')
    rib.position.set(Math.cos(a) * 2.3, 124.3, Math.sin(a) * 2.3)
    rib.rotation.y = azimuthRotation(a)
    plungerGroup.add(rib)
  }

  /* ---- 按帽 ---- */
  const capGroup = partGroup('cap', [0, 58, 0])
  capGroup.add(
    mesh(
      lathe([
        [R.button, Z.barrelEnd],
        [R.button, Z.capTop - 0.65],
        [R.button - 0.05, Z.capTop - 0.35],
        [R.button - 0.22, Z.capTop - 0.1],
        [R.button - 0.48, Z.capTop],
        [0.0001, Z.capTop],
      ]),
      M.cap,
      'cap',
    ),
  )
  const capCollar = mesh(
    new THREE.CylinderGeometry(R.buttonCollar, R.buttonCollar, Z.barrelEnd - Z.capCollarBottom, 40),
    M.cap,
    'cap',
  )
  capCollar.position.y = (Z.barrelEnd + Z.capCollarBottom) / 2
  capGroup.add(capCollar)

  const capHit = new THREE.Mesh(
    new THREE.CylinderGeometry(R.button + 3.2, R.button + 3.2, Z.capTop - Z.barrelEnd + 8, 12),
    new THREE.MeshBasicMaterial({ visible: false }),
  )
  capHit.userData.partId = 'cap'
  capHit.position.y = (Z.capTop + Z.barrelEnd) / 2
  capGroup.add(capHit)

  /* ---- 笔芯 ---- */
  const refillGroup = partGroup('refill', [0, -32, 0])
  const refillShell = mesh(
      lathe([
        [R.neck, 4.6],
        [R.neck, PEN.springRearSeatZRetracted],
        [R.refill - 0.2, PEN.springRearSeatZRetracted],
        [R.refill, PEN.springRearSeatZRetracted + 0.4],
        [R.refill, Z.refillEnd - 0.8],
        [R.refill - 0.35, Z.refillEnd],
        [R.refill - 0.6, Z.refillEnd],
        [R.refill - 0.45, PEN.springRearSeatZRetracted + 0.75],
        [R.neck - 0.3, PEN.springRearSeatZRetracted + 0.3],
        [R.neck - 0.3, 4.6], [R.neck, 4.6],
      ]),
      M.refillTube,
      'refill',
  )
  refillShell.name = 'refill-shell'
  refillGroup.add(refillShell)
  const inkStart = PEN.springRearSeatZRetracted + 2.5
  const inkEnd = Z.refillEnd - 8
  const ink = mesh(
    new THREE.CylinderGeometry(R.refill - 0.65, R.refill - 0.65, inkEnd - inkStart, 48),
    M.ink,
    'refill',
  )
  ink.position.y = (inkEnd + inkStart) / 2
  refillGroup.add(ink)
  refillGroup.add(mesh(lathe(tubeProfile(R.refill - 0.35, R.refill - 0.9, Z.refillEnd - 1.4, Z.refillEnd)), M.teachRotor, 'refill'))

  refillGroup.add(
    mesh(
      lathe([
        [0.26, 0.8], [0.42, 1.2], [0.62, 2.0],
        [R.neck, 3.7],
        [R.neck, 4.6],
        [R.neck, 5.2],
        [0.0001, 5.2],
      ]),
      M.metal,
      'refill',
    ),
  )
  const ball = mesh(new THREE.SphereGeometry(PEN.ballDiameter / 2, 16, 12), M.metal, 'refill')
  ball.position.y = PEN.tipZRetracted
  refillGroup.add(ball)

  /* ---- 复位弹簧 ---- */
  const springGroup = partGroup('spring', [0, -6, -4])
  const springShape = createSpring()
  const spring = mesh(springShape.geometry, M.spring, 'spring')
  spring.name = 'return-spring'
  springGroup.add(spring)

  /* ---- 笔夹 ---- */
  // 本地坐标里：Y 是笔轴，XZ 是横截面；世界「上」= 本地 −Z。
  // 所以笔夹挂在 −Z 一侧（笔杆上方），厚度沿 Z、宽度沿 X。
  const clipGroup = partGroup('clip', [0, 16, -38])
  const clipPivot = new THREE.Group()
  clipPivot.name = 'clip-hinge'
  clipPivot.position.set(0, Z.clipPivot, -6.0)
  clipGroup.add(clipPivot)

  const clipCurve = (y: number) => {
    const t = Math.max(0, Math.min(1, -y / 37.4))
    return -0.9 * Math.sin(t * Math.PI) + 0.36 * t * t
  }
  const clipPositions: number[] = []
  const clipIndices: number[] = []
  const clipAxial = 112, clipRadial = 48
  for (let i = 0; i <= clipAxial; i += 1) {
    const t = i / clipAxial, y = 1.5 - 38.9 * t
    const tip = t > 0.9 ? Math.sqrt(Math.max(0.0001, 1 - ((t - 0.9) / 0.1) ** 2)) : 1
    const width = (2.4 - 0.35 * t) * tip * Math.min(1, 0.72 + t / 0.06)
    for (let j = 0; j <= clipRadial; j += 1) {
      const phi = (j / clipRadial) * Math.PI * 2
      const x = width * Math.cos(phi), sin = Math.sin(phi)
      const z = -0.2 + clipCurve(y) + 0.55 * Math.sign(sin) * Math.abs(sin) ** 0.4 + 0.07 * x * x
      clipPositions.push(x, y, z)
      if (i < clipAxial && j < clipRadial) {
        const k = i * (clipRadial + 1) + j
        clipIndices.push(k, k + 1, k + clipRadial + 1, k + 1, k + clipRadial + 2, k + clipRadial + 1)
      }
    }
  }
  const clipGeometry = new THREE.BufferGeometry()
  clipGeometry.setAttribute('position', new THREE.Float32BufferAttribute(clipPositions, 3))
  clipGeometry.setIndex(clipIndices)
  clipGeometry.computeVertexNormals()
  const clipBlade = mesh(clipGeometry, M.clip, 'clip')
  clipBlade.name = 'clip-blade'
  clipPivot.add(clipBlade)

  const labelTexture = clipLabel()
  if (labelTexture) {
    const labelGeometry = new THREE.PlaneGeometry(3.7, 35.8, 8, 72)
    const p = labelGeometry.attributes.position
    for (let i = 0; i < p.count; i += 1) {
      const x = p.getX(i), y = p.getY(i) - 17.2
      // PlaneGeometry 正面 +Z；转半圈后从笔夹外侧（−Z）看字。
      p.setXYZ(i, -x, y, -0.80 + clipCurve(y) + 0.07 * x * x)
    }
    labelGeometry.computeVertexNormals()
    const labelMaterial = new THREE.MeshStandardMaterial({ map: labelTexture, transparent: true,
      roughness: 0.46, depthWrite: false, alphaTest: 0.03, polygonOffset: true, polygonOffsetFactor: -1 })
    ownedMaterials.add(labelMaterial)
    clipPivot.add(mesh(labelGeometry, labelMaterial, 'clip'))
  }

  // 透明根座与横向转轴，转动中心位于外侧铰点，而不是笔轴。
  const clipBoss = mesh(new THREE.BoxGeometry(4.8, 3.2, 1.2), M.clear, 'barrel', true)
  clipBoss.position.set(0, Z.clipPivot - 0.8, -5.5)
  clipGroup.add(clipBoss)
  const hinge = mesh(new THREE.CylinderGeometry(0.7, 0.7, 4.6, 24), M.clip, 'clip')
  hinge.rotation.z = Math.PI / 2
  clipPivot.add(hinge)
  const clipSpring = mesh(new THREE.BoxGeometry(1.8, 7, 0.22), M.metal, 'clip')
  clipSpring.position.set(0, -5.5, -0.8 + clipCurve(-5.5))
  clipPivot.add(clipSpring)

  /* ---- 接触标记：朝剖开一侧的 60° 短弧，属于教学叠加标记，不是零件。
     线径保持纤细，避免在轴肩外沿形成一枚看似独立垫圈的整环。 */
  const contactMarker = new THREE.Mesh(
    new THREE.TorusGeometry(1, 0.012, 8, 24, Math.PI / 3),
    new THREE.MeshBasicMaterial({ color: 0xb8432d, transparent: true, opacity: 0.9, depthWrite: false }),
  )
  contactMarker.name = 'contact-region-marker'
  contactMarker.userData.pickThrough = true
  contactMarker.geometry.rotateZ(-Math.PI / 6)
  contactMarker.rotation.x = Math.PI / 2
  contactMarker.visible = false
  root.add(contactMarker)

  /** 接触标记的高度与半径（mm，本地坐标：y 轴向、x/z 径向） */
  const CONTACT_MARK: Record<PenView['contact'], { z: number; r: number }> = {
    // 轴肩端面的环形接触区域：半径位于按帽杆与轴肩外缘之间。
    // 轴向 0.06 mm 仅为显示偏移，防止与表面争深度，不代表装配间隙。
    collar: { z: Z.barrelEnd + 0.06, r: (R.button + R.buttonCollar) / 2 },
    plunger: { z: Z.rodBottom + 0.04, r: (R.rod + R.rotor) / 2 },
    guide: { z: Z.guideBottom + 0.8, r: 3.25 },
    ramp: { z: Z.rampTop - 0.1, r: 3.3 },
    stop: { z: Z.stopLevel, r: 3.2 },
  }

  /* ---- 状态应用 ---- */

  let lastMode: ViewMode | null = null
  let currentSelected: PartId | null = null

  function applyMode(mode: ViewMode): void {
    const colors = mode === 'exterior' ? NEUTRAL_COLORS : TEACHING_COLORS
    for (const [key, color] of colors) {
      M[key].color.setHex(color)
      for (const [id, copy] of materialCopies) {
        if (id.endsWith(`:${M[key].uuid}`)) copy.color.setHex(color)
      }
    }

    const open = mode === 'cutaway'
    barrelNear.visible = !open
    connectorNear.visible = !open

    // 同一剖面同时打开握胶、前锥和固定导向；拆解则恢复完整零件。
    const clip = open ? [cutPlane] : null
    for (const material of shellMaterials) material.clippingPlanes = clip
    for (const material of partMaterials.get('guide') ?? []) material.clippingPlanes = clip
  }

  function applyHighlight(next: PartId | null): void {
    if (next === currentSelected) return
    currentSelected = next
    for (const material of ownedMaterials) {
      if (material instanceof THREE.MeshStandardMaterial) {
        material.emissive.setHex(0x000000)
        material.emissiveIntensity = 0
      }
    }
    if (!next) return
    for (const material of partMaterials.get(next) ?? []) {
      material.emissive.setHex(0xb8432d)
      material.emissiveIntensity = 0.2
    }
  }

  function update(view: PenView): void {
    if (view.viewMode !== lastMode) {
      applyMode(view.viewMode)
      lastMode = view.viewMode
    }

    const x = view.x
    capGroup.position.y = -x
    plungerGroup.position.y = -x
    rotorGroup.position.y = -x
    rotorGroup.rotation.y = (view.theta * Math.PI) / 180
    refillGroup.position.y = -x

    // 弹簧：前端固定，后端随笔芯肩部前移；L = 15.5 − x
    springShape.setLength(PEN.springInstalledLength - x)
    spring.position.y = Z.springFrontSeat

    clipPivot.rotation.x = (view.clipOpen * Math.PI) / 180

    for (const item of explodeGroups) {
      item.group.position.copy(item.offset).multiplyScalar(view.explode)
    }

    // 只在剖视里标接触：装配状态下才有接触，拆解视图里零件已经分开
    const mark = CONTACT_MARK[view.contact]
    contactMarker.visible = view.viewMode === 'cutaway' && view.explode < 0.01
    contactMarker.position.y = mark.z - (view.contact === 'plunger' ? x : 0)
    contactMarker.scale.setScalar(mark.r)

    applyHighlight(view.selected)
  }

  function pick(raycaster: THREE.Raycaster): PartId | null {
    const hits = raycaster.intersectObject(root, true)
    for (const hit of hits) {
      if (hit.object.userData.pickThrough || hit.object === capHit) continue
      let visible = true
      for (let p: THREE.Object3D | null = hit.object; p; p = p.parent) if (!p.visible) visible = false
      if (!visible) continue
      const material = (hit.object as THREE.Mesh).material
      if (material && !Array.isArray(material) && material.clippingPlanes?.some((plane) => plane.distanceToPoint(hit.point) < 0)) continue
      let node: THREE.Object3D | null = hit.object
      while (node) {
        const id = node.userData.partId as PartId | undefined
        if (id) return id
        node = node.parent
      }
    }
    return null
  }

  function dispose(): void {
    root.traverse((object) => {
      const item = object as THREE.Mesh & { material?: THREE.Material | THREE.Material[] }
      item.geometry?.dispose()
    })
    for (const material of ownedMaterials) {
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose()
      material.dispose()
    }
    ;(capHit.material as THREE.Material).dispose()
    ;(contactMarker.material as THREE.Material).dispose()
    void poseGroups
  }

  applyMode('exterior')
  applyHighlight(null)

  return {
    root,
    scale: PEN_WORLD_SCALE,
    update,
    dispose,
    pick,
    capHitArea: capHit,
  }
}
