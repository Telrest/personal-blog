import { downloadFile } from "../../../shared/data/download";
import { exportMarkdown, validateDraft } from "../logic/article";
import type { DraftDocument } from "../logic/draft-session";

export function readArticleFile(file: File) {
  if (file.size > 4_000_000)
    throw new Error("文件过大，请使用 4 MB 以内的文章。");
  return file.text();
}

export function downloadArticle(article: DraftDocument) {
  validateDraft(article);
  if (!article.title && !article.markdown.trim())
    throw new Error("先写一点内容，再导出吧。");
  downloadFile(
    exportMarkdown(article),
    `${(article.title || "未命名文章").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").slice(0, 100)}.md`,
    "text/markdown;charset=utf-8",
  );
}
