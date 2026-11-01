import { describe, expect, it } from 'vitest'
import {
  SCENE_SCALE,
  DEFAULT_POSE,
  FOOT_MODEL,
  FRACTURE,
  LOAD_LIMITS,
  REPAIR_STAGES,
  TARGET_HINT,
  ZERO_POSE,
  add,
  clampPose,
  cutCenter,
  dot,
  fragmentTransform,
  fractureJitter,
  fracturePlane,
  isPoseClosed,
  loadEffect,
  loadPlacement,
  mul,
  normalize,
  repairAppearance,
  sub,
  targetLength,
  toScene,
  vec3,
  vecLength,
} from './model'

/** 这些断言只检查「模型自洽」；解剖学与来源说明见 docs/bone-model.md。 */

describe('现成足骨模型与坐标约定', () => {
  it('26 块骨由同一个 GLB 提供，目标骨是右第 5 趾近节趾骨', () => {
    expect(FOOT_MODEL.footGlb).toBe('right-foot-26-bones.glb')
    expect(FOOT_MODEL.targetFma).toBe('FMA32640')
    expect(FOOT_MODEL.fifthMetatarsalFma).toBe('FMA24515')
    expect(FOOT_MODEL.targetFma).not.toBe(FOOT_MODEL.fifthMetatarsalFma)
  })

  it('展台换算只换单位与朝向：不镜像、不改变比例', () => {
    // 三个模型基向量（外侧 −X、足趾 +Z、足背 +Y）在展台坐标里的像
    const eX = toScene([1, 0, 0]) // 模型 +X = 内侧
    const eY = toScene([0, 1, 0]) // 模型 +Y = 足背
    const eZ = toScene([0, 0, 1]) // 模型 +Z = 足趾
    expect(eX).toEqual([-SCENE_SCALE, 0, 0])
    expect(eY).toEqual([0, 0, SCENE_SCALE])
    expect(eZ).toEqual([0, SCENE_SCALE, 0])
    // 右手系：eX × eY 应等于 eZ 的同号结果，若镜像则符号翻转
    const det =
      eX[0] * (eY[1] * eZ[2] - eY[2] * eZ[1]) -
      eX[1] * (eY[0] * eZ[2] - eY[2] * eZ[0]) +
      eX[2] * (eY[0] * eZ[1] - eY[1] * eZ[0])
    expect(det).toBeGreaterThan(0)
    // 外侧（模型 −X）映到展台 +X；足趾映到 +Y；足背映到 +Z
    expect(toScene([-1, 0, 0])[0]).toBeGreaterThan(0)
    expect(toScene([0, 0, 1])[1]).toBeGreaterThan(0)
    expect(toScene([0, 1, 0])[2]).toBeGreaterThan(0)
  })

  it('模型里最近与最远的足骨决定足长，尺度约 0.21 m', () => {
    // 资料包给出的目标骨长轴约 25.85 mm；尺度只做单位换算
    expect(targetLength()).toBeCloseTo(0.02585, 4)
    expect(SCENE_SCALE).toBe(20)
  })
})

