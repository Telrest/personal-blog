"use strict";
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

// C 排序并记录步骤；JavaScript 只显示和播放。 / C sorts and records; JavaScript displays and plays.
function call(name, type, args = [], values = []) {
  return runtime.ccall(name, type, args, values);
}
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
  for (const id of ["error", "pivot-label", "position", "playback", "legend"]) byId(id).hidden = true;
  byId("bars").replaceChildren();
  const message = document.createElement("p");
  message.className = "placeholder";
  message.textContent = "选择功能后点击“运行”。 / Choose a mode, then click “Run”.";
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
    bar.style.height = `${scaleMin === scaleMax ? 100 : 20 + 140 * (value - scaleMin) / (scaleMax - scaleMin)}px`;
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
    byId("step-description").textContent = `排序完成，共 ${frames.length - 2} 次分组。 / Sorting complete: ${frames.length - 2} partitions.`;
  } else if (frameIndex === 0) {
    byId("step-description").textContent = "初始数组。点击播放或下一步。 / Initial array. Click Play or Next.";
  } else {
    byId("step-description").textContent = `第 ${frameIndex} / ${frames.length - 2} 次分组：范围 [${frame.left}, ${frame.right}]，基准 ${frame.pivot}。 / Partition ${frameIndex} of ${frames.length - 2}: range [${frame.left}, ${frame.right}], pivot ${frame.pivot}.`;
    byId("pivot-label").textContent = `基准 / Pivot: ${frame.pivot}`;
    byId("position").textContent = `基准已放到下标 ${frame.pos}（从 0 开始）。 / Pivot placed at index ${frame.pos} (starting at 0).`;
  }
}
function scheduleNext() {
  timer = setTimeout(() => {
    frameIndex++;
    renderFrame();
    if (frameIndex === frames.length - 1) pause();
    else scheduleNext();
  }, Number(byId("speed").value));
}
form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!runtime) return;
  clearOutput();
  const text = input.value.replace(/[,，]/g, " ").replace(/\s+/g, " ");
  if (!/^[0-9+\- ]*$/.test(text)) {
    showError("请输入整数，用空格、换行或逗号分隔。 / Enter integers separated by spaces, newlines, or commas.");
    return;
  }
  try {
    const code = mode.value === "partition"
      ? call("run_partition", "number", ["string"], [text])
      : call("run_sort", "number", ["string", "number"], [text, mode.value === "visual" ? 1 : 0]);
    const errors = {
      "-1": "请至少输入一个整数。 / Enter at least one integer.",
      "-2": "输入中有不合法的整数。 / The input contains an invalid integer.",
      "-3": "最多输入 1024 个整数。 / Enter no more than 1,024 integers.",
      "-4": "整数范围：-2147483648 到 2147483647。 / Integer range: -2147483648 to 2147483647.",
      "-5": "无法显示结果，请减少数字数量。 / Unable to display the result; try fewer numbers.",
      "-6": "可视化最多 64 个数；更多数字请选“完整排序”。 / Visualization supports up to 64 numbers; use Full sort for larger inputs."
    };
    if (code < 0) {
      showError(errors[code] || "运行失败，请重新尝试。 / The run failed. Please try again.");
      return;
    }
    const values = call("get_result", "string").split(" ").map(Number);
    if (mode.value === "partition") {
      const pivot = call("get_pivot", "number");
      renderValues(values, {left: 0, right: values.length - 1, pos: code});
      byId("pivot-label").textContent = `基准 / Pivot: ${pivot}`;
      byId("position").textContent = `基准最终下标：${code}；左右两段还不一定有序。 / Final pivot index: ${code}; the two sections may still be unsorted.`;
      for (const id of ["pivot-label", "position", "legend"]) byId(id).hidden = false;
    } else if (mode.value === "sort") {
      renderValues(values, null, true);
      byId("position").textContent = `已按从小到大排好 ${values.length} 个数。 / Sorted ${values.length} numbers in ascending order.`;
      byId("position").hidden = false;
    } else {
      const total = call("get_trace_count", "number");
      for (let index = 0; index < total; index++) {
        frames.push({
          values: call("get_trace_frame", "string", ["number"], [index]).split(" ").map(Number),
          left: call("get_frame_left", "number", ["number"], [index]),
          right: call("get_frame_right", "number", ["number"], [index]),
          pivot: call("get_frame_pivot", "number", ["number"], [index]),
          pos: call("get_frame_position", "number", ["number"], [index])
        });
      }
      scaleMin = Math.min(...values);
      scaleMax = Math.max(...values);
      byId("timeline").max = total - 1;
      byId("playback").hidden = false;
      renderFrame();
    }
  } catch (error) {
    clearOutput();
    showError("程序运行失败，请刷新页面后重试。 / The program failed. Refresh the page and try again.");
    console.error(error);
  }
});
byId("play").addEventListener("click", () => {
  if (timer !== null) return pause();
  if (!frames.length || frameIndex === frames.length - 1) return;
  byId("play").textContent = "暂停 / Pause";
  scheduleNext();
});
for (const [id, delta] of [["previous", -1], ["next", 1]]) {
  byId(id).addEventListener("click", () => {
    pause();
    frameIndex = Math.max(0, Math.min(frames.length - 1, frameIndex + delta));
    if (frames.length) renderFrame();
  });
}
byId("restart").addEventListener("click", () => {
  pause(); frameIndex = 0;
  if (frames.length) renderFrame();
});
byId("timeline").addEventListener("input", () => {
  pause(); frameIndex = Number(byId("timeline").value);
  if (frames.length) renderFrame();
});
byId("speed").addEventListener("change", () => {
  if (timer !== null) { pause(); byId("play").textContent = "暂停 / Pause"; scheduleNext(); }
});
mode.addEventListener("change", clearOutput);
input.addEventListener("input", clearOutput);
byId("example").addEventListener("click", () => {
  input.value = "3 1 5 2 6 4"; clearOutput(); input.focus();
});
async function initialize() {
  try {
    runtime = await createPartitionModule({locateFile: (path, prefix) => prefix + path + (path.endsWith(".wasm") ? "?v=invite4" : "")});
    byId("run").disabled = false;
    byId("status").textContent = "就绪 / Ready";
  } catch (error) {
    byId("status").textContent = "加载失败 / Load failed";
    showError("程序未能加载，请刷新页面后重试。 / The program could not load. Refresh the page and try again.");
    console.error(error);
  }
}
initialize();
