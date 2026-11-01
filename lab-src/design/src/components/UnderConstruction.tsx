import type { ExhibitEntry } from '../exhibits/registry'
import { DrawingFrame } from './DrawingFrame'
import { StatusBadge } from './StatusBadge'

interface UnderConstructionProps {
  meta: ExhibitEntry
}

/**
 * 「制作中」展品页。
 *
 * 不摆假模型、不写假进度条：
 *  - 说明现在是什么状态、计划包含什么、为什么还没有数字；
 *  - 说明这一页不会加载三维场景（打开很快，这点本身是真实的）；
 *  - 给出进入其他展品与返回首页的路。
 */
export function UnderConstruction({ meta }: UnderConstructionProps) {
  return (
    <div className="construction">
      <div className="construction__notice" role="status">
        <StatusBadge status={meta.status} label={meta.statusLabel} />
        <p className="construction__notice-text">
          这件展品的模型尚未实现。本页<strong>不会加载三维场景</strong>，也没有任何可操作的参数。
        </p>
      </div>

      <div className="construction__grid">
        <DrawingFrame
          label="计划包含"
          titleBlock={[
            { label: '图号', value: `SD-${meta.index}` },
            { label: '主视图', value: meta.view === '3d' ? '三维' : '二维图表' },
            { label: '状态', value: meta.statusLabel },
            { label: '版次', value: '草案' },
          ]}
        >
          <p className="construction__deck">{meta.deck}</p>
          <ol className="construction__list">
            {meta.planned.map((item, index) => (
              <li key={item} className="construction__item">
                <span className="construction__num mono">{String(index + 1).padStart(2, '0')}</span>
                <span>{item}</span>
              </li>
            ))}
          </ol>
        </DrawingFrame>

        <div className="construction__side">
          <section className="construction__block">
            <h2 className="construction__block-title">当前状态</h2>
            <p className="construction__block-body">{meta.note}</p>
          </section>

          <section className="construction__block">
            <h2 className="construction__block-title">为什么还没有数字</h2>
            <p className="construction__block-body">
              站内约定：任何尺寸、转速、阈值都必须能说明是实测、文献、教学假设还是纯视觉效果。
              找不到出处的数值宁可不显示，也不先编一个占位。
            </p>
          </section>

          <section className="construction__block">
            <h2 className="construction__block-title">已经就位的部分</h2>
            <p className="construction__block-body">
              全站框架、展品路由、统一控制组件（暂停 / 重置 / 观察速度 / 镜头锁定 / 数据来源标签）
              与三维舞台都已完成，接入模型后即可操作。
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
