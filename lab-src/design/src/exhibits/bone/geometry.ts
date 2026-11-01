/**
 * 骨骼展品的几何层：现成足骨模型 → 教学用的骨折、剖切、骨痂与受力箭头。
 *
 * 数据：BodyParts3D 右足 26 骨（CC BY 4.0），米制、Y 轴向上、已居中。
 * 模型坐标 = (−X 外侧, +Y 足背, +Z 足趾)；root 上一次转成展台坐标
 * (+X 外侧, +Y 足趾, +Z 足背)，并放大 20 倍（1 展台单位 = 50 mm）。
 *
 * 这一层只按状态摆东西，不算模型量：断端姿态、受力大小、修复进度都来自 model.ts。
 */

import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import footGlbUrl from './assets/right-foot-26-bones.glb?url'
import {
  DEFAULT_POSE,
  FOOT_MODEL,
  FRACTURE,
  TARGET_HINT,
  ZERO_POSE,
  cutCenter,
  fragmentTransform,
  fractureJitter,
  fracturePlane,
  loadEffect,
  loadPlacement,
  repairAppearance,
  targetLength,
  type FracturePose,
  type LoadMode,
  type TabId,
} from './model'
import {
  buildSectionFaces,
  loopSubdivide,
  smoothGeometry,
  splitByPlane,
  sliceLoop,
} from './mesh'

/* ---------------------------------------------------------------- 颜色 */

/**
 * 固定语义的颜色表：同一种颜色在本展品里只有一个含义。
 * 图例见 content.ts 的 LEGEND，页面按当前页签显示对应几项。
 */
export const PALETTE = {
  bone: 0xd2c8b4,
  boneTarget: 0xb75f31,
  boneCompare: 0x647a8b,
  boneSelected: 0xd9b45c,
  cutRim: 0xdccfb4,
  cutCore: 0xc4ab80,
  arrow: 0x232323,
  constraint: 0x5c5f61,
  hematoma: 0x7d3a4a,
  softCallus: 0xd8bd7e,
  bonyCallus: 0xb08a52,
  callusBridge: 0xa87f49,
  jointMarker: 0xb8432d,
} as const

/* ---------------------------------------------------------------- 视图状态 */

export interface StructureSceneState {
  fractured: boolean
  cutaway: boolean
  isolate: boolean
  pose: FracturePose
  selected: string | null
}

export interface LoadSceneState {
  mode: LoadMode
  load: number
  fractured: boolean
}

export interface RepairSceneState {
  progress: number
  cutaway: boolean
}

export interface BoneSceneView {
  tab: TabId
  structure: StructureSceneState
  load: LoadSceneState
  repair: RepairSceneState
}

export interface BoneModel {
  root: THREE.Group
  update(view: BoneSceneView): void
  dispose(): void
  pick(raycaster: THREE.Raycaster): string | null
  /** 标注锚点（模型坐标，米）；返回副本 */
  anchor(id: string): THREE.Vector3 | undefined
  /** 骨名（来自模型 extras 的中文名） */
  label(id: string): string
  /** 只含骨骼（不含箭头、骨痂、标记）的包围盒，供镜头取景 */
  bounds(scope?: 'foot' | 'toe'): THREE.Box3
}

/* ---------------------------------------------------------------- 贴图 */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 松质骨断面：暖底 + 细骨小梁网（固定种子，同一台设备每次一样） */
function cancellousTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const random = mulberry32(20261101)

  ctx.fillStyle = '#cdb992'
  ctx.fillRect(0, 0, size, size)
  for (let i = 0; i < 26; i += 1) {
    const x = random() * size
    const y = random() * size
    const r = 6 + random() * 14
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, r)
    gradient.addColorStop(0, 'rgba(150,124,84,0.5)')
    gradient.addColorStop(1, 'rgba(205,185,146,0)')
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.lineCap = 'round'
  for (let i = 0; i < 280; i += 1) {
    const x = random() * size
    const y = random() * size
    const len = 6 + random() * 16
    const angle = random() * Math.PI * 2
    const bend = (random() - 0.5) * 0.9
    ctx.strokeStyle = random() > 0.45 ? 'rgba(124,101,68,0.55)' : 'rgba(240,228,205,0.5)'
    ctx.lineWidth = 0.8 + random() * 1.4
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.quadraticCurveTo(
      x + Math.cos(angle + bend) * len * 0.6,
      y + Math.sin(angle + bend) * len * 0.6,
      x + Math.cos(angle) * len,
      y + Math.sin(angle) * len,
    )
    ctx.stroke()
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.anisotropy = 4
  return texture
}

/* ---------------------------------------------------------------- 材质 */

interface Materials {
  bone: THREE.MeshStandardMaterial
  target: THREE.MeshStandardMaterial
  compare: THREE.MeshStandardMaterial
  selected: THREE.MeshStandardMaterial
  capRim: THREE.MeshStandardMaterial
  capCore: THREE.MeshStandardMaterial
  sectionRim: THREE.MeshStandardMaterial
  sectionCore: THREE.MeshStandardMaterial
  hematoma: THREE.MeshStandardMaterial
  softCallus: THREE.MeshStandardMaterial
  bonyCallus: THREE.MeshStandardMaterial
  bridge: THREE.MeshStandardMaterial
  arrow: THREE.MeshStandardMaterial
  constraint: THREE.MeshStandardMaterial
  marker: THREE.MeshBasicMaterial
  all: THREE.Material[]
  /** 需要随「剖切」开关切换裁剪平面的材质 */
  clipped: THREE.Material[]
  /** 骨痂一类的软组织材质 */
  tissue: THREE.Material[]
}

