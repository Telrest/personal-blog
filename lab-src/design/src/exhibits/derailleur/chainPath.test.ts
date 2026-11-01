import { describe, expect, it } from 'vitest'
import {
  CHAIN_LENGTH,
  CAGE_RANGE,
  DRIVE,
  buildDrivetrainPath,
  cogCount,
  cogZ,
  directionAt3d,
  guidePulleyCenter,
  pointAt3d,
  pitchRadius,
  solveCageAngle,
  tensionPulleyCenter,
} from './chainPath'

const DEG = 180 / Math.PI

describe('闭合链环：12 个挡位共用一条固定链长', () => {
  const solved = Array.from({ length: cogCount() }, (_, index) =>
    solveCageAngle(index, CHAIN_LENGTH),
  )

  it('每一个挡位都能解出摆臂角', () => {
    solved.forEach((item, index) => {
      expect(item, `挡位 ${index} 无解`).not.toBeNull()
    })
  })

  it('链长误差小于 1e-4 mm（链节长度守恒，不靠伸缩遮盖问题）', () => {
    for (const item of solved) {
      expect(item).not.toBeNull()
      expect(Math.abs(item!.lengthError)).toBeLessThan(1e-4)
      expect(item!.result.length3d).toBeCloseTo(CHAIN_LENGTH, 4)
    }
  })

  it('摆臂角随挡位单调变化，且都落在允许范围内', () => {
    const angles = solved.map((item) => item!.cageAngle)
    for (let i = 1; i < angles.length; i += 1) {
      expect(angles[i]).toBeGreaterThan(angles[i - 1])
    }
    for (const angle of angles) {
      expect(angle).toBeGreaterThanOrEqual(CAGE_RANGE.min)
      expect(angle).toBeLessThanOrEqual(CAGE_RANGE.max)
    }
    // 12 挡之间摆臂要真的动起来（这才是「摆臂补偿绕行长度」）
    expect((angles[angles.length - 1] - angles[0]) * DEG).toBeGreaterThan(40)
  })

  it('每个挡位的包角都在合理区间：链条绕得住，但不是绕了一大圈', () => {
    for (const item of solved) {
      const wraps = item!.result.wraps
      const chainring = wraps.chainring * DEG
      const cassette = wraps.cassette * DEG
      const tension = wraps.tension * DEG
      const guide = wraps.guide * DEG

      expect(chainring).toBeGreaterThan(120)
      expect(chainring).toBeLessThan(210)
      expect(cassette).toBeGreaterThan(40)
      expect(cassette).toBeLessThan(170)
      expect(tension).toBeGreaterThan(25)
      expect(tension).toBeLessThan(160)
      // 导向轮主要把链条引向目标齿片，包角小但必须真实接触
      expect(guide).toBeGreaterThan(0)
      expect(guide).toBeLessThan(90)
    }
  })

  it('轮子之间不互相穿插（否则公切线无解或穿模）', () => {
    for (let index = 0; index < cogCount(); index += 1) {
      const item = solved[index]!
      const guide = guidePulleyCenter(index)
      const tension = tensionPulleyCenter(index, item.cageAngle)
      const gap = Math.hypot(guide.x - tension.x, guide.y - tension.y)
      expect(gap).toBeCloseTo(DRIVE.pulleyCenterDistance, 6)
      // 张力轮不能低到地面以下（教学模型也要能看）
      expect(tension.y).toBeGreaterThan(60)
    }
  })

  it('路径是闭合的：总长等于链长，起点与终点连续', () => {
    for (const item of solved) {
      const path = item!.result.path
      expect(path.segments).toHaveLength(8)
      const sum = path.segments.reduce((total, segment) => total + segment.length, 0)
      expect(sum).toBeCloseTo(path.length, 6)
      // 圆弧与直线交替
      for (let i = 0; i < path.segments.length; i += 1) {
        expect(path.segments[i].kind).toBe(i % 2 === 0 ? 'arc' : 'line')
      }
      for (let i = 0; i < path.segments.length; i += 1) {
        expect(path.segments[i].length).toBeGreaterThan(0.5)
      }
    }
  })

  it('相邻段在接点处切向连续（没有折角，说明切线解对了）', () => {
    for (const item of solved) {
      const path = item!.result.path
      for (let i = 0; i < path.segments.length; i += 1) {
        const endOfSegment = path.offsets[i] + path.segments[i].length - 1
        const startOfNext = path.offsets[(i + 1) % path.segments.length] + 1
        const a = directionAt3d(item!.result, endOfSegment)
        const b = directionAt3d(item!.result, startOfNext)
        expect(a.x * b.x + a.y * b.y + a.z * b.z).toBeCloseTo(1, 2)
      }
    }
  })

  it('链条在前盘平面与齿片平面之间过渡：切线端点的 Z 正确', () => {
    for (const index of [0, 6, 11]) {
      const item = solved[index]!
      const result = item!.result
      expect(result.rearPlaneZ).toBeCloseTo(cogZ(index), 9)
      // 每个圆弧段 Z 恒定
      result.path.segments.forEach((segment, i) => {
        if (segment.kind === 'arc') {
          expect(result.segmentZ[i].from).toBeCloseTo(result.segmentZ[i].to, 9)
        }
      })
      // 直线段两端分别是前链线与齿片面
      expect(result.segmentZ.filter((z) => Math.abs(z.from - z.to) > 1).length).toBe(2)
    }
  })

  it('三维取点在整条链长上连续，不会跳点', () => {
    const result = solved[6]!.result
    let previous = pointAt3d(result, 0)
    for (let s = 0.5; s <= CHAIN_LENGTH; s += 0.5) {
      const next = pointAt3d(result, s)
      const gap = Math.hypot(next.x - previous.x, next.y - previous.y, next.z - previous.z)
      expect(gap).toBeLessThan(0.6)
      previous = next
    }
    const wrapPoint = pointAt3d(result, CHAIN_LENGTH)
    const startPoint = pointAt3d(result, 0)
    expect(Math.hypot(wrapPoint.x - startPoint.x, wrapPoint.y - startPoint.y)).toBeLessThan(1e-6)
  })

  it('链节数 × 节距正好覆盖链长', () => {
    expect(DRIVE.chainPitchCount * DRIVE.chainPitch).toBeCloseTo(1524, 9)
    expect(CHAIN_LENGTH).toBeCloseTo(1524, 9)
  })

  it('同一条链长下，大齿片绕得更多、包角更大', () => {
    const small = buildDrivetrainPath(0, solved[0]!.cageAngle)
    const big = buildDrivetrainPath(11, solved[11]!.cageAngle)
    expect(small).not.toBeNull()
    expect(big).not.toBeNull()
    expect(solved[11]!.result.length3d).toBeCloseTo(solved[0]!.result.length3d, 3)
    // 51T 节圆半径大、链条在它上面绕过的弧更长，包角本身反而更大
    expect(solved[11]!.result.wraps.cassette).toBeGreaterThan(
      solved[0]!.result.wraps.cassette,
    )
    expect(pitchRadius(51)).toBeGreaterThan(pitchRadius(10) * 4)
  })
})
