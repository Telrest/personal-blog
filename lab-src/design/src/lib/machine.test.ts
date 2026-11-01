import { describe, expect, it } from 'vitest'
import { createMachine, labelOf, type MachineSpec } from './machine'

/** 一个和「按动笔凸轮锁止」同构的玩具状态机：按下与松开交替，把推杆在两个位置之间推来推去 */
interface Ctx {
  presses: number
  latched: boolean
}

const spec: MachineSpec<Ctx> = {
  initial: 'extended',
  states: {
    extended: {
      transitions: [
        { event: 'press', target: 'retracted', action: (ctx) => void (ctx.presses += 1) },
      ],
    },
    retracted: {
      transitions: [
        { event: 'press', target: 'extended', action: (ctx) => void (ctx.presses += 1) },
      ],
    },
  },
}

describe('createMachine', () => {
  it('从初始状态开始', () => {
    const machine = createMachine(spec, { initialContext: { presses: 0, latched: false } })
    expect(machine.get().value).toBe('extended')
    expect(machine.get().events).toBe(0)
  })

  it('按事件切换状态并执行 action', () => {
    const machine = createMachine(spec, { initialContext: { presses: 0, latched: false } })
    expect(machine.send('press')).toBe(true)
    expect(machine.get().value).toBe('retracted')
    expect(machine.get().context.presses).toBe(1)
    expect(machine.send('press')).toBe(true)
    expect(machine.get().value).toBe('extended')
    expect(machine.get().context.presses).toBe(2)
  })

  it('当前状态没有对应转移时返回 false，状态不变', () => {
    const machine = createMachine(spec, { initialContext: { presses: 0, latched: false } })
    expect(machine.send('shake')).toBe(false)
    expect(machine.get().value).toBe('extended')
    expect(machine.get().events).toBe(0)
  })

  it('can() 预测事件是否可用', () => {
    const machine = createMachine(spec, { initialContext: { presses: 0, latched: false } })
    expect(machine.can('press')).toBe(true)
    expect(machine.can('shake')).toBe(false)
  })

  it('守卫条件生效：条件不满足时转移不发生', () => {
    interface GuardCtx {
      ready: boolean
    }
    const guarded: MachineSpec<GuardCtx> = {
      initial: 'idle',
      states: {
        idle: {
          transitions: [{ event: 'go', target: 'running', when: (ctx) => ctx.ready }],
        },
        running: {},
      },
    }
    const machine = createMachine(guarded, { initialContext: { ready: false } })
    expect(machine.send('go')).toBe(false)
    expect(machine.get().value).toBe('idle')
  })

  it('记录事件轨迹，并按上限截断', () => {
    const machine = createMachine(spec, {
      initialContext: { presses: 0, latched: false },
      maxHistory: 3,
    })
    for (let i = 0; i < 5; i += 1) machine.send('press')
    const history = machine.get().history
    expect(history).toHaveLength(3)
    expect(history[2]).toContain('press')
  })

  it('reset 回到初始状态与初始上下文', () => {
    const machine = createMachine(spec, { initialContext: { presses: 0, latched: false } })
    machine.send('press')
    machine.send('press')
    machine.reset()
    expect(machine.get().value).toBe('extended')
    expect(machine.get().context.presses).toBe(0)
    expect(machine.get().history).toHaveLength(0)
  })

  it('状态名到中文标签的映射有兜底', () => {
    expect(labelOf({ extended: '伸出' }, 'extended')).toBe('伸出')
    expect(labelOf({ extended: '伸出' }, 'unknown')).toBe('unknown')
  })
})
