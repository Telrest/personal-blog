import { byId as get } from "../../../shared/ui/element";
import { renderMarkdownWithMath } from "../../articles/logic/math-markdown";
import DOMPurify from "dompurify";
import { parseImportedArticle } from "../logic/import-article";
import { validateDraft } from "../logic/article";
import { DraftSession, type DraftDocument } from "../logic/draft-session";
import {
  downloadArticle as download,
  readArticleFile,
} from "../data/article-file";
import { formatSelection } from "../logic/format-markdown";
import { connectCloudWriting } from "./writing-cloud";
import { connectPublishing } from "../../publishing/ui/writing-publish";
const title = get<HTMLInputElement>("article-title");
const body = get<HTMLTextAreaElement>("article-body");
const category = get<HTMLInputElement>("article-category");
const tags = get<HTMLInputElement>("article-tags");
const summary = get<HTMLTextAreaElement>("article-summary");
const slug = get<HTMLInputElement>("article-slug");
const message = get<HTMLParagraphElement>("writing-message");
const preview = get<HTMLDivElement>("article-preview");
const pasteDialog = get<HTMLDialogElement>("paste-dialog");
const fields = [title, body, category, tags, summary, slug];
const read = () => ({
  title: title.value.trim(),
  markdown: body.value,
  category: category.value.trim(),
  tags: tags.value
    .split(/[,，]/)
    .map((t) => t.trim())
    .filter(Boolean),
  summary: summary.value.trim(),
  slug: slug.value.trim(),
});
const session = new DraftSession(read());
const empty = (): DraftDocument => ({
  title: "",
  markdown: "",
  category: "见解与思考",
  tags: [],
  summary: "",
  slug: "",
});
function apply(article: DraftDocument) {
  title.value = article.title;
  body.value = article.markdown;
  category.value = article.category;
  tags.value = article.tags.join("，");
  summary.value = article.summary;
  slug.value = article.slug;
  render();
}
let timer: ReturnType<typeof setTimeout>;
function notify(text: string, error = false) {
  message.textContent = text;
  message.classList.toggle("is-error", error);
}
function render() {
  get("preview-title").textContent = title.value.trim() || "未命名文章";
  get("word-count").textContent =
    `${[...body.value].length.toLocaleString("zh-CN")} 字符`;
  if (body.value.length > 1_000_000) {
    notify("正文超过 100 万字符，暂时停止预览。", true);
    return;
  }
  preview.innerHTML = body.value.trim()
    ? renderMarkdownWithMath(body.value, (html) =>
        DOMPurify.sanitize(html, {
          USE_PROFILES: { html: true },
          FORBID_TAGS: [
            "style",
            "form",
            "input",
            "button",
            "iframe",
            "object",
            "embed",
          ],
          FORBID_ATTR: ["style", "srcset"],
        }),
      )
    : '<p class="preview-empty">文字会在这里慢慢成形。</p>';
  preview.querySelectorAll<HTMLAnchorElement>("a").forEach((link) => {
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  });
  preview.querySelectorAll<HTMLImageElement>("img").forEach((image) => {
    image.loading = "lazy";
    image.referrerPolicy = "no-referrer";
  });
}
function changed() {
  session.edit(read());
  cloud.changed();
}
fields.forEach((field) =>
  field.addEventListener("input", () => {
    changed();
    clearTimeout(timer);
    timer = setTimeout(render, 180);
    notify(
      cloud.isOwner()
        ? "有新的修改，等待保存。"
        : "本次修改仅在当前页面中，离开前请导出。",
    );
  }),
);
window.addEventListener("beforeunload", (event) => {
  if (session.unprotected) {
    event.preventDefault();
    event.returnValue = "";
  }
});
function canReplace() {
  if (session.saving || cloud.isBusy()) {
    notify("正在处理草稿，请稍等。");
    return false;
  }
  return (
    !session.unprotected ||
    window.confirm("当前修改尚未保存或导出。要替换它吗？建议先取消并导出备份。")
  );
}
function importText(text: string, filename: string) {
  const article = parseImportedArticle(text, filename);
  validateDraft(article);
  if (!canReplace()) return false;
  apply(article);
  session.load(null, read());
  session.edit(read());
  cloud.reset();
  cloud.changed();
  document.dispatchEvent(new Event("writing-reset"));
  notify(
    article.warnings.length
      ? article.warnings.join(" ")
      : cloud.isOwner()
        ? "文章已导入为新草稿。"
        : "文章已导入本次试写；编辑完成后请导出。",
  );
  return true;
}
get("import-file").addEventListener("click", () =>
  get<HTMLInputElement>("article-file").click(),
);
get<HTMLInputElement>("article-file").addEventListener(
  "change",
  async (event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      importText(await readArticleFile(file), file.name);
    } catch (error) {
      notify(error instanceof Error ? error.message : "导入未完成。", true);
    } finally {
      input.value = "";
    }
  },
);
get("paste-open").addEventListener("click", () => {
  pasteDialog.showModal();
  get<HTMLTextAreaElement>("paste-content").focus();
});
get("paste-confirm").addEventListener("click", () => {
  try {
    if (
      importText(
        get<HTMLTextAreaElement>("paste-content").value,
        "粘贴的文章.md",
      )
    ) {
      pasteDialog.close();
      get<HTMLTextAreaElement>("paste-content").value = "";
    }
  } catch (error) {
    notify(error instanceof Error ? error.message : "导入未完成。", true);
    pasteDialog.close();
  }
});
get("export-file").addEventListener("click", () => {
  try {
    download(read());
    session.markExported();
    notify("已生成 Markdown 下载文件，请确认下载完成；云端保存状态保持不变。");
  } catch (error) {
    notify(error instanceof Error ? error.message : "导出未完成。", true);
  }
});
get("new-article").addEventListener("click", () => {
  if (!canReplace()) return;
  session.load(null, empty());
  apply(session.document);
  cloud.reset();
  document.dispatchEvent(new Event("writing-reset"));
  notify("已新建空白文章。");
  body.focus();
});
document
  .querySelectorAll<HTMLButtonElement>("[data-format]")
  .forEach((button) =>
    button.addEventListener("click", () => {
      const { selectionStart: start, selectionEnd: end, value } = body;
      const text = formatSelection(button.dataset.format, value, start, end);
      if (body.readOnly) return;
      body.setRangeText(text, start, end, "select");
      body.focus();
      changed();
      render();
      notify("排版已更新。");
    }),
  );
function setView(view: string) {
  document.querySelector(".workbench-columns")?.setAttribute("data-view", view);
  document
    .querySelectorAll<HTMLButtonElement>("[data-view][aria-pressed]")
    .forEach((button) =>
      button.setAttribute("aria-pressed", String(button.dataset.view === view)),
    );
}
document
  .querySelectorAll<HTMLButtonElement>("[data-view][aria-pressed]")
  .forEach((button) =>
    button.addEventListener("click", () => setView(button.dataset.view!)),
  );
if (matchMedia("(max-width:760px)").matches) setView("edit");
const cloud = connectCloudWriting({
  session,
  apply,
  empty,
  notify,
  canReplace,
  download,
  readonly: (value) => {
    fields.forEach((field) => (field.readOnly = value));
    document
      .querySelectorAll<HTMLButtonElement>("[data-format]")
      .forEach((button) => (button.disabled = value));
  },
});
connectPublishing({ session, cloud, apply, notify, canReplace });
document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    if (cloud.isOwner()) void cloud.save();
    else get("export-file").click();
  }
});
render();
