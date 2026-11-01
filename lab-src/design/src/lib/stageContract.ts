/**
 * 展品与「三维舞台」之间的统一契约。
 *
 * 一个展品模块拆成四层，各自只做一件事：
 *   model.ts       计算模型 / 状态机：真实单位，不 import three.js
 *   geometry.ts    几何展示：从模型状态摆零件，不自己算物理
 *   controls.tsx   界面：只负责把用户输入写回 store
 *   content.ts     解释内容：步骤、文案、来源标注
 *
 * 舞台（stage）只做三件事：按状态摆位、渲染、释放。
 * 所有展品共用这一套接口，所以暂停/重置/镜头/资源回收的行为一致。
 */

/** 舞台实例。由展品模块的工厂函数创建，由 ModelStage 组件驱动。 */
export interface StageRuntime<S> {
  /** 把最新模型状态推给场景。帧循环每帧都会调。 */
  update(state: S): void
  /** 画一帧 */
  render(): void
  resize(width: number, height: number, dpr: number): void
  /** 只有用户明确点了「回到默认视角」才会被调用 */
  resetCamera(): void
  dispose(): void
}

export interface StageHooks {
  /** 用户一旦自己动了镜头就调用一次，之后页面不许再自动抢回镜头 */
  onUserOrbit: () => void
}

export type StageFactory<S> = (
  canvas: HTMLCanvasElement,
  hooks: StageHooks,
) => Promise<StageRuntime<S>>

/** 三维不可用时的图文替代内容 */
export interface StageFallbackContent {
  title: string
  body: string
  /** 手绘风格的 SVG 结构示意，作为文字之外的补充 */
  diagram?: React.ReactNode
}
