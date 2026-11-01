/**
 * 魔丸模式的跑道、障碍与校园背景。
 *
 * 三条硬规则：
 *  1. 车永远在原点附近，世界向后滚动——距离再远也不会丢掉浮点精度；
 *  2. 一切循环复用的装饰（路缘、标杆、树、楼）都用「里程取模」摆位，不新建对象；
 *  3. 障碍用实例化网格：每帧只写矩阵，几何与材质全程共享。
 *
 * 障碍的碰撞盒在 model.ts 里算，这里只按 kind 与尺寸画出来，两者必须同尺寸。
 */

import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { CONFIG } from './config'
import type { GameView, Obstacle } from './model'
import { scoreAt } from './score'

export type Quality = 'high' | 'low'

export interface Track {
  root: THREE.Group
  update(view: GameView): void
  setQuality(quality: Quality): void
  dispose(): void
}

const SPAN = 300
const ROAD_HALF = CONFIG.steering.roadHalfWidth

/** 固定的伪随机：同一台设备每次进来背景一样，截图可复现 */
function seeded(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

/** 把 0..1 的值映射到 [min, max] */
const lerp = (min: number, max: number, t: number): number => min + (max - min) * t

/* =========================================================================
   材质
   ========================================================================= */

interface Materials {
  road: THREE.MeshStandardMaterial
  ground: THREE.MeshStandardMaterial
  trackRed: THREE.MeshStandardMaterial
  lineWhite: THREE.MeshStandardMaterial
  curb: THREE.MeshStandardMaterial
  wall: THREE.MeshStandardMaterial
  wallBase: THREE.MeshStandardMaterial
  wallCap: THREE.MeshStandardMaterial
  post: THREE.MeshStandardMaterial
  trunk: THREE.MeshStandardMaterial
  foliage: THREE.MeshStandardMaterial
  building: THREE.MeshStandardMaterial
  pole: THREE.MeshStandardMaterial
  gatePole: THREE.MeshStandardMaterial
  gatePanel: THREE.MeshStandardMaterial
}

function createMaterials(): Materials {
  return {
    road: new THREE.MeshStandardMaterial({ color: 0x6c7176, roughness: 0.94, metalness: 0.02 }),
    ground: new THREE.MeshStandardMaterial({ color: 0xd9d5c4, roughness: 1 }),
    trackRed: new THREE.MeshStandardMaterial({ color: 0xa9563f, roughness: 0.96 }),
    lineWhite: new THREE.MeshStandardMaterial({ color: 0xe9e6da, roughness: 0.85 }),
    curb: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, vertexColors: false }),
    wall: new THREE.MeshStandardMaterial({ color: 0x35689f, roughness: 0.9, metalness: 0.06 }),
    wallBase: new THREE.MeshStandardMaterial({ color: 0x27507c, roughness: 0.95, metalness: 0.04 }),
    wallCap: new THREE.MeshStandardMaterial({ color: 0x4a80b8, roughness: 0.82, metalness: 0.08 }),
    post: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }),
    trunk: new THREE.MeshStandardMaterial({ color: 0x7c6647, roughness: 0.95 }),
    foliage: new THREE.MeshStandardMaterial({ color: 0x5c7757, roughness: 0.95 }),
    building: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92 }),
    pole: new THREE.MeshStandardMaterial({ color: 0x8b9095, roughness: 0.6, metalness: 0.3 }),
    gatePole: new THREE.MeshStandardMaterial({ color: 0x2b3d54, roughness: 0.5, metalness: 0.3 }),
    gatePanel: new THREE.MeshStandardMaterial({ color: 0x1c2733, roughness: 0.7 }),
  }
}

/* =========================================================================
   节点门：每 500 m 一块牌子，写着这个节点上的魔丸 GPA
   ========================================================================= */

interface NodeGate {
  group: THREE.Group
  texture: THREE.CanvasTexture
  canvas: HTMLCanvasElement
  node: number
  update(distance: number): void
  dispose(): void
}