describe('预制裂面', () => {
  it('切分位置在从基底算起 18% 处，与资料包提示一致', () => {
    const center = cutCenter()
    const expected = add(TARGET_HINT.base, mul(TARGET_HINT.axis, targetLength() * TARGET_HINT.cutFraction))
    expect(vecLength(sub(center, expected))).toBeLessThan(1e-12)
    const promised: [number, number, number] = [
      -0.04311823070932089, -0.03233012198861492, 0.025386857728926345,
    ]
    expect(vecLength(sub(center, promised))).toBeLessThan(1e-5)
  })

  it('裂面法线与骨长轴成 20°，且是单位向量', () => {
    const plane = fracturePlane()
    expect(vecLength(plane.normal)).toBeCloseTo(1, 9)
    const cosine = dot(plane.normal, TARGET_HINT.axis)
    expect((Math.acos(cosine) * 180) / Math.PI).toBeCloseTo(TARGET_HINT.planeTiltDeg, 6)
    expect(plane.center).toEqual(cutCenter())
  })

  it('裂面起伏是确定的，且不超过设定幅度', () => {
    const points: Array<[number, number, number]> = [
      [-0.043, -0.032, 0.025],
      [-0.041, -0.033, 0.03],
      [-0.045, -0.031, 0.02],
    ]
    for (const point of points) {
      const a = fractureJitter(point)
      const b = fractureJitter(point)
      expect(a).toBe(b)
      expect(Math.abs(a)).toBeLessThanOrEqual((FRACTURE.jitterMm / 1000) * 1.0001)
    }
    // 不同位置给出不同起伏（不是常数）
    expect(fractureJitter(points[0])).not.toBe(fractureJitter(points[1]))
  })
})

describe('断端姿态', () => {
  it('默认值：裂隙 0.6 mm、横移 1 mm、旋转 8°，与资料包一致', () => {
    expect(DEFAULT_POSE).toEqual({ gap: 0.6, offset: 1, angulation: 8 })
    expect(FRACTURE.offsetRange).toEqual([0, 3])
    expect(FRACTURE.angulationRange).toEqual([-15, 15])
  })

  it('零位移姿态严格是恒等变换：两断面贴合', () => {
    const transform = fragmentTransform(ZERO_POSE)
    expect(transform.rotation).toBe(0)
    expect(transform.translate).toEqual([0, 0, 0])
    expect(isPoseClosed(ZERO_POSE)).toBe(true)
    expect(isPoseClosed(DEFAULT_POSE)).toBe(false)
    // 任取一点，绕枢轴旋转 0 度再平移 0 → 坐标不变
    for (const point of [TARGET_HINT.base, TARGET_HINT.distal, vec3(0.1, -0.2, 0.3)]) {
      const rel = sub(point, transform.pivot)
      const c = Math.cos(transform.rotation)
      const s = Math.sin(transform.rotation)
      const x = rel[0] * c + rel[2] * s
      const z = -rel[0] * s + rel[2] * c
      expect(x + transform.pivot[0] + transform.translate[0]).toBeCloseTo(point[0], 12)
      expect(rel[1] + transform.pivot[1] + transform.translate[1]).toBeCloseTo(point[1], 12)
      expect(z + transform.pivot[2] + transform.translate[2]).toBeCloseTo(point[2], 12)
    }
  })

  it('旋转以裂面中心为枢轴，刚体距离不变', () => {
    const pose = { gap: 0.6, offset: 1, angulation: 8 }
    const transform = fragmentTransform(pose)
    expect(transform.pivot).toEqual(cutCenter())
    const point = TARGET_HINT.distal
    const rel = sub(point, transform.pivot)
    const c = Math.cos(transform.rotation)
    const s = Math.sin(transform.rotation)
    const x = rel[0] * c + rel[2] * s
    const z = -rel[0] * s + rel[2] * c
    const moved = add(add([x, rel[1], z], transform.pivot), transform.translate)
    // 减去纯平移后，到枢轴的距离与原来一致
    const back = sub(moved, transform.translate)
    expect(vecLength(sub(back, transform.pivot))).toBeCloseTo(vecLength(rel), 12)
  })

  it('正角度把远端推向外侧（−X），横移也朝外侧', () => {
    const transform = fragmentTransform({ gap: 0, offset: 0, angulation: 8 })
    const point = TARGET_HINT.distal
    const rel = sub(point, transform.pivot)
    const c = Math.cos(transform.rotation)
    const s = Math.sin(transform.rotation)
    const x = rel[0] * c + rel[2] * s
    expect(x + transform.pivot[0]).toBeLessThan(point[0])

    const offsetTransform = fragmentTransform({ gap: 0, offset: 1, angulation: 0 })
    expect(offsetTransform.translate[0]).toBeCloseTo(-0.001, 12)
    const gapTransform = fragmentTransform({ gap: 0.6, offset: 0, angulation: 0 })
    const alongAxis = dot(gapTransform.translate, TARGET_HINT.axis)
    expect(alongAxis).toBeCloseTo(0.0006, 12)
  })

  it('姿态被夹到可探索范围', () => {
    const pose = clampPose({ gap: 9, offset: -4, angulation: 90 })
    expect(pose.gap).toBe(2.5)
    expect(pose.offset).toBe(0)
    expect(pose.angulation).toBe(15)
    expect(clampPose({ gap: 0, offset: 0, angulation: -20 }).angulation).toBe(-15)
  })
})

