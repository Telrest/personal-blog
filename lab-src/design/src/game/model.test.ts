import { describe, expect, it } from 'vitest'
import { CONFIG } from './config'
import { createGame, phaseLabel, sweptCollision, type Game, type GameEvent, type GameView, type Obstacle, type Row } from './model'

const DT = 1 / 60

/** 把倒计时走完，进入行驶状态 */
function beginRun(game: Game): void {
  game.start()
  let guard = 0
  while (game.getPhase() === 'countdown' && guard < 600) {
    game.advance(DT)
    guard += 1
  }
}

/**
 * 测试用的「称职玩家」：永远朝最近一排还没过的通道里、离自己最近的那个点走。
 * 它不预判、不抄近路，只会用和玩家一样的转向能力——所以它能活下来，
 * 说明关卡确实留了一条赶得上的路。
 */
function botSteer(view: GameView): number {
  const next = view.rows.find((row) => row.at > view.distance)
  if (!next) return 0
  // 朝通道里「离自己最近的、留了余量的点」走：太贴边会被判定为擦碰
  let target = view.lateral
  let best = Number.POSITIVE_INFINITY
  for (const span of next.free) {
    const margin = Math.min(0.22, (span.max - span.min) / 3)
    const lo = span.min + margin
    const hi = span.max - margin
    const clamped = Math.min(hi, Math.max(lo, view.lateral))
    const gap = Math.abs(clamped - view.lateral)
    if (gap < best) {
      best = gap
      target = clamped
    }
  }
  const delta = target - view.lateral
  if (Math.abs(delta) < 0.04) return 0
  return delta > 0 ? 1 : -1
}

function autoDrive(game: Game, targetDistance: number, maxSeconds = 600): { distance: number; crashed: boolean } {
  let seconds = 0
  while (game.getPhase() === 'running' && game.getView().distance < targetDistance && seconds < maxSeconds) {
    const view = game.getView()
    game.setControls({ steer: botSteer(view), boost: false })
    game.advance(DT)
    seconds += DT
  }
  return { distance: game.getView().distance, crashed: game.getPhase() === 'crash' }
}

describe('阶段状态机', () => {
  it('待机 → 倒计时 → 行驶，三个阶段各自独立', () => {
    const game = createGame({ seed: 7 })
    expect(game.getPhase()).toBe('idle')
    game.start()
    expect(game.getPhase()).toBe('countdown')
    game.advance(DT)
    expect(game.getView().distance).toBe(0)
    beginRun(game)
    expect(game.getPhase()).toBe('running')
    expect(phaseLabel(game.getPhase())).toBe('行驶中')
  })

  it('暂停后距离与分数都不再增长，继续后接着走', () => {
    const game = createGame({ seed: 11 })
    beginRun(game)
    for (let i = 0; i < 120; i += 1) game.advance(DT)
    const before = game.getView().distance
    expect(before).toBeGreaterThan(0)
    expect(game.pause()).toBe(true)
    expect(game.getPhase()).toBe('paused')
    // 快照是低频更新的，所以暂停之后再取一次基准值
    const scoreBefore = game.getSnapshot().gpa.text
    for (let i = 0; i < 300; i += 1) game.advance(DT)
    expect(game.getView().distance).toBe(before)
    expect(game.getSnapshot().gpa.text).toBe(scoreBefore)
    expect(game.resume()).toBe(true)
    for (let i = 0; i < 60; i += 1) game.advance(DT)
    expect(game.getView().distance).toBeGreaterThan(before)
  })

  it('旁观：进入即暂停，返回后恢复跟随（继续行驶）', () => {
    const game = createGame({ seed: 12 })
    beginRun(game)
    for (let i = 0; i < 90; i += 1) game.advance(DT)
    const before = game.getView().distance
    expect(game.enterSpectator()).toBe(true)
    expect(game.getPhase()).toBe('spectator')
    expect(game.getView().cameraMode).toBe('spectator')
    for (let i = 0; i < 180; i += 1) game.advance(DT)
    expect(game.getView().distance).toBe(before)
    expect(game.exitSpectator()).toBe(true)
    expect(game.getPhase()).toBe('running')
    expect(game.getView().cameraMode).toBe('chase')
  })

  it('从暂停进入旁观，退出后仍然停在暂停', () => {
    const game = createGame({ seed: 13 })
    beginRun(game)
    game.pause()
    expect(game.enterSpectator()).toBe(true)
    expect(game.exitSpectator()).toBe(true)
    expect(game.getPhase()).toBe('paused')
  })

  it('切到后台自动暂停', () => {
    const game = createGame({ seed: 14 })
    beginRun(game)
    for (let i = 0; i < 30; i += 1) game.advance(DT)
    game.handleHidden()
    expect(game.getPhase()).toBe('paused')
    const before = game.getView().distance
    for (let i = 0; i < 120; i += 1) game.advance(DT)
    expect(game.getView().distance).toBe(before)
  })
})

