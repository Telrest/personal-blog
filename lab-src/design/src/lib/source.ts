/**
 * 数据来源分级。
 *
 * 每个数值都必须能回答「这个数从哪来」。界面上一律用文字标签说明，
 * 不靠颜色区分——颜色只是辅助。
 */

export type SourceKind = 'measured' | 'literature' | 'assumption' | 'visual'

export interface SourceMeta {
  kind: SourceKind
  label: string
  short: string
  description: string
}

export const SOURCES: Record<SourceKind, SourceMeta> = {
  measured: {
    kind: 'measured',
    label: '实测数据',
    short: '实测',
    description: '对实物直接测量，或来自厂商公开的技术资料。',
  },
  literature: {
    kind: 'literature',
    label: '文献参数',
    short: '文献',
    description: '来自教材、设计手册或论文的公开数值，逐条标注出处。',
  },
  assumption: {
    kind: 'assumption',
    label: '教学假设',
    short: '假设',
    description: '为了让原理讲清楚而做的简化，不代表真实产品的参数。',
  },
  visual: {
    kind: 'visual',
    label: '纯视觉效果',
    short: '视觉',
    description: '只表达结构关系或强调重点，不代表真实尺寸与物理量。',
  },
}

/** 展示顺序：越靠前可信度越高 */
export const SOURCE_ORDER: SourceKind[] = ['measured', 'literature', 'assumption', 'visual']

export function sourceMeta(kind: SourceKind): SourceMeta {
  return SOURCES[kind]
}