describe('受力示意（归一化 λ）', () => {
  it('λ = 0 时三种方向都没有任何形变', () => {
    for (const mode of ['axial', 'lateral', 'abduction'] as const) {
      for (const fractured of [false, true]) {
        const effect = loadEffect(mode, 0, fractured)
        expect(effect.jointDeg).toBe(0)
        expect(effect.compressionMm).toBe(0)
        expect(effect.fragmentDeg).toBe(0)
      }
    }
  })

  it('完整骨：侧向／外展给 3° 示意弯曲，轴向给 0.35 mm 示意压缩', () => {
    expect(loadEffect('lateral', 1, false).jointDeg).toBeCloseTo(LOAD_LIMITS.jointBendDeg, 12)
    expect(loadEffect('abduction', 1, false).jointDeg).toBeCloseTo(LOAD_LIMITS.jointBendDeg, 12)
    const axial = loadEffect('axial', 1, false)
    expect(axial.compressionMm).toBeCloseTo(LOAD_LIMITS.axialCompressionMm, 12)
    expect(axial.jointDeg).toBe(0)
  })

  it('预制骨折：只给远端片段 0.8° 相对转动，不叠加关节弯曲', () => {
    const effect = loadEffect('lateral', 1, true)
    expect(effect.fragmentDeg).toBeCloseTo(LOAD_LIMITS.fragmentDeg, 12)
    expect(effect.jointDeg).toBe(0)
    expect(effect.compressionMm).toBe(0)
  })

  it('形变随 λ 线性、夹在 0–1，且上限不被突破', () => {
    expect(loadEffect('lateral', 0.5, false).jointDeg).toBeCloseTo(1.5, 12)
    expect(loadEffect('lateral', 2, false).jointDeg).toBeCloseTo(3, 12)
    expect(loadEffect('lateral', -1, false).jointDeg).toBe(0)
    expect(loadEffect('axial', 1, true).compressionMm).toBe(0)
  })

  it('三种方向的施力方向互不相同', () => {
    const axial = loadPlacement('axial')
    const lateral = loadPlacement('lateral')
    const abduction = loadPlacement('abduction')
    expect(vecLength(axial.direction)).toBeCloseTo(1, 9)
    expect(vecLength(lateral.direction)).toBeCloseTo(1, 9)
    expect(vecLength(abduction.direction)).toBeCloseTo(1, 9)
    // 轴向与骨轴反向；侧向从外侧压向内侧（+X）；外展向小趾外侧拉（−X）。
    expect(dot(axial.direction, TARGET_HINT.axis)).toBeCloseTo(-1, 9)
    expect(lateral.direction[0]).toBeCloseTo(1, 9)
    expect(abduction.direction[0]).toBeCloseTo(-1, 9)
    // 作用点沿骨轴的偏置：外展/轴向在尖端，侧向在骨干中段
    expect(abduction.axialOffset).toBeGreaterThan(lateral.axialOffset)
    expect(axial.axialOffset).toBeGreaterThan(abduction.axialOffset)
  })
})