function createNodeGate(materials: Materials): NodeGate {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 160
  const context = canvas.getContext('2d')
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4

  const group = new THREE.Group()
  for (const side of [1, -1]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 3.1, 10), materials.gatePole)
    pole.position.set(side * 3.7, 1.55, 0)
    pole.castShadow = true
    group.add(pole)
  }
  const backing = new THREE.Mesh(new THREE.BoxGeometry(8.1, 1.2, 0.16), materials.gatePanel)
  backing.position.set(0, 2.72, 0)
  group.add(backing)

  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(7.9, 1.12),
    new THREE.MeshBasicMaterial({ map: texture, transparent: false, toneMapped: false }),
  )
  panel.position.set(0, 2.72, 0.09)
  group.add(panel)

  const gate: NodeGate = {
    group,
    texture,
    canvas,
    node: -1,
    update(distance) {
      const node = Math.max(500, Math.ceil((distance + 1) / 500) * 500)
      if (node !== gate.node && context) {
        gate.node = node
        const score = scoreAt(node)
        context.fillStyle = '#1c2733'
        context.fillRect(0, 0, canvas.width, canvas.height)
        context.fillStyle = '#cf8a5c'
        context.fillRect(0, 0, canvas.width, 10)
        context.fillStyle = '#12211b'
        context.font = '600 74px "Segoe UI", system-ui, sans-serif'
        context.textBaseline = 'middle'
        context.fillText(`${Math.round(node).toLocaleString('zh-CN')} m`, 42, 88)
        context.textAlign = 'right'
        context.fillStyle = '#e9c46a'
        context.font = '700 92px "Cascadia Mono", Consolas, monospace'
        context.fillText(score.text, 700, 84)
        context.fillStyle = '#9fb0bd'
        context.font = '500 40px "Segoe UI", system-ui, sans-serif'
        context.fillText(score.nines > 0 ? `第 ${score.nines} 个 9` : '还在爬坡', 985, 88)
        context.textAlign = 'left'
        texture.needsUpdate = true
      }
      const relative = gate.node - distance
      group.visible = relative > -2 && relative < SPAN
      group.position.z = -relative
    },
    dispose() {
      texture.dispose()
      group.traverse((child) => {
        const mesh = child as THREE.Mesh
        if (mesh.isMesh) {
          mesh.geometry.dispose()
          const material = mesh.material
          if (Array.isArray(material)) material.forEach((item) => item.dispose())
          else material.dispose()
        }
      })
    },
  }
  return gate
}

/* =========================================================================
   障碍：连跳矮墙（低矮混凝土墙 + 压顶）
   ========================================================================= */

interface WallPool {
  parts: Array<{ mesh: THREE.InstancedMesh; capacity: number }>
  capacity: number
  setCount(count: number): void
  write(
    index: number,
    obstacle: Obstacle,
    distance: number,
    matrix: THREE.Matrix4,
    position: THREE.Vector3,
    scale: THREE.Vector3,
  ): void
}

/**
 * 连跳矮墙：一堵低矮混凝土墙 + 顶部压顶 + 墙脚一道深色风化带。
 *
 * 尺寸见 CONFIG.obstacle.wall（高 0.85 m、厚 0.38 m），长度按这一排被挡住的宽度
 * 用实例矩阵在 X 上缩放。三段共用一个矩阵，一堵墙只增加三个实例。
 */
function createWalls(materials: Materials): { root: THREE.Group; pool: WallPool; dispose(): void } {
  const root = new THREE.Group()
  const geometryList: THREE.BufferGeometry[] = []
  const capacity = 96
  const wall = CONFIG.obstacle.wall
  const depth = wall.halfDepth * 2

  const instanced = (geometry: THREE.BufferGeometry, material: THREE.Material): THREE.InstancedMesh => {
    geometryList.push(geometry)
    const mesh = new THREE.InstancedMesh(geometry, material, capacity)
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    mesh.frustumCulled = false
    mesh.castShadow = true
    mesh.receiveShadow = true
    root.add(mesh)
    return mesh
  }

  const body = instanced(
    new THREE.BoxGeometry(1, wall.height - wall.baseHeight, depth).translate(
      0,
      (wall.height + wall.baseHeight) / 2,
      0,
    ),
    materials.wall,
  )
  const base = instanced(
    new THREE.BoxGeometry(1, wall.baseHeight, depth + 0.006).translate(0, wall.baseHeight / 2, 0),
    materials.wallBase,
  )
  const cap = instanced(
    new THREE.BoxGeometry(1, wall.capHeight, depth + wall.capOverhang * 2).translate(
      0,
      wall.height + wall.capHeight / 2,
      0,
    ),
    materials.wallCap,
  )

  const pool: WallPool = {
    parts: [
      { mesh: body, capacity },
      { mesh: base, capacity },
      { mesh: cap, capacity },
    ],
    capacity,
    setCount(count) {
      body.count = count
      base.count = count
      cap.count = count
    },
    write(index, obstacle, distance, matrix, position, scale) {
      position.set(obstacle.x, 0, -(obstacle.at - distance))
      scale.set(obstacle.halfWidth * 2, 1, 1)
      matrix.compose(position, IDENTITY, scale)
      body.setMatrixAt(index, matrix)
      base.setMatrixAt(index, matrix)
      cap.setMatrixAt(index, matrix)
    },
  }

  return {
    root,
    pool,
    dispose() {
      for (const geometry of geometryList) geometry.dispose()
      body.dispose()
      base.dispose()
      cap.dispose()
    },
  }
}

