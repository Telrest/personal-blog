import { describe, expect, it } from 'vitest'
import type { CourseRecord } from './model'
import {
  clearState,
  loadState,
  memoryStorage,
  parseImport,
  saveState,
  serialize,
  validateCourses,
  type GpaState,
} from './storage'

const sample: CourseRecord[] = [
  { id: 'a', name: '高等数学（上）', creditsText: '5', scoreText: '82', targetText: '', included: true },
  { id: 'b', name: '大学物理（上）', creditsText: '4', scoreText: '76', targetText: '80', included: true },
]

const state: GpaState = { courses: sample, sample: false }

describe('本地保存', () => {
  it('第一次打开没有本地数据时返回示例数据，且标记为示例', () => {
    const storage = memoryStorage()
    const result = loadState(sample, storage)
    expect(result.restored).toBe(false)
    expect(result.state.sample).toBe(true)
    expect(result.state.courses).toHaveLength(2)
    expect(result.error).toBeNull()
  })

  it('保存后刷新可恢复，且不会退回示例数据', () => {
    const storage = memoryStorage()
    const edited: GpaState = {
      courses: [{ ...sample[0], scoreText: '95' }, sample[1]],
      sample: false,
    }
    expect(saveState(edited, storage)).toBe(true)

    const result = loadState(sample, storage)
    expect(result.restored).toBe(true)
    expect(result.state.sample).toBe(false)
    expect(result.state.courses[0].scoreText).toBe('95')
    expect(result.state.courses).toEqual(edited.courses)
  })

  it('清空后再次加载会回到示例数据', () => {
    const storage = memoryStorage()
    saveState(state, storage)
    clearState(storage)
    const result = loadState(sample, storage)
    expect(result.restored).toBe(false)
    expect(result.state.sample).toBe(true)
  })

  it('本地数据损坏时回到示例数据，并说明原数据未被覆盖', () => {
    const storage = memoryStorage()
    storage.setItem('thesecretofdesign.gpa.v1', '{ 这不是 JSON')
    const result = loadState(sample, storage)
    expect(result.restored).toBe(false)
    expect(result.state.sample).toBe(true)
    expect(result.error).toContain('读取失败')
  })

  it('本地保存的是空列表时，不被示例数据覆盖', () => {
    const storage = memoryStorage()
    saveState({ courses: [], sample: false }, storage)
    const result = loadState(sample, storage)
    expect(result.restored).toBe(true)
    expect(result.state.courses).toHaveLength(0)
  })
})

describe('导入导出往返', () => {
  it('导出再导入，数据完全一致', () => {
    const text = serialize(state)
    const imported = parseImport(text)
    expect(imported.ok).toBe(true)
    if (!imported.ok) return
    expect(imported.state.courses).toEqual(state.courses)
    expect(imported.state.sample).toBe(false)
  })

  it('导入也接受只有 courses 数组的对象', () => {
    const imported = parseImport(JSON.stringify({ courses: sample }))
    expect(imported.ok).toBe(true)
    if (!imported.ok) return
    expect(imported.state.courses.map((c) => c.name)).toEqual(['高等数学（上）', '大学物理（上）'])
  })

  it('导入失败时给出错误信息，不返回半成品', () => {
    for (const bad of ['', 'null', '[]', '{"courses": 3}', '[1,2,3]', '{"foo":"bar"}']) {
      const result = parseImport(bad)
      if (bad === '[]') {
        // 空数组是合法的「零门课」
        expect(result.ok).toBe(true)
        continue
      }
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.length).toBeGreaterThan(0)
    }
  })

  it('导入时把数字字段与缺省字段整理成文本', () => {
    const imported = parseImport(
      JSON.stringify({ courses: [{ name: 123, credits: 3, score: 88, included: 'yes' }] }),
    )
    expect(imported.ok).toBe(true)
    if (!imported.ok) return
    const course = imported.state.courses[0]
    expect(course.name).toBe('123')
    expect(course.creditsText).toBe('3')
    expect(course.scoreText).toBe('88')
    expect(course.included).toBe(true)
    expect(course.id.length).toBeGreaterThan(0)
  })
})

describe('校验', () => {
  it('课程数量超上限时报错', () => {
    const many = Array.from({ length: 201 }, (_, i) => ({ name: `课${i}` }))
    const result = validateCourses({ courses: many })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('上限')
  })

  it('空数组是合法的', () => {
    const result = validateCourses({ courses: [] })
    expect(result.ok).toBe(true)
    expect(result.courses).toHaveLength(0)
  })
})
