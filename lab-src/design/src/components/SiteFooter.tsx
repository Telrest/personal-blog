import { Link } from 'react-router-dom'
import { EXHIBIT_STATS } from '../exhibits/registry'

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell site-footer__inner">
        <div className="site-footer__col">
          <p className="site-footer__brand">设计的秘密</p>
          <p className="site-footer__note">大学网站作业 · 交互式原理展馆</p>
          <p className="site-footer__note">
            <a href="../../">← 回到 Telrest 的博客</a>
          </p>
        </div>

        <div className="site-footer__col">
          <p className="site-footer__label">当前进度</p>
          <p className="site-footer__note">
            共 {EXHIBIT_STATS.total} 件展品，已开放 {EXHIBIT_STATS.ready} 件，
            {EXHIBIT_STATS.building} 件显示制作中。
          </p>
        </div>

        <div className="site-footer__col">
          <p className="site-footer__label">参考与许可</p>
          <p className="site-footer__note">
            建模与验证方法参考{' '}
            <a href="https://github.com/elvarofficial/teardown" target="_blank" rel="noreferrer noopener">
              elvarofficial/teardown
            </a>
            （MIT）。完整来源见 <Link to="/about">关于展馆</Link>。
          </p>
        </div>
      </div>
    </footer>
  )
}
