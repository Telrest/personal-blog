export function formatSelection(
  format: string | undefined,
  value: string,
  start: number,
  end: number,
) {
  const selected = value.slice(start, end);
  let text = "";
  switch (format) {
    case "heading":
      text = `## ${selected || "小标题"}`;
      break;
    case "bold":
      text = `**${selected || "加粗文字"}**`;
      break;
    case "italic":
      text = `*${selected || "斜体文字"}*`;
      break;
    case "quote":
      text = (selected || "引用的文字")
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");
      break;
    case "list":
      text = (selected || "列表内容")
        .split("\n")
        .map((line) => `- ${line}`)
        .join("\n");
      break;
    case "link":
      text = `[${selected || "链接文字"}](https://example.com)`;
      break;
    case "code":
      text = `\n\`\`\`\n${selected || "在这里写代码"}\n\`\`\`\n`;
      break;
  }
  if (
    ["heading", "quote", "list"].includes(format || "") &&
    start > 0 &&
    value[start - 1] !== "\n"
  )
    text = "\n" + text;
  // Keep a closing code fence intact when inserting immediately after it.
  // 在代码围栏行末插入格式时先换行，避免破坏围栏。
  if (
    start === end &&
    /(?:^|\n)[ \t]*(`{3,}|~{3,})[ \t]*$/.test(value.slice(0, start))
  )
    text = "\n\n" + text;
  return text;
}