function createMaterials(): Materials {
  const cancellous = cancellousTexture()
  const bone = new THREE.MeshStandardMaterial({ color: PALETTE.bone, roughness: 0.66, metalness: 0.02, envMapIntensity: 0.45 })
  const target = new THREE.MeshStandardMaterial({ color: PALETTE.boneTarget, roughness: 0.58, metalness: 0.02, envMapIntensity: 0.5 })
  const compare = new THREE.MeshStandardMaterial({ color: PALETTE.boneCompare, roughness: 0.66, metalness: 0.04, envMapIntensity: 0.45 })
  const selected = new THREE.MeshStandardMaterial({
    color: PALETTE.boneSelected, roughness: 0.52, metalness: 0.06,
    emissive: 0x2a2110, emissiveIntensity: 0.45, envMapIntensity: 0.7,
  })
  const capRim = new THREE.MeshStandardMaterial({
    color: PALETTE.cutRim, roughness: 0.66, metalness: 0.02, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  })
  const capCore = new THREE.MeshStandardMaterial({
    color: 0xffffff, map: cancellous ?? undefined, roughness: 0.88, metalness: 0,
    side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  })
  const sectionRim = capRim.clone()
  sectionRim.polygonOffset = false
  const sectionCore = capCore.clone()
  sectionCore.polygonOffset = false
  const hematoma = new THREE.MeshStandardMaterial({
    color: PALETTE.hematoma, roughness: 0.4, metalness: 0, transparent: true, opacity: 0.8,
    depthWrite: false, side: THREE.DoubleSide,
  })
  const softCallus = new THREE.MeshStandardMaterial({
    color: PALETTE.softCallus, roughness: 0.55, metalness: 0, transparent: true, opacity: 0.5,
    depthWrite: false, side: THREE.DoubleSide,
  })
  const bonyCallus = new THREE.MeshStandardMaterial({
    color: PALETTE.bonyCallus, roughness: 0.8, metalness: 0.02, transparent: true, opacity: 1,
    flatShading: true, side: THREE.DoubleSide,
  })
  const bridge = new THREE.MeshStandardMaterial({ color: PALETTE.callusBridge, roughness: 0.85, metalness: 0.02, side: THREE.DoubleSide })
  const arrow = new THREE.MeshStandardMaterial({ color: PALETTE.arrow, roughness: 0.45, metalness: 0.1 })
  const constraint = new THREE.MeshStandardMaterial({ color: PALETTE.constraint, roughness: 0.6, metalness: 0.1 })
  const marker = new THREE.MeshBasicMaterial({ color: PALETTE.jointMarker, transparent: true, opacity: 0.92, depthWrite: false })
  const all: THREE.Material[] = [
    bone, target, compare, selected, capRim, capCore, sectionRim, sectionCore,
    hematoma, softCallus, bonyCallus, bridge, arrow, constraint, marker,
  ]
  return {
    bone, target, compare, selected, capRim, capCore, sectionRim, sectionCore,
    hematoma, softCallus, bonyCallus, bridge, arrow, constraint, marker, all,
    clipped: [target, capRim, capCore],
    tissue: [hematoma, softCallus, bonyCallus, bridge],
  }
}

/* ---------------------------------------------------------------- 小工具 */

const toVec = (p: readonly number[]) => new THREE.Vector3(p[0], p[1], p[2])

function isVisible(object: THREE.Object3D): boolean {
  let node: THREE.Object3D | null = object
  while (node) {
    if (!node.visible) return false
    node = node.parent
  }
  return true
}

/* ---------------------------------------------------------------- 主体 */

interface BoneEntry {
  id: string
  label: string
  geometry: THREE.BufferGeometry
}

export async function createBoneModel(): Promise<BoneModel> {
  const loader = new GLTFLoader()
  const gltf = await loader.loadAsync(footGlbUrl)
  try { return createBoneModelFromScene(gltf.scene) }
  finally {
    gltf.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      object.geometry.dispose()
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose()
    })
  }
}

