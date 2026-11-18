export function normalizeNumbers(value) {
  const text = value.replace(/[,，]/g, " ").replace(/\s+/g, " ");
  if (!/^[0-9+\- ]*$/.test(text)) {
    throw new Error(
      "请输入整数，用空格、换行或逗号分隔。 / Enter integers separated by spaces, newlines, or commas.",
    );
  }

  return text;
}

const failures = {
  "-1": "请至少输入一个整数。 / Enter at least one integer.",
  "-2": "输入中有不合法的整数。 / The input contains an invalid integer.",
  "-3": "最多输入 1024 个整数。 / Enter no more than 1,024 integers.",
  "-4": "整数范围：-2147483648 到 2147483647。 / Integer range: -2147483648 to 2147483647.",
  "-5": "无法显示结果，请减少数字数量。 / Unable to display the result; try fewer numbers.",
  "-6": "可视化最多 64 个数；更多数字请选“完整排序”。 / Visualization supports up to 64 numbers; use Full sort for larger inputs.",
};

export const sortFailure = (code) =>
  failures[code] ||
  "运行失败，请重新尝试。 / The run failed. Please try again.";
