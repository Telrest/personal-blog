/**
 * 几何工具：把现成骨网格切成教学用的两片、生成断面封口与剖切面。
 *
 * 全部是纯几何（只依赖 three 的数学与 BufferGeometry），不读写展品状态。
 * 单位跟随输入：现成足骨模型是米，所以这里所有长度参数也用米。
 *
 * 两条保证：
 *  - 两片来自同一张网格、同一个平面、同一条起伏函数，因此零位移时断面贴合；
 *  - 起伏只由位置决定（固定种子），不会每帧变化。
 */

import * as THREE from 'three'

const EPS = 1e-9

/* ---------------------------------------------------------------- 基础 */

export interface MeshInfo {
  geometry: THREE.BufferGeometry
  center: THREE.Vector3
  /** 局部包围盒（米） */
  size: THREE.Vector3
}

/** 复制一份几何，合并完全重合的顶点并重算法线（平滑着色） */
export function smoothGeometry(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const base = geometry.clone()
  base.deleteAttribute('normal')
  const merged = mergeVertices(base, 1e-7)
  const out = new THREE.BufferGeometry()
  if (merged.index) out.setIndex(merged.index.clone())
  out.setAttribute('position', merged.getAttribute('position').clone())
  if (merged.getAttribute('uv')) out.setAttribute('uv', merged.getAttribute('uv').clone())
  out.computeVertexNormals()
  out.computeBoundingSphere()
  out.computeBoundingBox()
  base.dispose()
  merged.dispose()
  return out
}

/**
 * 按位置合并重复顶点（保留索引），用于把导出时拆开的顶点重新连起来。
 * 输入如果不是索引几何，也先转成索引。
 */
export function mergeVertices(geometry: THREE.BufferGeometry, tolerance: number): THREE.BufferGeometry {
  const pos = geometry.getAttribute('position')
  const index = geometry.getIndex()
  const map = new Map<string, number>()
  const positions: number[] = []
  const uvs: number[] = []
  const uv = geometry.getAttribute('uv')
  const oldToNew = new Map<number, number>()
  const quant = 1 / tolerance

  const keyOf = (x: number, y: number, z: number) =>
    `${Math.round(x * quant)}|${Math.round(y * quant)}|${Math.round(z * quant)}`

  const count = index ? index.count : pos.count
  const newIndex: number[] = []
  for (let i = 0; i < count; i += 1) {
    const src = index ? index.getX(i) : i
    let mapped = oldToNew.get(src)
    if (mapped === undefined) {
      const x = pos.getX(src)
      const y = pos.getY(src)
      const z = pos.getZ(src)
      const key = keyOf(x, y, z)
      const found = map.get(key)
      if (found === undefined) {
        mapped = positions.length / 3
        positions.push(x, y, z)
        if (uv) uvs.push(uv.getX(src), uv.getY(src))
        map.set(key, mapped)
      } else {
        mapped = found
      }
      oldToNew.set(src, mapped)
    }
    newIndex.push(mapped)
  }

  const out = new THREE.BufferGeometry()
  out.setIndex(newIndex)
  out.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  if (uv) out.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  return out
}

/* ---------------------------------------------------------------- 细分 */

/**
 * Loop 细分（闭合网格）。只用于目标骨：源数据是减面版本，
 * 细分一级让关节端轮廓与断面看不出一块块三角面；不改变解剖比例。
 */
export function loopSubdivide(geometry: THREE.BufferGeometry, levels = 1): THREE.BufferGeometry {
  // 先按位置合并：导出格式常把接缝拆成重复顶点，不合并会把拓扑弄成破口
  let current = mergeVertices(geometry, 1e-7)
  for (let level = 0; level < levels; level += 1) { const previous = current; current = loopOnce(current); previous.dispose() }
  current.computeVertexNormals()
  current.computeBoundingSphere()
  return current
}

