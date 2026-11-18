import {
  fingerprint,
  makeBackup,
  type BlogBackup,
  type DraftSnapshot,
  type PublishedArticle,
} from "../../../shared/contracts/publication.ts";

type DraftVersion = { id: string; version: number };
type CleanupProof = DraftVersion & {
  slug: string;
  revision: string;
  snapshotFingerprint: string;
  backupVerified: true;
};
export type Publisher = {
  capabilities: () => Promise<{ configured: boolean; message: string }>;
  preview: (
    draft: DraftVersion,
  ) => Promise<{ existing: PublishedArticle | null; url: string }>;
  publish: (
    draft: DraftVersion,
    expected: string | null,
  ) => Promise<{ post: PublishedArticle; url: string }>;
  status: (
    post: PublishedArticle,
  ) => Promise<{ deployed: boolean; superseded?: boolean }>;
  snapshot: (draft: DraftVersion) => Promise<DraftSnapshot>;
  prepareComments: (post: PublishedArticle) => Promise<void>;
  cleanup: (proof: CleanupProof) => Promise<unknown>;
};

export function backupHistory(backup?: BlogBackup): DraftSnapshot["revisions"] {
  if (!backup) return [];
  const draft = backup.snapshot.draft;
  const current = {
    id: draft.id,
    version: draft.version,
    created_at: draft.updated_at,
    snapshot: draft,
  };
  const rows = [current, ...backup.snapshot.revisions, ...backup.local_history];
  return [...new Map(rows.map((row) => [row.id, row])).values()]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 30);
}

export function verifyDownloadedBackup(
  expected: BlogBackup,
  actual: BlogBackup,
) {
  if (actual.fingerprint !== expected.fingerprint)
    throw new Error("所选文件不是本次备份，云端草稿未清理。");
}

export async function cleanupVerifiedBackup(
  publisher: Pick<Publisher, "cleanup">,
  backup: BlogBackup,
) {
  const draft = backup.snapshot.draft;
  const post = backup.publication;
  if (!post) throw new Error("备份中没有发布记录，云端草稿未清理。");
  await publisher.cleanup({
    id: draft.id,
    version: draft.version,
    slug: post.slug,
    revision: post.revision_id,
    snapshotFingerprint: await fingerprint(backup.snapshot),
    backupVerified: true,
  });
  return draft;
}

type PublicationOptions = {
  confirm: (preview: Awaited<ReturnType<Publisher["preview"]>>) => boolean;
  cancelled: () => boolean;
  report: (message: string) => void;
  history: DraftSnapshot["revisions"];
  wait?: () => Promise<unknown>;
};

export async function preparePublishedBackup(
  publisher: Publisher,
  draft: DraftVersion,
  options: PublicationOptions,
) {
  const preview = await publisher.preview(draft);
  if (!options.confirm(preview)) return;
  options.report("正在提交定稿……");
  const { post, url } = await publisher.publish(
    draft,
    preview.existing?.revision_id ?? null,
  );
  const wait =
    options.wait ?? (() => new Promise((resolve) => setTimeout(resolve, 5000)));
  for (let attempt = 1; attempt <= 36; attempt++) {
    if (options.cancelled())
      throw new Error(
        "已停止等待；发布提交可能仍在部署，云端草稿已保留，可稍后再次检查。",
      );
    options.report("正在等待文章上线（" + attempt + "/36）……");
    const state = await publisher.status(post);
    if (state.superseded) throw new Error("文章有更新的发布版本，未清理云端。");
    if (state.deployed) {
      if (options.cancelled()) throw new Error("已停止等待，云端草稿已保留。");
      try {
        await publisher.prepareComments(post);
      } catch {
        throw new Error(
          "文章已上线，评论区尚未准备完成；云端草稿已保留，请稍后重试。",
        );
      }
      const snapshot = await publisher.snapshot(draft);
      const backup = await makeBackup(snapshot, post, options.history);
      if (options.cancelled()) throw new Error("已停止等待，云端草稿已保留。");
      return { backup, url };
    }
    if (attempt < 36) await wait();
  }
  throw new Error(
    "还未确认部署完成，云端草稿会保留。稍后点击发布可继续检查，不会重复创建文章。",
  );
}
