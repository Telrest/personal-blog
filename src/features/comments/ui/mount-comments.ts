import { watchVisitor } from "../../auth/logic/visitor-auth";
import { createSupabaseComments } from "../data/supabase-comments";
import {
  createCommentController,
  type CommentStatus,
} from "../logic/controller";
import { COMMENT_MAX_LENGTH, type Comment } from "../logic/model";

const timestamps = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  dateStyle: "medium",
  timeStyle: "short",
});

const statusText: Record<Exclude<CommentStatus["kind"], "rejected">, string> = {
  loading: "正在读取留言……",
  empty: "还没有留言，来留下第一点想法吧。",
  ready: "",
  "read-error": "留言暂时未能读取，请稍后重试。",
  unavailable: "评论服务暂未连接。",
  invalid: `请输入 1 到 ${COMMENT_MAX_LENGTH} 字的留言。`,
  posting: "正在发布留言……",
  posted: "留言已发布，谢谢你的分享。",
  "account-changed": "登录状态已改变，请重新读取留言确认结果。",
  "post-error": "留言未能确认发布，请保留文字并稍后重试。",
  "thread-error": "评论区暂未准备完成，请稍后重试。",
};

function renderComment(row: Comment) {
  const item = document.createElement("li");
  const meta = document.createElement("div");
  meta.className = "comment-meta";
  const author = document.createElement("a");
  author.textContent = "@" + row.github_login;
  author.href = "https://github.com/" + encodeURIComponent(row.github_login);
  author.target = "_blank";
  author.rel = "noopener noreferrer";
  const time = document.createElement("time");
  time.dateTime = row.created_at;
  time.textContent = timestamps.format(new Date(row.created_at));
  const text = document.createElement("p");
  text.className = "comment-body";
  text.textContent = row.body;
  meta.append(author, time);
  item.append(meta, text);
  return item;
}

function mountComments(root: HTMLElement) {
  const find = <T extends HTMLElement>(selector: string) =>
    root.querySelector<T>(selector)!;
  const list = find<HTMLOListElement>("[data-comment-list]");
  const status = find<HTMLElement>("[data-comment-status]");
  const form = find<HTMLFormElement>("[data-comment-form]");
  const body = find<HTMLTextAreaElement>("textarea");
  const submit = find<HTMLButtonElement>('[type="submit"]');
  const invitation = find<HTMLElement>("[data-comment-invitation]");
  const more = find<HTMLButtonElement>("[data-comment-more]");
  const { articleId, articleSlug } = root.dataset;
  const store =
    articleId && articleSlug
      ? createSupabaseComments(articleId, articleSlug)
      : null;

  const controller = createCommentController(store, {
    update(state) {
      form.hidden = !state.canComment;
      invitation.textContent = state.canComment
        ? "可以评论哦~"
        : "登录后，留下一点想法。";
      submit.disabled = !state.canComment || state.sending;
      body.readOnly = state.sending;
      more.hidden = state.pageAction === null;
      more.disabled = state.loading;
      more.textContent =
        state.pageAction === "retry" ? "重新读取留言" : "更多留言";
      const text =
        state.status.kind === "rejected"
          ? state.status.message
          : statusText[state.status.kind];
      if (status.textContent !== text) status.textContent = text;
    },
    insert(rows, position) {
      const items = rows.map(renderComment);
      if (position === "start") list.prepend(...items);
      else list.append(...items);
    },
  });

  watchVisitor(({ state, userId }) => {
    void controller.setAccount({
      userId,
      canComment: state === "member" || state === "author",
      isAuthor: state === "author",
    });
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (await controller.submit(body.value)) body.value = "";
  });
  more.addEventListener("click", () => void controller.load());
  void controller.load();
}

document
  .querySelectorAll<HTMLElement>("[data-comments]")
  .forEach(mountComments);
