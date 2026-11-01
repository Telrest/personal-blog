/**
 * GPA 展品的本地保存与导入导出。
 *
 * 数据只存在浏览器本地（localStorage），不上传、不带任何网络请求。
 * 导入时先校验，坏文件不会覆盖已有课程。
 */

import type { CourseRecord } from './model'

export const STORAGE_KEY = 'thesecretofdesign.gpa.v1'
export const EXPORT_KIND = 'the-secret-of-design/gpa'
export const EXPORT_VERSION = 1

/** 课程上限：防止导入一个几千行的文件把页面拖死 */
const MAX_COURSES = 200

export interface GpaState {
  courses: CourseRecord[]
  /** 是否为首次进入时加载的示例数据；用户编辑后置 false */
  sample: boolean
}

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export function memoryStorage(): StorageLike {
  const map = new Map<string, string>()
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  }
}

function browserStorage(): StorageLike | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null
    const probe = '__gpa_probe__'
    window.localStorage.setItem(probe, '1')
    window.localStorage.removeItem(probe)
    return window.localStorage
  } catch {
    return null
  }
}

let idCounter = 0
export function createId(): string {
  idCounter += 1
  const random = Math.random().toString(36).slice(2, 8)
  return `course-${Date.now().toString(36)}-${idCounter}-${random}`
}

export function createCourse(over: Partial<CourseRecord> = {}): CourseRecord {
  return {
    id: createId(),
    name: '新课程',
    creditsText: '2',
    scoreText: '',
    targetText: '',
    included: true,
    ...over,
  }
}

export function cloneCourses(courses: CourseRecord[]): CourseRecord[] {
  return courses.map((course) => ({ ...course }))
}

/* ---------------------------------------------------------------- 校验 */

export interface ValidationResult {
  ok: boolean
  courses: CourseRecord[]
  error: string | null
}

function readText(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return fallback
}

/**
 * 把任意输入整理成合法的课程数组。
 * 只接受能理解的结构，其余一律报错，不做「猜意图」的修复。
 */
export function validateCourses(input: unknown): ValidationResult {
  const raw = Array.isArray(input)
    ? input
    : typeof input === 'object' && input !== null
      ? (input as { courses?: unknown }).courses
      : undefined

  if (!Array.isArray(raw)) {
    return { ok: false, courses: [], error: '文件里没有找到 courses 数组。' }
  }
  if (raw.length > MAX_COURSES) {
    return { ok: false, courses: [], error: `课程数量超过上限（${MAX_COURSES}）。` }
  }

  const courses: CourseRecord[] = []
  for (let index = 0; index < raw.length; index += 1) {
    const item = raw[index]
    if (typeof item !== 'object' || item === null) {
      return { ok: false, courses: [], error: `第 ${index + 1} 条课程不是对象。` }
    }
    const record = item as Record<string, unknown>
    const scoreText = readText(record.scoreText ?? record.score)
    const targetText = readText(record.targetText ?? record.target)
    const creditsText = readText(record.creditsText ?? record.credits)
    const included = record.included === undefined ? true : Boolean(record.included)

    courses.push({
      id: typeof record.id === 'string' && record.id.trim() !== '' ? record.id : createId(),
      name: readText(record.name).trim() || '未命名课程',
      creditsText,
      scoreText,
      targetText,
      included,
    })
  }

  return { ok: true, courses, error: null }
}

/* ---------------------------------------------------------------- 导入导出 */

export function serialize(state: GpaState): string {
  return JSON.stringify(
    {
      app: EXPORT_KIND,
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      sample: state.sample,
      courses: state.courses,
    },
    null,
    2,
  )
}

export type ImportResult = { ok: true; state: GpaState } | { ok: false; error: string }

export function parseImport(text: string): ImportResult {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return { ok: false, error: `不是合法的 JSON：${detail}` }
  }

  const validated = validateCourses(data)
  if (!validated.ok) return { ok: false, error: validated.error ?? '文件结构不正确。' }

  const sample =
    typeof data === 'object' && data !== null && (data as { sample?: unknown }).sample === true

  return { ok: true, state: { courses: validated.courses, sample } }
}

/* ---------------------------------------------------------------- 本地保存 */

export interface LoadResult {
  state: GpaState
  /** 是否从本地恢复（false 表示用了示例数据） */
  restored: boolean
  error: string | null
}

export function loadState(sampleCourses: CourseRecord[], storage?: StorageLike): LoadResult {
  const store = storage ?? browserStorage()
  const fallback: GpaState = { courses: cloneCourses(sampleCourses), sample: true }
  if (!store) return { state: fallback, restored: false, error: null }

  let text: string | null = null
  try {
    text = store.getItem(STORAGE_KEY)
  } catch {
    return { state: fallback, restored: false, error: null }
  }
  if (!text) return { state: fallback, restored: false, error: null }

  const imported = parseImport(text)
  if (!imported.ok) {
    return {
      state: fallback,
      restored: false,
      error: `本地数据读取失败，已载入示例数据（原数据未被覆盖）：${imported.error}`,
    }
  }
  if (imported.state.courses.length === 0) {
    return { state: { courses: [], sample: false }, restored: true, error: null }
  }
  return { state: imported.state, restored: true, error: null }
}

export function saveState(state: GpaState, storage?: StorageLike): boolean {
  const store = storage ?? browserStorage()
  if (!store) return false
  try {
    store.setItem(STORAGE_KEY, serialize(state))
    return true
  } catch {
    return false
  }
}

export function clearState(storage?: StorageLike): void {
  const store = storage ?? browserStorage()
  try {
    store?.removeItem(STORAGE_KEY)
  } catch {
    /* 忽略：清不掉也不影响当前页面 */
  }
}
