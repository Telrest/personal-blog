/**
 * 明确状态机。
 *
 * 用于「锁止 / 历史状态 / 多输入」这类不能用一条时间轴糊过去的模型：
 * 圆珠笔的凸轮锁止只有「上位/下位 × 按下/松开」几个确定状态，
 * 用时间变量硬凑会把连按两次、按到一半松开这类真实情况算错。
 *
 * 纯逻辑，不依赖 React / three.js。
 */

export interface Transition<C> {
  /** 事件名，例如 'press' | 'release' | 'settle' */
  event: string
  /** 目标状态名；与当前状态相同＝只执行 action */
  target: string
  /** 守卫：返回 false 时这条转移不生效，继续看下一条 */
  when?: (context: C) => boolean
  /** 进入目标状态时执行，用来改上下文（例如计数、锁定标记） */
  action?: (context: C) => void
}

export interface StateNode<C> {
  transitions?: Transition<C>[]
}

export interface MachineSpec<C> {
  initial: string
  states: Record<string, StateNode<C>>
}

export interface MachineSnapshot<C> {
  value: string
  context: C
  /** 最近发生的事件轨迹（最多保留 maxHistory 条），用来显示「刚刚发生了什么」 */
  history: string[]
  /** 已经处理的事件总数 */
  events: number
}

export interface Machine<C> {
  get(): MachineSnapshot<C>
  subscribe(listener: () => void): () => void
  send(event: string): boolean
  can(event: string): boolean
  reset(): void
}

export interface MachineOptions<C> {
  initialContext: C
  maxHistory?: number
}

export function createMachine<C extends object>(
  spec: MachineSpec<C>,
  options: MachineOptions<C>,
): Machine<C> {
  const maxHistory = options.maxHistory ?? 12
  const clone = (context: C): C => ({ ...context })

  let snapshot: MachineSnapshot<C> = {
    value: spec.initial,
    context: clone(options.initialContext),
    history: [],
    events: 0,
  }
  const listeners = new Set<() => void>()
  const emit = () => {
    for (const listener of [...listeners]) listener()
  }

  const findTransition = (state: string, event: string): Transition<C> | undefined => {
    const node = spec.states[state]
    if (!node?.transitions) return undefined
    return node.transitions.find(
      (transition) => transition.event === event && (!transition.when || transition.when(snapshot.context)),
    )
  }

  return {
    get: () => snapshot,

    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    can(event) {
      return Boolean(findTransition(snapshot.value, event))
    },

    send(event) {
      const transition = findTransition(snapshot.value, event)
      if (!transition) return false

      const context = clone(snapshot.context)
      transition.action?.(context)
      const history = [...snapshot.history, `${snapshot.value} --${event}--> ${transition.target}`].slice(
        -maxHistory,
      )

      snapshot = {
        value: transition.target,
        context,
        history,
        events: snapshot.events + 1,
      }
      emit()
      return true
    },

    reset() {
      snapshot = {
        value: spec.initial,
        context: clone(options.initialContext),
        history: [],
        events: 0,
      }
      emit()
    },
  }
}

/** 把状态名翻成给人看的文案；模型里只存英文状态名。 */
export function labelOf(map: Record<string, string>, value: string): string {
  return map[value] ?? value
}