const IDENTITY = new THREE.Quaternion()

/* =========================================================================
   跑道
   ========================================================================= */

export function createTrack(): Track {
  const materials = createMaterials()
  const root = new THREE.Group()
  root.name = 'mowan-track'
  const geometries: THREE.BufferGeometry[] = []

  /* ---------------- 地面与路面 ---------------- */

  const groundGeometry = new THREE.PlaneGeometry(420, 460)
  geometries.push(groundGeometry)
  const ground = new THREE.Mesh(groundGeometry, materials.ground)
  ground.rotation.x = -Math.PI / 2
  ground.position.set(0, -0.02, -180)
  ground.receiveShadow = true
  root.add(ground)

  const roadGeometry = new THREE.PlaneGeometry(ROAD_HALF * 2, SPAN + 40)
  geometries.push(roadGeometry)
  const road = new THREE.Mesh(roadGeometry, materials.road)
  road.rotation.x = -Math.PI / 2
  road.position.set(0, 0, -SPAN / 2 + 20)
  road.receiveShadow = true
  root.add(road)

  // 两侧红色跑道与白线：有点校园试验场的意思，也不挡视线
  for (const side of [1, -1]) {
    const bandGeometry = new THREE.PlaneGeometry(3.4, SPAN + 40)
    geometries.push(bandGeometry)
    const band = new THREE.Mesh(bandGeometry, materials.trackRed)
    band.rotation.x = -Math.PI / 2
    band.position.set(side * (ROAD_HALF + 1.9), 0.005, -SPAN / 2 + 20)
    band.receiveShadow = true
    root.add(band)

    const laneGeometry = new THREE.PlaneGeometry(0.09, SPAN + 40)
    geometries.push(laneGeometry)
    const lane = new THREE.Mesh(laneGeometry, materials.lineWhite)
    lane.rotation.x = -Math.PI / 2
    lane.position.set(side * (ROAD_HALF + 0.35), 0.008, -SPAN / 2 + 20)
    root.add(lane)
  }

  /* ---------------- 循环复用的装饰 ---------------- */

  const random = seeded(20261101)

  // 路缘：红白相间，每 4.8 m 一块
  const curbGeometry = new THREE.BoxGeometry(0.26, 0.13, 4.6)
  geometries.push(curbGeometry)
  const curbCount = Math.ceil(SPAN / 4.8) * 2
  const curbs = new THREE.InstancedMesh(curbGeometry, materials.curb, curbCount)
  curbs.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  curbs.frustumCulled = false
  curbs.receiveShadow = true
  const curbColor = new THREE.Color()
  for (let i = 0; i < curbCount; i += 1) curbs.setColorAt(i, curbColor.setHex(i % 2 === 0 ? 0xf1eee4 : 0xc0503a))
  root.add(curbs)

  // 中线虚线
  const dashGeometry = new THREE.PlaneGeometry(0.16, 2.6).rotateX(-Math.PI / 2)
  geometries.push(dashGeometry)
  const dashCount = Math.ceil(SPAN / CONFIG.track.dashSpacing)
  const dashes = new THREE.InstancedMesh(dashGeometry, materials.lineWhite, dashCount)
  dashes.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  dashes.frustumCulled = false
  root.add(dashes)

  // 车道边线标杆
  const postGeometry = mergeGeometries([
    new THREE.BoxGeometry(0.07, 0.86, 0.07).translate(0, 0.43, 0),
    new THREE.BoxGeometry(0.16, 0.12, 0.04).translate(0, 0.8, 0),
  ])
  geometries.push(postGeometry)
  const postCount = Math.ceil(SPAN / CONFIG.track.markerSpacing) * 2
  const posts = new THREE.InstancedMesh(postGeometry, materials.post, postCount)
  posts.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  posts.frustumCulled = false
  const postColor = new THREE.Color()
  for (let i = 0; i < postCount; i += 1) posts.setColorAt(i, postColor.setHex(0xf1eee4))
  root.add(posts)

  // 树：树干 + 树冠
  const treeCount = 30
  const trunkGeometry = new THREE.CylinderGeometry(0.11, 0.16, 1.6, 6).translate(0, 0.8, 0)
  const foliageGeometry = new THREE.ConeGeometry(1.35, 3.1, 7).translate(0, 2.9, 0)
  geometries.push(trunkGeometry, foliageGeometry)
  const trunks = new THREE.InstancedMesh(trunkGeometry, materials.trunk, treeCount)
  const foliage = new THREE.InstancedMesh(foliageGeometry, materials.foliage, treeCount)
  for (const mesh of [trunks, foliage]) {
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    mesh.frustumCulled = false
    mesh.castShadow = true
    root.add(mesh)
  }
  const trees = Array.from({ length: treeCount }, (_, i) => ({
    at: random() * SPAN,
    x: (i % 2 === 0 ? 1 : -1) * lerp(9.5, 14, random()),
    scale: lerp(0.8, 1.5, random()),
  }))

  // 远处的校园楼：只做体量与颜色，不追细节
  const buildingCount = 18
  const buildingGeometry = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)
  geometries.push(buildingGeometry)
  const buildings = new THREE.InstancedMesh(buildingGeometry, materials.building, buildingCount)
  buildings.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  buildings.frustumCulled = false
  const buildingColor = new THREE.Color()
  const buildingPalette = [0xc7c1b2, 0xb8c2c5, 0xc4b9a9, 0xb4bfc5]
  for (let i = 0; i < buildingCount; i += 1) {
    buildings.setColorAt(i, buildingColor.setHex(buildingPalette[i % buildingPalette.length]))
  }
  root.add(buildings)
  const blocks = Array.from({ length: buildingCount }, (_, i) => ({
    at: (i / buildingCount) * SPAN + random() * 12,
    x: (i % 2 === 0 ? 1 : -1) * lerp(30, 52, random()),
    width: lerp(9, 20, random()),
    height: lerp(5, 17, random()),
    depth: lerp(9, 20, random()),
  }))

  // 灯杆：一根竖杆 + 一根横臂
  const poleGeometry = mergeGeometries([
    new THREE.CylinderGeometry(0.09, 0.12, 6.4, 8).translate(0, 3.2, 0),
    new THREE.BoxGeometry(1.5, 0.1, 0.1).translate(0.65, 6.3, 0),
  ])
  geometries.push(poleGeometry)
  const poleCount = 16
  const poles = new THREE.InstancedMesh(poleGeometry, materials.pole, poleCount)
  poles.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  poles.frustumCulled = false
  root.add(poles)
  const poleList = Array.from({ length: poleCount }, (_, i) => ({
    at: (i / poleCount) * SPAN,
    x: (i % 2 === 0 ? 1 : -1) * (ROAD_HALF + 5.2),
    flip: i % 2 === 0 ? -1 : 1,
  }))

  /* ---------------- 障碍与节点门 ---------------- */

  const { root: poolRoot, pool: wallPool, dispose: disposeWalls } = createWalls(materials)
  root.add(poolRoot)
  const gate = createNodeGate(materials)
  root.add(gate.group)

  /* ---------------- 每帧 ---------------- */

  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const scale = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()
  let quality: Quality = 'high'

  const wrap = (at: number, distance: number): number => {
    const relative = (((at - distance) % SPAN) + SPAN) % SPAN
    return -relative + 12
  }

  function update(view: GameView): void {
    const distance = view.distance

    // 路缘、虚线、标杆：整体按里程取模滚动
    let index = 0
    for (let i = 0; i < curbCount / 2; i += 1) {
      const at = i * 4.8
      const z = wrap(at, distance)
      for (const side of [1, -1]) {
        position.set(side * (ROAD_HALF + 0.18), 0, z)
        scale.set(1, 1, 1)
        matrix.compose(position, IDENTITY, scale)
        curbs.setMatrixAt(index, matrix)
        index += 1
      }
    }
    curbs.instanceMatrix.needsUpdate = true

    for (let i = 0; i < dashCount; i += 1) {
      const z = wrap(i * CONFIG.track.dashSpacing, distance)
      position.set(0, 0.012, z)
      matrix.compose(position, IDENTITY, scale.set(1, 1, 1))
      dashes.setMatrixAt(i, matrix)
    }
    dashes.instanceMatrix.needsUpdate = true

    index = 0
    for (let i = 0; i < postCount / 2; i += 1) {
      const z = wrap(i * CONFIG.track.markerSpacing, distance)
      for (const side of [1, -1]) {
        position.set(side * (ROAD_HALF + 1.05), 0, z)
        matrix.compose(position, IDENTITY, scale.set(1, 1, 1))
        posts.setMatrixAt(index, matrix)
        index += 1
      }
    }
    posts.instanceMatrix.needsUpdate = true

    // 树与楼在低画质下少画一些
    const treeLimit = quality === 'high' ? trees.length : CONFIG.quality.decorationsLow
    for (let i = 0; i < trees.length; i += 1) {
      const tree = trees[i]
      const z = wrap(tree.at, distance)
      const visible = i < treeLimit ? 1 : 0
      position.set(tree.x, 0, z)
      scale.set(tree.scale * visible, tree.scale * visible, tree.scale * visible)
      matrix.compose(position, IDENTITY, scale)
      trunks.setMatrixAt(i, matrix)
      foliage.setMatrixAt(i, matrix)
    }
    trunks.instanceMatrix.needsUpdate = true
    foliage.instanceMatrix.needsUpdate = true

    const blockLimit = quality === 'high' ? blocks.length : Math.ceil(blocks.length / 2)
    for (let i = 0; i < blocks.length; i += 1) {
      const block = blocks[i]
      const z = wrap(block.at, distance)
      const visible = i < blockLimit ? 1 : 0
      position.set(block.x, 0, z)
      scale.set(block.width * visible, block.height * visible, block.depth * visible)
      matrix.compose(position, IDENTITY, scale)
      buildings.setMatrixAt(i, matrix)
    }
    buildings.instanceMatrix.needsUpdate = true

    for (let i = 0; i < poleList.length; i += 1) {
      const pole = poleList[i]
      const z = wrap(pole.at, distance)
      position.set(pole.x, 0, z)
      quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), pole.flip > 0 ? 0 : Math.PI)
      matrix.compose(position, quaternion, scale.set(1, 1, 1))
      poles.setMatrixAt(i, matrix)
    }
    poles.instanceMatrix.needsUpdate = true

    // 障碍：这一排有几段墙就写几个实例
    let wallCount = 0
    for (const obstacle of view.obstacles) {
      if (wallCount >= wallPool.capacity) break
      wallPool.write(wallCount, obstacle, distance, matrix, position, scale)
      wallCount += 1
    }
    wallPool.setCount(wallCount)
    for (const part of wallPool.parts) part.mesh.instanceMatrix.needsUpdate = true

    gate.update(distance)
  }

  return {
    root,
    update,
    setQuality(next) {
      quality = next
      // 低画质：关掉障碍与树的投影，少一半阴影绘制
      const shadows = next === 'high'
      for (const part of wallPool.parts) part.mesh.castShadow = shadows
      trunks.castShadow = shadows
      foliage.castShadow = shadows
      poles.castShadow = shadows
    },
    dispose() {
      for (const geometry of geometries) geometry.dispose()
      disposeWalls()
      gate.dispose()
      for (const mesh of [curbs, dashes, posts, trunks, foliage, buildings, poles]) mesh.dispose()
      for (const material of Object.values(materials)) material.dispose()
      root.clear()
    },
  }
}