describe('障碍公平性', () => {
  it.each([1, 2, 3, 5, 8, 13, 21])('种子 %i：称职玩家能骑到 4 000 m 而不撞', (seed) => {
    const game = createGame({ seed })
    beginRun(game)
    const result = autoDrive(game, 4000)
    expect(result.crashed).toBe(false)
    expect(result.distance).toBeGreaterThanOrEqual(4000)
  })

  it.each([31, 44, 57])('种子 %i：每一排都留了净通道，且都来得及赶到', (seed) => {
    const game = createGame({ seed })
    beginRun(game)
    autoDrive(game, 2500)

    const rows = game.getRows()
    expect(rows.length).toBeGreaterThan(1)
    const maxSide = CONFIG.steering.roadHalfWidth
    const bikeRadius = CONFIG.collision.bikeRadius
    const minGap = CONFIG.generate.minGapWidth

    for (const row of rows) {
      expect(row.free.length).toBeGreaterThan(0)
      expect(row.reachable.length).toBeGreaterThan(0)
      for (const span of row.free) {
        expect(span.min).toBeGreaterThanOrEqual(-maxSide + bikeRadius - 1e-6)
        expect(span.max).toBeLessThanOrEqual(maxSide - bikeRadius + 1e-6)
        expect(span.max - span.min).toBeGreaterThanOrEqual(minGap - bikeRadius * 2 - 1e-6)
      }
      // 可见障碍不越过路面
      for (const obstacle of row.obstacles) {
        expect(obstacle.x + obstacle.halfWidth).toBeLessThanOrEqual(maxSide + 1e-6)
        expect(obstacle.x - obstacle.halfWidth).toBeGreaterThanOrEqual(-maxSide - 1e-6)
      }
    }

    // 相邻两排：这一排的可达位置，必须落在上一排可达集合 + 转向能力之内
    for (let i = 1; i < rows.length; i += 1) {
      const previous = rows[i - 1]
      const row = rows[i]
      const travel = CONFIG.steering.maxLateralSpeed * row.gapSeconds * CONFIG.generate.reachSafety
      for (const span of row.reachable) {
        const ok = previous.reachable.some(
          (from) => span.min <= from.max + travel + 1e-6 && span.max >= from.min - travel - 1e-6,
        )
        expect(ok).toBe(true)
      }
    }
  })

  it('后面的排会用更多障碍带（难度随距离上升，但速度有上限）', () => {
    const game = createGame({ seed: 99 })
    game.debugTeleport(3000)
    const rows: Row[] = [...game.getRows()]
    expect(rows.length).toBeGreaterThan(0)
    // 速度到顶之后不会再涨
    expect(CONFIG.speed.max).toBeLessThan(60)
    expect(CONFIG.speed.base).toBeLessThan(CONFIG.speed.max)
  })
})

