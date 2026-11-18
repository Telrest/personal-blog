import { errorMessage } from "../../../shared/logic/error-message.ts";
import { validateDraft, type Draft } from "./article.ts";
import type { DraftSession, DraftDocument } from "./draft-session";

export type CloudWritingBridge = {
  session: DraftSession;
  apply: (document: DraftDocument) => void;
  empty: () => DraftDocument;
  notify: (message: string, error?: boolean) => void;
  canReplace: () => boolean;
  readonly: (value: boolean) => void;
  download: (document: DraftDocument) => void;
};

type DraftRow = Pick<
  Draft,
  "id" | "title" | "category" | "version" | "updated_at" | "archived"
>;
type Revision = {
  version: number;
  created_at: string;
  snapshot: DraftDocument;
};
type Account = { owner: boolean; user: { id: string } | null };

export type DraftStore = {
  save: (
    document: DraftDocument,
    current: Draft | null,
    manual: boolean,
  ) => Promise<Draft>;
  list: (archived: boolean, offset: number) => Promise<DraftRow[]>;
  load: (id: string) => Promise<Draft>;
  archive: (id: string, version: number, archived: boolean) => Promise<void>;
  history: (id: string) => Promise<Revision[]>;
};

type View = {
  controls: (state: {
    owner: boolean;
    canSave: boolean;
    readonly: boolean;
    badge: string;
  }) => void;
  account: (account: Account) => void;
  authorChanged: () => void;
  hideWorkspace: () => void;
  opened: () => void;
  status: (text: string) => void;
  listMessage: (text: string) => void;
  showDrafts: (rows: DraftRow[], append: boolean) => void;
  pagination: (change: { disabled?: boolean; hidden?: boolean }) => void;
  autosave: () => boolean;
  archived: () => boolean;
};

const time = (value: string) =>
  new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));

