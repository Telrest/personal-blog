/**
 * 魔丸模式 · 全部可调参数集中在这里。
 *
 * 为什么集中：试玩时最常改的是距离节点、初速与上限、冲刺余量、障碍间距。
 * 把它们放在一个文件里，改完刷新就能感觉出来，不用在几个文件之间找数字。
 *
 * 单位约定：距离 m，速度 m/s，时间 s，角度 rad。
 * 这些参数是玩法参数，不是工程参数，因此没有「实测 / 文献」来源标签——
 * 页面上必须写清楚这一点，不要把它们当成真实车辆性能。
 */

export const CONFIG = {
  /** 一局的时序 */
  run: {
    /** 倒计时：3、2、1 之后起步 */
    countdownSeconds: 3,
    /** 碰撞演出总时长（可跳过） */
    crashSeconds: 2.4,
  },

  /** 记分：满绩渐近线 */
  score: {
    /** 前 1000 m 从 0 线性涨到 3.9 */
    linearDistance: 1000,
    /** 线性段的终点值 */
    linearTarget: 3.9,
    /** 到达 3.9 之后，每 500 m 多一个 9 */
    stepDistance: 500,
    /** 屏幕上最多画几个 9，再多就用省略号 */
    maxShownNines: 6,
    /** 线性段显示的小数位（截断，不进位，保证 3.90 只在 1000 m 出现） */
    linearDecimals: 2,
  },

  /** 车速：自动前进，冲刺临时更快 */
  speed: {
    /** 起步速度 */
    base: 15,
    /** 上限（要求里明确「速度设上限」） */
    max: 33,
    /** 到这个距离时速度基本到顶 */
    rampDistance: 2600,
    /** 速度跟随目标值的时间常数，数值越小越灵敏 */
    responseSeconds: 0.55,
    /** 冲刺倍率：距离涨得更快，但障碍来得也更急 */
    boostMultiplier: 1.34,
    /** 冲刺时转向能力的小幅折扣：更快也更容易歪 */
    boostSteerScale: 0.9,
  },

  /** 转向：连续左右，不是分车道跳格 */
  steering: {
    /** 最大横向速度 */
    maxLateralSpeed: 6.8,
    /** 横向加速度（键盘按下到全速约 0.2 s） */
    lateralAccel: 34,
    /** 松开方向后的横向阻力 */
    lateralDamping: 26,
    /** 车身最大倾角（视觉） */
    maxLean: 0.46,
    /** 路面半宽：车中心到护栏的距离 */
    roadHalfWidth: 4.1,
  },

  /** 冲刺余量：有限、会恢复 */
  boost: {
    /** 满余量可冲刺 2.1 s */
    drainPerSecond: 0.476,
    /** 停止冲刺后每秒恢复 0.16（约 6.3 s 回满） */
    recoverPerSecond: 0.16,
    /** 至少要有这么多余量才能起步 */
    minToStart: 0.22,
    /** 冲刺开始时的一次性速度加成 */
    kick: 1.6,
  },

  /** 碰撞判定：车当成一个盒，障碍是轴对齐盒，逐帧扫掠 */
  collision: {
    /** 车的横向半宽（含车把约 0.76 m 宽，这里取略保守的半宽） */
    bikeRadius: 0.38,
    /** 车的纵向半长 */
    bikeHalfLength: 0.72,
  },

  /** 道路与观察距离 */
  track: {
    /** 障碍从多远开始出现（保证看得见） */
    viewDistance: 105,
    /** 提前生成到多远 */
    spawnAhead: 135,
    /** 落到车后多远就回收 */
    recycleBehind: 18,
    /** 开局多少米内不放障碍（大约 5 秒，够把转向摸熟） */
    warmupDistance: 80,
    /** 隔多少米立一根侧标杆（纯装饰） */
    markerSpacing: 12,
    /** 路面分道线节距 */
    dashSpacing: 8,
  },

  /** 障碍尺寸：碰撞盒与可见模型一致 */
  obstacle: {
    /**
     * 连跳矮墙：一段低矮混凝土墙，顶部有一圈压顶（压顶比墙身略宽一点）。
     * 尺寸参照三视图：高约 0.85 m、厚约 0.38 m，长度按那一排被挡住的宽度来。
     */
    wall: {
      halfDepth: 0.19,
      height: 0.85,
      capHeight: 0.06,
      capOverhang: 0.03,
      /** 墙脚一道深色的风化带（纯视觉，不参与碰撞） */
      baseHeight: 0.06,
    },
  },

  /** 关卡生成：难度随距离上升，靠障碍组合而不是无上限提速 */
  generate: {
    /** 相邻两排的间隔（按时间算，保证高速时也来得及转） */
    rowGapSeconds: { start: 1.18, end: 0.92, atDistance: 3000 },
    /** 安全系数：理论横向能力的九成算作「来得及」 */
    reachSafety: 0.9,
    /** 通道最小净宽（不含车身） */
    minGapWidth: 2,
    /** 难度分段：到这些距离后允许的障碍带数 */
    bands: [
      { until: 600, max: 1 },
      { until: 1400, max: 2 },
      { until: Infinity, max: 3 },
    ],
  },

  /** 镜头：第三人称追尾 */
  camera: {
    /** 追尾距离（随速度略微拉远） */
    distance: 4.9,
    distanceExtraAtMax: 1.5,
    /** 机位高度 */
    height: 2.15,
    heightExtraAtMax: 0.45,
    /** 视线落点：车辆前方多远 */
    lookAhead: 9.5,
    /** 视线落点高度 */
    lookHeight: 0.95,
    /** 位置跟随的平滑速度（越大越硬） */
    follow: 7.5,
    /** 基础垂直视野 */
    fov: 56,
    /** 高速与冲刺时的额外视野 */
    fovSpeedGain: 9,
    fovBoostGain: 4,
    /** 旁观者模式：鼠标灵敏度与飞行速度（与展馆里的旁观者模式一致） */
    lookSensitivity: 0.0022,
    walkSpeed: 1.3,
    sprintSpeed: 3.4,
  },

  /** 画质：按设备自动选，也可以在暂停菜单里手动切 */
  quality: {
    /** 低画质的能力上限 */
    lowPixelRatio: 1.15,
    highPixelRatio: 2,
    /** 低画质关掉的装饰数量 */
    decorationsLow: 18,
    decorationsHigh: 46,
    /** 低画质的粒子数 */
    dustLow: 14,
    dustHigh: 30,
  },
} as const

