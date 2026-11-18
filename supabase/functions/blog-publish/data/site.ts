const SITE = "https://telrest.github.io/personal-blog/";
export const publicArticleUrl = (slug: string) =>
  SITE + "articles/" + slug + "/";
export async function isPublishedOnPages(
  article: { id: string; slug: string; revision_id: string },
  fetcher: typeof fetch,
) {
  let manifest: {
    articles?: { id: string; slug: string; revision_id: string }[];
  };
  try {
    const response = await fetcher(
      `${SITE}publication-manifest.json?check=${Date.now()}`,
      {
        headers: { "Cache-Control": "no-cache" },
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!response.ok) return false;
    manifest = await response.json();
  } catch {
    return false;
  }
  return (
    Array.isArray(manifest.articles) &&
    manifest.articles.some(
      (p) =>
        p.slug === article.slug &&
        p.id === article.id &&
        p.revision_id === article.revision_id,
    )
  );
}
