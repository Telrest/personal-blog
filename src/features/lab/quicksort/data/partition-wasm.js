export function loadPartitionRuntime() {
  return window.createPartitionModule({
    locateFile: (path, prefix) =>
      prefix + path + (path.endsWith(".wasm") ? "?v=invite4" : ""),
  });
}

export function partitionResult(runtime, mode, text) {
  // C 排序并记录步骤；JavaScript 只显示和播放。 / C sorts and records; JavaScript displays and plays.
  function call(name, type, args = [], values = []) {
    return runtime.ccall(name, type, args, values);
  }
  const code =
    mode === "partition"
      ? call("run_partition", "number", ["string"], [text])
      : call(
          "run_sort",
          "number",
          ["string", "number"],
          [text, mode === "visual" ? 1 : 0],
        );
  if (code < 0) return { code };
  const values = call("get_result", "string").split(" ").map(Number);
  if (mode === "partition")
    return { code, values, pivot: call("get_pivot", "number") };
  if (mode === "sort") return { code, values };
  const frames = [];
  const total = call("get_trace_count", "number");
  for (let index = 0; index < total; index++) {
    frames.push({
      values: call("get_trace_frame", "string", ["number"], [index])
        .split(" ")
        .map(Number),
      left: call("get_frame_left", "number", ["number"], [index]),
      right: call("get_frame_right", "number", ["number"], [index]),
      pivot: call("get_frame_pivot", "number", ["number"], [index]),
      pos: call("get_frame_position", "number", ["number"], [index]),
    });
  }
  return { code, values, frames };
}
