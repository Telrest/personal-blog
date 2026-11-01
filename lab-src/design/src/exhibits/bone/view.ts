import { add, cross, dot, mul, normalize, sub, type Vec3 } from './model'

export const BONE_FOV = 34
export const REFERENCE_ASPECT = 1.2

/** 同时容纳八个包围盒角点；窄屏通过扩大竖向视角保留相同的横向空间。 */
export function fitBoneView(min: Vec3, max: Vec3, direction: Vec3, padding = 1.18) {
  const target = mul(add(min, max), 0.5)
  const forward = normalize(direction)
  const right = normalize(cross([0, 1, 0], forward))
  const up = cross(forward, right)
  const tangent = Math.tan(BONE_FOV * Math.PI / 360)
  let distance = 0.6
  for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) {
    const p = sub([x, y, z], target), depth = dot(p, forward)
    distance = Math.max(distance, depth + padding * Math.max(Math.abs(dot(p, up)) / tangent, Math.abs(dot(p, right)) / (tangent * REFERENCE_ASPECT)))
  }
  return { position: add(target, mul(forward, distance)) as [number, number, number], target: [...target] as [number, number, number] }
}

export function boneFieldOfView(aspect: number): number {
  return 2 * Math.atan(Math.tan(BONE_FOV * Math.PI / 360) * Math.max(1, REFERENCE_ASPECT / Math.max(0.1, aspect))) * 180 / Math.PI
}