function loopOnce(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const pos = geometry.getAttribute('position')
  const index = geometry.getIndex()
  if (!index) throw new Error('Loop 细分需要索引几何')
  const vertexCount = pos.count
  const faces = index.count / 3

  // 邻接：每个顶点相邻顶点集合、每个面
  const neighbors: Set<number>[] = Array.from({ length: vertexCount }, () => new Set<number>())
  const faceNeighbors: number[][] = []
  const edgeKey = (a: number, b: number) => (a < b ? `${a}_${b}` : `${b}_${a}`)
  const edgeFaces = new Map<string, number[]>()

  for (let f = 0; f < faces; f += 1) {
    const a = index.getX(f * 3)
    const b = index.getX(f * 3 + 1)
    const c = index.getX(f * 3 + 2)
    const tri = [a, b, c]
    for (let i = 0; i < 3; i += 1) {
      const v = tri[i]
      const w = tri[(i + 1) % 3]
      neighbors[v].add(w)
      neighbors[w].add(v)
      const key = edgeKey(v, w)
      const list = edgeFaces.get(key)
      if (list) list.push(f)
      else edgeFaces.set(key, [f])
    }
    faceNeighbors.push(tri)
  }

  const positions: number[] = new Array(vertexCount * 3)
  for (let v = 0; v < vertexCount; v += 1) {
    const n = neighbors[v].size
    const px = pos.getX(v)
    const py = pos.getY(v)
    const pz = pos.getZ(v)
    if (n === 0) {
      positions[v * 3] = px
      positions[v * 3 + 1] = py
      positions[v * 3 + 2] = pz
      continue
    }
    let beta: number
    if (n === 3) beta = 3 / 16
    else beta = (1 / n) * (5 / 8 - Math.pow(3 / 8 + (1 / 4) * Math.cos((2 * Math.PI) / n), 2))
    let sx = 0
    let sy = 0
    let sz = 0
    for (const w of neighbors[v]) {
      sx += pos.getX(w)
      sy += pos.getY(w)
      sz += pos.getZ(w)
    }
    positions[v * 3] = px * (1 - n * beta) + sx * beta
    positions[v * 3 + 1] = py * (1 - n * beta) + sy * beta
    positions[v * 3 + 2] = pz * (1 - n * beta) + sz * beta
  }

  // 每条边生成一个新顶点
  const edgeVertex = new Map<string, number>()
  const extraPositions: number[] = []
  const addEdgeVertex = (a: number, b: number, opposite: number[]) => {
    const key = edgeKey(a, b)
    const existing = edgeVertex.get(key)
    if (existing !== undefined) return existing
    const oppositeVertices = opposite.length === 2 ? opposite : opposite
    let nx = 0
    let ny = 0
    let nz = 0
    if (oppositeVertices.length === 2) {
      for (const v of oppositeVertices) {
        nx += pos.getX(v)
        ny += pos.getY(v)
        nz += pos.getZ(v)
      }
      // Loop 规则：新边点 = 3/8(a+b) + 1/8(c+d)
      nx = (3 / 8) * (pos.getX(a) + pos.getX(b)) + (1 / 8) * nx
      ny = (3 / 8) * (pos.getY(a) + pos.getY(b)) + (1 / 8) * ny
      nz = (3 / 8) * (pos.getZ(a) + pos.getZ(b)) + (1 / 8) * nz
    } else {
      nx = (pos.getX(a) + pos.getX(b)) / 2
      ny = (pos.getY(a) + pos.getY(b)) / 2
      nz = (pos.getZ(a) + pos.getZ(b)) / 2
    }
    const id = vertexCount + extraPositions.length / 3
    extraPositions.push(nx, ny, nz)
    edgeVertex.set(key, id)
    return id
  }

  for (const [key, faceList] of edgeFaces) {
    const [a, b] = key.split('_').map(Number)
    if (faceList.length === 2) {
      const f0 = faceNeighbors[faceList[0]]
      const f1 = faceNeighbors[faceList[1]]
      const opp0 = f0.find((v) => v !== a && v !== b)
      const opp1 = f1.find((v) => v !== a && v !== b)
      addEdgeVertex(a, b, [opp0!, opp1!])
    } else {
      addEdgeVertex(a, b, [])
    }
  }

  const newIndex: number[] = []
  for (let f = 0; f < faces; f += 1) {
    const a = index.getX(f * 3)
    const b = index.getX(f * 3 + 1)
    const c = index.getX(f * 3 + 2)
    const ab = edgeVertex.get(edgeKey(a, b))!
    const bc = edgeVertex.get(edgeKey(b, c))!
    const ca = edgeVertex.get(edgeKey(c, a))!
    newIndex.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca)
  }

  const out = new THREE.BufferGeometry()
  out.setIndex(newIndex)
  out.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([...positions, ...extraPositions], 3),
  )
  return out
}

