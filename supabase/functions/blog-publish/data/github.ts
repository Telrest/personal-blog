import {
  PublishError,
  validatePublished,
  type PublishedArticle,
} from "../../_shared/publication.ts";
const API = "https://api.github.com/repos/Telrest/personal-blog";
function encode(text: string) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 32768)
    binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(binary);
}
function decode(text: string) {
  return new TextDecoder().decode(
    Uint8Array.from(atob(text.replace(/\s/g, "")), (c) => c.charCodeAt(0)),
  );
}
export class GithubArticles {
  private token: string;
  private fetcher: typeof fetch;
  constructor(token: string, fetcher: typeof fetch = fetch) {
    this.token = token;
    this.fetcher = fetcher;
  }
  private async request(path: string, init: RequestInit = {}, raw = false) {
    const response = await this.fetcher(API + path, {
      ...init,
      headers: {
        Accept: raw
          ? "application/vnd.github.raw+json"
          : "application/vnd.github+json",
        Authorization: `Bearer ${this.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "Telrest-Blog-Publisher",
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(20000),
    });
    if (response.status === 404) return null;
    if (!response.ok)
      throw new PublishError(
        response.status === 409 || response.status === 422
          ? "仓库中的文章已更新，请重新检查发布版本。"
          : "GitHub 写入未完成，请检查服务端发布凭据和仓库权限。",
        response.status === 409 || response.status === 422 ? 409 : 502,
      );
    return raw ? await response.text() : await response.json();
  }
  async read(
    slug: string,
  ): Promise<{ post: PublishedArticle; sha: string } | null> {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 100)
      throw new PublishError("文章地址无效。");
    const path = `/contents/src/content/published/${slug}.json?ref=main`;
    const result = await this.request(path);
    if (!result) return null;
    if (result.type !== "file" || typeof result.sha !== "string")
      throw new PublishError("目标文章文件格式有误。", 409);
    const text = result.content
      ? decode(result.content)
      : await this.request(path, {}, true);
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      throw new PublishError("仓库中的文章无法读取，不会覆盖。", 409);
    }
    return { post: await validatePublished(value), sha: result.sha };
  }
  async write(post: PublishedArticle, sha?: string): Promise<string> {
    const result = await this.request(
      "/contents/src/content/published/" + post.slug + ".json",
      {
        method: "PUT",
        body: JSON.stringify({
          message: "Publish article: " + post.slug,
          branch: "main",
          content: encode(JSON.stringify(post, null, 2) + "\n"),
          ...(sha ? { sha } : {}),
        }),
      },
    );
    if (!result?.commit?.sha)
      throw new PublishError(
        "发布结果尚未确认，草稿会继续保留，请重试检查。",
        502,
      );
    return result.commit.sha;
  }
}
