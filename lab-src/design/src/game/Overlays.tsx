/**
 * 全屏遮罩层：待机 / 倒计时 / 暂停 / 碰撞演出 / 结算。
 *
 * 这些层只负责显示与转发点击，所有状态都来自 model 的 snapshot，
 * 不在这里另存一份「看到多少分」。
 */

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { GameSnapshot } from './model'
import { groupDigits } from './score'
import type { Quality } from './track'

/* ------------------------------------------------------------------ 共享件 */

function Stat({ label, value, unit, tone }: { label: string; value: string; unit?: string; tone?: 'signal' }) {
  return (
    <div className={`mowan-stat${tone === 'signal' ? ' mowan-stat--signal' : ''}`}>
      <p className="mowan-stat__label">{label}</p>
      <p className="mowan-stat__value">
        <span className="mono">{value}</span>
        {unit && <span className="mowan-stat__unit">{unit}</span>}
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ 待机 */

interface TitleProps {
  bestDistanceText: string
  bestGpaText: string
  bestNines: number
  onStart: () => void
  muted: boolean
  onToggleMuted: () => void
  loaded: boolean
}

export function TitleOverlay({
  bestDistanceText,
  bestGpaText,
  bestNines,
  onStart,
  muted,
  onToggleMuted,
  loaded,
}: TitleProps) {
  // 开幕背景照片：北航体能训练走廊。没有这张图时自动退回纯 CSS 的跑道底纹，
  // 页面不会因为缺图而变丑或者报错。
  const [photo, setPhoto] = useState<string | null>(null)
  useEffect(() => {
    const url = `${import.meta.env.BASE_URL}mowan/corridor.jpg`
    const image = new Image()
    image.onload = () => setPhoto(url)
    image.src = url
    return () => {
      image.onload = null
    }
  }, [])

  return (
    <div className="mowan-overlay mowan-title">
      <div
        className="mowan-title__photo"
        style={photo ? { backgroundImage: `url("${photo}")` } : undefined}
        aria-hidden="true"
      />
      <div className="mowan-title__scrim" aria-hidden="true" />
      <div className="mowan-title__content">
        <p className="mowan-title__eyebrow">魔丸模式 · 独立游戏入口</p>
        <h1 className="mowan-title__headline">
          为了绩点，
          <br />
          我把航空发动机装上了自行车。
        </h1>
        <p className="mowan-title__lede">
          自动前进，只管左右。躲开一排排低矮的连跳墙，撞一次就结束。
          分数会一直涨——怎么涨，骑上去自己看。
        </p>

        <dl className="mowan-title__controls">
          <div>
            <dt>电脑</dt>
            <dd>A / D 或 ← → 连续转向 · 空格短时冲刺 · Esc 暂停</dd>
          </div>
          <div>
            <dt>手机</dt>
            <dd>左右触控按钮转向 · 冲刺按钮 · 右上角暂停</dd>
          </div>
          <div>
            <dt>旁观</dt>
            <dd>暂停菜单里进旁观者模式：指针锁定 + WASD 自由飞，Esc 退出</dd>
          </div>
        </dl>

        <div className="mowan-title__actions">
          <button type="button" className="btn btn--primary mowan-start" onClick={onStart} disabled={!loaded}>
            {loaded ? '开始骑（Enter）' : '正在装发动机…'}
          </button>
          <button type="button" className="btn mowan-ghost" onClick={onToggleMuted} aria-pressed={!muted}>
            声音：{muted ? '关' : '开'}
          </button>
        </div>

        <p className="mowan-title__best">
          历史最好 <span className="mono">{bestDistanceText}</span> m · 魔丸 GPA{' '}
          <span className="mono">{bestGpaText}</span>
          {bestNines > 0 ? ` · 第 ${bestNines} 个 9` : ''}
        </p>
        <p className="mowan-title__fine">
          魔丸 GPA 是本游戏的虚构分数，与任何真实课程 GPA 无关。参考北航本科换算公式的上限 4.0
          只是一个梗：游戏里永远差一点。
        </p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ 倒计时 */

export function CountdownOverlay({ text }: { text: string }) {
  return (
    <div className="mowan-overlay mowan-countdown" aria-live="polite">
      <p key={text} className={`mowan-countdown__value${text === '冲' ? ' is-go' : ''}`}>
        {text}
      </p>
      <p className="mowan-countdown__hint">
        {text === '冲' ? '出发 · 注意前方路障' : '发动机已启动 · 3 秒后起步'}
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ 暂停 */

interface PauseProps {
  snapshot: GameSnapshot
  quality: Quality
  muted: boolean
  onResume: () => void
  onRestart: () => void
  onSpectate: () => void
  onQualityChange: (quality: Quality) => void
  onToggleMuted: () => void
}

export function PauseOverlay({
  snapshot,
  quality,
  muted,
  onResume,
  onRestart,
  onSpectate,
  onQualityChange,
  onToggleMuted,
}: PauseProps) {
  return (
    <div className="mowan-overlay mowan-panel-layer">
      <section className="mowan-panel" aria-labelledby="mowan-pause-title">
        <header className="mowan-panel__head">
          <p className="mowan-panel__eyebrow">已暂停</p>
          <h2 className="mowan-panel__title" id="mowan-pause-title">
            距离和分数都停在原地
          </h2>
          <p className="mowan-panel__note">暂停、旁观、摔车演出和结算期间，里程与魔丸 GPA 都不再增长。</p>
        </header>

        <div className="mowan-stats">
          <Stat label="距离" value={snapshot.distanceText} unit="m" />
          <Stat label="魔丸 GPA" value={snapshot.gpa.text} tone="signal" />
          <Stat label="9 的个数" value={String(snapshot.gpa.nines)} />
          <Stat label="历史最好" value={snapshot.bestText} unit="m" />
        </div>

        <div className="mowan-panel__actions">
          <button type="button" className="btn btn--primary" onClick={onResume}>
            继续骑（Esc）
          </button>
          <button type="button" className="btn" onClick={onRestart}>
            重新开始
          </button>
          <button type="button" className="btn" onClick={onSpectate}>
            旁观者模式
          </button>
        </div>

        <div className="mowan-panel__settings">
          <div className="mowan-setting">
            <span className="mowan-setting__label">画质</span>
            <div className="mowan-segment" role="group" aria-label="画质">
              <button
                type="button"
                className={quality === 'high' ? 'is-active' : ''}
                aria-pressed={quality === 'high'}
                onClick={() => onQualityChange('high')}
              >
                高
              </button>
              <button
                type="button"
                className={quality === 'low' ? 'is-active' : ''}
                aria-pressed={quality === 'low'}
                onClick={() => onQualityChange('low')}
              >
                低（省电）
              </button>
            </div>
          </div>
          <div className="mowan-setting">
            <span className="mowan-setting__label">声音</span>
            <button type="button" className="mowan-tool" onClick={onToggleMuted} aria-pressed={!muted}>
              {muted ? '已静音' : '开'}
            </button>
          </div>
          <Link className="mowan-panel__link" to="/">
            返回展馆
          </Link>
        </div>
      </section>
    </div>
  )
}

/* ------------------------------------------------------------------ 碰撞演出 */

export function CrashOverlay({ onSkip }: { onSkip: () => void }) {
  return (
    <div className="mowan-overlay mowan-crash">
      <p className="mowan-crash__word">咔嚓！</p>
      <p className="mowan-crash__note">卡通摔车与骨折提示 · 不做血腥表现 · 不代表真实伤情</p>
      <button type="button" className="btn mowan-crash__skip" onClick={onSkip}>
        跳过演出（空格）
      </button>
    </div>
  )
}

/* ------------------------------------------------------------------ 结算 */

interface ResultProps {
  snapshot: GameSnapshot
  onRestart: () => void
}

export function ResultOverlay({ snapshot, onRestart }: ResultProps) {
  const gpa = snapshot.gpa
  return (
    <div className="mowan-overlay mowan-panel-layer">
      <section className="mowan-panel mowan-panel--result" aria-labelledby="mowan-result-title">
        <header className="mowan-panel__head">
          <p className="mowan-panel__eyebrow">本局结束</p>
          <h2 className="mowan-panel__title" id="mowan-result-title">
            距离满绩还差一点，距离骨折已经为零。
          </h2>
          {snapshot.record && <p className="mowan-panel__badge">新纪录</p>}
        </header>

        <div className="mowan-stats">
          <Stat label="本局距离" value={snapshot.distanceText} unit="m" />
          <Stat label="魔丸 GPA" value={gpa.text} tone="signal" />
          <Stat label="拿到 9" value={groupDigits(gpa.nines)} />
          <Stat label="历史纪录" value={snapshot.bestText} unit="m" />
        </div>

        <p className="mowan-result__line">
          {gpa.reached
            ? `已经 ${groupDigits(gpa.nines)} 个 9 了，下一个还差 ${Math.max(0, Math.round(gpa.remaining))} 米。`
            : `还差 ${Math.max(0, Math.round(gpa.remaining))} 米才够到 3.9。`}
          {snapshot.crash && ` 撞击时车速 ${Math.round(snapshot.crash.speed * 3.6)} km/h。`}
        </p>

        <div className="mowan-panel__actions">
          <button type="button" className="btn btn--primary" onClick={onRestart}>
            再来一次（Enter）
          </button>
          <Link className="btn" to="/">
            返回展馆
          </Link>
        </div>

        {/* 这局用到的四件展品：看完就回去看原理，都是可选操作 */}
        <div className="mowan-result__exhibits">
          <p className="mowan-result__exhibits-label">这局用到的四件展品</p>
          <div className="mowan-result__exhibits-links">
            <Link className="btn" to="/exhibit/derailleur">
              自行车的变速
            </Link>
            <Link className="btn" to="/exhibit/engine">
              航空发动机
            </Link>
            <Link className="btn" to="/exhibit/gpa">
              GPA 的秘密
            </Link>
            <Link className="btn" to="/exhibit/bone">
              骨折原理
            </Link>
          </div>
        </div>

        <p className="mowan-panel__note">
          查看科普内容是可选操作，不会挡住重试。历史纪录按实际距离比较——显示出来的字符串可能一样（比如都是
          3.99），真正比的是米数。
        </p>
      </section>
    </div>
  )
}