describe('修复分期', () => {
  it('区间与资料包一致：0–0.2 / 0.2–0.5 / 0.5–0.8 / 0.8–1', () => {
    expect(REPAIR_STAGES.map((stage) => [stage.from, stage.to])).toEqual([
      [0, 0.2],
      [0.2, 0.5],
      [0.5, 0.8],
      [0.8, 1],
    ])
  })

  it('h = 0：血肿层可见，软骨痂与骨性骨痂尚未出现', () => {
    const appearance = repairAppearance(0)
    expect(appearance.stageIndex).toBe(0)
    expect(appearance.hematoma.opacity).toBe(1)
    expect(appearance.softCallus.opacity).toBe(0)
    expect(appearance.bonyCallus.opacity).toBe(0)
  })

  it('阶段索引随进度单调推进，边界取右侧阶段', () => {
    expect(repairAppearance(0.19).stageIndex).toBe(0)
    expect(repairAppearance(0.2).stageIndex).toBe(1)
    expect(repairAppearance(0.49).stageIndex).toBe(1)
    expect(repairAppearance(0.5).stageIndex).toBe(2)
    expect(repairAppearance(0.79).stageIndex).toBe(2)
    expect(repairAppearance(0.8).stageIndex).toBe(3)
    expect(repairAppearance(1).stageIndex).toBe(3)
  })

  it('中间阶段：软骨痂在 0.2–0.5 之间长大，骨性骨痂出现后消退', () => {
    expect(repairAppearance(0.22).softCallus.opacity).toBeGreaterThan(0)
    expect(repairAppearance(0.4).softCallus.size).toBeGreaterThan(0.9)
    expect(repairAppearance(0.6).softCallus.opacity).toBeLessThan(0.2)
    expect(repairAppearance(0.65).bonyCallus.opacity).toBeGreaterThan(0.9)
  })

  it('h = 1：血肿与软骨痂完全消退，骨痂变成接近骨干的轮廓', () => {
    const appearance = repairAppearance(1)
    expect(appearance.hematoma.opacity).toBe(0)
    expect(appearance.softCallus.opacity).toBe(0)
    expect(appearance.bonyCallus.opacity).toBe(1)
    expect(appearance.bonyCallus.size).toBeLessThan(0.25)
    expect(appearance.boneBlend).toBeCloseTo(1, 12)
  })

  it('进度夹在 0–1，不会出现负值或残留组织', () => {
    expect(repairAppearance(-1).hematoma.opacity).toBe(1)
    const end = repairAppearance(2)
    expect(end.softCallus.opacity).toBe(0)
    expect(end.hematoma.opacity).toBe(0)
  })
})

describe('模型自洽的补充检查', () => {
  it('长轴单位化、基底在远端之前', () => {
    expect(vecLength(TARGET_HINT.axis)).toBeCloseTo(1, 12)
    // 基底比远端更靠足跟（模型 +Z 指向足趾）
    expect(TARGET_HINT.base[2]).toBeLessThan(TARGET_HINT.distal[2])
  })

  it('裂面法线朝向足背侧，便于从足背观察断面', () => {
    const plane = fracturePlane()
    expect(plane.normal[1]).toBeGreaterThan(0)
  })

  it('默认姿态的远端位移量级合理（2–5 mm）', () => {
    const transform = fragmentTransform(DEFAULT_POSE)
    const point = TARGET_HINT.distal
    const rel = sub(point, transform.pivot)
    const c = Math.cos(transform.rotation)
    const s = Math.sin(transform.rotation)
    const moved = add(add([rel[0] * c + rel[2] * s, rel[1], -rel[0] * s + rel[2] * c], transform.pivot), transform.translate)
    expect(vecLength(sub(moved, point))).toBeLessThan(0.005)
    expect(vecLength(sub(moved, point))).toBeGreaterThan(0.002)
  })

  it('规范化函数对零向量不产生 NaN', () => {
    const value = normalize([0, 0, 0])
    expect(value.every((component) => Number.isFinite(component))).toBe(true)
  })
})
