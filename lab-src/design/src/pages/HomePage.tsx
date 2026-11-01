import { Link } from 'react-router-dom'
import { DimLine, DrawingFrame } from '../components/DrawingFrame'
import { SectionHead } from '../components/SectionHead'
import { SourceLegend } from '../components/SourceTag'
import { StatusBadge } from '../components/StatusBadge'
import { EXHIBITS, EXHIBIT_STATS } from '../exhibits/registry'

export default function HomePage() {
  return (
    <main id="main" className="page-home">
      {/* ---------------- 展馆入口 ---------------- */}
      <section className="hero">
        <div className="shell hero__grid">
          <div className="hero__text">
            <p className="eyebrow">
              <span className="eyebrow__index">展馆</span>
              <span className="eyebrow__text">交互式原理展馆 · 第一版</span>
            </p>
            <h1 className="hero__title">设计的秘密</h1>
            <p className="hero__lede">
              <span className="hero__lede-line">拆开一个东西，改变一个条件，</span>
              <span className="hero__lede-line">看见它为什么这样工作。</span>
            </p>
            <p className="hero__body">
              每件展品都是你每天在用、却不一定说得清的东西。展馆把它拆到能看见动作的那一层，
              再把决定结果的参数交到你手上——为什么是这样工作，由你自己试出来。
            </p>

            <div className="hero__actions">
              <a className="btn btn--primary" href="#exhibits">
                从第一个问题开始
              </a>
              <Link className="btn" to="/about">
                关于这座展馆
              </Link>
            </div>

            <p className="hero__meta">
              共 {EXHIBIT_STATS.total} 件展品 · 已开放 {EXHIBIT_STATS.ready} 件 · 制作中{' '}
              {EXHIBIT_STATS.building} 件
            </p>
          </div>

          <div className="hero__drawing">
            <DrawingFrame
              label="展馆索引"
              ariaLabel="展馆索引：五件展品及当前进度"
            >
              <ol className="index-list">
                {EXHIBITS.map((exhibit) => (
                  <li key={exhibit.id} className="index-list__row">
                    <span className="index-list__num mono">{exhibit.index}</span>
                    <span className="index-list__title">{exhibit.title}</span>
                    <span className="index-list__status">{exhibit.statusLabel}</span>
                  </li>
                ))}
              </ol>
              <DimLine label="五件展品 · 一条主线：拆开、改变、看见" />
            </DrawingFrame>
          </div>
        </div>
      </section>

      {/* ---------------- 番外：独立游戏入口 ---------------- */}
      <section className="section section--mowan">
        <div className="shell">
          <Link to="/game" className="mowan-teaser">
            <div className="mowan-teaser__text">
              <p className="mowan-teaser__eyebrow">番外 · 独立游戏入口</p>
              <h2 className="mowan-teaser__title">为了绩点，我把航空发动机装上了自行车。</h2>
              <p className="mowan-teaser__lede">
                第三人称无尽躲避：自动前进，只用左右躲开一排排低矮的连跳墙。撞一次就结束，成绩留在本地。
                分数会一直涨，但涨法有点怪——具体怎么涨，骑上去自己看。
              </p>
              <p className="mowan-teaser__meta">
                <span>自行车 · 发动机 · GPA · 骨折</span>
                <span>键盘 / 触屏</span>
                <span>本地纪录</span>
              </p>
              <span className="mowan-teaser__cta">进入魔丸模式
                <span aria-hidden="true">→</span>
              </span>
            </div>

            <div className="mowan-teaser__board" aria-hidden="true">
              <p className="mowan-teaser__board-label">魔丸 GPA</p>
              <p className="mowan-teaser__board-value">？</p>
              <p className="mowan-teaser__board-hint">
                跑得越远，这个数越接近 4.0。
                <br />
                但它长什么样，得自己骑出来。
              </p>
              <p className="mowan-teaser__board-foot">不替换任何原理展品 · 单独加载</p>
            </div>
          </Link>
        </div>
      </section>

      {/* ---------------- 五个问题 ---------------- */}
      <section className="section section--exhibits" id="exhibits">
        <div className="shell">
          <SectionHead
            index="01"
            eyebrow="五个问题"
            title="从一个问题进去"
            lead="每件展品都从一个具体的问题开始。问题比结论好记：先觉得奇怪，才有想拆开的冲动。"
            aside={
              <p className="section-head__aside-text">
                <span className="mono">{EXHIBIT_STATS.total}</span> 件展品
                <br />
                <span className="mono">{EXHIBIT_STATS.ready}</span> 件可操作
              </p>
            }
          />

          <ol className="question-list">
            {EXHIBITS.map((exhibit) => (
              <li key={exhibit.id} className="question-list__item">
                <Link className="question-card" to={`/exhibit/${exhibit.id}`}>
                  <span className="question-card__index mono" aria-hidden="true">
                    {exhibit.index}
                  </span>

                  <span className="question-card__body">
                    <span className="question-card__question">{exhibit.question}</span>
                    <span className="question-card__meta">
                      <span className="question-card__title">{exhibit.title}</span>
                      <span className="question-card__sep" aria-hidden="true">
                        /
                      </span>
                      <span className="question-card__subtitle">{exhibit.subtitle}</span>
                    </span>
                  </span>

                  <span className="question-card__side">
                    <StatusBadge status={exhibit.status} label={exhibit.statusLabel} size="sm" />
                    <span className="question-card__cta">
                      <span>{exhibit.status === 'ready' ? '进入展品' : '查看进度'}</span>
                      <span aria-hidden="true">→</span>
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------------- 怎么用 ---------------- */}
      <section className="section section--howto">
        <div className="shell">
          <SectionHead
            index="02"
            eyebrow="怎么用"
            title="两种看法，同一套模型"
            lead="导览和自由探索不是两个版本，只是「谁来改参数」不同。所有读数、三维场景和图表都从同一份模型状态算出来，所以两种模式看到的数字永远一致。"
          />

          <div className="howto-grid">
            <article className="howto-card">
              <p className="howto-card__tag mono">模式 A</p>
              <h3 className="howto-card__title">带我看懂</h3>
              <p className="howto-card__body">
                展馆按步骤带你走。一步只改一个条件，改完停住，等你看清楚再走下一步。
                随时可以退出导览，参数和镜头留在原地，接着自己动手。
              </p>
            </article>

            <article className="howto-card">
              <p className="howto-card__tag mono">模式 B</p>
              <h3 className="howto-card__title">自由探索</h3>
              <p className="howto-card__body">
                参数全在你手上：拖动、暂停、重置、加速、剖开外壳看内部。
                镜头一旦被你动过，页面就不再自动回正——除非你自己点「回到默认视角」。
              </p>
            </article>

            <article className="howto-card">
              <p className="howto-card__tag mono">通用</p>
              <h3 className="howto-card__title">每件展品都一样的地方</h3>
              <p className="howto-card__body">
                暂停、重置、观察速度、数据来源标签，位置和行为全站统一。
                桌面端控制栏在模型右侧，手机上是模型下方，标签文字始终可见。
              </p>
            </article>
          </div>
        </div>
      </section>

      {/* ---------------- 数据诚实 ---------------- */}
      <section className="section section--sources">
        <div className="shell">
          <SectionHead
            index="03"
            eyebrow="数据诚实"
            title="每个数字都带出处"
            lead="展馆区分四类数据，标签用文字写出来而不是只靠颜色——黑白打印、色觉差异都能读懂。"
          />
          <SourceLegend />
        </div>
      </section>
    </main>
  )
}
