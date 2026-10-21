const root = document.documentElement;
const wallpaper = document.querySelector<HTMLElement>('.wallpaper-scene');
const hero = document.querySelector<HTMLElement>('#home');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const scrollHeader = document.querySelector<HTMLElement>('.site-header');
const firstContent = document.querySelector<HTMLElement>('#writing .section-heading');
if (scrollHeader && firstContent) {
  const setHeaderVisible = (visible: boolean) => {
    scrollHeader.classList.toggle('header-visible', visible);
    scrollHeader.inert = !visible;
    if (!visible) {
      const menu = scrollHeader.querySelector<HTMLElement>('#mobile-navigation');
      const menuButton = scrollHeader.querySelector<HTMLButtonElement>('.menu-toggle');
      if (menu) menu.hidden = true;
      menuButton?.setAttribute('aria-expanded', 'false');
      menuButton?.setAttribute('aria-label', '打开导航菜单');
    }
  };
  setHeaderVisible(false);
  if ('IntersectionObserver' in window) {
    // Share the content's reveal boundary. 与第一组内容在同一边界浮现。
    const headerObserver = new IntersectionObserver(entries => {
      const entry = entries[0];
      setHeaderVisible(entry.isIntersecting || entry.boundingClientRect.top < 0);
    }, { rootMargin: '0px 0px -32px 0px', threshold: 0.06 });
    headerObserver.observe(firstContent);
  } else {
    const updateHeader = () => setHeaderVisible(firstContent.getBoundingClientRect().top < window.innerHeight - 32);
    updateHeader();
    window.addEventListener('scroll', updateHeader, { passive: true });
  }
}

if (wallpaper && hero) {
  let framePending = false;
  let heroHeight = hero.offsetHeight;
  let previousDepth = -1;
  let entranceDepth = 0;

  // Crossfade two fixed layers; avoid recalculating a full-screen blur on every frame.
  // 固定清晰与模糊两层，只改变透明度，避免逐帧重算整张壁纸的模糊。
  const updateDepth = () => {
    const progress = Math.max(0, Math.min(1, (window.scrollY - heroHeight * 0.08) / (heroHeight * 0.78)));
    const depth = Math.round(Math.max(entranceDepth, progress * progress * (3 - 2 * progress)) * 1000) / 1000;
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
  let layoutUnderUserControl = false;
  let entranceFrame = 0;
  let entranceComplete = false;
  const entranceSize = () => ({
    peek: Math.min(192, Math.max(120, window.innerHeight * 0.24)),
    lift: Math.min(28, window.innerHeight * 0.034),
  });
  const applyEntrance = (progress: number) => {
    const eased = 1 - Math.pow(1 - progress, 3);
    entranceDepth = eased * 0.88;
    if (!layoutUnderUserControl) {
      const size = entranceSize();
      hero.style.setProperty('--intro-peek', `${(size.peek * eased).toFixed(2)}px`);
      hero.style.setProperty('--avatar-lift', `${(-size.lift * eased).toFixed(2)}px`);
    }
    updateDepth();
  };

  // Reveal the content by gently shortening the opening scene, without taking over scrolling.
  // 轻轻收起一小段首屏来露出内容，不接管访客的滚动操作。
  const takeControl = () => { layoutUnderUserControl = true; };
  const navigationKeys = new Set(['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' ', 'Tab']);
  const onEntranceKey = (event: KeyboardEvent) => { if (navigationKeys.has(event.key)) takeControl(); };
  const onVisibility = () => { if (document.hidden) takeControl(); };
  const releaseEntranceListeners = () => {
    window.removeEventListener('wheel', takeControl);
    window.removeEventListener('touchstart', takeControl);
    window.removeEventListener('pointerdown', takeControl);
    window.removeEventListener('keydown', onEntranceKey);
    window.removeEventListener('hashchange', takeControl);
    document.removeEventListener('visibilitychange', onVisibility);
  };
  const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  const animateEntrance = !reducedMotion.matches && !location.hash && window.scrollY < 8 && navigation?.type !== 'back_forward';
  if (animateEntrance) {
    window.addEventListener('wheel', takeControl, { passive: true });
    window.addEventListener('touchstart', takeControl, { passive: true });
    window.addEventListener('pointerdown', takeControl, { passive: true });
    window.addEventListener('keydown', onEntranceKey);
    window.addEventListener('hashchange', takeControl);
    document.addEventListener('visibilitychange', onVisibility);
    const start = performance.now() + 200;
    const animate = (time: number) => {
      const progress = Math.max(0, Math.min(1, (time - start) / 1700));
      applyEntrance(progress);
      if (progress < 1) entranceFrame = requestAnimationFrame(animate);
      else {
        entranceComplete = true;
        heroHeight = hero.offsetHeight;
        releaseEntranceListeners();
        updateDepth();
      }
    };
    entranceFrame = requestAnimationFrame(animate);
  } else {
    applyEntrance(1);
    entranceComplete = true;
    heroHeight = hero.offsetHeight;
  }
  reducedMotion.addEventListener('change', event => {
    if (event.matches && !entranceComplete) {
      cancelAnimationFrame(entranceFrame);
      applyEntrance(1);
      entranceComplete = true;
      heroHeight = hero.offsetHeight;
      releaseEntranceListeners();
    }
  });
  window.addEventListener('resize', () => {
    if (entranceComplete && !layoutUnderUserControl) applyEntrance(1);
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
