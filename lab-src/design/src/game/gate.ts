/**
 * 起点门楼：照着北航「体能锻炼走廊」实拍照片重做的一版。
 *
 * 按照片对的结构：
 *  1. 两根白色圆柱（直径 0.6 m）立在路两侧，柱脚墨绿钢箍、柱顶托着金字拱；
 *  2. 蓝色弧形顶棚是**左右两块分开**的阳光板，中缝压一根脊梁；板下两道墨绿弧形
 *     钢梁 + 五根纵向檩条，板上八组银灰横向肋；顶棚向场内延伸，入口这一侧敞开；
 *  3. 入口平面上方一道很扁的钢拱，八个金色大字一个个竖直装在拱上，高低跟着拱走；
 *  4. 两侧墨绿框钢板网围栏：上横杆、下横杆、三根立柱；
 *  5. 入口两扇墨绿框钢板网大门向内敞开，围栏上挂蓝底「安全提示」，
 *     右侧白柱上挂红底「注意安全」；
 *  6. 门内两侧不锈钢闸机，中间留出宽通道。
 *
 * 取舍：
 *  - 闸机只铺两侧外车道，中间留空——游戏里的行车线不能有一排隐形墙；
 *    门楼是布景，不参与碰撞。
 *  - 大字用一张 8 格图集贴到 8 个竖直平面上：远看像立在拱上的立体字。
 *  - 静态件按材质合并，整座门楼十来个 draw call；走远就整体隐藏。
 *  - 尺寸是按照片比例目测的示意，不是实测，页面上不当作数据展示。
 */

import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

/** 门楼所在的里程：玩家从这里起步，倒计时结束后从门下穿过 */
const GATE_AT = 8.5
const ROAD_HALF = 4.1

/** 白柱 */
const PIER_X = 4.9
const PIER_HEIGHT = 4.4
/** 蓝色顶棚：半径、半张角、顶点高度、沿路长度、中缝、中心 z（向场内延伸） */
const ROOF_RADIUS = 7.5
const ROOF_HALF_ANGLE = 0.72
const ROOF_APEX = 5.0
const ROOF_LENGTH = 3.6
const ROOF_GAP = 0.05
const ROOF_CENTER_Z = -1.2
/** 金字拱：圆心、半径、半张角（拱在入口平面上） */
const ARCH_CENTER_Y = -8.49
const ARCH_RADIUS = 13.79
const ARCH_HALF_ANGLE = 0.363
const ARCH_Z = 0
/** 八个字 */
const LETTER_HALF_ANGLE = 0.32
const LETTER_WIDTH = 0.9
const LETTER_HEIGHT = 0.85

export interface StartGate {
  group: THREE.Group
  update(distance: number, quality: 'high' | 'low'): void
  dispose(): void
}

/* =========================================================================
   贴图
   ========================================================================= */

/**
 * 八个金色大字：一张 8 格图集。
 * 每格画「深色硬投影 + 金色渐变 + 深棕描边 + 顶部高光」，模拟照片里那种
 * 立在钢拱上的立体金字；硬投影是为了能开 alphaTest，边缘干净。
 */
function createLetterAtlas(): THREE.CanvasTexture {
  const text = '北航体能锻炼走廊'
  const cellWidth = 256
  const cellHeight = 320
  const canvas = document.createElement('canvas')
  canvas.width = cellWidth * text.length
  canvas.height = cellHeight
  const context = canvas.getContext('2d')
  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height)
    const fontSize = 232
    context.font = `700 ${fontSize}px "Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif`
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    for (let i = 0; i < text.length; i += 1) {
      const cx = cellWidth * i + cellWidth / 2
      const cy = cellHeight / 2 + 8
      context.fillStyle = 'rgba(58, 40, 12, 0.85)'
      context.fillText(text[i], cx + 9, cy + 11)
      context.lineWidth = 14
      context.strokeStyle = '#6b4a12'
      context.strokeText(text[i], cx, cy)
      const gradient = context.createLinearGradient(0, cy - fontSize / 2, 0, cy + fontSize / 2)
      gradient.addColorStop(0, '#fff8d8')
      gradient.addColorStop(0.32, '#f2d071')
      gradient.addColorStop(0.62, '#d9a63d')
      gradient.addColorStop(0.86, '#b8822a')
      gradient.addColorStop(1, '#9c6a1f')
      context.fillStyle = gradient
      context.fillText(text[i], cx, cy)
      context.strokeStyle = 'rgba(255, 250, 214, 0.5)'
      context.lineWidth = 4
      context.strokeText(text[i], cx - 2, cy - 3)
    }
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

