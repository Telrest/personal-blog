/** 懒加载展品模块时的占位，尺寸固定，避免布局跳动 */
export function PageLoading({ label = '正在加载展品…' }: { label?: string }) {
  return (
    <div className="loading" role="status" aria-live="polite">
      <span className="loading__bar" aria-hidden="true" />
      <p className="loading__text">{label}</p>
    </div>
  )
}