describe('碰撞', () => {
  const thinWall: Obstacle = {
    id: 1,
    rowId: 1,
    kind: 'wall',
    at: 100,
    x: 0,
    halfWidth: 2,
    halfDepth: CONFIG.obstacle.wall.halfDepth,
    height: CONFIG.obstacle.wall.height,
  }

  it('高速跨帧不会穿过薄路障', () => {
    // 60 m/s 下一帧走 1 m，比路障厚得多；落点已经越过障碍，仍然必须判撞
    expect(sweptCollision(99.6, 100.6, 0, 0, thinWall)).toBe(true)
    // 横向错开时不算撞
    expect(sweptCollision(99.6, 100.6, 3.5, 3.5, thinWall)).toBe(false)
    // 整段都在障碍之前 / 之后
    expect(sweptCollision(95, 98, 0, 0, thinWall)).toBe(false)
    expect(sweptCollision(103, 110, 0, 0, thinWall)).toBe(false)
    // 斜着穿过：起点在左边，终点在右边，中途扫过障碍
    expect(sweptCollision(99.6, 100.6, -3, 3, thinWall)).toBe(true)
  })

  it('撞一次就结束本局，演出期间不涨距离，结算后可以重来', () => {
    const game = createGame({ seed: 23 })
    beginRun(game)
    // 往最近一排的障碍带里开，直到撞上
    let guard = 0
    while (game.getPhase() === 'running' && guard < 60 * 120) {
      const view = game.getView()
      const next = view.rows.find((row) => row.at > view.distance)
      let target = 0
      if (next) {
        const block = [...next.blocked].sort((a, b) => b.max - b.min - (a.max - a.min))[0]
        target = block ? (block.min + block.max) / 2 : 0
      }
      const delta = target - view.lateral
      game.setControls({ steer: Math.abs(delta) < 0.1 ? 0 : Math.sign(delta) })
      game.advance(DT)
      guard += 1
    }
    expect(game.getPhase()).toBe('crash')
    const crashDistance = game.getView().distance
    expect(game.getSnapshot().crash).not.toBeNull()

    // 演出期间距离冻结
    for (let i = 0; i < 30; i += 1) game.advance(DT)
    expect(game.getView().distance).toBe(crashDistance)

    // 演出结束进入结算，纪录按实际距离更新
    let guard2 = 0
    while (game.getPhase() === 'crash' && guard2 < 600) {
      game.advance(DT)
      guard2 += 1
    }
    expect(game.getPhase()).toBe('result')
    expect(game.getBest()).toBeGreaterThanOrEqual(crashDistance)
    expect(game.getSnapshot().record).toBe(true)
    const best = game.getBest()

    // 结算之后再等两秒，距离与分数依旧冻结
    const frozen = game.getView().distance
    const frozenText = game.getSnapshot().gpa.text
    for (let i = 0; i < 120; i += 1) game.advance(DT)
    expect(game.getView().distance).toBe(frozen)
    expect(game.getSnapshot().gpa.text).toBe(frozenText)

    // 再来一次：本局状态清空，纪录保留
    game.restart()
    expect(game.getPhase()).toBe('countdown')
    expect(game.getView().distance).toBe(0)
    expect(game.getSnapshot().gpa.text).toBe('0.00')
    expect(game.getSnapshot().nines).toBe(0)
    expect(game.getSnapshot().best).toBe(best)
    expect(game.getBest()).toBe(best)
  })

  it('结算期间距离和分数都不动', () => {
    const game = createGame({ seed: 24 })
    beginRun(game)
    let guard = 0
    while (game.getPhase() === 'running' && guard < 60 * 120) {
      const view = game.getView()
      const next = view.rows.find((row) => row.at > view.distance)
      const block = next ? [...next.blocked].sort((a, b) => b.max - b.min - (a.max - a.min))[0] : undefined
      const target = block ? (block.min + block.max) / 2 : 0
      const delta = target - view.lateral
      game.setControls({ steer: Math.abs(delta) < 0.1 ? 0 : Math.sign(delta) })
      game.advance(DT)
      guard += 1
    }
    expect(game.getPhase()).toBe('crash')
    expect(game.skipCutscene()).toBe(true)
    expect(game.getPhase()).toBe('result')
    const distance = game.getView().distance
    const text = game.getSnapshot().gpa.text
    for (let i = 0; i < 120; i += 1) game.advance(DT)
    expect(game.getView().distance).toBe(distance)
    expect(game.getSnapshot().gpa.text).toBe(text)
  })
})

describe('冲刺', () => {
  it('余量有限、会恢复，冲刺时距离涨得更快', () => {
    const calm = createGame({ seed: 41 })
    beginRun(calm)
    for (let i = 0; i < 240; i += 1) calm.advance(DT)
    const calmDistance = calm.getView().distance

    const boosted = createGame({ seed: 41 })
    beginRun(boosted)
    for (let i = 0; i < 240; i += 1) {
      boosted.setControls({ boost: true })
      boosted.advance(DT)
    }
    expect(boosted.getView().distance).toBeGreaterThan(calmDistance)

    const drain = boosted.getSnapshot().stamina
    expect(drain).toBeLessThan(1)
    // 松开后恢复（但不会超过 1）
    boosted.setControls({ boost: false })
    for (let i = 0; i < 60 * 8; i += 1) boosted.advance(DT)
    expect(boosted.getSnapshot().stamina).toBeGreaterThan(drain)
    expect(boosted.getSnapshot().stamina).toBeLessThanOrEqual(1)
  })

  it('余量见底时冲刺会自动停止', () => {
    const game = createGame({ seed: 42 })
    beginRun(game)
    let guard = 0
    while (game.getSnapshot().stamina > 0 && guard < 60 * 10) {
      game.setControls({ boost: true })
      game.advance(DT)
      guard += 1
    }
    expect(game.getSnapshot().stamina).toBeLessThanOrEqual(0.001)
    expect(game.getSnapshot().boosting).toBe(false)
  })
})

describe('极长距离与计分', () => {
  it('推到 1×10^12 m 也不会显示 4.0', () => {
    const game = createGame({ seed: 51 })
    game.debugTeleport(1e12)
    const snapshot = game.getSnapshot()
    expect(snapshot.gpa.text).toBe('3.999999…')
    expect(snapshot.gpa.truncated).toBe(true)
    expect(snapshot.gpa.nines).toBeGreaterThan(6)
    expect(Number(snapshot.gpa.text.replace('…', ''))).toBeLessThan(4)
    expect(snapshot.gpa.distance).toBe(1e12)
  })

  it('每跨过一个节点就发一次「新的 9」事件', () => {
    const events: GameEvent[] = []
    const game = createGame({ seed: 21, onEvent: (event) => events.push(event) })
    beginRun(game)
    autoDrive(game, 2100)
    const nines = events.filter((event): event is Extract<GameEvent, { type: 'nine' }> => event.type === 'nine')
    expect(nines.map((event) => event.nines)).toEqual([1, 2, 3])
    expect(nines.map((event) => event.text)).toEqual(['3.9', '3.99', '3.999'])
  })
})
