import { normalizeNumbers, sortFailure } from "../logic/sort-input.js";
import {
  loadPartitionRuntime,
  partitionResult,
} from "../data/partition-wasm.js";

const byId = (id) => document.getElementById(id);
const form = byId("partition-form");
const input = byId("numbers");
const mode = byId("mode");
const result = byId("result");
let runtime;
let frames = [];
let frameIndex = 0;
let timer = null;
let scaleMin = 0;
let scaleMax = 1;

function showError(message) {
  byId("error").textContent = message;
  byId("error").hidden = false;
}
function pause() {
  if (timer !== null) clearTimeout(timer);
  timer = null;
  byId("play").textContent = "播放 / Play";
}
function clearOutput() {
  pause();
  frames = [];
  frameIndex = 0;
  for (const id of ["error", "pivot-label", "position", "playback", "legend"])
    byId(id).hidden = true;
  byId("bars").replaceChildren();
  const message = document.createElement("p");
  message.className = "placeholder";
  message.textContent =
    "选择功能后点击“运行”。 / Choose a mode, then click “Run”.";
  result.replaceChildren(message);
}
function colorAt(index, frame, complete) {
  if (complete) return "sorted";
  if (!frame || frame.pos < 0) return "neutral";
  if (index === frame.pos) return "pivot";
  if (index < frame.left || index > frame.right) return "neutral";
  return index < frame.pos ? "left" : "right";
}
function renderValues(values, frame = null, complete = false) {
  const chips = document.createDocumentFragment();
  values.forEach((value, index) => {
    const chip = document.createElement("span");
    chip.className = "number " + colorAt(index, frame, complete);
    chip.textContent = value;
    chip.title = `下标 / Index: ${index}`;
    chips.appendChild(chip);
  });
  result.replaceChildren(chips);
}
function renderFrame() {
  const frame = frames[frameIndex];
  const complete = frameIndex === frames.length - 1;
  renderValues(frame.values, frame, complete);
  const columns = document.createDocumentFragment();
  frame.values.forEach((value, index) => {
    const column = document.createElement("div");
    column.className = "bar-column";
    const bar = document.createElement("div");
    bar.className = "bar " + colorAt(index, frame, complete);
    bar.style.height = `${scaleMin === scaleMax ? 100 : 20 + (140 * (value - scaleMin)) / (scaleMax - scaleMin)}px`;
    bar.title = `下标 / Index: ${index} · 值 / Value: ${value}`;
    const label = document.createElement("span");
    label.textContent = value;
    column.append(bar, label);
    columns.appendChild(column);
  });
  byId("bars").replaceChildren(columns);
  byId("timeline").value = frameIndex;
  byId("previous").disabled = frameIndex === 0;
  byId("next").disabled = complete;
  byId("play").disabled = complete;
  byId("pivot-label").hidden = frame.pos < 0;
  byId("position").hidden = frame.pos < 0;
  byId("legend").hidden = frame.pos < 0;
  if (complete) {
    byId("step-description").textContent =
      `排序完成，共 ${frames.length - 2} 次分组。 / Sorting complete: ${frames.length - 2} partitions.`;
  } else if (frameIndex === 0) {
    byId("step-description").textContent =
      "初始数组。点击播放或下一步。 / Initial array. Click Play or Next.";
  } else {
    byId("step-description").textContent =
      `第 ${frameIndex} / ${frames.length - 2} 次分组：范围 [${frame.left}, ${frame.right}]，基准 ${frame.pivot}。 / Partition ${frameIndex} of ${frames.length - 2}: range [${frame.left}, ${frame.right}], pivot ${frame.pivot}.`;
    byId("pivot-label").textContent = `基准 / Pivot: ${frame.pivot}`;
    byId("position").textContent =
      `基准已放到下标 ${frame.pos}（从 0 开始）。 / Pivot placed at index ${frame.pos} (starting at 0).`;
  }
}
function scheduleNext() {
  timer = setTimeout(
    () => {
      frameIndex++;
      renderFrame();
      if (frameIndex === frames.length - 1) pause();
      else scheduleNext();
    },
    Number(byId("speed").value),
  );
}
form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!runtime) return;
  clearOutput();
  let text;
  try {
    text = normalizeNumbers(input.value);
  } catch (error) {
    showError(error.message);
    return;
  }
  try {
    const output = partitionResult(runtime, mode.value, text);
    const { code, values } = output;
    if (code < 0) {
      showError(sortFailure(code));
      return;
    }
    if (mode.value === "partition") {
      const { pivot } = output;
      renderValues(values, { left: 0, right: values.length - 1, pos: code });
      byId("pivot-label").textContent = `基准 / Pivot: ${pivot}`;
      byId("position").textContent =
        `基准最终下标：${code}；左右两段还不一定有序。 / Final pivot index: ${code}; the two sections may still be unsorted.`;
      for (const id of ["pivot-label", "position", "legend"])
        byId(id).hidden = false;
    } else if (mode.value === "sort") {
      renderValues(values, null, true);
      byId("position").textContent =
        `已按从小到大排好 ${values.length} 个数。 / Sorted ${values.length} numbers in ascending order.`;
      byId("position").hidden = false;
    } else {
      frames = output.frames;
      const total = frames.length;
      scaleMin = Math.min(...values);
      scaleMax = Math.max(...values);
      byId("timeline").max = total - 1;
      byId("playback").hidden = false;
      renderFrame();
    }
  } catch (error) {
    clearOutput();
    showError(
      "程序运行失败，请刷新页面后重试。 / The program failed. Refresh the page and try again.",
    );
    console.error(error);
  }
});
byId("play").addEventListener("click", () => {
  if (timer !== null) return pause();
  if (!frames.length || frameIndex === frames.length - 1) return;
  byId("play").textContent = "暂停 / Pause";
  scheduleNext();
});
for (const [id, delta] of [
  ["previous", -1],
  ["next", 1],
]) {
  byId(id).addEventListener("click", () => {
    pause();
    frameIndex = Math.max(0, Math.min(frames.length - 1, frameIndex + delta));
    if (frames.length) renderFrame();
  });
}
byId("restart").addEventListener("click", () => {
  pause();
  frameIndex = 0;
  if (frames.length) renderFrame();
});
byId("timeline").addEventListener("input", () => {
  pause();
  frameIndex = Number(byId("timeline").value);
  if (frames.length) renderFrame();
});
byId("speed").addEventListener("change", () => {
  if (timer !== null) {
    pause();
    byId("play").textContent = "暂停 / Pause";
    scheduleNext();
  }
});
mode.addEventListener("change", clearOutput);
input.addEventListener("input", clearOutput);
byId("example").addEventListener("click", () => {
  input.value = "3 1 5 2 6 4";
  clearOutput();
  input.focus();
});
async function initialize() {
  try {
    runtime = await loadPartitionRuntime();
    byId("run").disabled = false;
    byId("status").textContent = "就绪 / Ready";
  } catch (error) {
    byId("status").textContent = "加载失败 / Load failed";
    showError(
      "程序未能加载，请刷新页面后重试。 / The program could not load. Refresh the page and try again.",
    );
    console.error(error);
  }
}
initialize();
