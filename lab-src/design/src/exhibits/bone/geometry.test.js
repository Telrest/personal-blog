import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { createBoneModelFromScene } from './geometry'
import { DEFAULT_POSE, FOOT_MODEL, TARGET_HINT, ZERO_POSE } from './model'
import { INITIAL_STATE } from './state'
import { boneFieldOfView, fitBoneView } from './view'

const models = []
afterEach(() => models.splice(0).forEach((model) => model.dispose()))
async function model() {
  const bytes = readFileSync(new URL('./assets/right-foot-26-bones.glb', import.meta.url))
  const scene = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')
  const result = createBoneModelFromScene(scene.scene)
  scene.scene.traverse((node) => {
    if (node.isMesh) { node.geometry.dispose(); node.material.dispose() }
  })
  models.push(result)
  return result
}
const view = (patch = {}) => ({ ...structuredClone(INITIAL_STATE), repair: { progress: 0, cutaway: false }, ...patch })
function visible(node) {
  for (let parent = node; parent; parent = parent.parent) if (!parent.visible) return false
  return true
}
function bones(result) {
  const ids = new Set()
  result.root.traverse((node) => {
    if (node.isMesh && node.userData.boneId?.startsWith('FMA') && visible(node)) ids.add(node.userData.boneId)
  })
  return ids
}

describe('真实右足资源的装配回归', () => {
  it('完整对照保留全部 26 块骨；后两节不再随隐藏骨折组消失', async () => {
    const result = await model(); result.update(view())
    expect(bones(result).size).toBe(26)
    expect(bones(result).has(FOOT_MODEL.fifthMiddleFma)).toBe(true)
    expect(bones(result).has(FOOT_MODEL.fifthDistalFma)).toBe(true)
  })
  it('完整/骨折和三页签来回切换后，第五趾列始终完整', async () => {
    const result = await model()
    for (const tab of ['load', 'repair', 'structure', 'load', 'structure']) for (const fractured of [true, false]) {
      result.update(view({ tab, structure: { ...INITIAL_STATE.structure, fractured, isolate: true }, load: { ...INITIAL_STATE.load, fractured } }))
      expect([...bones(result)].sort()).toEqual([FOOT_MODEL.targetFma, FOOT_MODEL.fifthMetatarsalFma, FOOT_MODEL.fifthMiddleFma, FOOT_MODEL.fifthDistalFma].sort())
    }
  })
  it('剖切平面随各自片段移动；选中后仍使用同一剖切关系', async () => {
    const result = await model()
    result.update(view({ structure: { ...INITIAL_STATE.structure, fractured: true, cutaway: true, selected: FOOT_MODEL.targetFma, pose: { gap: 2.5, offset: 3, angulation: -15 } } }))
    for (const name of ['target-proximal', 'target-distal']) {
      const mesh = result.root.getObjectByName(name)
      expect(mesh.material.clippingPlanes).toHaveLength(1)
      const local = mesh.material.clippingPlanes[0].clone().applyMatrix4(mesh.matrixWorld.clone().invert())
      const axis = new THREE.Vector3(...TARGET_HINT.axis)
      const up = new THREE.Vector3(0, 1, 0).addScaledVector(axis, -axis.y).normalize().negate()
      expect(local.normal.distanceTo(up)).toBeLessThan(1e-8)
      const cap = mesh.parent.children.find((child) => child.name.startsWith('section-') && child.name.endsWith('core'))
      const pos = cap.geometry.getAttribute('position')
      for (let i = 0; i < pos.count; i++) expect(Math.abs(local.distanceToPoint(new THREE.Vector3().fromBufferAttribute(pos, i)))).toBeLessThan(1e-8)
    }
    result.update(view())
    expect(result.root.getObjectByName('target-intact').material.clippingPlanes).toBeNull()
  })
  it('完整骨轴向载荷确实作用于可见骨；零载荷恢复，标签跟随断端', async () => {
    const result = await model()
    result.update(view({ tab: 'load', load: { ...INITIAL_STATE.load, load: 0 } }))
    const zero = result.anchor('pp5-head')
    result.update(view({ tab: 'load', load: { ...INITIAL_STATE.load, load: 1 } }))
    expect(result.anchor('pp5-head').distanceTo(zero)).toBeGreaterThan(0.0002)
    result.update(view({ structure: { ...INITIAL_STATE.structure, fractured: true, pose: DEFAULT_POSE } }))
    const displaced = result.anchor('mp5')
    result.update(view({ structure: { ...INITIAL_STATE.structure, fractured: true, pose: ZERO_POSE } }))
    expect(result.anchor('mp5').distanceTo(displaced)).toBeGreaterThan(0.001)
  })
  it('关闭剖切后无残留，骨痂、断面和包围盒始终为有限数值', async () => {
    const result = await model()
    for (const progress of [0, .2, .34, .64, .9, 1]) {
      result.update(view({ tab: 'repair', repair: { progress, cutaway: true } }))
      result.root.traverse((node) => {
        if (!node.isMesh || !visible(node)) return
        expect([...node.geometry.getAttribute('position').array].every(Number.isFinite)).toBe(true)
      })
    }
    result.update(view({ tab: 'repair', repair: { progress: .64, cutaway: false } }))
    expect(result.root.getObjectByName('target-distal').material.clippingPlanes).toBeNull()
    expect(result.bounds('toe').isEmpty()).toBe(false)
  })
  it('真实趾列在最大断端姿态、桌面和窄屏下仍完整入镜', async () => {
    const result = await model(), bounds = result.bounds('toe')
    const pose = fitBoneView(bounds.min.toArray(), bounds.max.toArray(), [.22,.05,1])
    for (const angle of [-15, 15]) for (const aspect of [.7, 1.5]) {
      result.update(view({ structure: { ...INITIAL_STATE.structure, fractured: true, isolate: true, pose: { gap: 2.5, offset: 3, angulation: angle } } }))
      const camera = new THREE.PerspectiveCamera(boneFieldOfView(aspect), aspect, .02, 80)
      camera.position.set(...pose.position); camera.lookAt(...pose.target); camera.updateMatrixWorld(true)
      result.root.traverse((mesh) => {
        if (!mesh.isMesh || !visible(mesh) || !mesh.userData.boneId?.startsWith('FMA')) return
        const pos = mesh.geometry.getAttribute('position')
        for (let i = 0; i < pos.count; i++) {
          const p = new THREE.Vector3().fromBufferAttribute(pos,i).applyMatrix4(mesh.matrixWorld).project(camera)
          expect(Math.abs(p.x)).toBeLessThan(1); expect(Math.abs(p.y)).toBeLessThan(1)
        }
      })
    }
  })
  it('箭头的锥尖与轴杆方向一致，外展箭头指向足外侧', async () => {
    const result = await model()
    result.update(view({ tab: 'load', load: { mode: 'abduction', load: 1, fractured: false } }))
    result.root.updateMatrixWorld(true)
    const head = result.root.getObjectByName('load-arrow-head'), shaft = result.root.getObjectByName('load-arrow-shaft')
    const base = new THREE.Vector3(0,0,0).applyMatrix4(head.matrixWorld)
    const tip = new THREE.Vector3(.0038,0,0).applyMatrix4(head.matrixWorld)
    const direction = new THREE.Vector3(1,0,0).transformDirection(shaft.matrixWorld)
    expect(tip.clone().sub(base).normalize().dot(direction)).toBeCloseTo(1, 8)
    expect(tip.x).toBeGreaterThan(base.x) // 模型 -X 外侧，经右足旋转后为展台 +X。
  })
})
