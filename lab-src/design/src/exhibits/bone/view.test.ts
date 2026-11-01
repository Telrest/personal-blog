import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { boneFieldOfView, fitBoneView } from './view'

describe('完整取景', () => {
  it('三个方向、桌面与窄屏均容纳整个模型边界', () => {
    const min: [number, number, number] = [-1.1, -2.6, -.9], max: [number, number, number] = [1.1, 2.6, .9]
    for (const direction of [[0,0,1], [0,0,-1], [1,.05,.15]] as [number,number,number][]) for (const aspect of [.65, 1, 1.45, 2]) {
      const pose = fitBoneView(min, max, direction)
      const camera = new THREE.PerspectiveCamera(boneFieldOfView(aspect), aspect, .02, 80)
      camera.position.set(...pose.position); camera.lookAt(...pose.target); camera.updateMatrixWorld(true)
      for (const x of [min[0],max[0]]) for (const y of [min[1],max[1]]) for (const z of [min[2],max[2]]) {
        const p = new THREE.Vector3(x,y,z).project(camera)
        expect(Math.abs(p.x)).toBeLessThan(.9); expect(Math.abs(p.y)).toBeLessThan(.9)
      }
    }
  })
})
