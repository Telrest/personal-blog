/**
 * 变速器的三维几何与摆位（three.js）。
 *
 * 这一层只做「按模型状态摆零件、上材质」，不自己算齿比、不算受力。
 * 所有尺寸来自 `chainPath.ts`：齿数决定齿形、链长决定摆臂角、所选齿片决定 Z。
 *
 * 坐标：模型是 mm，场景是 m（1 单位 = 1 m，整车约 1.16 m 长，轮胎落在地面 Y = 0）。
 *  X 朝车前，Y 向上，Z 朝骑车者右侧（传动侧）。
 *
 * 页面上必须写明的简化：
 *  - 齿形是按节距画的近似齿，不是厂家齿面；
 *  - 链节按弧长均匀排布，不追求每个滚子精确落进每个齿谷；
 *  - 换挡过渡时链条横向离开原齿片，是示意，不是接触求解。
 */

import * as THREE from 'three'
import type { ShiftFrame } from './model'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import {
  CHAIN_LENGTH,
  DRIVE,
  PARALLELOGRAM,
  buildDrivetrainPath,
  cassetteTeethAt,
  cogCount,
  cogZ,
  directionAt3d,
  guideArcCenter,
  guidePulleyCenterAtZ,
  pitchRadius,
  pointAt3d,
  solveCageAngle,
  solveCageAngleFor,
  tensionPulleyCenter,
  toothRootRadius,
  toothTipRadius,
  type DrivetrainPath,
  type PathFrame,
} from './chainPath'

/** mm → 场景米 */
const M = 0.001
const mm = (value: number): number => value * M

export type PartId =
  | 'frame'
  | 'wheel'
  | 'crank'
  | 'chainring'
  | 'chain'
  | 'cassette'
  | 'guidePulley'
  | 'tensionPulley'
  | 'cage'
  | 'parallelogram'
  | 'bKnuckle'

export const PART_IDS: PartId[] = [
  'frame',
  'crank',
  'chainring',
  'chain',
  'cassette',
  'guidePulley',
  'tensionPulley',
  'cage',
  'parallelogram',
  'bKnuckle',
  'wheel',
]

export interface DerailleurView {
  /** 已完成啮合的挡位（链条接触半径由它决定） */
  engaged: number
  /**
   * 换挡过渡时链条与后拨的实际位置：接触半径、接触平面、后拨平面。
   * 稳定挡位时三者就是所选齿片的半径与 Z。
   */
  shiftFrame: ShiftFrame
  crankAngle: number
  wheelAngle: number
  cassetteAngle: number
  chainTravel: number
  /**
   * 前轮角度（rad，顺时针为正）。前轮不受传动驱动，只由用户直接用鼠标拨动，
   * 所以它是独立于模型状态的一个纯视觉量。
   */
  frontWheelAngle: number
  selected: PartId | null
  showWheel: boolean
  showFrame: boolean
  chainHighlight: boolean
}

/* =========================================================================
   材质
   ========================================================================= */

interface Materials {
  frame: THREE.MeshStandardMaterial
  frameDark: THREE.MeshStandardMaterial
  steel: THREE.MeshStandardMaterial
  darkSteel: THREE.MeshStandardMaterial
  alu: THREE.MeshStandardMaterial
  chain: THREE.MeshStandardMaterial
  chainHighlight: THREE.MeshStandardMaterial
  plastic: THREE.MeshStandardMaterial
  tire: THREE.MeshStandardMaterial
  rim: THREE.MeshStandardMaterial
  saddle: THREE.MeshStandardMaterial
  highlight: THREE.MeshStandardMaterial
}

/**
 * 浅色工程展馆风格的材质：金属有金属度但粗糙度不低，
 * 避免强反光把齿形与链节糊掉；导轮是哑光塑料，与金属明显区分。
 */
function createMaterials(): Materials {
  return {
    frame: new THREE.MeshStandardMaterial({ color: 0x2b3d54, metalness: 0.35, roughness: 0.42 }),
    frameDark: new THREE.MeshStandardMaterial({ color: 0x1e2833, metalness: 0.4, roughness: 0.38 }),
    steel: new THREE.MeshStandardMaterial({ color: 0xbcc1c4, metalness: 0.7, roughness: 0.34 }),
    darkSteel: new THREE.MeshStandardMaterial({ color: 0x7c8287, metalness: 0.78, roughness: 0.42 }),
    alu: new THREE.MeshStandardMaterial({ color: 0xccd0d2, metalness: 0.6, roughness: 0.3 }),
    chain: new THREE.MeshStandardMaterial({ color: 0x60676c, metalness: 0.76, roughness: 0.48 }),
    chainHighlight: new THREE.MeshStandardMaterial({
      color: 0xb06a3c,
      metalness: 0.5,
      roughness: 0.42,
      emissive: 0xc2553a,
      emissiveIntensity: 0.22,
    }),
    plastic: new THREE.MeshStandardMaterial({ color: 0x3a3f45, metalness: 0.08, roughness: 0.7 }),
    tire: new THREE.MeshStandardMaterial({ color: 0x26292b, metalness: 0.02, roughness: 0.94 }),
    rim: new THREE.MeshStandardMaterial({ color: 0xadb2b5, metalness: 0.56, roughness: 0.36 }),
    saddle: new THREE.MeshStandardMaterial({ color: 0x1f2429, metalness: 0.05, roughness: 0.8 }),
    highlight: new THREE.MeshStandardMaterial({
      color: 0xc2553a,
      metalness: 0.3,
      roughness: 0.5,
      emissive: 0xb8432d,
      emissiveIntensity: 0.4,
    }),
  }
}

