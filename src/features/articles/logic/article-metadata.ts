export const categoryLabel = (category?: string) =>
  category?.trim() || "未分类";
export const articleTags = (tags?: string[]) =>
  (tags ?? []).map((tag) => tag.trim()).filter(Boolean);

const shortDate = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function shortPublicationDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "日期未知";
  const parts = new Map<string, string>();
  for (const part of shortDate.formatToParts(date))
    parts.set(part.type, part.value);
  return `${parts.get("year")}.${parts.get("month")}.${parts.get("day")}`;
}

const longDate = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "long",
  day: "numeric",
});

export function longPublicationDate(value: string | undefined) {
  if (!value) return "日期未知";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "日期未知" : longDate.format(date);
}

export function estimateReadingMinutes(markdown: string) {
  const markdownForReading = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/[#>*_~|=-]/g, " ");
  const cjkCharacters =
    markdownForReading.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  const latinWords =
    markdownForReading.replace(/[\u3400-\u9fff]/g, " ").match(/[A-Za-z0-9]+/g)
      ?.length ?? 0;
  return Math.max(1, Math.ceil(cjkCharacters / 350 + latinWords / 200));
}
