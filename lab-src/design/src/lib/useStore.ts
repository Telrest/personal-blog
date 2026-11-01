import { useRef, useSyncExternalStore } from 'react'
import type { Store } from './store'

/** 整个 store 当快照用：状态没换对象就不会重渲染。 */
export function useStoreValue<T extends object>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get)
}

/**
 * 只订阅一个原始值。selector 必须是稳定的（放在组件外，或用 useCallback），
 * 且只能返回 string / number / boolean 之类的原始值，否则 useSyncExternalStore
 * 会因为每次返回新对象而无限重渲染。
 */
export function useStoreSelector<T extends object, S extends string | number | boolean | null | undefined>(
  store: Store<T>,
  selector: (state: T) => S,
): S {
  const cache = useRef<{ state: T | null; value: S }>({ state: null, value: selector(store.get()) })

  const getSnapshot = () => {
    const state = store.get()
    if (cache.current.state !== state) {
      cache.current = { state, value: selector(state) }
    }
    return cache.current.value
  }

  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot)
}
