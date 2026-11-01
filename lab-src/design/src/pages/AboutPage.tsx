import { useState } from 'react'
import { Link } from 'react-router-dom'
import { SectionHead } from '../components/SectionHead'
import { SourceLegend } from '../components/SourceTag'
import { CameraBar } from '../components/controls/CameraBar'
import { ControlPanel, ControlSection } from '../components/controls/ControlPanel'
import { Readout } from '../components/controls/Readout'
import { SegmentedControl } from '../components/controls/SegmentedControl'
import { SliderControl } from '../components/controls/SliderControl'
import { ToggleControl } from '../components/controls/ToggleControl'
import { TransportBar } from '../components/controls/TransportBar'
import { fmt } from '../lib/format'

/** 控制语言示例：与展品页使用同一批组件，只演示行为，不代表任何真实展品参数。 */
function ControlDemo() {
  const [depth, setDepth] = useState(8)
  const [viewMode, setViewMode] = useState('solid')
  const [annotate, setAnnotate] = useState(true)
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState(1)
  const [cameraMoved, setCameraMoved] = useState(false)

  return (
    <div className="demo">
      <div className="demo__panel">
        <ControlPanel title="控制语言示例" subtitle="这组控件与展品页完全同源">          <ControlSection title="模型参数">
            <SliderControl
              label="剖切深度"
              value={depth}
              min={0}
              max={20}
              step={0.5}
              unit="mm"
              source="assumption"
              hint="演示用参数：只演示滑块行为，不代表任何真实展品尺寸。"
              onChange={setDepth}
            />
            <SegmentedControl
              label="展示方式"
              value={viewMode}
              onChange={setViewMode}
              options={[
                { value: 'solid', label: '实体' },
                { value: 'section', label: '剖切' },
                { value: 'xray', label: '透视' },
              ]}
            />
            <ToggleControl
              label="显示标注"
              checked={annotate}
              onChange={setAnnotate}
              hint="开关右侧始终写着「开 / 关」，不靠颜色判断状态。"
            />
          </ControlSection>

          <ControlSection title="观察">
            <TransportBar
              playing={playing}
              speed={speed}
              onToggle={() => setPlaying((value) => !value)}
              onReset={() => setPlaying(true)}
              onSpeedChange={setSpeed}
              timeLabel={`${fmt(depth, 1)} mm`}
            />
            <CameraBar
              cameraMoved={cameraMoved}
              onResetCamera={() => setCameraMoved(false)}
              views={[
                { value: 'default', label: '默认' },
                { value: 'side', label: '侧视' },
                { value: 'top', label: '俯视' },
              ]}
              view="default"
              onViewChange={() => setCameraMoved(false)}
            />
          </ControlSection>

          <ControlSection title="读数">
            <Readout
              items={[
                { label: '剖切深度', value: fmt(depth, 1), unit: 'mm', source: 'assumption' },
                { label: '展示方式', value: viewMode === 'solid' ? '实体' : viewMode === 'section' ? '剖切' : '透视' },
                { label: '标注', value: annotate ? '显示' : '隐藏' },
                { label: '观察速度', value: `${speed}×` },
              ]}
            />
          </ControlSection>
        </ControlPanel>
      </div>

      <div className="demo__aside">
        <p className="demo__note">
          模拟「用户动了镜头」：
          <button type="button" className="demo__button" onClick={() => setCameraMoved(true)}>
            让镜头进入自由状态
          </button>
          ——这时状态条会写「自由视角（已停止自动回正）」，只有点「回到默认视角」才会恢复。
        </p>

        <ul className="demo__rules">
          <li>
            <strong>滑块</strong>：标签、当前值、单位、量程两端全部写出来；数值的可信度来源标在标签旁边。
          </li>
          <li>
            <strong>单选组</strong>：选中项同时有 ✓ 符号、下划线和加粗，三重表达，不只靠颜色。
          </li>
          <li>
            <strong>开关</strong>：右侧永远写着「开」或「关」，不看颜色也知道状态。
          </li>
          <li>
            <strong>播放条</strong>：按钮文字随状态变成「播放 / 暂停」；重置回到初始条件，不是回到第一帧。
          </li>
          <li>
            <strong>镜头条</strong>：用户动过镜头后就写「自由视角」，除非本人点按钮，没有任何代码会把镜头拉回去。
          </li>
        </ul>
      </div>
    </div>
  )
}

const LIMITS = [
  '五件展品都已开放，但每件的模型都是教学示意：外观参考公开产品，内部结构与参数按教学需要简化，不对应任何真实型号的实测数据。',
  '还没有接入真实测量数据：展品参数必须在建模时逐条标注来源，标注不出来的数值不会出现在页面上。',
  '移动端只验证了布局与触控目标尺寸，没有在真机上做长时间性能测试。',
  '三维不可用时的兜底是统一说明 + 文字替代，图文结构示意是按展品各写一段，没有做成完整的分步图解。',
  '没有做账号、后端、学校系统接入和视频导出——按约定不在这一版范围内。',
]

