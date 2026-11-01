/**
 * 魔丸模式的本地存档：只有两条——历史最好距离与音效开关。
 *
 * 首版不需要账号、不需要服务器；读写失败（隐私模式、配额满）就当作没有存档，
 * 不能因为存不进去就让游戏起不来。
 */

import { BEST_RECORD_KEY, MUTED_KEY } from './config'

export function loadBest(): number {
  try {
    const raw = window.localStorage.getItem(BEST_RECORD_KEY)
    if (!raw) return 0
    const value = Number(raw)
    return Number.isFinite(value) && value > 0 ? value : 0
  } catch {
    return 0
  }
}

export function saveBest(distance: number): void {
  if (!Number.isFinite(distance) || distance <= 0) return
  try {
    window.localStorage.setItem(BEST_RECORD_KEY, String(Math.round(distance)))
  } catch {
    /* 存不进去就算了：这一局的成绩还在结算页上 */
  }
}

export function loadMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTED_KEY) === '1'
  } catch {
    return false
  }
}

export function saveMuted(muted: boolean): void {
  try {
    window.localStorage.setItem(MUTED_KEY, muted ? '1' : '0')
  } catch {
    /* 同上 */
  }
}
