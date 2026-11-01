/**
 * 全屏 API 的最小封装。
 *
 * 只做四件事：判断支持、读当前全屏元素、进入、退出，外加订阅变化。
 * 所有失败都返回 false，不抛异常——按钮点了没反应，比页面崩掉好。
 * iOS Safari 不支持普通元素全屏，这里会老老实实报「不支持」，界面据此隐藏按钮。
 */

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null
  webkitFullscreenEnabled?: boolean
  webkitExitFullscreen?: () => Promise<void>
}

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void>
}

export function isFullscreenSupported(): boolean {
  if (typeof document === 'undefined') return false
  const doc = document as FullscreenDocument
  const enabled = doc.fullscreenEnabled ?? doc.webkitFullscreenEnabled
  return Boolean(enabled)
}

/** 当前处于全屏的元素（没有则为 null） */
export function getFullscreenElement(): Element | null {
  if (typeof document === 'undefined') return null
  const doc = document as FullscreenDocument
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null
}

export async function enterFullscreen(element: HTMLElement): Promise<boolean> {
  if (getFullscreenElement()) return true
  const target = element as FullscreenElement
  try {
    if (target.requestFullscreen) {
      await target.requestFullscreen({ navigationUI: 'hide' })
      return true
    }
    if (target.webkitRequestFullscreen) {
      await target.webkitRequestFullscreen()
      return true
    }
  } catch {
    return false
  }
  return false
}

export async function exitFullscreen(): Promise<boolean> {
  if (typeof document === 'undefined') return false
  const doc = document as FullscreenDocument
  try {
    if (doc.exitFullscreen) {
      await doc.exitFullscreen()
      return true
    }
    if (doc.webkitExitFullscreen) {
      await doc.webkitExitFullscreen()
      return true
    }
  } catch {
    return false
  }
  return false
}

/** 订阅全屏状态变化（含 Esc 退出），返回退订函数 */
export function subscribeFullscreen(listener: () => void): () => void {
  if (typeof document === 'undefined') return () => {}
  document.addEventListener('fullscreenchange', listener)
  document.addEventListener('webkitfullscreenchange', listener)
  return () => {
    document.removeEventListener('fullscreenchange', listener)
    document.removeEventListener('webkitfullscreenchange', listener)
  }
}

/* ---------------------------------------------------------------- 退出提示 */

/**
 * 「按 Esc 退出全屏」这句提示只显示一次。
 * 记在这台设备的 localStorage 里；隐私模式下读写会抛错，那就每次都提示，
 * 宁可多提示一次，也不要因为存不进去而让人退出不来。
 */
const HINT_KEY = 'thesecretofdesign.fullscreen-hint.v1'

export function hasSeenFullscreenHint(): boolean {
  try {
    return window.localStorage.getItem(HINT_KEY) === 'seen'
  } catch {
    return false
  }
}

export function markFullscreenHintSeen(): void {
  try {
    window.localStorage.setItem(HINT_KEY, 'seen')
  } catch {
    /* 存不进去就算了 */
  }
}