export default function AboutPage() {
  return (
    <main id="main" className="page-about">
      <div className="shell">
        <header className="page-head">
          <p className="eyebrow">
            <span className="eyebrow__index">关于</span>
            <span className="eyebrow__text">设计原则与实现说明</span>
          </p>
          <h1 className="page-title">一座可以拆开的原理展馆</h1>
          <p className="page-lede">
            展馆不收门票，也不放解说牌。它只做一件事：把一件东西拆到能看见动作的那一层，
            然后把决定结果的参数交到你手上。
          </p>
        </header>

        <section className="section section--tight">
          <SectionHead index="01" eyebrow="原则" title="三条写死的规矩" />
          <div className="principle-grid">
            <article className="principle">
              <h3 className="principle__title">模型是唯一事实来源</h3>
              <p className="principle__body">
                输入参数与模型状态只存一份。三维场景、二维图表、读数、文字标签全都从这一份状态算出来，
                所以屏幕上不可能出现「模型在动、读数不动」的情况。
              </p>
            </article>
            <article className="principle">
              <h3 className="principle__title">锁止、历史、多输入用状态机</h3>
              <p className="principle__body">
                不能用一条时间变量糊过去的机构（例如按动笔的凸轮锁止），一律写成明确状态机：
                状态有哪些、什么事件能把状态推到哪去，都能在代码里读出来，而不是藏在时间函数里。
              </p>
            </article>
            <article className="principle">
              <h3 className="principle__title">数字必须能回答「从哪来」</h3>
              <p className="principle__body">
                每个数值旁边都有来源标签：实测、文献、教学假设或纯视觉效果。
                找不到出处的数值宁可不显示，也不先编一个占位。
              </p>
            </article>
          </div>
        </section>

        <section className="section section--tight">
          <SectionHead
            index="02"
            eyebrow="控制语言"
            title="按钮上都写着字"
            lead="所有控制都有文字标签；状态用文字写出来，颜色只是辅助。下面这组控件与展品页用的是同一批组件，可以直接点。"
          />
          <ControlDemo />
        </section>

        <section className="section section--tight">
          <SectionHead
            index="03"
            eyebrow="数据分级"
            title="四类数据，四种说法"
            lead="来源标签在展品里会出现在滑块旁边、读数表里和说明文字中。"
          />
          <SourceLegend />
        </section>

        <section className="section section--tight">
          <SectionHead index="04" eyebrow="实现" title="每个模块拆成四层" />
          <div className="arch-grid">
            <dl className="arch-list">
              <div className="arch-list__row">
                <dt>model</dt>
                <dd>计算模型与状态机。真实的物理单位，不引入 three.js，可以单独单元测试。</dd>
              </div>
              <div className="arch-list__row">
                <dt>geometry</dt>
                <dd>几何展示。只负责按模型状态摆零件、剖切、上色，不自己算物理。</dd>
              </div>
              <div className="arch-list__row">
                <dt>controls</dt>
                <dd>界面。把用户输入写回唯一的状态源，不保存第二份显示数值。</dd>
              </div>
              <div className="arch-list__row">
                <dt>content</dt>
                <dd>解释内容。导览步骤、文案、数据来源与出处。</dd>
              </div>
            </dl>
            <ul className="arch-notes">
              <li>每件展品独立加载，首页不启动任何三维场景。</li>
              <li>同一时刻页面里只有一个 requestAnimationFrame 在跑。</li>
              <li>离开展品页会停止动画并释放几何体、材质、贴图与 GPU 上下文。</li>
              <li>没有 WebGL 时给出图文替代，不进黑屏。</li>
            </ul>
          </div>
        </section>

        <section className="section section--tight">
          <SectionHead index="05" eyebrow="参考" title="借鉴了什么，复用了什么" />
          <div className="credit">
            <p className="credit__body">
              建模与验证方法参考{' '}
              <a
                className="link"
                href="https://github.com/elvarofficial/teardown"
                target="_blank"
                rel="noreferrer noopener"
              >
                elvarofficial/teardown
              </a>
              （MIT，作者 elvarofficial 与 whaleyxbt）。具体借鉴的是四件事：
            </p>
            <ul className="credit__list">
              <li>
                <strong>真实参考建模</strong>：先找实物照片、剖切图或厂商图，对着建，而不是凭一句描述想象。
              </li>
              <li>
                <strong>统一模型状态</strong>：一个输入驱动全部姿态与读数，面板与画面不可能互相矛盾。
              </li>
              <li>
                <strong>剖切观察</strong>：把正在工作的零件单独打开、剖开、透视，比绕十圈更有用。
              </li>
              <li>
                <strong>按帧复核</strong>：不能靠「我觉得对」交付，要截图逐帧对照检查清单。
              </li>
            </ul>
            <p className="credit__body">
              没有复制该仓库的源码：它的三个示例是 V8 发动机、起落架与仿生兽，没有圆珠笔或涡扇模型；
              本项目也不沿用它的单文件打包方式。其许可为 MIT，若后续复用其中代码，
              会在此处登记文件名、原路径与许可证全文。
            </p>
            <p className="credit__body">
              技术栈：Vite + TypeScript + React + three.js。三维只在进入展品时加载，
              首页与「制作中」页面完全不引入 three.js。
            </p>
          </div>
        </section>

        <section className="section section--tight">
          <SectionHead index="06" eyebrow="现状" title="还没做好的地方" />
          <ul className="limits">
            {LIMITS.map((item) => (
              <li key={item} className="limits__item">
                {item}
              </li>
            ))}
          </ul>
          <p className="limits__back">
            <Link className="link" to="/">
              ← 回到展馆入口
            </Link>
          </p>
        </section>
      </div>
    </main>
  )
}
