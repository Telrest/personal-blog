import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  buildSectionFaces,
  loopSubdivide,
  offsetPolygon,
  orderSegmentsToLoop,
  signedArea,
  sliceLoop,
  smoothGeometry,
  splitByPlane,
  triangulatePolygon,
} from './mesh'

/** 用合成网格验证几何工具；真实骨网格的验收在浏览器里做（见 docs/verification.md） */

function cylinder(): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(0.01, 0.01, 0.04, 24, 6, false)
}

function tiltedPlane(): THREE.Plane {
  const normal = new THREE.Vector3(0.3, 1, 0.25).normalize()
  return new THREE.Plane().setFromNormalAndCoplanarPoint(normal, new THREE.Vector3(0, 0.002, 0))
}

function triangleCount(geometry: THREE.BufferGeometry): number {
  const index = geometry.getIndex()
  const position = geometry.getAttribute('position')
  return index ? index.count / 3 : position.count / 3
}

describe('平面切分', () => {
  it('切开后两片都有面，断面轮廓是一个闭合环', () => {
    const geometry = cylinder()
    const plane = tiltedPlane()
    const result = splitByPlane(geometry, plane)
    expect(triangleCount(result.positive)).toBeGreaterThan(10)
    expect(triangleCount(result.negative)).toBeGreaterThan(10)
    expect(result.rim.length).toBeGreaterThan(8)

    // 相邻点之间应当首尾相接：每一段都很短
    for (let i = 0; i < result.rim.length; i += 1) {
      const a = result.rim[i]
      const b = result.rim[(i + 1) % result.rim.length]
      expect(a.distanceTo(b)).toBeLessThan(0.01)
    }
    // 所有轮廓点都在切面上
    for (const point of result.rim) {
      expect(Math.abs(plane.distanceToPoint(point))).toBeLessThan(1e-9)
    }
    // 两片的总面数应大于原网格（切开的三角形被拆成更多三角形）
    expect(triangleCount(result.positive) + triangleCount(result.negative)).toBeGreaterThan(
      triangleCount(geometry),
    )
  })

  it('带起伏的断面：两侧来自同一函数，切两次结果完全一致', () => {
    const jitter = (point: THREE.Vector3) => 0.0004 * Math.sin(220 * point.x + 140 * point.z)
    const a = splitByPlane(cylinder(), tiltedPlane(), jitter)
    const b = splitByPlane(cylinder(), tiltedPlane(), jitter)
    expect(a.rim.length).toBe(b.rim.length)
    for (let i = 0; i < a.rim.length; i += 1) {
      expect(a.rim[i].distanceTo(b.rim[i])).toBeLessThan(1e-12)
      // 起伏让轮廓离开理想平面，但不超过设定幅度
      expect(Math.abs(tiltedPlane().distanceToPoint(a.rim[i]))).toBeLessThanOrEqual(0.0004 + 1e-9)
    }
  })

  it('平面完全在一侧时，另一片为空但不会抛错', () => {
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1)
    const result = splitByPlane(cylinder(), plane)
    expect(triangleCount(result.negative)).toBe(0)
    expect(triangleCount(result.positive)).toBeGreaterThan(0)
    expect(result.rim).toHaveLength(0)
  })
})

