import {
  PublishError,
  uuid,
  digest,
  documentOf,
  articleRevision,
  validateSnapshot,
  requireCleanup,
  type DraftSnapshot,
  type PublishedArticle,
} from "../../_shared/publication.ts";
import { GithubArticles } from "../data/github.ts";
import { isPublishedOnPages, publicArticleUrl } from "../data/site.ts";
type Cloud = {
  snapshot: (id: string, version: number) => Promise<DraftSnapshot>;
  remove: (id: string, version: number) => Promise<void>;
};
type Fetcher = typeof fetch;
export class PublishingService {
  private articles: GithubArticles;
  private fetcher: Fetcher;
  private cloud: Cloud;
  constructor(token: string, cloud: Cloud, fetcher: Fetcher = fetch) {
    this.articles = new GithubArticles(token, fetcher);
    this.fetcher = fetcher;
    this.cloud = cloud;
  }
  private async snapshot(id: unknown, version: unknown) {
    if (!uuid(id) || !Number.isSafeInteger(version) || Number(version) < 1)
      throw new PublishError("草稿编号或版本无效。");
    return validateSnapshot(await this.cloud.snapshot(id, Number(version)));
  }
  async preview(id: unknown, version: unknown) {
    const snapshot = await this.snapshot(id, version);
    const document = documentOf(snapshot.draft, true);
    const existing = await this.articles.read(document.slug);
    return {
      existing: existing?.post || null,
      url: publicArticleUrl(document.slug),
      revision: await articleRevision(document),
    };
  }
  async publish(id: unknown, version: unknown, expected: unknown) {
    if (expected !== null && !digest(expected))
      throw new PublishError("请先检查发布版本。");
    const snapshot = await this.snapshot(id, version);
    if (snapshot.draft.archived) throw new PublishError("请先恢复归档草稿。");
    const document = documentOf(snapshot.draft, true),
      existing = await this.articles.read(document.slug),
      revision = await articleRevision(document);
    // An identical retry is safe after a lost response. 不重复写入已经成功提交的相同内容。
    if (existing?.post.revision_id === revision)
      return {
        post: existing.post,
        url: publicArticleUrl(document.slug),
        unchanged: true,
      };
    if ((existing?.post.revision_id || null) !== expected)
      throw new PublishError("文章已在另一处更新，请重新检查后发布。", 409);
    const now = new Date().toISOString();
    const post: PublishedArticle = {
      ...document,
      format: 1,
      id: existing?.post.id || crypto.randomUUID(),
      published_at: existing?.post.published_at || now,
      updated_at: now,
      revision_id: revision,
    };
    const commit = await this.articles.write(post, existing?.sha);
    return { post, url: publicArticleUrl(post.slug), commit, unchanged: false };
  }
  async live(slug: string, revision: string) {
    const source = await this.articles.read(slug);
    if (!source || source.post.revision_id !== revision)
      return { deployed: false, superseded: Boolean(source) };
    const deployed = await isPublishedOnPages(source.post, this.fetcher);
    return { deployed, post: source.post, url: publicArticleUrl(slug) };
  }
  async cleanup(input: {
    id: unknown;
    version: unknown;
    slug: unknown;
    revision: unknown;
    snapshotFingerprint: unknown;
    backupVerified: unknown;
  }) {
    if (
      input.backupVerified !== true ||
      !digest(input.revision) ||
      !digest(input.snapshotFingerprint) ||
      typeof input.slug !== "string"
    )
      throw new PublishError("请先完成本地备份校验。");
    const snapshot = await this.snapshot(input.id, input.version);
    if (snapshot.draft.slug !== input.slug)
      throw new PublishError("文章地址与草稿不一致。", 409);
    const state = await this.live(input.slug, input.revision);
    if (!state.post)
      throw new PublishError("尚未确认发布结果，云端草稿会保留。", 409);
    await requireCleanup(
      snapshot,
      state.post,
      {
        snapshotFingerprint: input.snapshotFingerprint,
        revision: input.revision,
      },
      state.deployed ? state.post.revision_id : undefined,
    );
    await this.cloud.remove(snapshot.draft.id, snapshot.draft.version);
    return { removed: true, url: state.url };
  }
}
