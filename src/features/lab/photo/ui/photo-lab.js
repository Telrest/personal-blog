import { renderAscii } from "../logic/ascii.js";
import {
  rasterizeImage,
  openDemoImage,
  openImageFile,
} from "../data/image-source.js";

const base = import.meta.env.BASE_URL;
const $ = (id) => document.getElementById(id);

const stageEl = $("pp-stage");
const artEl = $("pp-art");
const originalEl = $("pp-original");
const statusEl = $("pp-status");
const metaEl = $("pp-meta");
const widthEl = $("pp-width");
const modeEl = $("pp-mode");
const speedEl = $("pp-speed");
const lightEl = $("pp-light");
const enhanceEl = $("pp-enhance");
const followEl = $("pp-follow");
const playBtn = $("pp-play");
const finishBtn = $("pp-finish");
const holdBtn = $("pp-hold");
const demoSrcBtn = $("pp-demo");
const pickSrcBtn = $("pp-pick");
const fileEl = $("pp-file");

const state = {
  source: null,
  gray: null,
  grayKey: "",
  originalUrl: "",
  fullText: "",
  cols: 0,
  rows: 0,
  revealed: 0,
  raf: 0,
  playing: false,
};

function stageColor() {
  return lightEl.checked ? "#f7f7f2" : "#0f1b16";
}

// 只有底色变化才需要重新栅格化；拖宽度滑块时直接复用上次结果。
// Only the background colour forces a re-raster; width changes reuse it.
function buildImage() {
  const key = lightEl.checked ? "light" : "dark";
  if (state.gray && state.grayKey === key) return state.gray;
  const image = rasterizeImage(state.source, stageColor());
  state.gray = image;
  state.grayKey = key;
  return image;
}

/* ---------- 显示与逐字播放 ---------- */
// 量出当前字体下一个字符的真实宽度比例。
// Consolas 没有盲文点阵字形，浏览器会回退到别的字体，宽度和 0.6em 差很远；
// 硬按 0.6em 估算会让点阵模式溢出，滚动条一出现一消失就反复重排 —— 看起来就是抖动。
// Measure the real advance width: braille glyphs fall back to another font.
let ratioCache = { key: "", value: 0.6 };

function charRatio() {
  const sample = modeEl.value === "braille" ? "\u28ff" : "M";
  const fontFamily = getComputedStyle(artEl).fontFamily;
  const key = sample + "|" + fontFamily;
  if (ratioCache.key === key) return ratioCache.value;
  const probe = document.createElement("span");
  probe.setAttribute("aria-hidden", "true");
  probe.textContent = sample.repeat(50);
  probe.style.cssText =
    "position:fixed;top:-2000px;left:0;visibility:hidden;white-space:pre;" +
    "font-size:100px;line-height:1;letter-spacing:0;pointer-events:none;";
  probe.style.fontFamily = fontFamily;
  document.body.appendChild(probe);
  const width = probe.getBoundingClientRect().width;
  probe.remove();
  ratioCache = { key, value: width > 0 ? width / 50 / 100 : 0.6 };
  return ratioCache.value;
}

let lastFit = { width: 0, height: 0, size: 0 };

// 同时按宽和高收缩字号，让整幅字符画完整落在可视区域内，不用滚动。
// Shrink by both axes so the whole picture fits at once, without scrolling.
function fitStage(force) {
  if (!state.cols || !state.rows) return;
  const availWidth = stageEl.clientWidth - 36;
  const availHeight = stageEl.clientHeight - 36;
  if (availWidth <= 0 || availHeight <= 0) return;
  // 留 2% 余量：取整误差若让字符画刚好超出，就会出现横向滚动条，
  // 滚动条又吃掉高度、再次触发重排 —— 这才是抖动的来源。
  // Keep a small margin so rounding never spawns a horizontal scrollbar.
  const byWidth = (availWidth * 0.98) / (state.cols * charRatio());
  // 优先铺满宽度；太高的图就纵向滚动，和原程序的行为一致。
  // Fill the width first; tall pictures scroll vertically, like the original program.
  let size = byWidth;
  if (!Number.isFinite(size) || size <= 0) return;
  size = Math.max(1.1, Math.min(14, size));
  // 没有实质变化就不重设字号，避免和 ResizeObserver 互相触发形成死循环。
  // Skip no-op updates so the observer cannot ping-pong with us.
  const next = Number(size.toFixed(2));
  if (
    !force &&
    next === lastFit.size &&
    availWidth === lastFit.width &&
    availHeight === lastFit.height
  )
    return;
  lastFit = { width: availWidth, height: availHeight, size: next };
  artEl.style.fontSize = next + "px";
  artEl.style.lineHeight = "1";
}

function stopPlayback() {
  state.playing = false;
  if (state.raf) cancelAnimationFrame(state.raf);
  state.raf = 0;
}

// 按钮文案跟着状态走：完成态显示“运行示例”，中途暂停显示“继续”。
function updatePlayLabel() {
  if (state.playing) {
    playBtn.textContent = "暂停 / Pause";
    return;
  }
  if (state.revealed > 0 && state.revealed < state.fullText.length) {
    playBtn.textContent = "继续 / Resume";
    return;
  }
  playBtn.textContent = "重播 / Replay";
}