/** 钢板网：透明菱形网格 */
function createMeshTexture(): THREE.CanvasTexture {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (context) {
    context.clearRect(0, 0, size, size)
    context.strokeStyle = 'rgba(200, 210, 206, 0.95)'
    context.lineWidth = 3
    for (let offset = -size; offset <= size; offset += 32) {
      context.beginPath()
      context.moveTo(offset, 0)
      context.lineTo(offset + size, size)
      context.stroke()
      context.beginPath()
      context.moveTo(offset + size, 0)
      context.lineTo(offset, size)
      context.stroke()
    }
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/** 起点线上的方格 */
function createStartLineTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 64
  const context = canvas.getContext('2d')
  if (context) {
    const cell = 64
    for (let x = 0; x < canvas.width / cell; x += 1) {
      for (let y = 0; y < canvas.height / cell; y += 1) {
        context.fillStyle = (x + y) % 2 === 0 ? '#12211b' : '#c9c4b6'
        context.fillRect(x * cell, y * cell, cell, cell)
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/** 围栏上的小牌子 */
function createSignTexture(background: string, color: string, text: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 192
  const context = canvas.getContext('2d')
  if (context) {
    context.fillStyle = background
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.strokeStyle = 'rgba(255,255,255,0.8)'
    context.lineWidth = 10
    context.strokeRect(9, 9, canvas.width - 18, canvas.height - 18)
    context.fillStyle = color
    context.font = '700 86px "Microsoft YaHei", "PingFang SC", sans-serif'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(text, canvas.width / 2, canvas.height / 2 + 4)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/* =========================================================================
   小工具：把几何直接摆到位置上，最后按材质合并
   ========================================================================= */

type Parts = THREE.BufferGeometry[]

function pushBox(
  list: Parts,
  width: number,
  height: number,
  depth: number,
  x: number,
  y: number,
  z: number,
  rotateY = 0,
  rotateZ = 0,
): void {
  const geometry = new THREE.BoxGeometry(width, height, depth)
  if (rotateZ) geometry.rotateZ(rotateZ)
  if (rotateY) geometry.rotateY(rotateY)
  geometry.translate(x, y, z)
  list.push(geometry)
}

function pushCylinder(
  list: Parts,
  radiusTop: number,
  radiusBottom: number,
  height: number,
  x: number,
  y: number,
  z: number,
  axis: 'x' | 'y' | 'z' = 'y',
  segments = 14,
): void {
  const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments)
  if (axis === 'x') geometry.rotateZ(Math.PI / 2)
  if (axis === 'z') geometry.rotateX(Math.PI / 2)
  geometry.translate(x, y, z)
  list.push(geometry)
}

/** 竖直面上的圆弧（拱、肋）：圆心在 (0, centerY)，从 startAngle 展开 */
function pushArc(
  list: Parts,
  radius: number,
  tube: number,
  arcLength: number,
  startAngle: number,
  centerY: number,
  z: number,
  segments = 40,
): void {
  const geometry = new THREE.TorusGeometry(radius, tube, 6, segments, arcLength)
  geometry.rotateZ(startAngle)
  geometry.translate(0, centerY, z)
  list.push(geometry)
}

/** 弧形板（顶棚的一片）：轴沿 Z */
function pushRoofPanel(
  list: Parts,
  radius: number,
  length: number,
  startAngle: number,
  arcLength: number,
  centerY: number,
  centerZ: number,
): void {
  const geometry = new THREE.CylinderGeometry(radius, radius, length, 20, 1, true, startAngle, arcLength)
  geometry.rotateX(Math.PI / 2)
  geometry.translate(0, centerY, centerZ)
  list.push(geometry)
}

/* =========================================================================
   门楼
   ========================================================================= */

export function createStartGate(): StartGate {
  const group = new THREE.Group()
  group.name = 'mowan-start-gate'

  const whiteParts: Parts = []
  const greenParts: Parts = []
  const silverParts: Parts = []
  const meshParts: Parts = []
  const roofParts: Parts = []
  const disposables: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture> = []

  const register = <T extends THREE.Material | THREE.Texture>(item: T): T => {
    disposables.push(item)
    return item
  }

  /* ---------------- 材质 ---------------- */

  const whiteMaterial = register(
    new THREE.MeshStandardMaterial({ color: 0xe7e8e2, metalness: 0.08, roughness: 0.68 }),
  )
  const greenMaterial = register(
    new THREE.MeshStandardMaterial({ color: 0x2b4a3c, metalness: 0.42, roughness: 0.5 }),
  )
  const silverMaterial = register(
    new THREE.MeshStandardMaterial({ color: 0xc6cecb, metalness: 0.72, roughness: 0.3 }),
  )
  const roofMaterial = register(
    new THREE.MeshStandardMaterial({
      color: 0x2f6fbf,
      metalness: 0.18,
      roughness: 0.32,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      emissive: 0x0b2c52,
      emissiveIntensity: 0.4,
    }),
  )
  const meshTexture = register(createMeshTexture())
  const meshMaterial = register(
    new THREE.MeshStandardMaterial({
      map: meshTexture,
      transparent: true,
      alphaTest: 0.22,
      side: THREE.DoubleSide,
      metalness: 0.35,
      roughness: 0.55,
      color: 0xd0d7d3,
    }),
  )

  /* ---------------- 1. 两根白柱 ---------------- */

  for (const side of [1, -1]) {
    const x = side * PIER_X
    pushBox(whiteParts, 1.0, 0.42, 1.0, x, 0.21, 0)
    pushCylinder(greenParts, 0.34, 0.4, 0.6, x, 0.72, 0, 'y', 16)
    pushCylinder(whiteParts, 0.3, 0.32, PIER_HEIGHT - 1.0, x, 1.0 + (PIER_HEIGHT - 1.0) / 2, 0, 'y', 20)
    pushCylinder(greenParts, 0.33, 0.33, 0.16, x, PIER_HEIGHT - 0.08, 0, 'y', 16)
  }

  /* ---------------- 2. 顶棚下的墨绿弧形钢梁与檩条 ---------------- */

  const roofCenterY = ROOF_APEX - ROOF_RADIUS
  const eaveX = Math.sin(ROOF_HALF_ANGLE) * ROOF_RADIUS
  const eaveY = roofCenterY + Math.cos(ROOF_HALF_ANGLE) * ROOF_RADIUS

  for (const z of [ROOF_CENTER_Z + 1.6, ROOF_CENTER_Z - 1.6]) {
    pushArc(
      greenParts,
      ROOF_RADIUS + 0.06,
      0.06,
      ROOF_HALF_ANGLE * 2,
      Math.PI / 2 - ROOF_HALF_ANGLE,
      roofCenterY,
      z,
      44,
    )
  }
  for (const t of [-0.58, -0.3, 0, 0.3, 0.58]) {
    const x = Math.sin(t) * (ROOF_RADIUS + 0.03)
    const y = roofCenterY + Math.cos(t) * (ROOF_RADIUS + 0.03)
    pushCylinder(greenParts, 0.03, 0.03, 3.2, x, y, ROOF_CENTER_Z, 'z', 8)
  }

  /* ---------------- 3. 左右两块分开的蓝顶棚 ---------------- */

  const halfPanel = ROOF_HALF_ANGLE - ROOF_GAP
  pushRoofPanel(roofParts, ROOF_RADIUS, ROOF_LENGTH, Math.PI - ROOF_HALF_ANGLE, halfPanel, roofCenterY, ROOF_CENTER_Z)
  pushRoofPanel(roofParts, ROOF_RADIUS, ROOF_LENGTH, Math.PI + ROOF_GAP, halfPanel, roofCenterY, ROOF_CENTER_Z)

  // 中缝脊梁
  pushBox(silverParts, 0.14, 0.1, ROOF_LENGTH + 0.1, 0, ROOF_APEX + 0.02, ROOF_CENTER_Z)

  // 八组银灰横向肋
  const ribCount = 8
  for (let i = 0; i < ribCount; i += 1) {
    const z = ROOF_CENTER_Z - ROOF_LENGTH / 2 + 0.1 + i * ((ROOF_LENGTH - 0.2) / (ribCount - 1))
    pushArc(silverParts, ROOF_RADIUS + 0.02, 0.03, halfPanel, Math.PI / 2 - ROOF_HALF_ANGLE, roofCenterY, z, 18)
    pushArc(silverParts, ROOF_RADIUS + 0.02, 0.03, halfPanel, Math.PI / 2 + ROOF_GAP, roofCenterY, z, 18)
  }

  // 柱顶与顶棚檐口之间的托架
  for (const side of [1, -1]) {
    pushBox(
      greenParts,
      Math.abs(PIER_X - Math.abs(eaveX)) + 0.12,
      0.14,
      0.16,
      (side * (PIER_X + Math.abs(eaveX))) / 2,
      eaveY,
      ROOF_CENTER_Z + 1.55,
    )
  }

  /* ---------------- 4. 金字拱 + 八个立体金字 ---------------- */

  pushArc(
    silverParts,
    ARCH_RADIUS,
    0.06,
    ARCH_HALF_ANGLE * 2,
    Math.PI / 2 - ARCH_HALF_ANGLE,
    ARCH_CENTER_Y,
    ARCH_Z,
    60,
  )
  // 拱两端的小立柱，落到柱顶
  for (const side of [1, -1]) {
    const endX = side * Math.sin(ARCH_HALF_ANGLE) * ARCH_RADIUS
    const endY = ARCH_CENTER_Y + Math.cos(ARCH_HALF_ANGLE) * ARCH_RADIUS
    const height = Math.max(0.15, PIER_HEIGHT - endY)
    pushCylinder(greenParts, 0.04, 0.045, height + 0.1, endX, endY - height / 2 + 0.05, ARCH_Z, 'y', 8)
  }

  const letterTexture = register(createLetterAtlas())
  const letterMaterial = register(
    new THREE.MeshBasicMaterial({
      map: letterTexture,
      transparent: true,
      alphaTest: 0.3,
      toneMapped: false,
      side: THREE.DoubleSide,
    }),
  )
  const characters = '北航体能锻炼走廊'
  for (let i = 0; i < characters.length; i += 1) {
    const angle = -LETTER_HALF_ANGLE + (i / (characters.length - 1)) * LETTER_HALF_ANGLE * 2
    const x = Math.sin(angle) * ARCH_RADIUS
    const archY = ARCH_CENTER_Y + Math.cos(angle) * ARCH_RADIUS
    const geometry = new THREE.PlaneGeometry(LETTER_WIDTH, LETTER_HEIGHT)
    const uv = geometry.attributes.uv as THREE.BufferAttribute
    const u0 = i / characters.length
    const u1 = (i + 1) / characters.length
    uv.setXY(0, u0, 1)
    uv.setXY(1, u1, 1)
    uv.setXY(2, u0, 0)
    uv.setXY(3, u1, 0)
    uv.needsUpdate = true
    disposables.push(geometry)
    const mesh = new THREE.Mesh(geometry, letterMaterial)
    mesh.position.set(x, archY + LETTER_HEIGHT / 2 - 0.04, ARCH_Z + 0.04)
    group.add(mesh)
    pushBox(greenParts, 0.12, 0.1, 0.08, x, archY + 0.02, ARCH_Z)
  }

  /* ---------------- 5. 两侧钢板网围栏 ---------------- */

  const fenceInner = PIER_X + 0.32
  const fenceOuter = PIER_X + 3.7
  for (const side of [1, -1]) {
    const center = (side * (fenceInner + fenceOuter)) / 2
    const width = fenceOuter - fenceInner
    const height = 2.3

    const panel = new THREE.PlaneGeometry(width, height)
    panel.translate(center, 0.2 + height / 2, 0)
    meshParts.push(panel)

    pushBox(greenParts, width + 0.12, 0.09, 0.09, center, 0.2 + height + 0.02, 0)
    pushBox(greenParts, width + 0.12, 0.07, 0.07, center, 0.2, 0)
    for (const px of [fenceInner, (fenceInner + fenceOuter) / 2, fenceOuter]) {
      pushBox(greenParts, 0.1, height + 0.22, 0.1, side * px, 0.2 + height / 2, 0)
    }
  }

  /* ---------------- 6. 两扇向内敞开的大门 ---------------- */

  const leafWidth = 2.05
  const leafHeight = 1.85
  for (const side of [1, -1]) {
    const hingeX = side * (ROAD_HALF + 0.25)
    const leaf = new THREE.Group()
    leaf.position.set(hingeX, 0, 0.4)
    leaf.rotation.y = -side * 1.15

    const leafParts: Parts = []
    const rail = 0.05
    pushBox(leafParts, rail, leafHeight, rail, 0, leafHeight / 2, 0)
    pushBox(leafParts, rail, leafHeight, rail, -side * leafWidth, leafHeight / 2, 0)
    pushBox(leafParts, leafWidth, rail, rail, (-side * leafWidth) / 2, leafHeight - rail / 2, 0)
    pushBox(leafParts, leafWidth, rail, rail, (-side * leafWidth) / 2, rail / 2, 0)
    pushBox(
      leafParts,
      Math.hypot(leafWidth, leafHeight * 0.8),
      0.035,
      0.035,
      (-side * leafWidth) / 2,
      leafHeight / 2,
      0,
      0,
      side * Math.atan2(leafHeight * 0.8, leafWidth),
    )
    const leafMesh = new THREE.Mesh(mergeGeometries(leafParts), greenMaterial)
    for (const geometry of leafParts) geometry.dispose()
    leaf.add(leafMesh)

    const meshPanel = new THREE.PlaneGeometry(leafWidth - 0.1, leafHeight - 0.1)
    meshPanel.translate((-side * leafWidth) / 2, leafHeight / 2, 0)
    disposables.push(meshPanel)
    leaf.add(new THREE.Mesh(meshPanel, meshMaterial))
    group.add(leaf)

    pushBox(greenParts, 0.12, leafHeight + 0.25, 0.12, hingeX, (leafHeight + 0.25) / 2, 0.4)
  }

  /* ---------------- 7. 门内的闸机（只铺两侧，中间留通道） ---------------- */

  const turnstileLanes = [2.45, 3.2, 3.95]
  for (const side of [1, -1]) {
    for (const laneX of turnstileLanes) {
      const x = side * laneX
      pushBox(silverParts, 0.3, 1.02, 0.17, x, 0.51, -1.4)
      pushBox(silverParts, 0.24, 0.06, 0.2, x, 1.05, -1.4)
      pushBox(greenParts, 0.2, 0.025, 0.14, x, 1.09, -1.35)
    }
    pushCylinder(silverParts, 0.022, 0.022, turnstileLanes[2] - turnstileLanes[0], side * 3.2, 0.48, -1.4, 'x', 8)
  }

  /* ---------------- 8. 两块牌子 ---------------- */

  const blueSign = new THREE.Mesh(
    new THREE.PlaneGeometry(1.0, 0.38),
    register(
      new THREE.MeshBasicMaterial({
        map: register(createSignTexture('#1867b5', '#ffffff', '安全提示')),
        toneMapped: false,
      }),
    ),
  )
  disposables.push(blueSign.geometry)
  blueSign.position.set(-(PIER_X + 1.35), 2.62, 0.1)
  group.add(blueSign)

  const redSign = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 0.34),
    register(
      new THREE.MeshBasicMaterial({
        map: register(createSignTexture('#8f1f14', '#ffd54a', '注意安全')),
        toneMapped: false,
      }),
    ),
  )
  disposables.push(redSign.geometry)
  redSign.position.set(PIER_X - 0.02, 3.05, 0.34)
  group.add(redSign)

  /* ---------------- 9. 起点线 ---------------- */

  const startLine = new THREE.Mesh(
    new THREE.PlaneGeometry(ROAD_HALF * 2, 0.9).rotateX(-Math.PI / 2),
    register(new THREE.MeshBasicMaterial({ map: register(createStartLineTexture()), toneMapped: false })),
  )
  disposables.push(startLine.geometry)
  startLine.position.set(0, 0.016, 1.8)
  group.add(startLine)

  /* ---------------- 合并静态件 ---------------- */

  const addMerged = (parts: Parts, material: THREE.Material): THREE.Mesh | null => {
    if (!parts.length) return null
    const geometry = mergeGeometries(parts)
    for (const part of parts) part.dispose()
    if (!geometry) return null
    disposables.push(geometry)
    const mesh = new THREE.Mesh(geometry, material)
    group.add(mesh)
    return mesh
  }
  addMerged(whiteParts, whiteMaterial)
  addMerged(greenParts, greenMaterial)
  addMerged(silverParts, silverMaterial)
  addMerged(meshParts, meshMaterial)
  const roofMesh = addMerged(roofParts, roofMaterial)

  /* ---------------- 每帧 ---------------- */

  let visible = true
  const update = (distance: number, quality: 'high' | 'low'): void => {
    const z = -(GATE_AT - distance)
    group.position.z = z
    const nextVisible = z < 34 && z > -80
    if (nextVisible !== visible) {
      visible = nextVisible
      group.visible = nextVisible
    }
    // 低画质省掉半透明顶棚，少一次混合与排序
    if (roofMesh) roofMesh.visible = quality === 'high'
  }

  return {
    group,
    update,
    dispose() {
      for (const item of disposables) item.dispose()
      group.clear()
    },
  }
}
