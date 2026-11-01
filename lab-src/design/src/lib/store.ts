/**
 * 极小的可观察状态容器。
 *
 * 约定（贯穿整站的「唯一事实来源」规则）：
 *  - 每个展品只有一个 store，保存用户输入参数 + 模型状态；
 *  - 3D 场景、二维图表、读数、文字标签全部从这个 store 读取派生结果；
 *  - 任何界面不能自己另存一份「显示用」数值。
 *
 * 这个文件是纯逻辑，不依赖 React 或 three.js，方便单元测试。
 */

export interface Store<T> {
  get(): T
  set(next: T | ((prev: T) => T)): void
  /** 浅合并，只在真的有字段变化时才通知订阅者 */
  patch(partial: Partial<T>): void
  subscribe(listener: () => void): () => void
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial
  const listeners = new Set<() => void>()

  const emit = () => {
    // 复制一份再遍历：订阅者在回调里退订时不会跳过别人
    for (const listener of [...listeners]) listener()
  }

  return {
    get: () => state,

    set(next) {
      const value = typeof next === 'function' ? (next as (prev: T) => T)(state) : next
      if (Object.is(value, state)) return
      state = value
      emit()
    },

    patch(partial) {
      let changed = false
      for (const key of Object.keys(partial) as (keyof T)[]) {
        if (!Object.is(state[key], partial[key])) {
          changed = true
          break
        }
      }
      if (!changed) return
      state = { ...state, ...partial }
      emit()
    },

    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