/* ---------------------------------------------------------------- 断面 */

/** 平面上的二维坐标基（保证右手系，法线朝外） */
export function planeBasis(normal: THREE.Vector3): { u: THREE.Vector3; v: THREE.Vector3 } {
  const n = normal.clone().normalize()
  const helper = Math.abs(n.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0)
  const u = new THREE.Vector3().crossVectors(helper, n).normalize()
  const v = new THREE.Vector3().crossVectors(n, u).normalize()
  return { u, v }
}

/** 把一串三维点按平面投影成二维（保持环的顺序） */
export function projectToPlane(
  points: THREE.Vector3[],
  plane: THREE.Plane,
): { basis: { u: THREE.Vector3; v: THREE.Vector3 }; points2d: THREE.Vector2[] } {
  const basis = planeBasis(plane.normal)
  const points2d = points.map((point) => new THREE.Vector2(point.dot(basis.u), point.dot(basis.v)))
  return { basis, points2d }
}

/** 二维多边形有向面积（> 0 为逆时针） */
export function signedArea(points: THREE.Vector2[]): number {
  let area = 0
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    area += a.x * b.y - b.x * a.y
  }
  return area / 2
}

/** 沿边界向内偏移（同顶点数，用于皮质环） */
export function offsetPolygon(points: THREE.Vector2[], distance: number): THREE.Vector2[] {
  const n = points.length
  const ccw = signedArea(points) > 0
  const result: THREE.Vector2[] = []
  for (let i = 0; i < n; i += 1) {
    const prev = points[(i - 1 + n) % n]
    const current = points[i]
    const next = points[(i + 1) % n]
    const e1 = new THREE.Vector2().subVectors(current, prev)
    const e2 = new THREE.Vector2().subVectors(next, current)
    if (e1.lengthSq() < 1e-18 || e2.lengthSq() < 1e-18) {
      result.push(current.clone())
      continue
    }
    e1.normalize()
    e2.normalize()
    // 逆时针多边形的内法线在边的左侧
    const n1 = ccw ? new THREE.Vector2(-e1.y, e1.x) : new THREE.Vector2(e1.y, -e1.x)
    const n2 = ccw ? new THREE.Vector2(-e2.y, e2.x) : new THREE.Vector2(e2.y, -e2.x)
    const bisector = new THREE.Vector2(n1.x + n2.x, n1.y + n2.y)
    if (bisector.lengthSq() < 1e-12) {
      result.push(current.clone().addScaledVector(n1, distance))
      continue
    }
    bisector.normalize()
    const cos = Math.max(0.35, bisector.dot(n1))
    result.push(current.clone().addScaledVector(bisector, distance / cos))
  }
  return result
}

/** 使用成熟的 Earcut 三角化完整凹轮廓，避免失败后只封住一部分。 */
export function triangulatePolygon(points: THREE.Vector2[]): number[] {
  return THREE.ShapeUtils.triangulateShape(points.map((p) => p.clone()), []).flat()
}

/** 把平面环变成有厚度的断面：皮质环 + 松质核心（两组顶点与索引） */
export interface SectionFaces {
  /** 皮质环（贴边），返回几何与二维 uv 缩放后的坐标 */
  rim: THREE.BufferGeometry
  /** 松质核心 */
  core: THREE.BufferGeometry
}

/**
 * 断面封口。
 * @param loop 已起伏的断面轮廓（三维点，首尾相接）
 * @param plane 断面所在平面
 * @param rimWidth 皮质环宽度（米）
 * @param uvScale 松质纹理的 uv 缩放（1/米）
 */