/* =========================================================================
   形状与基础几何
   ========================================================================= */

/** 齿形轮廓：按节距对应的节圆画齿顶与齿根（教学近似齿） */
export function gearShape(teeth: number, pitchR: number): THREE.Shape {
  const tip = toothTipRadius(pitchR)
  const root = toothRootRadius(pitchR)
  const step = (Math.PI * 2) / teeth
  const shape = new THREE.Shape()

  for (let i = 0; i < teeth; i += 1) {
    const center = i * step - Math.PI / 2
    const points: [number, number][] = [
      [center - step * 0.46, root],
      [center - step * 0.23, tip],
      [center + step * 0.23, tip],
      [center + step * 0.46, root],
    ]
    points.forEach(([angle, radius], index) => {
      const x = Math.cos(angle) * radius
      const y = Math.sin(angle) * radius
      if (i === 0 && index === 0) shape.moveTo(x, y)
      else shape.lineTo(x, y)
    })
  }
  shape.closePath()
  return shape
}

/** 带中心孔的齿盘轮廓 */
function gearRingShape(teeth: number, pitchR: number, bore: number): THREE.Shape {
  const shape = gearShape(teeth, pitchR)
  const hole = new THREE.Path()
  hole.absarc(0, 0, bore, 0, Math.PI * 2, true)
  shape.holes.push(hole)
  return shape
}

/** 圆角长条（链板、导板） */
function stadiumShape(length: number, height: number): THREE.Shape {
  const half = Math.max(0, (length - height) / 2)
  const radius = height / 2
  const shape = new THREE.Shape()
  shape.moveTo(-half, -radius)
  shape.lineTo(half, -radius)
  shape.absarc(half, 0, radius, -Math.PI / 2, Math.PI / 2, false)
  shape.lineTo(-half, radius)
  shape.absarc(-half, 0, radius, Math.PI / 2, (Math.PI * 3) / 2, false)
  shape.closePath()
  return shape
}

/**
 * 把 mm 单位画出来的轮廓挤出成实体，并整体缩放到场景单位（米）。
 * 齿形、链板、导板都是先在 mm 坐标里画的，这里统一换算，避免到处写 0.001。
 */
function extrudeCentered(shape: THREE.Shape, depthMm: number, curveSegments = 10): THREE.BufferGeometry {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: depthMm,
    bevelEnabled: false,
    curveSegments,
  })
  geometry.translate(0, 0, -depthMm / 2)
  geometry.scale(M, M, M)
  geometry.computeVertexNormals()
  return geometry
}

const UP = new THREE.Vector3(0, 1, 0)
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1)
const UNIT_CYLINDER = new THREE.CylinderGeometry(1, 1, 1, 12, 1)

const v3 = (x: number, y: number, z: number): THREE.Vector3 =>
  new THREE.Vector3(mm(x), mm(y), mm(z))

/** 把一根单位圆柱摆到两点之间（半径按米） */
function placeBar(mesh: THREE.Mesh, from: THREE.Vector3, to: THREE.Vector3, radius: number): void {
  const direction = new THREE.Vector3().subVectors(to, from)
  const length = direction.length()
  mesh.scale.set(radius, Math.max(length, 1e-5), radius)
  mesh.position.copy(from).addScaledVector(direction, 0.5)
  mesh.quaternion.setFromUnitVectors(UP, direction.normalize())
}

/** 把一根单位长条（板）摆到两点之间，可指定厚度 */
function placePlate(
  mesh: THREE.Mesh,
  from: THREE.Vector3,
  to: THREE.Vector3,
  width: number,
  thickness: number,
): void {
  const direction = new THREE.Vector3().subVectors(to, from)
  const length = direction.length()
  mesh.scale.set(width, Math.max(length, 1e-5), thickness)
  mesh.position.copy(from).addScaledVector(direction, 0.5)
  mesh.quaternion.setFromUnitVectors(UP, direction.normalize())
}

