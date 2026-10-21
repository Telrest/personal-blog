export type Draft = {
  id: string; owner_id: string; title: string; summary: string; category: string;
  tags: string[]; slug: string; markdown: string; version: number;
  created_at: string; updated_at: string;
};
export type Article = {
  id: string; slug: string; title: string; summary: string; category: string;
  tags: string[]; markdown: string; published_at: string; updated_at: string;
  revision_id: string; is_published: boolean;
};
export function validateDraft(draft: Pick<Draft, 'title'|'summary'|'category'|'tags'|'slug'|'markdown'>, publishing = false) {
  if (draft.title.length > 180) throw new Error('标题最多 180 字。');
  if (draft.summary.length > 600) throw new Error('摘要最多 600 字。');
  if (draft.category.length > 60 || !draft.category.trim()) throw new Error('请填写 60 字以内的分类。');
  if (draft.tags.length > 20 || draft.tags.some(tag => tag.length > 40)) throw new Error('最多 20 个标签，每个标签最多 40 字。');
  if (draft.markdown.length > 1_000_000) throw new Error('文章过长，请控制在 100 万字符以内。');
  if (draft.slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(draft.slug)) throw new Error('文章地址只使用小写字母、数字和连字符。');
  if (draft.slug.length > 100) throw new Error('文章地址最多 100 字符。');
  if (publishing && (!draft.title.trim() || !draft.markdown.trim())) throw new Error('发布前请填写标题和正文。');
}
export function exportMarkdown(draft: Pick<Draft, 'title'|'summary'|'category'|'tags'|'slug'|'markdown'>) {
  // JSON strings are valid YAML scalars. JSON 转义也适用于 YAML，避免标题破坏元数据。
  return `---\ntitle: ${JSON.stringify(draft.title)}\nsummary: ${JSON.stringify(draft.summary)}\ncategory: ${JSON.stringify(draft.category)}\ntags: ${JSON.stringify(draft.tags)}\nslug: ${JSON.stringify(draft.slug)}\n---\n\n${draft.markdown}\n`;
}
export function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '时间未知' : new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year:'numeric', month:'2-digit', day:'2-digit' }).format(date);
}
