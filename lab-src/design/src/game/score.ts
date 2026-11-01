/**
 * 魔丸 GPA：一条永远走不到的满绩渐近线。
 *
 * 规则（与页面上的说明必须一字不差）：
 *  - 前 1 000 m 从 0 线性涨到 3.9；
 *  - 到达 1 000 m 之后，每多骑 500 m，小数末尾多一个 9：
 *    1 000 → 3.9，1 500 → 3.99，2 000 → 3.999，2 500 → 3.9999 …
 *  - 数学上 G = 4 − 10^(−n)，n 是连续的 9 的个数。
 *
 * 实现上刻意不用浮点数保存「很长的小数」：
 * 9 的个数由距离的整数阶段算出，显示字符串由 '9'.repeat(n) 拼出来，
 * 因此 4 000 m 与 1×10¹⁵ m 都只是「阶段更大」，永远不会被舍入成 4.0。
 *
 * 分数名字固定叫「魔丸 GPA」，与任何真实课程 GPA 无关。
 */

import { CONFIG } from './config'

export interface MowanGpa {
  /** 本局实际距离（m），比较纪录时用的就是它 */
  distance: number
  /** 已经到手的 9 的个数；0 表示还在线性段 */
  nines: number
  /** 显示字符串，例如 '3.9'、'3.999'、'3.999999…' */
  text: string
  /** 9 的个数超过显示上限（用了省略号） */
  truncated: boolean
  /** 是否已经站上 3.9 */
  reached: boolean
  /** 下一个节点的里程；线性段是 1 000 m */
  nextAt: number
  /** 距离下一个节点还差多少米（≥ 0） */
  remaining: number
  /** 距离下一个节点的进度 0–1 */
  progress: number
}

const { linearDistance, linearTarget, stepDistance, maxShownNines, linearDecimals } = CONFIG.score

/** 把一个非负整数按三位一组分开：1234567 → '1 234 567' */
export function groupDigits(value: number): string {
  const text = Math.floor(Math.abs(value)).toString()
  return text.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

/** 只在显示距离时用：四舍五入到整米（内部距离不受影响） */
export function formatMeters(distance: number): string {
  return groupDigits(Math.max(0, Math.round(distance)))
}

/**
 * 由距离算出魔丸 GPA。
 *
 * 所有阶段判断都走整数：nines = 1 + floor((d − 1000) / 500)，
 * 不用 4 − 10^(−n)，所以既不会丢精度，也不会显示成 4.0。
 */
export function scoreAt(distance: number): MowanGpa {
  const d = Number.isFinite(distance) ? Math.max(0, distance) : 0

  if (d < linearDistance) {
    const raw = (linearTarget * d) / linearDistance
    const factor = 10 ** linearDecimals
    // 截断而不是四舍五入：999.9 m 显示 3.89，3.90 只在 1 000 m 出现
    const floored = Math.floor(raw * factor) / factor
    return {
      distance: d,
      nines: 0,
      text: floored.toFixed(linearDecimals),
      truncated: false,
      reached: false,
      nextAt: linearDistance,
      remaining: linearDistance - d,
      progress: Math.min(1, d / linearDistance),
    }
  }

  const nines = 1 + Math.floor((d - linearDistance) / stepDistance)
  const shown = Math.min(nines, maxShownNines)
  const truncated = nines > maxShownNines
  const previousAt = linearDistance + (nines - 1) * stepDistance
  const nextAt = linearDistance + nines * stepDistance

  return {
    distance: d,
    nines,
    text: `3.${'9'.repeat(shown)}${truncated ? '…' : ''}`,
    truncated,
    reached: true,
    nextAt,
    remaining: Math.max(0, nextAt - d),
    progress: Math.min(1, Math.max(0, (d - previousAt) / stepDistance)),
  }
}

/**
 * 一句幽默提示。返回 null 表示这一刻不打扰玩家。
 * 文案与页面说明共用，不要在别处再写一套。
 */
export function hintFor(gpa: MowanGpa): string | null {
  if (!gpa.reached) {
    if (gpa.distance >= linearDistance - 12) return '就差一点'
    if (gpa.distance >= linearDistance - 110) return '即将满绩'
    return null
  }
  if (gpa.progress >= 0.88) return '就差一点'
  if (gpa.nines >= 5) return '满绩是一条渐近线'
  if (gpa.nines >= 2) return '再坚持一下'
  return '再坚持一下'
}

/** 「第 N 个 9」——省略号状态下必须同时给出这一句 */
export function nineNote(gpa: MowanGpa): string | null {
  if (gpa.nines <= 0) return null
  return `第 ${groupDigits(gpa.nines)} 个 9`
}

/**
 * 纪录比较只看实际距离。
 * 两个不同的距离可能显示成同一个字符串（例如 1 210 m 与 1 499 m 都是 3.99），
 * 所以不能拿显示字符串比大小。
 */
export function isBetterRecord(distance: number, best: number): boolean {
  return Number.isFinite(distance) && distance > best
}
