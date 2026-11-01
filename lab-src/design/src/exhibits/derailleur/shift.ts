/**
 * 换挡过渡的三段曲线（纯逻辑，不碰 three.js）。
 *
 * 真实换挡不是「把整条链子移到另一片齿片上」，而是三步：
 *
 *   1. 后拨先动：平行四边形把导向轮横向推到目标齿片的平面，
 *      此时链条还坐在原齿片里（传动比也不变）；
 *   2. 链条跨过去：被侧推的链条顺着齿片上的换挡齿尖抬起、越过齿顶，
 *      落到相邻齿片上——这段时间链条是「骑在齿尖上」的，
 *      所以它在模型里被抬到齿顶半径之外，不从齿盘里穿过；
 *   3. 落座：链条落进新齿片的齿谷，接触半径回到新齿片的节圆半径，
 *      这一刻才算「完成啮合」，传动比才切换。
 *
 * 三个量都是 0..1 的进度，几何层用它们算接触半径与接触平面。
 */

export interface ShiftTimeline {
  /** 后拨横向位置：0 = 原齿片面，1 = 目标齿片面（先到位） */
  derailleur: number
  /** 链条接触面横向位置：跨越阶段才从 0 走到 1 */
  contact: number
  /** 链条越过齿顶的抬升量（0..1，中间最高） */
  lift: number
}

/** 后拨到位占换挡进度的比例：后拨先走完，链条再跨 */
export const SHIFT_LEAD = 0.58
/** 链条跨越区间：从 52% 到 94% */
export const SHIFT_CROSS = { start: 0.52, end: 0.94 } as const

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

const smooth = (t: number): number => t * t * (3 - 2 * t)

/** 由换挡进度（0..1）算出三个相位量 */
export function shiftTimeline(progress: number): ShiftTimeline {
  const p = clamp01(progress)
  const derailleur = smooth(clamp01(p / SHIFT_LEAD))
  const crossT = clamp01((p - SHIFT_CROSS.start) / (SHIFT_CROSS.end - SHIFT_CROSS.start))
  return {
    derailleur,
    contact: smooth(crossT),
    // 正弦鼓包：两端为 0（贴着齿谷），中间最高（骑在齿尖上）
    lift: Math.sin(Math.PI * crossT),
  }
}

/* =========================================================================
   齿形与链条的尺寸
   ========================================================================= */

/** 链条节距（mm） */
const PITCH = 12.7

/**
 * 齿顶 / 齿根相对节圆的高度（mm）。
 *
 * 真实链轮的齿顶大约在节圆外 3 mm、齿根在节圆内 4 mm 左右；
 * 这里按节距取 0.24 / 0.31 倍，12.7 mm 节距下就是 +3.05 / −3.94 mm。
 * 齿顶不能太高，否则换挡时链条得抬很高才越得过去，看起来像浮起来。
 */
export const TOOTH = {
  tip: PITCH * 0.24,
  root: PITCH * 0.31,
  /**
   * 换挡跨越时，链条中心线要抬到「两侧齿片的齿顶之外」再高多少。
   * 这个量决定跨越时链条离齿顶的视觉间隙。
   */
  crossingClearance: 0.9,
} as const

/** 换挡跨越所需的抬升峰值（mm）：齿顶高度 + 间隙 + 两侧节圆半径差的一半 */
export function liftPeakMm(radiusA: number, radiusB: number): number {
  return TOOTH.tip + TOOTH.crossingClearance + Math.abs(radiusB - radiusA) / 2
}