export function createCloudWriting(
  bridge: CloudWritingBridge,
  store: DraftStore,
  auth: { account: () => Promise<Account>; signOut: () => Promise<void> },
  view: View,
) {
  const { session, notify } = bridge;
  let owner = false,
    managing = false,
    locked = false,
    accountGeneration = 0,
    listGeneration = 0,
    openGeneration = 0,
    offset = 0;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  function controls() {
    view.controls({
      owner,
      canSave:
        owner &&
        !locked &&
        !managing &&
        !session.saving &&
        !session.conflict &&
        !session.current?.archived,
      readonly: locked || Boolean(owner && session.current?.archived),
      badge: owner
        ? session.current?.archived
          ? "已归档"
          : session.saving
            ? "正在保存"
            : session.dirty
              ? "未保存修改"
              : session.current
                ? "私密云端草稿"
                : "新草稿"
        : "本次试写",
    });
  }
  function changed() {
    controls();
    clearTimeout(saveTimer);
    if (
      owner &&
      !locked &&
      !managing &&
      view.autosave() &&
      !session.conflict &&
      !session.current?.archived
    )
      saveTimer = setTimeout(() => void persist(false), 2000);
  }
  async function persist(manual: boolean) {
    if (!owner) {
      notify("请先登录为作者；当前内容可以导出备份。", true);
      return;
    }
    if (managing || locked) {
      notify("正在处理草稿，请稍等。");
      return;
    }
    clearTimeout(saveTimer);
    try {
      validateDraft(session.document);
      notify("正在保存私密草稿……");
      const operation = session.save(store.save, manual);
      controls();
      await operation;
      if (!owner) return;
      notify(
        session.dirty
          ? "已保存较早的修改，正在等待保存最新内容。"
          : `已保存到私密云端 · ${time(session.current!.updated_at)}`,
      );
      controls();
      await refreshList();
      if (session.dirty) changed();
    } catch (error) {
      notify(`未保存：${errorMessage(error)}`, true);
    } finally {
      controls();
    }
  }
  async function openDraft(id: string) {
    if (!bridge.canReplace()) return;
    const generation = ++openGeneration,
      previous = JSON.stringify(session.document);
    clearTimeout(saveTimer);
    view.listMessage("正在读取草稿……");
    try {
      const draft = await store.load(id);
      if (!owner || generation !== openGeneration) return;
      // Do not replace text typed while the read request was in flight.
      // 读取期间若又开始输入，先保留编辑器中的新内容。
      if (JSON.stringify(session.document) !== previous && !bridge.canReplace())
        return;
      session.load(draft, draft);
      bridge.apply(draft);
      view.opened();
      controls();
      notify(
        draft.archived
          ? "这是归档草稿，可以导出；恢复后可以继续编辑。"
          : `已载入私密草稿 · ${time(draft.updated_at)}`,
      );
    } catch (error) {
      notify(errorMessage(error), true);
    } finally {
      if (generation === openGeneration) view.listMessage("");
    }
  }

  async function refreshList(append = false) {
    if (!owner) return;
    const generation = ++listGeneration;
    const requestedOffset = append ? offset : 0;
    view.pagination({ disabled: true });
    try {
      const rows = await store.list(view.archived(), requestedOffset);
      if (!owner || generation !== listGeneration) return;
      offset = requestedOffset + rows.length;
      view.showDrafts(rows, append);
      view.listMessage(
        offset ? "" : "这里还没有草稿。导入或写一点内容，然后保存。",
      );
      view.pagination({ hidden: rows.length < 50 });
    } catch (error) {
      if (!owner || generation !== listGeneration) return;
      view.listMessage("列表读取失败：" + errorMessage(error));
      view.pagination({ hidden: true });
    } finally {
      if (generation === listGeneration) view.pagination({ disabled: false });
    }
  }

  async function changeArchive(draft: DraftRow) {
    if (session.saving || managing || locked) {
      notify("正在处理草稿，请稍等。");
      return;
    }
    try {
      if (session.current?.id === draft.id && session.dirty) {
        await persist(true);
        if (session.dirty) return;
      }
      managing = true;
      clearTimeout(saveTimer);
      controls();
      const current = session.current;
      const version =
        current && current.id === draft.id ? current.version : draft.version;
      await store.archive(draft.id, version, !draft.archived);
      if (session.current && session.current.id === draft.id) {
        // Keep any text typed while archiving; never clear it after an async reply.
        // 归档请求期间继续输入的文字仍留在编辑器中，不在响应后清空。
        session.current = {
          ...session.current,
          archived: !draft.archived,
          version: version + 1,
        };
        if (draft.archived) await openDraft(draft.id);
      }
      controls();
      notify(
        draft.archived
          ? "草稿已恢复。"
          : session.current?.id === draft.id && session.dirty
            ? "草稿已归档；操作期间的新修改仍在编辑器中，尚未保存，请先导出。"
            : "草稿已归档，可以在归档列表中恢复。",
      );
      await refreshList();
    } catch (error) {
      notify(errorMessage(error), true);
    } finally {
      managing = false;
      controls();
      if (session.dirty && !session.current?.archived) changed();
    }
  }

  async function refreshAccount() {
    const generation = ++accountGeneration;
    try {
      const account = await auth.account();
      if (generation !== accountGeneration) return;
      owner = account.owner;
      view.account(account);
      view.authorChanged();
      if (owner) {
        view.status(
          "已登录为作者。草稿只有你能读取，保存后可在其他设备继续编辑。",
        );
        controls();
        await refreshList();
        if (session.dirty) changed();
      } else {
        view.hideWorkspace();
        clearTimeout(saveTimer);
        view.status(
          account.user
            ? "已登录，当前账号尚未开通作者权限。可以继续本次试写，无法访问云端草稿。"
            : "登录后可以保存私密草稿。未登录时，内容只保留在本次页面中。",
        );
        view.showDrafts([], false);
        controls();
      }
    } catch (error) {
      if (generation !== accountGeneration) return;
      owner = false;
      view.authorChanged();
      clearTimeout(saveTimer);
      view.status(
        "云端连接未完成：" + errorMessage(error) + " 当前内容请先导出。",
      );
      controls();
    }
  }

  async function logout() {
    if (!bridge.canReplace()) return;
    clearTimeout(saveTimer);
    await auth.signOut();
    owner = false;
    session.load(null, bridge.empty());
    bridge.apply(session.document);
    controls();
    notify("已退出登录，当前编辑器已清空。");
    await refreshAccount();
  }

  async function loadHistory() {
    const draftId = session.current?.id;
    if (!draftId) return null;
    const rows = await store.history(draftId);
    return owner && session.current?.id === draftId ? rows : null;
  }

  function restore(revision: Revision) {
    if (session.current?.archived || !bridge.canReplace()) return false;
    validateDraft(revision.snapshot);
    session.edit(revision.snapshot);
    bridge.apply(revision.snapshot);
    notify("已载入历史内容，后续保存会生成新的版本。");
    changed();
    return true;
  }

  function authChanged(event: string) {
    if (event === "SIGNED_OUT") {
      owner = false;
      accountGeneration++;
      listGeneration++;
      openGeneration++;
      clearTimeout(saveTimer);
      controls();
      view.authorChanged();
    }
    if (
      event === "SIGNED_IN" ||
      event === "SIGNED_OUT" ||
      event === "USER_UPDATED"
    )
      setTimeout(() => void refreshAccount(), 0);
  }

  function autosaveChanged() {
    clearTimeout(saveTimer);
    if (view.autosave() && session.dirty) changed();
  }

  return {
    controls,
    changed,
    openDraft,
    changeArchive,
    refreshList,
    refreshAccount,
    loadHistory,
    restore,
    authChanged,
    autosaveChanged,
    logout,
    reset() {
      openGeneration++;
      clearTimeout(saveTimer);
      controls();
    },
    isOwner: () => owner,
    save: () => persist(true),
    lock(value: boolean) {
      locked = value;
      clearTimeout(saveTimer);
      controls();
    },
    isBusy: () => locked || managing,
    refresh: () => refreshList(),
  };
}
