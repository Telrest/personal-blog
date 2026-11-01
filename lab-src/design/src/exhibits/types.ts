/** 展品编号：顺序即首页问题的顺序 */
export type ExhibitId = 'pen' | 'engine' | 'bone' | 'gpa' | 'derailleur'

/**
 * ready   —— 可以操作，模型已实现
 * building —— 正在实现，页面结构已就位
 * planned —— 只完成了选题与内容规划
 */
export type ExhibitStatus = 'ready' | 'building' | 'planned'

export interface ExhibitMeta {
  id: ExhibitId
  /** 展品编号，01–05 */
  index: string
  title: string
  subtitle: string
  /** 首页用来引导进入的那一个问题 */
  question: string
  /** 一句话说明「要看懂的是什么」 */
  deck: string
  /** 计划包含的内容，未完成展品用它诚实地交代范围 */
  planned: string[]
  status: ExhibitStatus
  /** 状态文字，永远用文字表达，不靠颜色 */
  statusLabel: string
  /** 当前状态的补充说明 */
  note: string
  /** 主视图是三维还是二维 */
  view: '3d' | '2d'
  /** 该展品使用的数据来源种类，用于首页/详情页提示 */
  sources?: string[]
}

export type ExhibitMode = 'guide' | 'free'

export interface ExhibitModuleProps {
  meta: ExhibitMeta
  mode: ExhibitMode
  /**
   * 切换观看方式。模块内的「退出导览」用它把页面切回自由探索；
   * 不传时模块只负责自己的内容，不改变页面模式（现有展品不传也不受影响）。
   */
  onModeChange?: (mode: ExhibitMode) => void
}