/** 记录存档键：和展馆其它本地数据分开，互不影响 */
export const BEST_RECORD_KEY = 'thesecretofdesign.mowan.best.v1'
/** 音效开关 */
export const MUTED_KEY = 'thesecretofdesign.mowan.muted.v1'

/** 某个距离对应的巡航速度（不含冲刺） */
export function cruiseSpeedAt(distance: number): number {
  const { base, max, rampDistance } = CONFIG.speed
  const t = clamp01(distance / rampDistance)
  // 平滑起步：sqrt 让前段涨得明显，后段趋于平
  const eased = Math.sqrt(t)
  return base + (max - base) * eased
}

/** 一排障碍允许多少个「带」（难度分段表） */
export function maxBandsAt(distance: number): number {
  for (const step of CONFIG.generate.bands) {
    if (distance < step.until) return step.max
  }
  return 1
}

/** 相邻两排之间的时间间隔（距离越远越紧） */
export function rowGapSecondsAt(distance: number): number {
  const { rowGapSeconds } = CONFIG.generate
  const t = clamp01(distance / rowGapSeconds.atDistance)
  return rowGapSeconds.start + (rowGapSeconds.end - rowGapSeconds.start) * t
}

/** 允许的净通道宽度：越远越窄，但不低于 minGapWidth */
export function gapWidthAt(distance: number): number {
  const min = CONFIG.generate.minGapWidth
  const start = 3.6
  const t = clamp01(distance / 3200)
  return Math.max(min, start + (min - start) * t)
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return value < 0 ? 0 : value > 1 ? 1 : value
}

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return value < min ? min : value > max ? max : value
}

export function damp(current: number, target: number, rate: number, dt: number): number {
  if (dt <= 0) return current
  return current + (target - current) * (1 - Math.exp(-rate * dt))
}