export function buildSectionFaces(
  loop: THREE.Vector3[],
  plane: THREE.Plane,
  rimWidth: number,
  uvScale: number,
): SectionFaces {
  const { basis, points2d } = projectToPlane(loop, plane)
  const ccw = signedArea(points2d) > 0
  if (!ccw) {
    points2d.reverse()
    loop = [...loop].reverse()
  }
  const inner2d = offsetPolygon(points2d, Math.max(rimWidth, 1e-5))
  const normal = plane.normal.clone().normalize()

  const to3d = (point: THREE.Vector2) =>
    new THREE.Vector3()
      .addScaledVector(basis.u, point.x)
      .addScaledVector(basis.v, point.y)
      .addScaledVector(normal, loop[0].dot(normal))

  // 皮质环：外圈 ↔ 内圈 的四边形带
  const rimPositions: number[] = []
  const rimUvs: number[] = []
  const rimIndices: number[] = []
  const outerCount = points2d.length
  for (let i = 0; i < outerCount; i += 1) {
    const outer = loop[i].clone()
    const inner = to3d(inner2d[i])
    rimPositions.push(outer.x, outer.y, outer.z, inner.x, inner.y, inner.z)
    rimUvs.push(points2d[i].x * uvScale, points2d[i].y * uvScale)
    rimUvs.push(inner2d[i].x * uvScale, inner2d[i].y * uvScale)
  }
  for (let i = 0; i < outerCount; i += 1) {
    const a = i * 2
    const b = ((i + 1) % outerCount) * 2
    rimIndices.push(a, b, a + 1, a + 1, b, b + 1)
  }

  const rimGeometry = new THREE.BufferGeometry()
  rimGeometry.setAttribute('position', new THREE.Float32BufferAttribute(rimPositions, 3))
  rimGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(rimUvs, 2))
  rimGeometry.setIndex(rimIndices)
  rimGeometry.computeVertexNormals()

  // 松质核心：三角化内圈
  const triangles = triangulatePolygon(inner2d)
  const corePositions: number[] = []
  const coreUvs: number[] = []
  for (let i = 0; i < inner2d.length; i += 1) {
    const p = to3d(inner2d[i])
    corePositions.push(p.x, p.y, p.z)
    coreUvs.push(inner2d[i].x * uvScale, inner2d[i].y * uvScale)
  }
  const coreGeometry = new THREE.BufferGeometry()
  coreGeometry.setAttribute('position', new THREE.Float32BufferAttribute(corePositions, 3))
  coreGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(coreUvs, 2))
  coreGeometry.setIndex(triangles)
  coreGeometry.computeVertexNormals()
  // 法线统一压到平面法线上，避免耳切出来的朝向不一致
  const coreNormal = coreGeometry.getAttribute('normal') as THREE.BufferAttribute
  for (let i = 0; i < coreNormal.count; i += 1) coreNormal.setXYZ(i, normal.x, normal.y, normal.z)
  coreNormal.needsUpdate = true

  return { rim: rimGeometry, core: coreGeometry }
}

/* ---------------------------------------------------------------- 切分 */

interface SplitVertex {
  position: THREE.Vector3
  normal: THREE.Vector3
  distance: number
}

export interface SplitResult {
  /** 法线正侧（远端片段） */
  positive: THREE.BufferGeometry
  /** 法线负侧（基底片段） */
  negative: THREE.BufferGeometry
  /** 断面轮廓（三维点，已应用起伏，顺序为环） */
  rim: THREE.Vector3[]
}

/**
 * 用平面把一张闭合网格切成两片，两片都带同一份断面轮廓。
 *
 * @param jitter 断面起伏（输入平面上的点，返回沿法线的位移，米）
 */