function staticBar(from: THREE.Vector3, to: THREE.Vector3, radius: number, material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(UNIT_CYLINDER, material)
  placeBar(mesh, from, to, radius)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

function cylinder(radiusMm: number, lengthMm: number, material: THREE.Material, axis: 'x' | 'y' | 'z' = 'z'): THREE.Mesh {
  const geometry = new THREE.CylinderGeometry(mm(radiusMm), mm(radiusMm), mm(lengthMm), 18, 1)
  const mesh = new THREE.Mesh(geometry, material)
  if (axis === 'z') mesh.rotation.x = Math.PI / 2
  if (axis === 'x') mesh.rotation.z = Math.PI / 2
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

/* =========================================================================
   车架与车轮
   ========================================================================= */

/** 资料包 B01 的整车几何锚点（mm，地面 Y = 0，传动侧 Z > 0） */
export const FRAME = {
  bb: { x: 0, y: 315, z: 0 },
  rearAxle: { x: DRIVE.rearAxle.x, y: DRIVE.rearAxle.y, z: 0 },
  frontAxle: { x: 712.34, y: 370, z: 0 },
  headTop: { x: 436, y: 921, z: 0 },
  headBottom: { x: 476.2, y: 824, z: 0 },
  seatTop: { x: -111.9, y: 719.7, z: 0 },
  saddle: { x: -140, y: 838, z: 0 },
  bar: { x: 402, y: 966, z: 0 },
  /** 后轮中心平面在 Z = 0；飞轮整体在 Z > 0（传动侧） */
  hubHalfWidth: 74,
} as const

function createWheel(radiusMm: number, widthMm: number, materials: Materials, spokes = 32): THREE.Group {
  const group = new THREE.Group()
  const radius = mm(radiusMm)
  const width = mm(widthMm)

  const tire = new THREE.Mesh(new THREE.TorusGeometry(radius - width / 2, width / 2, 10, 72), materials.tire)
  tire.castShadow = true
  tire.receiveShadow = true
  group.add(tire)

  const rim = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.8, radius * 0.8, mm(21), 72, 1, true),
    materials.rim,
  )
  rim.rotation.x = Math.PI / 2
  rim.castShadow = true
  group.add(rim)

  const spokeGeometry = new THREE.CylinderGeometry(0.0015, 0.0015, 1, 6, 1)
  const spokesMesh = new THREE.InstancedMesh(spokeGeometry, materials.alu, spokes)
  const matrix = new THREE.Matrix4()
  const quaternion = new THREE.Quaternion()
  const hubFlange = mm(28)
  const rimInner = radius * 0.8
  for (let i = 0; i < spokes; i += 1) {
    const angle = (i / spokes) * Math.PI * 2
    const side = i % 2 === 0 ? 1 : -1
    const start = new THREE.Vector3(Math.cos(angle) * hubFlange, Math.sin(angle) * hubFlange, side * mm(20))
    const end = new THREE.Vector3(Math.cos(angle + 0.12) * rimInner, Math.sin(angle + 0.12) * rimInner, 0)
    const direction = new THREE.Vector3().subVectors(end, start)
    const length = direction.length()
    quaternion.setFromUnitVectors(UP, direction.clone().normalize())
    matrix.compose(
      start.clone().addScaledVector(direction, 0.5),
      quaternion,
      new THREE.Vector3(1, length, 1),
    )
    spokesMesh.setMatrixAt(i, matrix)
  }
  spokesMesh.castShadow = true
  group.add(spokesMesh)

  group.add(cylinder(26, FRAME.hubHalfWidth * 2, materials.alu, 'z'))
  return group
}