function play(fromStart) {
  stopPlayback();
  const total = state.fullText.length;
  if (!total) return;
  if (fromStart || state.revealed >= total) state.revealed = 0;
  artEl.textContent = state.fullText.slice(0, state.revealed);

  const base0 = state.revealed;
  const remaining = total - base0;
  const duration = Math.max(
    320,
    Number(speedEl.value) * 1000 * (remaining / total),
  );
  // 字符很多时降低重绘频率，避免每帧重排十万字符。
  // Repaint in chunks so huge outputs do not reflow on every frame.
  const paintStep = Math.max(1, Math.floor(total / 120));
  const started = performance.now();
  let last = -1;
  state.playing = true;
  updatePlayLabel();

  const tick = (now) => {
    if (!state.playing) return;
    const progress = Math.min(1, (now - started) / duration);
    if (progress >= 1) {
      state.playing = false;
      state.revealed = total;
      artEl.textContent = state.fullText;
      updatePlayLabel();
      if (followEl.checked) stageEl.scrollTop = stageEl.scrollHeight;
      return;
    }
    const reveal = base0 + Math.floor(progress * remaining);
    if (last < 0 || reveal - last >= paintStep) {
      last = reveal;
      state.revealed = reveal;
      artEl.textContent = state.fullText.slice(0, reveal);
      if (followEl.checked) stageEl.scrollTop = stageEl.scrollHeight;
    }
    state.raf = requestAnimationFrame(tick);
  };
  state.raf = requestAnimationFrame(tick);
}

function finishNow() {
  stopPlayback();
  state.revealed = state.fullText.length;
  artEl.textContent = state.fullText;
  updatePlayLabel();
}

function render() {
  if (!state.source) return;
  stopPlayback();
  const image = buildImage();
  const result = renderAscii(image, {
    columns: Number(widthEl.value),
    braille: modeEl.value === "braille",
    light: lightEl.checked,
    enhance: enhanceEl.checked,
  });

  stageEl.classList.toggle("is-light", lightEl.checked);
  // 点阵字符走固定字体，避免浏览器按字符随机回退导致宽度不齐。
  // Pin a braille-capable font so every cell has the same advance width.
  artEl.classList.toggle("is-braille", modeEl.value === "braille");
  state.fullText = result.lines.join("\n");
  state.cols = result.lines.length ? result.lines[0].length : 0;
  state.rows = result.lines.length;

  metaEl.hidden = false;
  metaEl.textContent = `${image.width}×${image.height} → ${result.columns}×${result.lines.length}`;
  statusEl.textContent = "就绪 / Ready";

  fitStage(true);
  // 打开即从空白开始逐字打印。
  // Start typing right away when the page loads.
  play(true);
}

/* ---------- 原图对照：按住显示，松开恢复 ---------- */
function showOriginal(show) {
  if (!state.originalUrl) return;
  originalEl.hidden = !show;
  artEl.hidden = show;
  holdBtn.classList.toggle("is-on", show);
}

function setOriginal(url) {
  // 换源时释放上一张的 blob，避免重复选图累积内存。
  // Release the previous blob when the source changes.
  if (
    state.originalUrl &&
    state.originalUrl.startsWith("blob:") &&
    state.originalUrl !== url
  ) {
    URL.revokeObjectURL(state.originalUrl);
  }
  state.originalUrl = url;
  originalEl.src = url;
}

/* ---------- 载入来源 ---------- */
async function showSource(kind, read, failure) {
  try {
    const { img, url } = await read();
    state.source = { img, kind };
    state.gray = null;
    setOriginal(url);
    render();
  } catch (error) {
    statusEl.textContent = failure;
    if (kind === "demo") console.error(error);
  }
}

function loadDemo() {
  statusEl.textContent = "载入图标 / Loading";
  return showSource("demo", () => openDemoImage(base), "图标载入失败 / Failed");
}

function loadFile(file) {
  statusEl.textContent = "读取照片 / Reading";
  return showSource(
    "photo",
    () => openImageFile(file),
    "无法读取这张图片 / Cannot read",
  );
}

function markSource(activeButton, otherButton) {
  activeButton.classList.add("is-on");
  otherButton.classList.remove("is-on");
}

/* ---------- 事件绑定 ---------- */
let widthTimer = 0;
widthEl.addEventListener("input", () => {
  clearTimeout(widthTimer);
  widthTimer = setTimeout(render, 180);
});
modeEl.addEventListener("change", render);
lightEl.addEventListener("change", render);
enhanceEl.addEventListener("change", render);

playBtn.addEventListener("click", () => {
  if (state.playing) {
    stopPlayback();
    updatePlayLabel();
  } else {
    play(false);
  }
});
finishBtn.addEventListener("click", finishNow);

holdBtn.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  if (holdBtn.setPointerCapture) {
    try {
      holdBtn.setPointerCapture(event.pointerId);
    } catch {}
  }
  showOriginal(true);
});
for (const name of ["pointerup", "pointercancel", "pointerleave"]) {
  holdBtn.addEventListener(name, () => showOriginal(false));
}
holdBtn.addEventListener("keydown", (event) => {
  if (event.key === " " || event.key === "Enter") {
    event.preventDefault();
    showOriginal(true);
  }
});
holdBtn.addEventListener("keyup", () => showOriginal(false));
holdBtn.addEventListener("blur", () => showOriginal(false));

demoSrcBtn.addEventListener("click", () => {
  markSource(demoSrcBtn, pickSrcBtn);
  loadDemo();
});
pickSrcBtn.addEventListener("click", () => fileEl.click());
fileEl.addEventListener("change", () => {
  const file = fileEl.files && fileEl.files[0];
  if (!file) return;
  markSource(pickSrcBtn, demoSrcBtn);
  loadFile(file);
  fileEl.value = "";
});

window.addEventListener("resize", fitStage);
// 容器尺寸变化（窗口缩放、字体加载）时重新适配字号。
if ("ResizeObserver" in window) {
  // 延后到下一帧再测，避免和本次字号修改互相触发。
  new ResizeObserver(() => requestAnimationFrame(() => fitStage())).observe(
    stageEl,
  );
}

// 默认底色跟随站点主题 / Follow the site theme by default.
lightEl.checked = document.documentElement.dataset.theme === "light";
loadDemo();