export function splitByPlane(
  geometry: THREE.BufferGeometry,
  plane: THREE.Plane,
  jitter?: (point: THREE.Vector3) => number,
): SplitResult {
  const pos = geometry.getAttribute('position')
  const nor = geometry.getAttribute('normal')
  const index = geometry.getIndex()
  const triangleCount = index ? index.count / 3 : pos.count / 3

  const positive: number[] = []
  const negative: number[] = []
  const segments: Array<[THREE.Vector3, THREE.Vector3]> = []
  const normal = plane.normal.clone().normalize()

  const read = (id: number): SplitVertex => ({
    position: new THREE.Vector3(pos.getX(id), pos.getY(id), pos.getZ(id)),
    normal: nor
      ? new THREE.Vector3(nor.getX(id), nor.getY(id), nor.getZ(id)).normalize()
      : new THREE.Vector3(0, 0, 1),
    distance: 0,
  })

  const pushTriangle = (target: number[], a: SplitVertex, b: SplitVertex, c: SplitVertex) => {
    for (const vertex of [a, b, c]) {
      target.push(vertex.position.x, vertex.position.y, vertex.position.z)
      target.push(vertex.normal.x, vertex.normal.y, vertex.normal.z)
    }
  }

  for (let f = 0; f < triangleCount; f += 1) {
    const ids = index
      ? [index.getX(f * 3), index.getX(f * 3 + 1), index.getX(f * 3 + 2)]
      : [f * 3, f * 3 + 1, f * 3 + 2]
    const vertices = ids.map(read)
    for (const vertex of vertices) vertex.distance = plane.distanceToPoint(vertex.position)

    const positiveCount = vertices.filter((vertex) => vertex.distance >= -EPS).length
    const negativeCount = vertices.filter((vertex) => vertex.distance <= EPS).length
    if (positiveCount === 3) {
      pushTriangle(positive, vertices[0], vertices[1], vertices[2])
      continue
    }
    if (negativeCount === 3) {
      pushTriangle(negative, vertices[0], vertices[1], vertices[2])
      continue
    }

    const positivePolygon: SplitVertex[] = []
    const negativePolygon: SplitVertex[] = []
    const crossings: SplitVertex[] = []
    for (let i = 0; i < 3; i += 1) {
      const current = vertices[i]
      const next = vertices[(i + 1) % 3]
      if (current.distance >= -EPS) positivePolygon.push(current)
      if (current.distance <= EPS) negativePolygon.push(current)
      const crossing =
        (current.distance > EPS && next.distance < -EPS) ||
        (current.distance < -EPS && next.distance > EPS)
      if (!crossing) continue
      const t = current.distance / (current.distance - next.distance)
      const position = new THREE.Vector3().lerpVectors(current.position, next.position, t)
      if (jitter) position.addScaledVector(normal, jitter(position))
      const vertex: SplitVertex = {
        position,
        normal: new THREE.Vector3().lerpVectors(current.normal, next.normal, t).normalize(),
        distance: 0,
      }
      positivePolygon.push(vertex)
      negativePolygon.push(vertex)
      crossings.push(vertex)
    }
    const addFan = (target: number[], polygon: SplitVertex[]) => {
      for (let i = 1; i + 1 < polygon.length; i += 1) {
        pushTriangle(target, polygon[0], polygon[i], polygon[i + 1])
      }
    }
    addFan(positive, positivePolygon)
    addFan(negative, negativePolygon)
    if (crossings.length === 2) segments.push([crossings[0].position, crossings[1].position])
  }

  const rim = orderSegmentsToLoop(segments)
  return {
    positive: buildSplitGeometry(positive),
    negative: buildSplitGeometry(negative),
    rim,
  }
}

