import { Link } from 'react-router-dom'
import { EXHIBITS } from '../exhibits/registry'

export function NotFoundPage() {
  return (
    <main id="main" className="page-shell">
      <div className="shell">
        <p className="eyebrow">
          <span className="eyebrow__index">404</span>
          <span className="eyebrow__text">找不到这一页</span>
        </p>
        <h1 className="page-title">这条走廊通向空展位</h1>
        <p className="page-lead">
          地址可能写错了，也可能这件展品还没编号。展馆目前一共 {EXHIBITS.length} 件展品。
        </p>
        <div className="page-actions">
          <Link className="btn btn--primary" to="/">
            返回首页
          </Link>
        </div>
      </div>
    </main>
  )
}
