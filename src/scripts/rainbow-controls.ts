// Pseudo-elements survive text updates in playback buttons. 伪元素不会被播放按钮的文字更新移除。
const rainbowControls = document.querySelectorAll<HTMLElement>([
  'button', '.button', '.icon-button', '.nav-link', '.category-tab',
  '.wallpaper-scroll', '.mobile-navigation a', '.lab-card', '.lab-row', '.lab-all', '.about-link',
].join(','));

for (const control of rainbowControls) {
  if (getComputedStyle(control).position === 'static') control.classList.add('rainbow-positioned');
  control.classList.add('rainbow-hover');
}
