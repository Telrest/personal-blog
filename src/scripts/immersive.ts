const root = document.documentElement;
const wallpaper = document.querySelector<HTMLElement>('.wallpaper-scene');
const hero = document.querySelector<HTMLElement>('#home');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

if (wallpaper && hero) {
  let framePending = false;
  let heroHeight = hero.offsetHeight;
  let previousDepth = -1;

  // Crossfade two fixed layers; avoid recalculating a full-screen blur on every frame.
  // 固定清晰与模糊两层，只改变透明度，避免逐帧重算整张壁纸的模糊。
  const updateDepth = () => {
    const progress = Math.max(0, Math.min(1, (window.scrollY - heroHeight * 0.08) / (heroHeight * 0.78)));
    const depth = Math.round(progress * progress * (3 - 2 * progress) * 1000) / 1000;
    if (depth !== previousDepth) {
      wallpaper.style.setProperty('--wallpaper-depth', String(depth));
      previousDepth = depth;
    }
    framePending = false;
  };
  const queueDepthUpdate = () => {
    if (!framePending) {
      framePending = true;
      requestAnimationFrame(updateDepth);
    }
  };
  updateDepth();
  window.addEventListener('scroll', queueDepthUpdate, { passive: true });
  window.addEventListener('resize', () => {
    heroHeight = hero.offsetHeight;
    queueDepthUpdate();
  }, { passive: true });
  window.addEventListener('pageshow', queueDepthUpdate);
}

const revealItems = document.querySelectorAll<HTMLElement>('[data-reveal]');
if (!reducedMotion.matches && 'IntersectionObserver' in window) {
  const revealObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-visible');
      revealObserver.unobserve(entry.target);
    }
  }, { rootMargin: '0px 0px -32px 0px', threshold: 0.06 });

  for (const item of revealItems) {
    const delay = Number(item.dataset.revealDelay || 0);
    item.style.setProperty('--reveal-delay', `${Number.isFinite(delay) ? Math.min(200, Math.max(0, delay)) : 0}ms`);
    revealObserver.observe(item);
  }
  // Without JavaScript, content remains visible. 无脚本时默认展示全部内容。
  root.classList.add('reveal-ready');
  reducedMotion.addEventListener('change', event => {
    if (event.matches) {
      root.classList.remove('reveal-ready');
      revealObserver.disconnect();
    }
  });
}