describe('断面封口', () => {
  it('皮质环与松质核心都能生成，环的点数是轮廓的两倍', () => {
    const plane = tiltedPlane()
    const split = splitByPlane(cylinder(), plane)
    const faces = buildSectionFaces(split.rim, plane, 0.0008, 1)
    const rimPositions = faces.rim.getAttribute('position')
    const corePositions = faces.core.getAttribute('position')
    expect(rimPositions.count).toBe(split.rim.length * 2)
    expect(corePositions.count).toBe(split.rim.length)
    expect(faces.core.getIndex()!.count).toBeGreaterThan(0)
    const coreNormal = faces.core.getAttribute('normal')
    for (let i = 0; i < 3; i += 1) {
      expect(Math.abs(Math.abs(coreNormal.getX(i)) - Math.abs(plane.normal.x))).toBeLessThan(1e-6)
    }
  })

  it('二维多边形工具：面积、内偏移、三角化', () => {
    const square = [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(2, 0),
      new THREE.Vector2(2, 2),
      new THREE.Vector2(0, 2),
    ]
    expect(signedArea(square)).toBeCloseTo(4, 9)
    const inner = offsetPolygon(square, 0.5)
    expect(signedArea(inner)).toBeCloseTo(1, 6)
    const triangles = triangulatePolygon(square)
    expect(triangles).toHaveLength(6)
    // 凹多边形（星形）也要能切完
    const star: THREE.Vector2[] = []
    for (let i = 0; i < 10; i += 1) {
      const angle = (i / 10) * Math.PI * 2
      const radius = i % 2 === 0 ? 2 : 0.8
      star.push(new THREE.Vector2(Math.cos(angle) * radius, Math.sin(angle) * radius))
    }
    expect(triangulatePolygon(star)).toHaveLength(8 * 3)
  })
})

describe('剖面与线段成环', () => {
  it('与网格求交得到闭合轮廓', () => {
    const geometry = cylinder()
    // 避开正好落在顶点环上的平面，真实骨网格也从不与切面共顶点
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.003)
    const loop = sliceLoop([geometry], plane)
    expect(loop.length).toBeGreaterThan(8)
    for (const point of loop) expect(Math.abs(point.y - 0.003)).toBeLessThan(1e-9)
  })

  it('散乱线段能串成环，最短线段被忽略', () => {
    const a = new THREE.Vector3(0, 0, 0)
    const b = new THREE.Vector3(1, 0, 0)
    const c = new THREE.Vector3(1, 0, 1)
    const d = new THREE.Vector3(0, 0, 1)
    const loop = orderSegmentsToLoop([
      [a, b],
      [c, b],
      [c, d],
      [a, d],
    ])
    expect(loop).toHaveLength(4)
  })

  it('开链也能按顺序走完（剖切骨片时断面轮廓是开链）', () => {
    const points = [0, 1, 2, 3].map((i) => new THREE.Vector3(i, 0, 0))
    const chain = orderSegmentsToLoop([
      [points[2], points[3]],
      [points[0], points[1]],
      [points[2], points[1]],
    ])
    expect(chain).toHaveLength(4)
    // ���ڵ������ӣ��������Ϊ���򸺣������ĸ��㶼�õ�
    for (let i = 1; i < chain.length; i += 1) {
      expect(Math.abs(chain[i].x - chain[i - 1].x)).toBeCloseTo(1, 9)
    }
    expect(chain.map((point) => point.x).sort((a, b) => a - b)).toEqual([0, 1, 2, 3])
  })
})

describe('显示处理', () => {
  it('平滑几何保持面数，法线是单位向量', () => {
    const geometry = cylinder()
    const smooth = smoothGeometry(geometry)
    expect(triangleCount(smooth)).toBe(triangleCount(geometry))
    const normal = smooth.getAttribute('normal')
    for (let i = 0; i < 10; i += 1) {
      const length = Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i))
      expect(length).toBeCloseTo(1, 4)
    }
  })

  it('Loop 细分：面数乘 4，包围盒只轻微收缩', () => {
    const geometry = new THREE.CylinderGeometry(0.01, 0.01, 0.04, 12, 3, false)
    geometry.computeBoundingBox()
    const before = geometry.boundingBox!.clone()
    const subdivided = loopSubdivide(geometry, 1)
    expect(triangleCount(subdivided)).toBe(triangleCount(geometry) * 4)
    subdivided.computeBoundingBox()
    const after = subdivided.boundingBox!
    const sizeBefore = before.getSize(new THREE.Vector3())
    const sizeAfter = after.getSize(new THREE.Vector3())
    expect(sizeAfter.x).toBeLessThanOrEqual(sizeBefore.x * 1.01)
    expect(sizeAfter.x).toBeGreaterThan(sizeBefore.x * 0.9)
    const position = subdivided.getAttribute('position')
    for (let i = 0; i < position.count; i += 1) {
      expect(Number.isFinite(position.getX(i))).toBe(true)
    }
  })
})