/** 同一装配路径同时用于真实资源和离线几何回归检查。 */
export function createBoneModelFromScene(source: THREE.Object3D): BoneModel {
  source.updateMatrixWorld(true)

  const entries: BoneEntry[] = []
  source.traverse((object) => {
    const mesh = object as THREE.Mesh & { userData?: Record<string, unknown> }
    if (!mesh.isMesh) return
    const id = mesh.name || (mesh.userData?.fma as string) || ''
    const label = (mesh.userData?.name_zh as string) ?? id
    entries.push({ id, label, geometry: mesh.geometry.clone().applyMatrix4(mesh.matrixWorld) })
  })
  if (entries.length !== 26) {
    throw new Error(`足骨模型应有 26 块骨，实际读到 ${entries.length} 块`)
  }
  const labels = new Map(entries.map((entry) => [entry.id, entry.label]))
  labels.set('mtp-joint', '第 5 跖趾关节')
  labels.set('toe', '第 5 趾')

  const materials = createMaterials()
  const targetMaterials = {
    intact: [materials.target.clone(), materials.selected.clone()],
    proximal: [materials.target.clone(), materials.selected.clone()],
    distal: [materials.target.clone(), materials.selected.clone()],
  }
  for (const pair of Object.values(targetMaterials)) materials.all.push(...pair)
  const root = new THREE.Group()
  root.name = 'bone-root'
  // 模型坐标 → 展台坐标：绕 (0,1,1) 转 180°，再放大 20 倍（1 单位 = 50 mm）
  root.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 1).normalize(), Math.PI)
  root.scale.setScalar(20)

  const byId = new Map(entries.map((entry) => [entry.id, entry]))
  const targetEntry = byId.get(FOOT_MODEL.targetFma)
  if (!targetEntry) throw new Error('模型里找不到右第 5 趾近节趾骨（FMA32640）')

  const axis = toVec(TARGET_HINT.axis)
  const targetBase = toVec(TARGET_HINT.base)
  const targetHead = toVec(TARGET_HINT.distal)
  const center = toVec(cutCenter())
  const jointPoint = targetBase.clone().addScaledVector(axis, -0.0016)

  /* ---------------- 目标骨：细分 → 切分 → 断面 ---------------- */

  const smoothTarget = smoothGeometry(targetEntry.geometry)
  const targetGeometry = loopSubdivide(smoothTarget, 1)
  smoothTarget.dispose()
  const planeSpec = fracturePlane()
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
    toVec(planeSpec.normal),
    toVec(planeSpec.center),
  )
  const split = splitByPlane(targetGeometry, plane, (point) =>
    fractureJitter([point.x, point.y, point.z]),
  )
  const capFaces = buildSectionFaces(
    split.rim,
    plane,
    FRACTURE.corticalThicknessMm / 1000,
    1 / 0.02,
  )

  /* ---------------- 剖切面（纵向）：去掉足背侧一半 ---------------- */

  const dorsal = new THREE.Vector3(0, 1, 0)
  const cutUp = dorsal.clone().addScaledVector(axis, -dorsal.dot(axis)).normalize()
  // 模型坐标里的裁剪平面：保留足底一侧（three.js 保留法线正侧）
  const clipPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(cutUp.clone().negate(), center)
  // 剖面几何用同一张平面，但法线朝足背，断面朝外
  const sectionPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(cutUp.clone(), center)
  // 材质上的裁剪平面按世界空间解释，得先套上 root 的旋转与缩放
  root.updateMatrixWorld(true)
  const worldClipPlane = clipPlane.clone().applyMatrix4(root.matrixWorld)

  const intactFaces = buildSectionFaces(
    sliceLoop([targetGeometry], sectionPlane),
    sectionPlane,
    FRACTURE.corticalThicknessMm / 1000,
    1 / 0.02,
  )
  const proximalFaces = buildSectionFaces(
    sliceLoop([split.negative], sectionPlane),
    sectionPlane,
    FRACTURE.corticalThicknessMm / 1000,
    1 / 0.02,
  )
  const distalFaces = buildSectionFaces(
    sliceLoop([split.positive], sectionPlane),
    sectionPlane,
    FRACTURE.corticalThicknessMm / 1000,
    1 / 0.02,
  )

  /* ---------------- 第五趾列的分组 ---------------- */
  // loadGroup（整根趾的示意形变）
  //   ├─ intact           完整对照
  //   ├─ proximalGroup    基底片段（固定）
  //   └─ distalGroup      远端片段（断端姿态 + 片段活动）→ midGroup（中节 + 末节）
  const loadGroup = new THREE.Group()
  loadGroup.name = 'fifth-ray'
  root.add(loadGroup)

  const intactMesh = new THREE.Mesh(targetGeometry, targetMaterials.intact[0])
  intactMesh.name = 'target-intact'
  intactMesh.userData.boneId = FOOT_MODEL.targetFma
  intactMesh.castShadow = true
  intactMesh.receiveShadow = true
  loadGroup.add(intactMesh)

  const proximalGroup = new THREE.Group()
  const distalGroup = new THREE.Group()
  const toeChain = new THREE.Group()
  const midGroup = new THREE.Group()
  loadGroup.add(proximalGroup, distalGroup, toeChain)
  toeChain.add(midGroup)

  const proximalFragment = new THREE.Mesh(split.negative, targetMaterials.proximal[0])
  const distalFragment = new THREE.Mesh(split.positive, targetMaterials.distal[0])
  proximalFragment.name = 'target-proximal'
  distalFragment.name = 'target-distal'
  for (const mesh of [proximalFragment, distalFragment]) {
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.userData.boneId = FOOT_MODEL.targetFma
  }
  // 断面封口：两片带同一张断面几何，随各自父级移动（零位移时完全贴合）
  const capMeshes: THREE.Mesh[] = []
  for (const material of [materials.capRim, materials.capCore]) {
    const geometry = material === materials.capRim ? capFaces.rim : capFaces.core
    const proximalMaterial = material.clone(), distalMaterial = material.clone()
    materials.all.push(proximalMaterial, distalMaterial)
    const proximalCap = new THREE.Mesh(geometry, proximalMaterial)
    const distalCap = new THREE.Mesh(geometry, distalMaterial)
    for (const mesh of [proximalCap, distalCap]) {
      mesh.castShadow = false
      mesh.receiveShadow = false
      mesh.userData.pickable = false
      mesh.name = material === materials.capRim ? 'fracture-cap-rim' : 'fracture-cap-core'
      capMeshes.push(mesh)
    }
    proximalGroup.add(proximalCap)
    distalGroup.add(distalCap)
  }
  proximalGroup.add(proximalFragment)
  distalGroup.add(distalFragment)

  /* ---------------- 其余骨 ---------------- */

  const otherGroup = new THREE.Group()
  root.add(otherGroup)
  const meshes: THREE.Mesh[] = []
  for (const entry of entries) {
    if (entry.id === FOOT_MODEL.targetFma) continue
    const isMiddle = entry.id === FOOT_MODEL.fifthMiddleFma
    const isDistal = entry.id === FOOT_MODEL.fifthDistalFma
    const isCompare = entry.id === FOOT_MODEL.fifthMetatarsalFma
    const geometry = smoothGeometry(entry.geometry)
    const mesh = new THREE.Mesh(geometry, isCompare ? materials.compare : materials.bone)
    mesh.name = entry.id
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.userData.boneId = entry.id
    mesh.userData.isRay5 = isCompare || isMiddle || isDistal
    meshes.push(mesh)
    if (isMiddle || isDistal) midGroup.add(mesh)
    else otherGroup.add(mesh)
  }

  /* ---------------- 剖切面 ---------------- */

  const sectionMeshes: Array<{ mesh: THREE.Mesh; owner: 'intact' | 'proximal' | 'distal' }> = []
  const addSection = (
    faces: { rim: THREE.BufferGeometry; core: THREE.BufferGeometry },
    owner: 'intact' | 'proximal' | 'distal',
    parent: THREE.Object3D,
  ) => {
    const rim = new THREE.Mesh(faces.rim, materials.sectionRim)
    const core = new THREE.Mesh(faces.core, materials.sectionCore)
    for (const mesh of [rim, core]) {
      mesh.castShadow = false
      mesh.receiveShadow = false
      mesh.userData.pickable = false
      mesh.name = `section-${owner}-${mesh === rim ? 'rim' : 'core'}`
      parent.add(mesh)
      sectionMeshes.push({ mesh, owner })
    }
  }
  addSection(intactFaces, 'intact', loadGroup)
  addSection(proximalFaces, 'proximal', proximalGroup)
  addSection(distalFaces, 'distal', distalGroup)

  /* ---------------- 基底部标记与关节拾取球 ---------------- */

  const marker = new THREE.Mesh(new THREE.SphereGeometry(0.0011, 14, 10), materials.marker)
  marker.position.copy(targetBase).addScaledVector(axis, 0.0012)
  marker.userData.pickable = false
  root.add(marker)

  const hitMaterial = materials.marker.clone()
  hitMaterial.colorWrite = false; hitMaterial.depthWrite = false
  materials.all.push(hitMaterial)
  const jointHit = new THREE.Mesh(new THREE.SphereGeometry(0.0042, 10, 8), hitMaterial)
  jointHit.position.copy(jointPoint)
  jointHit.visible = false
  jointHit.userData.boneId = 'mtp-joint'
  jointHit.userData.pickable = true
  root.add(jointHit)

  /* ---------------- 受力箭头与约束符号 ---------------- */

  const arrowGroup = new THREE.Group()
  root.add(arrowGroup)

  const shaftGeometry = new THREE.CylinderGeometry(0.00065, 0.00065, 1, 10)
  shaftGeometry.translate(0, 0.5, 0)
  shaftGeometry.rotateZ(-Math.PI / 2)
  const headGeometry = new THREE.ConeGeometry(0.0018, 0.0038, 14)
  headGeometry.translate(0, 0.0019, 0)
  headGeometry.rotateZ(-Math.PI / 2)
  const arrowShaft = new THREE.Mesh(shaftGeometry, materials.arrow)
  const arrowHead = new THREE.Mesh(headGeometry, materials.arrow)
  arrowHead.name = 'load-arrow-head'
  arrowShaft.name = 'load-arrow-shaft'
  const arrow = new THREE.Group()
  arrow.add(arrowShaft, arrowHead)
  arrowGroup.add(arrow)

  const constraintGroup = new THREE.Group()
  arrowGroup.add(constraintGroup)
  {
    const ground = new THREE.Mesh(new THREE.BoxGeometry(0.009, 0.00022, 0.00022), materials.constraint)
    ground.position.copy(jointPoint).add(new THREE.Vector3(0, 0.0045, 0))
    constraintGroup.add(ground)
    for (let i = 0; i < 5; i += 1) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.00022, 0.0021, 0.00022), materials.constraint)
      bar.position.copy(ground.position).add(new THREE.Vector3(-0.0036 + i * 0.0018, 0, 0.0006))
      bar.rotation.z = -0.6
      constraintGroup.add(bar)
    }
  }

  /* ---------------- 修复叠层（对位场景） ---------------- */

  const callusGroup = new THREE.Group()
  root.add(callusGroup)

  const AXIAL = 15
  const ANGULAR = 40
  const callusHalf = Math.min(FRACTURE.callusHalfLengthMm / 1000, center.distanceTo(targetBase) * 0.85)
  const radial = (() => {
    const u = new THREE.Vector3().crossVectors(axis, new THREE.Vector3(0, 1, 0))
    if (u.lengthSq() < 1e-8) u.crossVectors(axis, new THREE.Vector3(1, 0, 0))
    u.normalize()
    const v = new THREE.Vector3().crossVectors(axis, u).normalize()
    return { u, v }
  })()
  const radialAt = (theta: number) =>
    radial.u.clone().multiplyScalar(Math.cos(theta)).addScaledVector(radial.v, Math.sin(theta)).normalize()

  /** 对位场景里骨表面到骨轴的距离（射线法，构建时算一次，固定不变） */
  const surfaceRadii = new Float32Array(AXIAL * ANGULAR)
  {
    // 在未变换的模型空间采样完整骨；从内部发出的射线必须能命中背面。
    const sampleMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
    const sample = new THREE.Mesh(targetGeometry, sampleMaterial)
    const raycaster = new THREE.Raycaster()
    raycaster.far = 0.025
    for (let i = 0; i < AXIAL; i += 1) {
      const t = (i / (AXIAL - 1) - 0.5) * 2 * callusHalf
      const origin = center.clone().addScaledVector(axis, t)
      for (let j = 0; j < ANGULAR; j += 1) {
        const direction = radialAt((j / ANGULAR) * Math.PI * 2)
        raycaster.set(origin, direction)
        const hit = raycaster.intersectObject(sample, false)[0]
        surfaceRadii[i * ANGULAR + j] = hit ? hit.distance : 0.0035
      }
    }
    const smoothed = surfaceRadii.slice()
    for (let i = 0; i < AXIAL; i += 1) {
      for (let j = 0; j < ANGULAR; j += 1) {
        let sum = 0
        let count = 0
        for (let di = -1; di <= 1; di += 1) {
          for (let dj = -1; dj <= 1; dj += 1) {
            const ii = Math.min(AXIAL - 1, Math.max(0, i + di))
            const jj = (j + dj + ANGULAR) % ANGULAR
            sum += surfaceRadii[ii * ANGULAR + jj]
            count += 1
          }
        }
        smoothed[i * ANGULAR + j] = sum / count
      }
    }
    surfaceRadii.set(smoothed)
    sampleMaterial.dispose()
  }

  /** 沿骨轴的纺锤形外扩量（米）：中点最厚，端点收进骨内 */
  function callusMargin(t: number, outgrowth: number, noise: number, theta: number): number {
    const u = Math.abs(t) / callusHalf
    if (u >= 1) return -0.0006
    const bulge = Math.pow(Math.cos((u * Math.PI) / 2), 2)
    const ripple = 1 + noise * (0.16 * Math.sin(theta * 5 + t * 900) + 0.1 * Math.sin(theta * 9 - t * 400))
    return outgrowth * bulge * ripple - 0.00045
  }

  interface Loft {
    mesh: THREE.Mesh
    setSize: (size: number) => void
  }

  function createLoft(material: THREE.Material, outgrowth: number, noise: number): Loft {
    const positions = new Float32Array(AXIAL * ANGULAR * 3)
    const indices: number[] = []
    for (let i = 0; i < AXIAL - 1; i += 1) {
      for (let j = 0; j < ANGULAR; j += 1) {
        const jj = (j + 1) % ANGULAR
        const a = i * ANGULAR + j
        const b = i * ANGULAR + jj
        const c = (i + 1) * ANGULAR + j
        const d = (i + 1) * ANGULAR + jj
        indices.push(a, c, b, b, c, d)
      }
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setIndex(indices)
    const mesh = new THREE.Mesh(geometry, material)
    mesh.userData.pickable = false
    callusGroup.add(mesh)

    let lastSize = -1
    const setSize = (size: number) => {
      if (Math.abs(size - lastSize) < 0.0015) return
      lastSize = size
      const attribute = geometry.getAttribute('position') as THREE.BufferAttribute
      for (let i = 0; i < AXIAL; i += 1) {
        const t = (i / (AXIAL - 1) - 0.5) * 2 * callusHalf
        const origin = center.clone().addScaledVector(axis, t)
        for (let j = 0; j < ANGULAR; j += 1) {
          const theta = (j / ANGULAR) * Math.PI * 2
          const radius =
            surfaceRadii[i * ANGULAR + j] + callusMargin(t, outgrowth, noise, theta) * size
          const point = origin.clone().addScaledVector(radialAt(theta), Math.max(radius, 0.0006))
          attribute.setXYZ(i * ANGULAR + j, point.x, point.y, point.z)
        }
      }
      attribute.needsUpdate = true
      geometry.computeVertexNormals()
      geometry.computeBoundingSphere()
    }
    setSize(1)
    return { mesh, setSize }
  }

  const hematoma = createLoft(materials.hematoma, 2.6 / 1000, 1)
  const softCallus = createLoft(materials.softCallus, (FRACTURE.callusOutgrowthMm / 1000) * 0.8, 0.6)
  const bonyCallus = createLoft(materials.bonyCallus, FRACTURE.callusOutgrowthMm / 1000, 0.35)

  const bridge = new THREE.Mesh(new THREE.CylinderGeometry(0.0011, 0.0011, 1, 14, 1, true), materials.bridge)
  bridge.userData.pickable = false
  bridge.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis)
  bridge.position.copy(center)
  bridge.scale.set(1, callusHalf * 1.7, 1)
  callusGroup.add(bridge)

  /* ---------------- 标注锚点 ---------------- */

  const bounds = new THREE.Box3()
  for (const entry of entries) {
    entry.geometry.computeBoundingBox()
    if (entry.geometry.boundingBox) bounds.union(entry.geometry.boundingBox)
  }
  const anchors = new Map<string, THREE.Vector3>()
  anchors.set('heel', new THREE.Vector3((bounds.min.x + bounds.max.x) / 2, -0.01, bounds.min.z + 0.01))
  anchors.set('medial', new THREE.Vector3(bounds.max.x + 0.004, -0.008, -0.012))
  anchors.set('lateral', new THREE.Vector3(bounds.min.x - 0.004, -0.022, 0.024))
  anchors.set('foot', new THREE.Vector3((bounds.min.x + bounds.max.x) / 2, 0.008, 0.008))
  anchors.set('mt5-head', jointPoint.clone().addScaledVector(axis, -0.003))
  anchors.set('mtp-joint', jointPoint.clone())
  anchors.set('pp5-base', targetBase.clone())
  anchors.set('pp5-head', targetHead.clone())
  anchors.set('pp5-mid', targetBase.clone().addScaledVector(axis, targetLength() * 0.55))
  anchors.set('mp5', targetHead.clone().addScaledVector(axis, 0.0085))
  anchors.set('dp5', targetHead.clone().addScaledVector(axis, 0.018))
  anchors.set('toe-tip', targetHead.clone().addScaledVector(axis, 0.024))
  for (const [id, anchorId] of [[FOOT_MODEL.fifthMiddleFma, 'mp5'], [FOOT_MODEL.fifthDistalFma, 'dp5']] as const) {
    const entry = byId.get(id)
    entry?.geometry.computeBoundingBox()
    if (entry?.geometry.boundingBox) anchors.set(anchorId, entry.geometry.boundingBox.getCenter(new THREE.Vector3()))
  }
  {
    const distal = byId.get(FOOT_MODEL.fifthDistalFma)?.geometry.getAttribute('position')
    if (distal) {
      let farthest = -Infinity
      for (let i = 0; i < distal.count; i += 1) {
        const p = new THREE.Vector3().fromBufferAttribute(distal, i)
        const projection = p.clone().sub(targetBase).dot(axis)
        if (projection > farthest) { farthest = projection; anchors.set('toe-tip', p) }
      }
    }
  }
  anchors.set('callus', center.clone())
  anchors.set('arrow', center.clone())
  {
    const entry = byId.get(FOOT_MODEL.fifthMetatarsalFma)
    if (entry) {
      entry.geometry.computeBoundingBox()
      if (entry.geometry.boundingBox) {
        anchors.set('mt5', entry.geometry.boundingBox.getCenter(new THREE.Vector3()))
      }
    }
  }

  /* ---------------- 状态应用 ---------------- */

  let selected: string | null = null

  const ownerPlanes = { intact: clipPlane.clone(), proximal: clipPlane.clone(), distal: clipPlane.clone() }
  const setClipping = (material: THREE.Material, enabled: boolean, plane: THREE.Plane) => {
    if (Boolean(material.clippingPlanes?.length) !== enabled) material.needsUpdate = true
    material.clippingPlanes = enabled ? [plane] : null
    material.clipShadows = enabled
  }
  function applyClipping(cutTarget: boolean, cutTissue: boolean) {
    ownerPlanes.intact.copy(clipPlane).applyMatrix4(loadGroup.matrixWorld)
    ownerPlanes.proximal.copy(clipPlane).applyMatrix4(proximalGroup.matrixWorld)
    ownerPlanes.distal.copy(clipPlane).applyMatrix4(distalGroup.matrixWorld)
    for (const owner of ['intact', 'proximal', 'distal'] as const) {
      for (const material of targetMaterials[owner]) setClipping(material, cutTarget, ownerPlanes[owner])
    }
    capMeshes.forEach((mesh, index) => setClipping(mesh.material as THREE.Material, cutTarget, index % 2 === 0 ? ownerPlanes.proximal : ownerPlanes.distal))
    for (const material of materials.tissue) {
      setClipping(material, cutTissue, worldClipPlane)
    }
  }

  function applySelection(next: string | null) {
    if (next === selected) return
    selected = next
    for (const mesh of meshes) {
      const id = mesh.userData.boneId as string
      const isCompare = id === FOOT_MODEL.fifthMetatarsalFma
      mesh.material = next === id ? materials.selected : isCompare ? materials.compare : materials.bone
    }
    const index = next === FOOT_MODEL.targetFma ? 1 : 0
    intactMesh.material = targetMaterials.intact[index]
    proximalFragment.material = targetMaterials.proximal[index]
    distalFragment.material = targetMaterials.distal[index]
  }

  function updatePose(pose: FracturePose, translate: THREE.Vector3, extraRotation: number) {
    const transform = fragmentTransform(pose)
    const rotation = transform.rotation + extraRotation
    const pivot = toVec(transform.pivot)
    distalGroup.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotation)
    const rotatedPivot = pivot.clone().applyQuaternion(distalGroup.quaternion)
    distalGroup.position.copy(pivot).sub(rotatedPivot).add(toVec(transform.translate)).add(translate)
  }

  function arrowAnchor(mode: LoadMode, axialOffset: number, lateralOffset: number): THREE.Vector3 {
    if (mode === 'abduction') {
      const tip = anchors.get('toe-tip') ?? targetHead
      return tip.clone().add(new THREE.Vector3(-lateralOffset * 0.5, 0.0015, 0))
    }
    if (mode === 'lateral') {
      return targetBase
        .clone()
        .addScaledVector(axis, axialOffset)
        .add(new THREE.Vector3(-lateralOffset * 0.9, 0, 0.0012))
    }
    const tip = anchors.get('toe-tip') ?? targetHead
    return tip.clone().addScaledVector(axis, -0.0012)
  }

  function update(view: BoneSceneView) {
    const { tab } = view
    const isLoad = tab === 'load'
    const isRepair = tab === 'repair'
    const structure = view.structure
    const fractured = isRepair ? true : isLoad ? view.load.fractured : structure.fractured
    const pose = isRepair ? ZERO_POSE : isLoad ? DEFAULT_POSE : structure.pose
    const cutaway = isRepair ? view.repair.cutaway : !isLoad && structure.cutaway

    intactMesh.visible = !fractured
    proximalGroup.visible = fractured
    distalGroup.visible = fractured
    otherGroup.visible = true

    // 其他骨：结构页签跟「隐藏其他骨」，受力与修复页签只留第 5 趾列
    for (const mesh of meshes) {
      const isRay5 = mesh.userData.isRay5 === true
      mesh.visible = tab === 'structure' ? !structure.isolate || isRay5 : isRay5
    }
    marker.visible = tab === 'structure'
    jointHit.visible = tab === 'structure'

    // 受力：整根趾的示意形变 + 断端活动
    let translate = new THREE.Vector3()
    let extraRotation = 0
    loadGroup.quaternion.identity()
    loadGroup.position.set(0, 0, 0)
    midGroup.quaternion.identity()
    midGroup.position.set(0, 0, 0)
    loadGroup.scale.setScalar(1)
    loadGroup.matrixAutoUpdate = true
    if (isLoad) {
      const effect = loadEffect(view.load.mode, view.load.load, view.load.fractured)
      const sign = view.load.mode === 'abduction' ? -1 : 1
      if (view.load.fractured) {
        extraRotation = ((effect.fragmentDeg * Math.PI) / 180) * sign
        if (view.load.mode === 'axial') {
          translate = axis.clone().multiplyScalar(-0.0002 * effect.load)
        }
      } else if (view.load.mode === 'axial') {
        // 作用于可见的完整骨和后两节，避免只移动隐藏的骨折组。
        const k = -effect.compressionMm / 1000 / targetLength()
        const a = axis
        const compression = new THREE.Matrix4().set(
          1 + k*a.x*a.x, k*a.x*a.y, k*a.x*a.z, 0,
          k*a.y*a.x, 1 + k*a.y*a.y, k*a.y*a.z, 0,
          k*a.z*a.x, k*a.z*a.y, 1 + k*a.z*a.z, 0,
          0, 0, 0, 1,
        )
        compression.setPosition(targetBase.clone().sub(targetBase.clone().applyMatrix4(compression)))
        loadGroup.matrix.copy(compression); loadGroup.matrixAutoUpdate = false
      } else {
        const angle = ((effect.jointDeg * Math.PI) / 180) * (view.load.mode === 'abduction' ? -1 : 1)
        if (view.load.mode === 'abduction') {
          loadGroup.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle)
          loadGroup.position.copy(jointPoint).sub(jointPoint.clone().applyQuaternion(loadGroup.quaternion))
        } else {
          midGroup.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle)
          midGroup.position.copy(targetHead).sub(targetHead.clone().applyQuaternion(midGroup.quaternion))
        }
      }
    }
    updatePose(pose, translate, extraRotation)
    toeChain.position.copy(fractured ? distalGroup.position : new THREE.Vector3())
    toeChain.quaternion.copy(fractured ? distalGroup.quaternion : new THREE.Quaternion())
    root.updateMatrixWorld(true)

    // 剖切
    applyClipping(cutaway && !isRepair ? true : cutaway, cutaway && isRepair)
    for (const item of sectionMeshes) {
      item.mesh.visible = cutaway && (item.owner === 'intact' ? !fractured : fractured)
    }
    // 零位移时两片断面完全贴合，封口藏在实体内部；这时不画，免得两张面重合闪烁
    const open = pose.gap !== 0 || pose.offset !== 0 || pose.angulation !== 0 || extraRotation !== 0 || translate.lengthSq() > 0
    for (const mesh of capMeshes) mesh.visible = fractured && open
    for (const pair of Object.values(targetMaterials)) pair[0].color.setHex(isRepair ? PALETTE.bone : PALETTE.boneTarget)

    // 修复叠层
    const appearance = repairAppearance(view.repair.progress)
    callusGroup.visible = isRepair
    if (isRepair) {
      hematoma.setSize(1)
      softCallus.setSize(appearance.softCallus.size)
      bonyCallus.setSize(appearance.bonyCallus.size)
      materials.hematoma.opacity = 0.82 * appearance.hematoma.opacity
      materials.softCallus.opacity = 0.52 * appearance.softCallus.opacity
      materials.bonyCallus.opacity = appearance.bonyCallus.opacity
      materials.bonyCallus.color.setHex(PALETTE.bonyCallus)
      materials.bonyCallus.color.lerp(new THREE.Color(PALETTE.bone), appearance.boneBlend * 0.85)
      hematoma.mesh.visible = appearance.hematoma.opacity > 0.01
      softCallus.mesh.visible = appearance.softCallus.opacity > 0.01
      bonyCallus.mesh.visible = appearance.bonyCallus.opacity > 0.01
      bridge.visible = view.repair.cutaway && appearance.bonyCallus.opacity > 0.05
      bridge.scale.set(1, callusHalf * 1.7 * Math.max(0.2, appearance.bonyCallus.size), 1)
    } else {
      hematoma.mesh.visible = false
      softCallus.mesh.visible = false
      bonyCallus.mesh.visible = false
      bridge.visible = false
    }

    // 箭头
    arrowGroup.visible = isLoad
    if (isLoad) {
      const placement = loadPlacement(view.load.mode)
      const direction = toVec(placement.direction).normalize()
      const anchorPoint = arrowAnchor(view.load.mode, placement.axialOffset, placement.lateralOffset)
      const length = Math.max(0.0015, placement.arrowLength * view.load.load)
      const headLength = Math.min(0.0038, length * 0.5)
      const shaftLength = Math.max(0.0004, length - headLength)
      const pulling = view.load.mode === 'abduction'
      arrow.position.copy(anchorPoint).addScaledVector(direction, pulling ? 0 : -length)
      arrowShaft.scale.set(shaftLength, 1, 1)
      arrowHead.position.set(shaftLength, 0, 0)
      arrowHead.scale.set(headLength / 0.0038, 1, 1)
      arrow.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), direction)
      arrow.visible = view.load.load > 0.004
      constraintGroup.visible = !view.load.fractured
      anchorPoint.addScaledVector(direction, (pulling ? 1 : -1) * length * 0.5)
      anchors.set('arrow', anchorPoint)
    } else {
      constraintGroup.visible = false
    }

    applySelection(tab === 'structure' ? structure.selected : null)
  }

  function pick(raycaster: THREE.Raycaster): string | null {
    const candidates: THREE.Object3D[] = [intactMesh, proximalFragment, distalFragment, jointHit, ...meshes]
    const hits = raycaster.intersectObjects(candidates, false)
    for (const hit of hits) {
      if (!isVisible(hit.object)) continue
      if (hit.object.userData.pickable === false) continue
      const material = (hit.object as THREE.Mesh).material as THREE.Material
      if (material.clippingPlanes?.some((plane) => plane.distanceToPoint(hit.point) < 0)) continue
      const id = hit.object.userData.boneId as string | undefined
      if (id) return id
    }
    return null
  }

  function dispose() {
    const geometries = new Set<THREE.BufferGeometry>()
    root.traverse((object) => {
      const mesh = object as THREE.Mesh
      if (mesh.geometry) geometries.add(mesh.geometry)
    })
    entries.forEach((entry) => geometries.add(entry.geometry))
    geometries.forEach((geometry) => geometry.dispose())
    const textures = new Set<THREE.Texture>()
    for (const material of materials.all) {
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) textures.add(value)
      }
      material.dispose()
    }
    textures.forEach((texture) => texture.dispose())
  }

  // 初始状态：完整对照、默认断端姿态
  updatePose(DEFAULT_POSE, new THREE.Vector3(), 0)

  return {
    root,
    update,
    dispose,
    pick,
    anchor: (id) => {
      const p = anchors.get(id)?.clone()
      if (!p) return undefined
      const group = id === 'mp5' || id === 'dp5' || id === 'toe-tip' ? midGroup
        : id === 'pp5-head' || id === 'pp5-mid' ? (distalGroup.visible ? distalGroup : loadGroup)
        : id === 'pp5-base' ? loadGroup : null
      if (group) p.applyMatrix4(group.matrixWorld).applyMatrix4(root.matrixWorld.clone().invert())
      return p
    },
    label: (id) => labels.get(id) ?? id,
    bounds: (scope = 'foot') => {
      root.updateMatrixWorld(true)
      const box = new THREE.Box3()
      for (const entry of entries) {
        const target = entry.id === FOOT_MODEL.targetFma || entry.id === FOOT_MODEL.fifthMetatarsalFma || entry.id === FOOT_MODEL.fifthMiddleFma || entry.id === FOOT_MODEL.fifthDistalFma
        if (scope === 'toe' && !target) continue
        entry.geometry.computeBoundingBox()
        if (entry.geometry.boundingBox) box.union(entry.geometry.boundingBox)
      }
      if (scope === 'toe') box.expandByPoint(jointPoint.clone().addScaledVector(axis, -0.005)).expandByScalar(0.005)
      return box.applyMatrix4(root.matrixWorld)
    },
  }
}
