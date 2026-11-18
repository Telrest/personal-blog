import { byId as get } from "../../../shared/ui/element";
import { publisher } from "../data/publisher-api";
import { errorMessage } from "../../../shared/logic/error-message";
import {
  documentOf,
  makeBackup,
  type BlogBackup,
} from "../../../shared/contracts/publication";
import {
  backupHistory,
  cleanupVerifiedBackup,
  preparePublishedBackup,
  verifyDownloadedBackup,
} from "../logic/publication-workflow";
import {
  chooseBackupDirectory,
  directorySupported,
  writeVerifiedBackup,
  downloadBackup,
  readBackupFile,
  type BackupDirectory,
} from "../data/local-backup";
import type {
  DraftSession,
  DraftDocument,
} from "../../writing/logic/draft-session";
type Bridge = {
  session: DraftSession;
  cloud: {
    save: () => Promise<void>;
    lock: (value: boolean) => void;
    isBusy: () => boolean;
    isOwner: () => boolean;
    reset: () => void;
    refresh: () => Promise<void>;
  };
  apply: (document: DraftDocument) => void;
  notify: (message: string, error?: boolean) => void;
  canReplace: () => boolean;
};
export function connectPublishing(bridge: Bridge) {
  const { session, cloud, notify } = bridge;
  let directory: BackupDirectory | undefined,
    available = false,
    running = false,
    cancelled = false,
    imported: BlogBackup | undefined;
  let capabilityGeneration = 0;
  let pending: { backup: BlogBackup; clean: boolean } | undefined;
  const status = get("publication-status"),
    publish = get<HTMLButtonElement>("publish-article"),
    backupButton = get<HTMLButtonElement>("backup-article"),
    verifyInput = get<HTMLInputElement>("verify-backup-file"),
    restoreInput = get<HTMLInputElement>("restore-backup-file");
  const update = () => {
    get("publication-tools").hidden = !cloud.isOwner();
    publish.disabled = !available || running;
    backupButton.disabled = running;
    get<HTMLInputElement>("cleanup-after-publish").disabled = running;
    get<HTMLButtonElement>("choose-backup-folder").disabled = running;
    get<HTMLButtonElement>("restore-backup").disabled = running;
    get<HTMLButtonElement>("local-history").disabled = !imported || running;
    get<HTMLButtonElement>("verify-downloaded-backup").hidden = !pending;
    get<HTMLButtonElement>("verify-downloaded-backup").disabled = running;
    get<HTMLButtonElement>("cancel-publication").hidden = !running;
  };
  async function capability() {
    const generation = ++capabilityGeneration;
    if (!cloud.isOwner()) {
      available = false;
      update();
      return;
    }
    try {
      const result = await publisher.capabilities();
      if (generation !== capabilityGeneration) return;
      available = result.configured === true;
      status.textContent = result.message;
    } catch (error) {
      if (generation !== capabilityGeneration) return;
      available = false;
      status.textContent = errorMessage(error);
    }
    update();
  }
  async function saved() {
    if (cloud.isBusy() || session.saving)
      throw new Error("正在处理草稿，请稍等。");
    if (session.current?.archived) throw new Error("请先恢复归档草稿。");
    await cloud.save();
    if (session.dirty || !session.current)
      throw new Error("当前修改尚未保存，未开始发布或清理。");
    return session.current;
  }
  function syncing(value: boolean) {
    running = value;
    if (!value) cloud.lock(false);
    update();
  }
  const localHistory = () => backupHistory(imported);
  async function cleanup(backup: BlogBackup, clean: boolean) {
    if (!clean) {
      status.textContent = "文章与本地备份已完成，按本次设置保留云端草稿。";
      return;
    }
    const d = await cleanupVerifiedBackup(publisher, backup);
    // Only detach the exact cleaned version; never discard newer editor text.
    // 仅断开已经清理的同一版本，操作期间的新文字仍保留。
    if (
      session.current?.id === d.id &&
      session.current.version === d.version &&
      !session.dirty
    ) {
      const document = session.document;
      session.load(null, document);
      session.edit(document);
      session.markExported();
      get<HTMLInputElement>("cloud-autosave").checked = false;
      cloud.reset();
    }
    await cloud.refresh();
    status.textContent = "文章已上线，本地备份已校验，云端草稿及历史已清理。";
    notify(
      "已完成发布、备份和清理。当前文字仍可查看；继续修改时可重新保存为草稿。",
    );
  }
  async function store(
    backup: BlogBackup,
    clean: boolean,
    publication = false,
  ) {
    if (directory) {
      await writeVerifiedBackup(directory, backup);
      pending = undefined;
      if (publication && cancelled) {
        status.textContent = "本地备份已校验，已停止清理，云端草稿已保留。";
        return;
      }
      if (publication) await cleanup(backup, clean);
      else {
        session.markExported();
        status.textContent = "完整备份已写入所选文件夹，并通过读回校验。";
      }
    } else {
      downloadBackup(backup);
      pending = { backup, clean: publication && clean };
      status.textContent =
        "备份包已发起下载。请点击“校验下载的备份”，选择刚下载的文件；校验前不会清理云端。";
      update();
    }
  }
  get("choose-backup-folder").addEventListener("click", async () => {
    try {
      if (!directorySupported()) {
        status.textContent =
          "当前浏览器使用下载备份方式，下载后可选回文件进行校验。";
        return;
      }
      directory = await chooseBackupDirectory();
      status.textContent =
        "已选择本次会话的备份文件夹。请使用网站仓库之外的文件夹保存私密备份。";
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError"))
        notify(errorMessage(error), true);
    }
  });
  backupButton.addEventListener("click", async () => {
    if (running) return;
    try {
      syncing(true);
      const draft = await saved();
      cloud.lock(true);
      await store(
        await makeBackup(await publisher.snapshot(draft), null, localHistory()),
        false,
      );
    } catch (error) {
      notify(errorMessage(error), true);
    } finally {
      syncing(false);
    }
  });
  publish.addEventListener("click", async () => {
    if (running) return;
    cancelled = false;
    syncing(true);
    try {
      documentOf(session.document, true);
      const draft = await saved();
      cloud.lock(true);
      const clean = get<HTMLInputElement>("cleanup-after-publish").checked;
      const result = await preparePublishedBackup(publisher, draft, {
        confirm: (preview) =>
          window.confirm(
            `${preview.existing ? "将更新这个地址的已发布文章，并保留原发布时间。" : "将把当前定稿公开发布到 GitHub 和博客。"}\n${preview.url}\n\n${clean ? "上线并校验本地完整备份后，将删除这份云端草稿和历史版本。" : "本次保留云端草稿。"}\n私密草稿历史只进入本地备份，不会发布。继续吗？`,
          ),
        cancelled: () => cancelled,
        report: (text) => {
          status.textContent = text;
        },
        history: localHistory(),
      });
      if (!result) return;
      await store(result.backup, clean, true);
      if (!pending) status.textContent += " 文章地址：" + result.url;
    } catch (error) {
      notify(errorMessage(error), true);
      status.textContent = errorMessage(error);
    } finally {
      syncing(false);
    }
  });
  get("cancel-publication").addEventListener("click", () => {
    cancelled = true;
  });
  get("verify-downloaded-backup").addEventListener("click", () =>
    verifyInput.click(),
  );
  verifyInput.addEventListener("change", async () => {
    const file = verifyInput.files?.[0];
    if (!file || !pending || running) return;
    syncing(true);
    cloud.lock(true);
    const item = pending;
    try {
      verifyDownloadedBackup(item.backup, await readBackupFile(file));
      if (item.backup.publication) await cleanup(item.backup, item.clean);
      else {
        session.markExported();
        status.textContent = "下载的完整备份校验成功。";
      }
      pending = undefined;
    } catch (error) {
      notify(errorMessage(error), true);
    } finally {
      verifyInput.value = "";
      syncing(false);
    }
  });
  get("restore-backup").addEventListener("click", () => restoreInput.click());
  restoreInput.addEventListener("change", async () => {
    const file = restoreInput.files?.[0];
    if (!file) return;
    try {
      const backup = await readBackupFile(file);
      if (running || !bridge.canReplace()) return;
      imported = backup;
      session.load(null, documentOf(backup.snapshot.draft));
      session.edit(session.document);
      bridge.apply(session.document);
      cloud.reset();
      update();
      notify(
        "完整备份已校验并载入。尚未写入云端；可以查看本地历史，或点击保存私密草稿继续编辑。",
      );
    } catch (error) {
      notify(errorMessage(error), true);
    } finally {
      restoreInput.value = "";
    }
  });
  get("local-history").addEventListener("click", () => {
    if (!imported) return;
    const dialog = get<HTMLDialogElement>("local-history-dialog"),
      list = get("local-history-list");
    list.replaceChildren();
    for (const row of localHistory()) {
      const button = document.createElement("button");
      button.className = "writing-button";
      button.type = "button";
      button.textContent = `载入版本 ${row.version} · ${new Date(row.created_at).toLocaleString("zh-CN")}`;
      button.addEventListener("click", () => {
        if (!bridge.canReplace()) return;
        session.load(null, documentOf(row.snapshot));
        session.edit(session.document);
        bridge.apply(session.document);
        cloud.reset();
        dialog.close();
        notify("本地历史版本已载入，尚未保存到云端。");
      });
      list.append(button);
    }
    dialog.showModal();
  });
  document.addEventListener("blog-author-change", () => void capability());
  update();
  if (cloud.isOwner()) void capability();
  for (const event of ["writing-reset", "writing-cloud-open"])
    document.addEventListener(event, () => {
      imported = undefined;
      update();
    });
}
