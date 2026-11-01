import { describe, expect, it, vi } from 'vitest'
import { createStore } from './store'

describe('createStore', () => {
  it('读取初始状态', () => {
    const store = createStore({ a: 1, b: 'x' })
    expect(store.get()).toEqual({ a: 1, b: 'x' })
  })

  it('set 新对象时通知订阅者', () => {
    const store = createStore({ n: 0 })
    const listener = vi.fn()
    store.subscribe(listener)
    store.set({ n: 1 })
    expect(store.get().n).toBe(1)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('set 传入同一个对象不通知', () => {
    const initial = { n: 0 }
    const store = createStore(initial)
    const listener = vi.fn()
    store.subscribe(listener)
    store.set(initial)
    expect(listener).not.toHaveBeenCalled()
  })

  it('set 支持更新函数', () => {
    const store = createStore({ n: 1 })
    store.set((prev) => ({ n: prev.n + 1 }))
    expect(store.get().n).toBe(2)
  })

  it('patch 只在字段真的变化时通知', () => {
    const store = createStore({ a: 1, b: 2 })
    const listener = vi.fn()
    store.subscribe(listener)

    store.patch({ a: 1 })
    expect(listener).not.toHaveBeenCalled()

    store.patch({ a: 5 })
    expect(store.get()).toEqual({ a: 5, b: 2 })
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('退订后不再通知', () => {
    const store = createStore({ n: 0 })
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)
    unsubscribe()
    store.set({ n: 1 })
    expect(listener).not.toHaveBeenCalled()
  })

  it('订阅者在回调里退订不会影响其他订阅者', () => {
    const store = createStore({ n: 0 })
    const second = vi.fn()
    let unsubscribeFirst: (() => void) | null = null
    unsubscribeFirst = store.subscribe(() => unsubscribeFirst?.())
    store.subscribe(second)
    store.set({ n: 1 })
    expect(second).toHaveBeenCalledTimes(1)
  })
})