function createFrame(materials: Materials): THREE.Group {
  const group = new THREE.Group()
  const bb = v3(FRAME.bb.x, FRAME.bb.y, FRAME.bb.z)
  const headTop = v3(FRAME.headTop.x, FRAME.headTop.y, 0)
  const headBottom = v3(FRAME.headBottom.x, FRAME.headBottom.y, 0)
  const seatTop = v3(FRAME.seatTop.x, FRAME.seatTop.y, 0)

  group.add(staticBar(headBottom, bb, mm(22), materials.frame))
  group.add(staticBar(bb, seatTop, mm(20), materials.frame))
  group.add(staticBar(seatTop, headTop.clone().lerp(headBottom, 0.22), mm(18), materials.frame))
  group.add(staticBar(headBottom, headTop, mm(21), materials.frameDark))

  const shell = cylinder(26, 74, materials.frameDark, 'z')
  shell.position.copy(bb)
  group.add(shell)

  group.add(staticBar(seatTop, v3(FRAME.saddle.x, FRAME.saddle.y - 26, 0), mm(14), materials.frameDark))

  for (const side of [1, -1]) {
    const bbSide = v3(FRAME.bb.x, FRAME.bb.y, side * 33)
    const drop = v3(FRAME.rearAxle.x, FRAME.rearAxle.y, side * FRAME.hubHalfWidth)
    const seatSide = v3(FRAME.seatTop.x * 0.94, FRAME.seatTop.y - 26, side * 17)
    group.add(staticBar(bbSide, drop, mm(12.5), materials.frame))
    group.add(staticBar(seatSide, drop, mm(10.5), materials.frame))
  }

  const crown = v3(FRAME.headBottom.x - 14, FRAME.headBottom.y - 88, 0)
  group.add(staticBar(headBottom, crown, mm(20), materials.frameDark))
  for (const side of [1, -1]) {
    group.add(staticBar(crown, v3(FRAME.frontAxle.x, FRAME.frontAxle.y, side * 52), mm(14), materials.frameDark))
  }

  const bar = v3(FRAME.bar.x, FRAME.bar.y, 0)
  group.add(staticBar(headTop, bar, mm(15), materials.frameDark))
  const barTube = cylinder(11, 760, materials.frameDark, 'z')
  barTube.position.copy(bar)
  group.add(barTube)
  for (const side of [1, -1]) {
    const grip = cylinder(16, 110, materials.saddle, 'z')
    grip.position.set(mm(FRAME.bar.x + 26), mm(FRAME.bar.y), side * mm(320))
    group.add(grip)
  }

  const saddle = new THREE.Mesh(new THREE.BoxGeometry(mm(250), mm(32), mm(128)), materials.saddle)
  saddle.position.copy(v3(FRAME.saddle.x, FRAME.saddle.y, 0))
  saddle.rotation.z = 0.06
  saddle.castShadow = true
  group.add(saddle)

  group.traverse((child) => {
    child.userData.part = 'frame'
  })
  return group
}

/* =========================================================================
   传动：前盘 / 曲柄 / 飞轮
   ========================================================================= */

function buildChainring(materials: Materials): THREE.Group {
  const group = new THREE.Group()
  const pitchR = pitchRadius(DRIVE.chainringTeeth)

  const ring = new THREE.Mesh(
    extrudeCentered(gearRingShape(DRIVE.chainringTeeth, pitchR, pitchR * 0.74), 3.2, 4),
    materials.darkSteel,
  )
  ring.castShadow = true
  group.add(ring)

  for (let i = 0; i < 4; i += 1) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4
    const arm = new THREE.Mesh(new THREE.BoxGeometry(mm(48), mm(16), mm(4.6)), materials.alu)
    arm.position.set(mm(Math.cos(angle) * 42), mm(Math.sin(angle) * 42), 0)
    arm.rotation.z = angle
    arm.castShadow = true
    group.add(arm)
  }
  group.add(cylinder(19, 9, materials.alu, 'z'))

  group.traverse((child) => {
    child.userData.part = 'chainring'
  })
  return group
}

interface CrankParts {
  arms: THREE.Group
  pedals: THREE.Group
}

function buildCrank(materials: Materials): CrankParts {
  const arms = new THREE.Group()
  const pedals = new THREE.Group()
  const length = 170

  for (const side of [1, -1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(mm(length), mm(24), mm(11)), materials.alu)
    arm.position.set(mm(length / 2), 0, mm(side * 68))
    arm.castShadow = true
    arms.add(arm)

    const pedal = new THREE.Group()
    const body = new THREE.Mesh(new THREE.BoxGeometry(mm(96), mm(17), mm(78)), materials.saddle)
    body.castShadow = true
    pedal.add(body)
    const spindle = cylinder(6, 70, materials.darkSteel, 'z')
    spindle.position.z = mm(-side * 32)
    pedal.add(spindle)
    pedal.userData.side = side
    pedals.add(pedal)
  }

  arms.traverse((child) => {
    child.userData.part = 'crank'
  })
  pedals.traverse((child) => {
    child.userData.part = 'crank'
  })
  return { arms, pedals }
}

function buildCassette(materials: Materials): THREE.Group {
  const group = new THREE.Group()

  for (let index = 0; index < cogCount(); index += 1) {
    const teeth = cassetteTeethAt(index)
    const pitchR = pitchRadius(teeth)
    const bore = Math.min(pitchR * 0.5, 17.5)
    const cog = new THREE.Mesh(
      extrudeCentered(gearRingShape(teeth, pitchR, bore), 1.7, 3),
      index < 5 ? materials.steel : materials.darkSteel,
    )
    cog.position.z = mm(cogZ(index))
    cog.castShadow = true
    cog.receiveShadow = true
    group.add(cog)
  }

  const body = cylinder(17.4, 48, materials.darkSteel, 'z')
  body.position.z = mm(43)
  group.add(body)
  const lockring = cylinder(13, 6, materials.alu, 'z')
  lockring.position.z = mm(70)
  group.add(lockring)

  group.traverse((child) => {
    child.userData.part = 'cassette'
  })
  return group
}

