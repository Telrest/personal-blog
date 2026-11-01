/**
 * 彩虹悬停边缘的打标器。
 *
 * 为什么不写在 CSS 里：有些控件（例如三维舞台右上角的「全屏」）本身就是
 * `position: absolute`，如果无脑给所有 button 加 `position: relative`，
 * 它们会脱离原位、跑出容器。这里只在「计算后的 position 是 static」时
 * 才补 .rainbow-positioned。
 *
 * Only tag controls whose computed position is static, so absolutely
 * positioned controls keep their place.
 */
const SELECTOR = 'button, .btn, .site-nav__link, .link, summary'

function tag(): void {
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(SELECTOR))) {
    if (el.classList.contains('rainbow-hover')) continue
    if (getComputedStyle(el).position === 'static') el.classList.add('rainbow-positioned')
    el.classList.add('rainbow-hover')
  }
}

let scheduled = false

function schedule(): void {
  if (scheduled) return
  scheduled = true
  requestAnimationFrame(() => {
    scheduled = false
    tag()
  })
}

export function startRainbowControls(): void {
  tag()
  if (typeof MutationObserver === 'undefined') return
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true })
}
