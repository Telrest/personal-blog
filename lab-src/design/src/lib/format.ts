/** 数值格式化：读数一律走这里，保证同一数值在全站显示一致。 */

export function fmt(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '—'
  const rounded = Number(value.toFixed(digits))
  return String(rounded)
}

/** 固定小数位，用于需要对齐的读数表 */
export function fmtFixed(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '—'
  return value.toFixed(digits)
}

export function fmtSigned(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '—'
  const text = fmt(Math.abs(value), digits)
  if (Number(value.toFixed(digits)) === 0) return text
  return `${value > 0 ? '+' : '−'}${text}`
}

export function fmtRange(min: number, max: number, unit?: string): string {
  const suffix = unit ? ` ${unit}` : ''
  return `${fmt(min)} – ${fmt(max)}${suffix}`
}
