import { byId as get } from "../../../shared/ui/element";
import { backendConfigured } from "../../../shared/data/supabase";
import {
  authorAccount,
  signIn,
  signOut,
  subscribeAuth,
} from "../../auth/data/supabase-auth";
import {
  saveCloudDraft,
  listCloudDrafts,
  loadCloudDraft,
  archiveCloudDraft,
  draftHistory,
} from "../data/cloud-drafts";
import { errorMessage } from "../../../shared/logic/error-message";
import {
  createCloudWriting,
  type CloudWritingBridge,
} from "../logic/cloud-writing";
const time = (value: string) =>
  new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
export function connectCloudWriting(bridge: CloudWritingBridge) {
  const { session, notify } = bridge;
  const status = get("account-status"),
    badge = get("writing-session-label");
  const login = get<HTMLButtonElement>("cloud-signin"),
    logout = get<HTMLButtonElement>("cloud-signout");
  const save = get<HTMLButtonElement>("cloud-save"),
    reload = get<HTMLButtonElement>("cloud-reload"),
    history = get<HTMLButtonElement>("cloud-history");
  const autosave = get<HTMLInputElement>("cloud-autosave"),
    archived = get<HTMLInputElement>("show-archived");
  const list = get<HTMLUListElement>("cloud-draft-list"),
    more = get<HTMLButtonElement>("cloud-load-more");
  const cloud = createCloudWriting(
    bridge,
    {
      save: saveCloudDraft,
      list: listCloudDrafts,
      load: loadCloudDraft,
      archive: archiveCloudDraft,
      history: draftHistory,
    },
    { account: authorAccount, signOut },
    {
      controls({ owner, canSave, readonly, badge: label }) {
        save.disabled = !canSave;
        history.disabled = !owner || !session.current;
        reload.hidden = !owner || !session.current;
        get("cloud-controls").hidden = !owner;
        get("cloud-drafts").hidden = !owner;
        bridge.readonly(readonly);
        badge.textContent = label;
      },
      account({ user }) {
        login.hidden = Boolean(user);
        logout.hidden = !user;
        get("account-details").hidden = !user;
        get("account-user-id").textContent = user?.id || "";
      },
      authorChanged: () =>
        document.dispatchEvent(new Event("blog-author-change")),
      hideWorkspace() {
        get("author-workspace").hidden = true;
        location.replace(import.meta.env.BASE_URL);
      },
      opened: () => document.dispatchEvent(new Event("writing-cloud-open")),
      status: (text) => {
        status.textContent = text;
      },
      listMessage: (text) => {
        get("cloud-drafts-message").textContent = text;
      },
      pagination: (change) => {
        Object.assign(more, change);
      },
      autosave: () => autosave.checked,
      archived: () => archived.checked,
      showDrafts(rows, append) {
        if (!append) list.replaceChildren();
        for (const draft of rows) {
          const li = document.createElement("li"),
            open = document.createElement("button"),
            title = document.createElement("strong"),
            meta = document.createElement("span"),
            action = document.createElement("button");
          open.className = "cloud-draft-open";
          open.type = "button";
          title.textContent = draft.title || "未命名草稿";
          meta.textContent = `${draft.category} · ${time(draft.updated_at)}`;
          open.append(title, meta);
          open.addEventListener("click", () => void cloud.openDraft(draft.id));
          action.className = "writing-text-button";
          action.type = "button";
          action.textContent = draft.archived ? "恢复" : "归档";
          action.setAttribute(
            "aria-label",
            `${action.textContent}「${draft.title || "未命名草稿"}」`,
          );

          action.addEventListener("click", async () => {
            action.disabled = true;
            try {
              await cloud.changeArchive(draft);
            } finally {
              action.disabled = false;
            }
          });
          li.append(open, action);
          list.append(li);
        }
      },
    },
  );
  login.addEventListener("click", async () => {
    if (session.saving) {
      notify("正在保存，请稍等。");
      return;
    }
    if (
      session.dirty &&
      !window.confirm(
        "登录会跳转页面，当前试写不会自动带过去。请确认已经导出备份，再继续。",
      )
    )
      return;
    try {
      login.disabled = true;
      await signIn();
    } catch (error) {
      notify(errorMessage(error), true);
      login.disabled = false;
    }
  });

  logout.addEventListener("click", async () => {
    logout.disabled = true;
    try {
      await cloud.logout();
    } catch (error) {
      notify(errorMessage(error), true);
    } finally {
      logout.disabled = false;
    }
  });
  save.addEventListener("click", () => void cloud.save());
  reload.addEventListener("click", () => {
    if (session.current) void cloud.openDraft(session.current.id);
  });
  get("cloud-refresh").addEventListener(
    "click",
    () => void cloud.refreshList(),
  );
  archived.addEventListener("change", () => void cloud.refreshList());
  more.addEventListener("click", () => void cloud.refreshList(true));
  autosave.addEventListener("change", cloud.autosaveChanged);
  history.addEventListener("click", async () => {
    if (!session.current) return;
    const dialog = get<HTMLDialogElement>("history-dialog"),
      rows = get("history-list");
    rows.textContent = "正在读取历史版本……";
    dialog.showModal();
    try {
      const versions = await cloud.loadHistory();
      rows.replaceChildren();
      if (!versions) {
        dialog.close();
        return;
      }
      if (!versions.length)
        rows.textContent = "第一次修改保存后，这里会出现历史版本。";
      for (const revision of versions) {
        const row = document.createElement("div"),
          label = document.createElement("span"),
          restore = document.createElement("button"),
          download = document.createElement("button");
        row.className = "history-row";
        label.textContent = `版本 ${revision.version} · ${time(revision.created_at)}`;
        restore.className = download.className = "writing-button";
        restore.textContent = "载入编辑器";
        download.textContent = "导出";
        restore.disabled = Boolean(session.current?.archived);
        restore.addEventListener("click", () => {
          try {
            if (cloud.restore(revision)) dialog.close();
          } catch (error) {
            notify(errorMessage(error), true);
          }
        });
        download.addEventListener("click", () => {
          try {
            bridge.download(revision.snapshot);
          } catch (error) {
            notify(errorMessage(error), true);
          }
        });
        row.append(label, restore, download);
        rows.append(row);
      }
    } catch (error) {
      rows.textContent = errorMessage(error);
    }
  });

  window.addEventListener("online", () => {
    if (cloud.isOwner() && session.dirty) cloud.changed();
  });
  if (backendConfigured) {
    login.disabled = false;
    status.textContent = "正在检查登录状态……";
    subscribeAuth(cloud.authChanged);
    void cloud.refreshAccount();
  } else {
    login.disabled = true;
    status.textContent =
      "私密草稿服务尚未连接。现在仍可导入、排版和导出，刷新或关闭前请导出备份。";
    cloud.controls();
  }
  return cloud;
}