function buildSplitGeometry(values: number[]): THREE.BufferGeometry {
  const positions: number[] = []
  const normals: number[] = []
  for (let i = 0; i < values.length; i += 6) {
    positions.push(values[i], values[i + 1], values[i + 2])
    normals.push(values[i + 3], values[i + 4], values[i + 5])
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geometry.computeBoundingSphere()
  return geometry
}

/** 用平面与一组网格求交，返回最长的闭合轮廓（用于剖切面） */
export function sliceLoop(geometries: THREE.BufferGeometry[], plane: THREE.Plane): THREE.Vector3[] {
  const segments: Array<[THREE.Vector3, THREE.Vector3]> = []
  for (const geometry of geometries) {
    const pos = geometry.getAttribute('position')
    const index = geometry.getIndex()
    const triangleCount = index ? index.count / 3 : pos.count / 3
    for (let f = 0; f < triangleCount; f += 1) {
      const ids = index
        ? [index.getX(f * 3), index.getX(f * 3 + 1), index.getX(f * 3 + 2)]
        : [f * 3, f * 3 + 1, f * 3 + 2]
      const points = ids.map((id) => new THREE.Vector3(pos.getX(id), pos.getY(id), pos.getZ(id)))
      const distances = points.map((point) => plane.distanceToPoint(point))
      const crossings: THREE.Vector3[] = []
      for (let i = 0; i < 3; i += 1) {
        const d0 = distances[i]
        const d1 = distances[(i + 1) % 3]
        if ((d0 > EPS && d1 < -EPS) || (d0 < -EPS && d1 > EPS)) {
          const t = d0 / (d0 - d1)
          crossings.push(new THREE.Vector3().lerpVectors(points[i], points[(i + 1) % 3], t))
        }
      }
      if (crossings.length === 2) segments.push([crossings[0], crossings[1]])
    }
  }
  return orderSegmentsToLoop(segments)
}

/** 把散乱线段串成闭合环（取点数最多的一条） */
export function orderSegmentsToLoop(segments: Array<[THREE.Vector3, THREE.Vector3]>): THREE.Vector3[] {
  if (segments.length === 0) return []
  const quant = 1e6
  const keyOf = (point: THREE.Vector3) =>
    `${Math.round(point.x * quant)}|${Math.round(point.y * quant)}|${Math.round(point.z * quant)}`

  const adjacency = new Map<string, Array<{ key: string; point: THREE.Vector3 }>>()
  const points = new Map<string, THREE.Vector3>()
  for (const [a, b] of segments) {
    const ka = keyOf(a)
    const kb = keyOf(b)
    if (ka === kb) continue
    points.set(ka, a)
    points.set(kb, b)
    if (!adjacency.has(ka)) adjacency.set(ka, [])
    if (!adjacency.has(kb)) adjacency.set(kb, [])
    adjacency.get(ka)!.push({ key: kb, point: b })
    adjacency.get(kb)!.push({ key: ka, point: a })
  }

  const visited = new Set<string>()
  let best: THREE.Vector3[] = []
  const keys = [...adjacency.keys()]
  // 先走端点（度为 1 的顶点）：开链（例如骨片被纵向剖开时）也能整条走完
  const orderedStarts = [
    ...keys.filter((key) => (adjacency.get(key) ?? []).length === 1),
    ...keys,
  ]
  for (const startKey of orderedStarts) {
    if (visited.has(startKey)) continue
    const chain: string[] = []
    let current: string | null = startKey
    while (current !== null && !visited.has(current)) {
      const node: string = current
      visited.add(node)
      chain.push(node)
      const options: Array<{ key: string; point: THREE.Vector3 }> = adjacency.get(node) ?? []
      const next = options.find((option) => !visited.has(option.key))
      current = next ? next.key : null
    }
    if (chain.length > best.length) best = chain.map((key) => points.get(key)!.clone())
  }
  return best
}

/** 断面封口：由轮廓直接生成皮质环 + 松质核心 */
export function buildSectionFromLoop(
  loop: THREE.Vector3[],
  plane: THREE.Plane,
  rimWidth: number,
  uvScale: number,
): SectionFaces | null {
  if (loop.length < 6) return null
  return buildSectionFaces(loop, plane, rimWidth, uvScale)
}

/* ---------------------------------------------------------------- 杂项 */

/** 一组网格在世界（或给定父级局部）坐标里的包围盒 */
export function boundsOf(objects: THREE.Object3D[]): THREE.Box3 {
  const box = new THREE.Box3()
  for (const object of objects) {
    object.updateMatrixWorld(true)
    box.expandByObject(object)
  }
  return box
}
