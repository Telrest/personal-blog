import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { createPenModel, PEN_WORLD_SCALE, type PenView } from './geometry'
import { PEN } from './model'

const initial: PenView = {
  x: 0, theta: 0, contact: 'collar', viewMode: 'exterior', explode: 0, selected: null, clipOpen: 0,
}

describe('按动笔的装配几何', () => {
  it.each([0, PEN.xExtended, PEN.xMax])('x=%s 时弹簧两端贴合支座，笔芯细颈穿过弹簧而非粗管', (x) => {
    const pen = createPenModel()
    try {
      pen.update({ ...initial, x })
      pen.root.updateMatrixWorld(true)
      const spring = pen.root.getObjectByName('return-spring') as THREE.Mesh
      const bounds = new THREE.Box3().setFromObject(spring)
      expect(bounds.min.z / PEN_WORLD_SCALE).toBeCloseTo(PEN.springFrontSeatZ, 4)
      expect(bounds.max.z / PEN_WORLD_SCALE).toBeCloseTo(PEN.springRearSeatZRetracted - x, 4)
      const probeZ = (PEN.springFrontSeatZ + PEN.springRearSeatZRetracted - x) / 2
      const ray = new THREE.Raycaster(new THREE.Vector3(1, 0, probeZ * PEN_WORLD_SCALE), new THREE.Vector3(-1, 0, 0))
      const shell = pen.root.getObjectByName('refill-shell')!
      const hits = ray.intersectObject(shell)
      expect(hits.length).toBeGreaterThan(0)
      const neckRadius = hits[0].point.x / PEN_WORLD_SCALE
      expect(neckRadius).toBeCloseTo(PEN.refillNeckDiameter / 2, 4)
      expect(neckRadius).toBeLessThan((PEN.springOuterDiameter - 2 * PEN.springWireDiameter) / 2)
    } finally { pen.dispose() }
  })

  it('弹簧压缩前后钢丝径向直径保持不变', () => {
    const pen = createPenModel()
    try {
      const spring = pen.root.getObjectByName('return-spring') as THREE.Mesh
      pen.update(initial)
      spring.geometry.computeBoundingBox()
      const before = spring.geometry.boundingBox!.getSize(new THREE.Vector3())
      pen.update({ ...initial, x: PEN.xMax })
      spring.geometry.computeBoundingBox()
      const after = spring.geometry.boundingBox!.getSize(new THREE.Vector3())
      expect(after.x).toBeCloseTo(before.x, 5)
      expect(after.z).toBeCloseTo(before.z, 5)
      expect(before.y - after.y).toBeCloseTo(PEN.xMax, 4)
    } finally { pen.dispose() }
  })

  it('选中前锥只高亮前锥；剖视打开握胶，拆解恢复完整零件', () => {
    const pen = createPenModel()
    try {
      pen.update({ ...initial, selected: 'cone', viewMode: 'cutaway' })
      const barrel = pen.root.getObjectByName('pen-barrel')!.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>
      const cone = pen.root.getObjectByName('pen-cone')!.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>
      const grip = pen.root.getObjectByName('pen-grip')!.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>
      expect(cone.material.emissiveIntensity).toBeGreaterThan(0)
      expect(barrel.material.emissiveIntensity).toBe(0)
      expect(grip.material.clippingPlanes).toHaveLength(1)
      pen.update({ ...initial, viewMode: 'exploded', explode: 1 })
      expect(grip.material.clippingPlanes).toBeNull()
      expect(barrel.visible).toBe(true)
      pen.root.updateMatrixWorld(true)
      const outer = new THREE.Box3().setFromObject(pen.root.getObjectByName('pen-grip')!)
      const inner = new THREE.Box3().setFromObject(pen.root.getObjectByName('refill-shell')!)
      expect(outer.intersectsBox(inner)).toBe(false)
    } finally { pen.dispose() }
  })

  it('弹簧与握胶三角面的朝向和外法线一致，避免正面被剔除', () => {
    const pen = createPenModel()
    try {
      const meshes = [pen.root.getObjectByName('return-spring'), pen.root.getObjectByName('pen-grip')!.children[0]] as THREE.Mesh[]
      for (const mesh of meshes) {
        const p = mesh.geometry.attributes.position, n = mesh.geometry.attributes.normal, index = mesh.geometry.index!
        for (let i = 0; i < index.count; i += 93) {
          const a = index.getX(i), b = index.getX(i + 1), c = index.getX(i + 2)
          const va = new THREE.Vector3().fromBufferAttribute(p, a)
          const face = new THREE.Vector3().fromBufferAttribute(p, b).sub(va)
            .cross(new THREE.Vector3().fromBufferAttribute(p, c).sub(va))
          expect(face.dot(new THREE.Vector3().fromBufferAttribute(n, a))).toBeGreaterThanOrEqual(-1e-8)
        }
      }
    } finally { pen.dispose() }
  })
})
