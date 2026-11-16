import { backend, backendConfigured } from '../../../lib/cloud-drafts';
import { CommentRejected, type CommentStore } from '../logic/model';

const PAGE_SIZE = 20;
const PUBLIC_FIELDS = 'id,github_login,body,created_at';

export async function openArticleComments(articleId: string, slug: string): Promise<void> {
  const { error } = await backend().rpc('open_article_comments', {
    p_article_id: articleId, p_slug: slug,
  });
  if (error) throw error;
}

export function createSupabaseComments(articleId: string, slug: string): CommentStore | null {
  if (!backendConfigured) return null;
  return {
    async list(cursor) {
      let query = backend().from('blog_comments').select(PUBLIC_FIELDS)
        .eq('article_id', articleId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(PAGE_SIZE);
      if (cursor) {
        const { id, created_at: date } = cursor;
        query = query.or(`created_at.lt.${date},and(created_at.eq.${date},id.lt.${id})`);
      }
      const { data, error } = await query;
      if (error) throw error;
      const rows = data ?? [];
      const last = rows.at(-1);
      return { rows, nextCursor: rows.length === PAGE_SIZE && last
        ? { id: last.id, created_at: last.created_at }
        : null };
    },
    async post(body) {
      const { data, error } = await backend().rpc('post_blog_comment', {
        p_article_id: articleId, p_body: body,
      });
      if (error?.code === 'P0001') throw new CommentRejected(error.message);
      if (error) throw error;
      return data;
    },
    openThread: () => openArticleComments(articleId, slug),
  };
}
