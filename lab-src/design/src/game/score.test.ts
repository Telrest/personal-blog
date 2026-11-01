import { describe, expect, it } from 'vitest'
import { CONFIG } from './config'
import { formatMeters, groupDigits, hintFor, isBetterRecord, nineNote, scoreAt } from './score'

/**
 * 满绩渐近线的验收点：
 *  - 前 1 000 m 线性，999.9 m 还显示 3.89，3.90 只在 1 000 m 出现；
 *  - 1 000 / 1 500 / 2 000 / 2 500 m 的节点逐个对上；
 *  - 任何距离都不显示 4.0；
 *  - 极长距离靠整数阶段，不靠浮点小数。
 */
describe('魔丸 GPA · 线性段', () => {
  it('起点是 0.00，500 m 是一半，999 m 还不到 3.9', () => {
    expect(scoreAt(0).text).toBe('0.00')
    expect(scoreAt(500).text).toBe('1.95')
    expect(scoreAt(999).text).toBe('3.89')
    expect(scoreAt(1000).nines).toBe(1)
  })

  it('线性段截断而不是四舍五入：999.9 m 不会提前显示 3.90', () => {
    const gpa = scoreAt(999.9)
    expect(gpa.reached).toBe(false)
    expect(gpa.text).toBe('3.89')
    expect(Number(gpa.text)).toBeLessThan(CONFIG.score.linearTarget)
  })
})

describe('魔丸 GPA · 每个 500 m 节点', () => {
  const nodes: Array<[number, number, string]> = [
    [1000, 1, '3.9'],
    [1499.9, 1, '3.9'],
    [1500, 2, '3.99'],
    [1999.9, 2, '3.99'],
    [2000, 3, '3.999'],
    [2500, 4, '3.9999'],
    [3000, 5, '3.99999'],
    [3500, 6, '3.999999'],
  ]

  it.each(nodes)('%d m → %s 个 9 → %s', (distance, nines, text) => {
    const gpa = scoreAt(distance)
    expect(gpa.nines).toBe(nines)
    expect(gpa.text).toBe(text)
    expect(gpa.truncated).toBe(false)
  })

  it('下一个节点的里程与剩余里程正确', () => {
    expect(scoreAt(1200).nextAt).toBe(1500)
    expect(scoreAt(1200).remaining).toBeCloseTo(300, 6)
    expect(scoreAt(1500).nextAt).toBe(2000)
    expect(scoreAt(999).nextAt).toBe(1000)
    expect(scoreAt(999).remaining).toBeCloseTo(1, 6)
  })

  it('进度在节点之间从 0 涨到 1', () => {
    expect(scoreAt(1500).progress).toBeCloseTo(0, 6)
    expect(scoreAt(1750).progress).toBeCloseTo(0.5, 6)
    expect(scoreAt(1999.9).progress).toBeGreaterThan(0.99)
  })
})

describe('魔丸 GPA · 永远不会是 4.0', () => {
  const distances = [0, 1, 999.99, 1000, 1234.5, 5000, 10000, 1e6, 1e9, 1e12, 1e15]

  it.each(distances)('%d m 的字符串仍然以 3. 开头（或 0 起的线性值）且小于 4', (distance) => {
    const gpa = scoreAt(distance)
    expect(Number(gpa.text.replace('…', ''))).toBeLessThan(4)
    expect(gpa.text.startsWith('4')).toBe(false)
    expect(gpa.text).not.toBe('4.0')
  })

  it('极长距离不会因为精度变成 4.0', () => {
    for (const distance of [4e15, 9e15, 1e16]) {
      const gpa = scoreAt(distance)
      expect(gpa.text).toBe('3.999999…')
      expect(gpa.truncated).toBe(true)
      expect(gpa.nines).toBeGreaterThan(CONFIG.score.maxShownNines)
      expect(Number.isSafeInteger(gpa.nines)).toBe(true)
    }
  })

  it('超过六个 9 时用省略号，并注明第几个 9', () => {
    const gpa = scoreAt(4000)
    expect(gpa.text).toBe('3.999999…')
    expect(gpa.truncated).toBe(true)
    expect(nineNote(gpa)).toBe('第 7 个 9')
    expect(scoreAt(3000).text).toBe('3.99999')
    expect(scoreAt(3000).truncated).toBe(false)
    expect(nineNote(scoreAt(3000))).toBe('第 5 个 9')
    expect(nineNote(scoreAt(900))).toBeNull()
  })

  it('阶段是按距离整数算出来的，不是靠浮点小数累加', () => {
    // 差 1 mm 就跨节点，阶段仍然精确
    expect(scoreAt(1499.999).nines).toBe(1)
    expect(scoreAt(1500).nines).toBe(2)
    // 同一个阶段内的任意距离，显示完全一致
    expect(scoreAt(1500.001).text).toBe(scoreAt(1999.999).text)
  })
})

describe('魔丸 GPA · 提示与纪录', () => {
  it('幽默提示在合适的距离出现', () => {
    expect(hintFor(scoreAt(600))).toBeNull()
    expect(hintFor(scoreAt(900))).toBe('即将满绩')
    expect(hintFor(scoreAt(995))).toBe('就差一点')
    expect(hintFor(scoreAt(1200))).toBe('再坚持一下')
    expect(hintFor(scoreAt(1800))).toBe('再坚持一下')
    expect(hintFor(scoreAt(3900))).toBe('满绩是一条渐近线')
  })

  it('纪录按实际距离比较，不按显示字符串', () => {
    // 1 499 m 与 1 500 m 显示成 3.9 与 3.99，但真正要比的是距离
    expect(scoreAt(1499).text).toBe('3.9')
    expect(scoreAt(1500).text).toBe('3.99')
    expect(isBetterRecord(1500, 1499)).toBe(true)
    expect(isBetterRecord(1499, 1500)).toBe(false)
    // 同一段 3.99 里，距离更大的仍然算新纪录
    expect(scoreAt(1600).text).toBe(scoreAt(1999).text)
    expect(isBetterRecord(1999, 1600)).toBe(true)
    expect(isBetterRecord(Number.NaN, 1600)).toBe(false)
  })

  it('距离与第 N 个 9 的整数格式化', () => {
    expect(groupDigits(1234567)).toBe('1 234 567')
    expect(formatMeters(999.6)).toBe('1 000')
    expect(groupDigits(0)).toBe('0')
  })
})