/* =========================================================================
   链条：沿弧长排布的链节
   ========================================================================= */

interface ChainMeshes {
  outer: THREE.InstancedMesh
  inner: THREE.InstancedMesh
  rollers: THREE.InstancedMesh
  links: number
}

function buildChain(materials: Materials): ChainMeshes {
  const links = DRIVE.chainPitchCount
  const pitch = DRIVE.chainPitch
  // 12 速链条：链板高约 6.6 mm、外宽约 5.0 mm；滚子直径 7.6 mm，上下会露出链板一点
  const plateShape = stadiumShape(pitch - 0.8, 6.6)

  const makePlatePair = (offset: number): THREE.BufferGeometry => {
    const plate = extrudeCentered(plateShape, 0.85)
    const a = plate.clone()
    a.translate(0, 0, mm(offset))
    const b = plate.clone()
    b.translate(0, 0, mm(-offset))
    return mergeGeometries([a, b]) as THREE.BufferGeometry
  }

  const outerGeometry = makePlatePair(2.5)
  const innerGeometry = makePlatePair(1.8)
  const rollerGeometry = new THREE.CylinderGeometry(mm(3.8), mm(3.8), mm(4.6), 14, 1)
  rollerGeometry.rotateX(Math.PI / 2)
  rollerGeometry.translate(mm(-pitch / 2), 0, 0)

  const outer = new THREE.InstancedMesh(outerGeometry, materials.chain, Math.ceil(links / 2))
  const inner = new THREE.InstancedMesh(innerGeometry, materials.chain, Math.floor(links / 2))
  const rollers = new THREE.InstancedMesh(rollerGeometry, materials.steel, links)
  for (const mesh of [outer, inner, rollers]) {
    mesh.castShadow = true
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    // 链节位置每帧都在变，包围球不参与视锥剔除，避免整条链被误剔掉
    mesh.frustumCulled = false
  }

  return { outer, inner, rollers, links }
}

/* =========================================================================
   后拨：四连杆 + 摆臂 + 两个导轮
   ========================================================================= */

interface DerailleurParts {
  group: THREE.Group
  bKnuckleBody: THREE.Mesh
  basePlate: THREE.Mesh
  movingPlate: THREE.Mesh
  links: [THREE.Mesh, THREE.Mesh]
  pins: THREE.Mesh[]
  pKnuckleBody: THREE.Mesh
  cage: THREE.Group
  cageOuter: THREE.Mesh
  cageInner: THREE.Mesh
  guideWheel: THREE.Group
  tensionWheel: THREE.Group
  cagePivot: THREE.Mesh
}

function buildDerailleur(materials: Materials): DerailleurParts {
  const group = new THREE.Group()

  const bKnuckleBody = new THREE.Mesh(UNIT_BOX, materials.darkSteel)
  bKnuckleBody.castShadow = true

  const basePlate = new THREE.Mesh(UNIT_BOX, materials.darkSteel)
  const movingPlate = new THREE.Mesh(UNIT_BOX, materials.alu)
  basePlate.castShadow = true
  movingPlate.castShadow = true

  const linkA = new THREE.Mesh(UNIT_CYLINDER, materials.alu)
  const linkB = new THREE.Mesh(UNIT_CYLINDER.clone(), materials.alu)
  linkA.castShadow = true
  linkB.castShadow = true

  const pins: THREE.Mesh[] = []
  for (let i = 0; i < 4; i += 1) {
    const pin = cylinder(4.2, 20, materials.steel, 'x')
    pins.push(pin)
  }

  const pKnuckleBody = new THREE.Mesh(UNIT_BOX, materials.darkSteel)
  pKnuckleBody.castShadow = true

  // 摆臂：两块导板 + 两个导轮
  const cage = new THREE.Group()
  const plateLength = DRIVE.pulleyCenterDistance + 40
  const plateGeometry = extrudeCentered(stadiumShape(plateLength, 23), 2.4, 10)
  const cageOuter = new THREE.Mesh(plateGeometry, materials.plastic)
  cageOuter.position.set(mm(DRIVE.pulleyCenterDistance / 2), 0, mm(6.6))
  cageOuter.castShadow = true
  const cageInner = new THREE.Mesh(plateGeometry.clone(), materials.plastic)
  cageInner.position.set(mm(DRIVE.pulleyCenterDistance / 2), 0, mm(-6.6))
  cageInner.castShadow = true
  cage.add(cageOuter, cageInner)

  const jockeyGeometry = extrudeCentered(gearRingShape(DRIVE.pulleyTeeth, pitchRadius(DRIVE.pulleyTeeth), 5.5), 4.2, 3)
  const guideWheel = new THREE.Group()
  const guideCog = new THREE.Mesh(jockeyGeometry, materials.plastic)
  guideCog.castShadow = true
  guideWheel.add(guideCog)
  const tensionWheel = new THREE.Group()
  const tensionCog = new THREE.Mesh(jockeyGeometry.clone(), materials.plastic)
  tensionCog.castShadow = true
  tensionWheel.add(tensionCog)

  const cagePivot = cylinder(9, 17, materials.alu, 'z')

  group.add(
    bKnuckleBody,
    basePlate,
    movingPlate,
    linkA,
    linkB,
    ...pins,
    pKnuckleBody,
    cage,
    guideWheel,
    tensionWheel,
    cagePivot,
  )

  const tag = (object: THREE.Object3D, part: PartId) => {
    object.traverse((child) => {
      child.userData.part = part
    })
  }
  tag(bKnuckleBody, 'bKnuckle')
  tag(basePlate, 'parallelogram')
  tag(movingPlate, 'parallelogram')
  tag(linkA, 'parallelogram')
  tag(linkB, 'parallelogram')
  pins.forEach((pin) => tag(pin, 'parallelogram'))
  tag(pKnuckleBody, 'parallelogram')
  tag(cageOuter, 'cage')
  tag(cageInner, 'cage')
  tag(cagePivot, 'cage')
  tag(guideWheel, 'guidePulley')
  tag(tensionWheel, 'tensionPulley')

  return {
    group,
    bKnuckleBody,
    basePlate,
    movingPlate,
    links: [linkA, linkB],
    pins,
    pKnuckleBody,
    cage,
    cageOuter,
    cageInner,
    guideWheel,
    tensionWheel,
    cagePivot,
  }
}

/* =========================================================================
   整机
   ========================================================================= */

export interface BikeModel {
  root: THREE.Group
  update(view: DerailleurView): void
  pick(raycaster: THREE.Raycaster): PartId | null
  /** 只检测前轮：彩蛋里用鼠标拨前轮时用来判断有没有按在轮子上 */
  hitsFrontWheel(raycaster: THREE.Raycaster): boolean
  /** 前轮中心（场景坐标，米）：把指针位置换算成轮子转角要用它 */
  frontWheelCenter: THREE.Vector3
  dispose(): void
}

export function createBikeModel(): BikeModel {
  const materials = createMaterials()
  const root = new THREE.Group()

  const frame = createFrame(materials)
  const wheelRear = createWheel(DRIVE.wheelRadius, 60, materials)
  const wheelFront = createWheel(DRIVE.wheelRadius, 60, materials)
  wheelRear.position.set(mm(FRAME.rearAxle.x), mm(FRAME.rearAxle.y), 0)
  wheelFront.position.set(mm(FRAME.frontAxle.x), mm(FRAME.frontAxle.y), 0)
  for (const [wheel, side] of [[wheelRear, 'rear'], [wheelFront, 'front']] as const) {
    wheel.traverse((child) => {
      child.userData.part = 'wheel'
      child.userData.wheelSide = side
    })
  }

  const chainring = new THREE.Group()
  chainring.position.set(mm(FRAME.bb.x), mm(FRAME.bb.y), mm(DRIVE.chainlineZ))
  chainring.add(buildChainring(materials))

  const crank = buildCrank(materials)
  const crankGroup = new THREE.Group()
  crankGroup.position.set(mm(FRAME.bb.x), mm(FRAME.bb.y), 0)
  crankGroup.add(crank.arms)

  const pedalGroup = new THREE.Group()
  pedalGroup.position.set(mm(FRAME.bb.x), mm(FRAME.bb.y), 0)
  pedalGroup.add(crank.pedals)

  const cassette = buildCassette(materials)
  cassette.position.set(mm(FRAME.rearAxle.x), mm(FRAME.rearAxle.y), 0)

  const chain = buildChain(materials)
  const chainGroup = new THREE.Group()
  chainGroup.add(chain.outer, chain.inner, chain.rollers)
  chainGroup.traverse((child) => {
    child.userData.part = 'chain'
  })

  const derailleur = buildDerailleur(materials)

  root.add(
    frame,
    wheelRear,
    wheelFront,
    chainring,
    crankGroup,
    pedalGroup,
    cassette,
    chainGroup,
    derailleur.group,
  )

  /* ---------------- 每帧摆位 ---------------- */

  const matrix = new THREE.Matrix4()
  const quaternion = new THREE.Quaternion()
  const localX = new THREE.Vector3(1, 0, 0)
  const one = new THREE.Vector3(1, 1, 1)
  const tempPoint = new THREE.Vector3()
  const tempDirection = new THREE.Vector3()

  let cachedKey = ''
  let cachedPath: DrivetrainPath | null = null
  let cachedCage = -Math.PI / 3

  /**
   * 按当前 frame 解摆臂角并建链环。
   *
   * 换挡过渡时接触半径与两个平面都在变，所以这里每帧都可能重解；
   * 用上一次的解作为割线起点（通常 3–4 次迭代），
   * 再把 frame 量化到 0.05 mm 做缓存，避免同一位置重复求解。
   */
  const solveFor = (
    engaged: number,
    frame: ShiftFrame,
  ): { path: DrivetrainPath | null; cage: number; pathFrame: PathFrame } => {
    const pathFrame: PathFrame = {
      contactRadius: frame.contactRadiusMm,
      contactPlaneZ: frame.contactPlaneZ,
      derailleurZ: frame.derailleurPlaneZ,
    }
    const key = `${engaged}:${pathFrame.contactRadius.toFixed(2)}:${pathFrame.contactPlaneZ.toFixed(
      2,
    )}:${pathFrame.derailleurZ.toFixed(2)}`
    if (key === cachedKey) return { path: cachedPath, cage: cachedCage, pathFrame }

    const solved =
      solveCageAngleFor(pathFrame, CHAIN_LENGTH, { cogIndex: engaged, guess: cachedCage, samples: 20 }) ??
      solveCageAngle(engaged, CHAIN_LENGTH)
    const cage = solved?.cageAngle ?? cachedCage
    const path = solved?.result ?? buildDrivetrainPath(engaged, cage, pathFrame) ?? cachedPath
    cachedKey = key
    cachedCage = cage
    cachedPath = path
    return { path, cage, pathFrame }
  }

  const placeDerailleur = (derailleurZ: number, tension: { x: number; y: number }) => {
    const center = guideArcCenter()
    const guide = guidePulleyCenterAtZ(derailleurZ)
    const drop = PARALLELOGRAM.pulleyDrop
    const half = PARALLELOGRAM.pivotSpan / 2

    // 连杆方向（y-z 平面）：虚拟圆心 → 导向轮，|v| = 连杆长
    const linkAngle = Math.atan2(derailleurZ - center.z, center.y - guide.y)
    const normalAngle = linkAngle + Math.PI / 2
    const nY = Math.cos(normalAngle)
    const nZ = Math.sin(normalAngle)

    const baseCenter = new THREE.Vector3(mm(guide.x), mm(center.y + drop), mm(center.z))
    const movingCenter = new THREE.Vector3(mm(guide.x), mm(guide.y + drop), mm(derailleurZ))
    const a = baseCenter.clone().add(new THREE.Vector3(0, mm(nY * half), mm(nZ * half)))
    const b = baseCenter.clone().add(new THREE.Vector3(0, mm(-nY * half), mm(-nZ * half)))
    const c = movingCenter.clone().add(new THREE.Vector3(0, mm(nY * half), mm(nZ * half)))
    const d = movingCenter.clone().add(new THREE.Vector3(0, mm(-nY * half), mm(-nZ * half)))

    // 两根连杆与四个销
    placeBar(derailleur.links[0], a, c, mm(4.6))
    placeBar(derailleur.links[1], b, d, mm(4.6))
    const pinPositions = [a, b, c, d]
    derailleur.pins.forEach((pin, index) => {
      pin.position.copy(pinPositions[index])
    })

    // 安装体：从尾钩附近垂到固定铰点
    const mount = new THREE.Vector3(mm(FRAME.rearAxle.x - 4), mm(FRAME.rearAxle.y - 26), mm(baseCenter.z))
    placePlate(
      derailleur.bKnuckleBody,
      mount,
      baseCenter,
      mm(30),
      mm(20),
    )
    placePlate(derailleur.basePlate, a, b, mm(34), mm(9))
    placePlate(derailleur.movingPlate, c, d, mm(34), mm(9))

    // P 关节：从运动铰点走向导向轮轴心
    placePlate(
      derailleur.pKnuckleBody,
      movingCenter,
      new THREE.Vector3(mm(guide.x), mm(guide.y), mm(derailleurZ)),
      mm(26),
      mm(17),
    )

    derailleur.guideWheel.position.set(mm(guide.x), mm(guide.y), mm(derailleurZ))
    derailleur.tensionWheel.position.set(mm(tension.x), mm(tension.y), mm(derailleurZ))

    // 摆臂：绕导向轮中心转动 cageAngle，两块导板跨到张力轮
    const guide3 = new THREE.Vector3(mm(guide.x), mm(guide.y), mm(derailleurZ))
    const tension3 = new THREE.Vector3(mm(tension.x), mm(tension.y), mm(derailleurZ))
    derailleur.cage.position.copy(guide3)
    derailleur.cage.quaternion.setFromUnitVectors(
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3().subVectors(tension3, guide3).normalize(),
    )
    derailleur.cagePivot.position.copy(guide3)
  }

  const updateChain = (path: DrivetrainPath, travel: number) => {
    const links = chain.links
    const pitch = CHAIN_LENGTH / links
    for (let i = 0; i < links; i += 1) {
      const s = i * pitch + travel
      const point = pointAt3d(path, s)
      const direction = directionAt3d(path, s)
      tempPoint.set(mm(point.x), mm(point.y), mm(point.z))
      tempDirection.set(direction.x, direction.y, direction.z).normalize()
      quaternion.setFromUnitVectors(localX, tempDirection)

      if (i % 2 === 0) {
        matrix.compose(tempPoint, quaternion, one)
        chain.outer.setMatrixAt(i >> 1, matrix)
      } else {
        matrix.compose(tempPoint, quaternion, one)
        chain.inner.setMatrixAt(i >> 1, matrix)
      }
      matrix.compose(tempPoint, quaternion, one)
      chain.rollers.setMatrixAt(i, matrix)
    }
    chain.outer.instanceMatrix.needsUpdate = true
    chain.inner.instanceMatrix.needsUpdate = true
    chain.rollers.instanceMatrix.needsUpdate = true
  }

  let lastSelected: PartId | null | undefined
  let lastChainHighlight: boolean | undefined

  const applyHighlight = (selected: PartId | null, chainHighlight: boolean) => {
    if (selected === lastSelected && chainHighlight === lastChainHighlight) return
    lastSelected = selected
    lastChainHighlight = chainHighlight

    root.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (!mesh.isMesh) return
      const part = mesh.userData.part as PartId | undefined
      const base = mesh.userData.baseMaterial as THREE.Material | undefined
      if (!base) {
        mesh.userData.baseMaterial = mesh.material
        return
      }
      const originalMaterial = mesh.userData.baseMaterial as THREE.Material
      if (part === 'chain') {
        mesh.material = chainHighlight || selected === 'chain' ? materials.chainHighlight : originalMaterial
        return
      }
      mesh.material = selected === part ? materials.highlight : originalMaterial
    })
  }

  const update = (view: DerailleurView) => {
    // 模型里的角度按「从传动侧看顺时针」为正方向；three.js 的 rotation.z 以逆时针为正，
    // 所以这里统一取负号，链条、齿、后轮三者才会朝同一个方向走。
    crankGroup.rotation.z = -view.crankAngle
    chainring.rotation.z = -view.crankAngle
    cassette.rotation.z = -view.cassetteAngle
    wheelRear.rotation.z = -view.wheelAngle
    // 前轮不受传动驱动，只由用户用鼠标拨动（彩蛋，页面上不提示）
    wheelFront.rotation.z = -view.frontWheelAngle
    frame.visible = view.showFrame
    wheelRear.visible = view.showWheel

    // 脚踏只平移不旋转：踏板保持水平
    const cos = Math.cos(view.crankAngle)
    const sin = Math.sin(view.crankAngle)
    for (const pedal of pedalGroup.children) {
      const side = pedal.userData.side as number
      pedal.position.set(mm(170 * cos), mm(-170 * sin), mm(side * 118))
    }

    // 导轮被链条带着转：线速度与链条相同，方向同样是顺时针
    const jockeyAngle = view.chainTravel / pitchRadius(DRIVE.pulleyTeeth)
    derailleur.guideWheel.rotation.z = -jockeyAngle
    derailleur.tensionWheel.rotation.z = -jockeyAngle

    const { path, cage } = solveFor(view.engaged, view.shiftFrame)
    const tension = tensionPulleyCenter(view.engaged, cage)

    placeDerailleur(view.shiftFrame.derailleurPlaneZ, tension)
    if (path) updateChain(path, view.chainTravel)
    applyHighlight(view.selected, view.chainHighlight)
  }

  const frontWheelCenter = new THREE.Vector3(
    mm(FRAME.frontAxle.x),
    mm(FRAME.frontAxle.y),
    0,
  )

  const hitsFrontWheel = (raycaster: THREE.Raycaster): boolean =>
    raycaster.intersectObject(wheelFront, true).length > 0

  const pick = (raycaster: THREE.Raycaster): PartId | null => {
    const hits = raycaster.intersectObject(root, true)
    for (const hit of hits) {
      const part = hit.object.userData.part as PartId | undefined
      if (part) return part
    }
    return null
  }

  const dispose = () => {
    root.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (mesh.geometry) mesh.geometry.dispose()
    })
    for (const material of Object.values(materials)) material.dispose()
    root.clear()
  }

  return { root, update, pick, hitsFrontWheel, frontWheelCenter, dispose }
}

/** 供界面显示的齿片 Z（mm） */
export function cogPlaneZ(index: number): number {
  return cogZ(index)
}
