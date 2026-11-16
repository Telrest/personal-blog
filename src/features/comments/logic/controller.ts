import { COMMENT_MAX_LENGTH, CommentRejected, type Comment, type CommentCursor, type CommentStore } from './model.ts';

export type CommentAccount = { userId: string | null; canComment: boolean; isAuthor: boolean };

export type CommentStatus =
  | { kind: 'loading' | 'empty' | 'ready' | 'read-error' | 'unavailable' | 'invalid'
      | 'posting' | 'posted' | 'account-changed' | 'post-error' | 'thread-error' }
  | { kind: 'rejected'; message: string };

export type CommentState = {
  canComment: boolean;
  sending: boolean;
  loading: boolean;
  pageAction: 'more' | 'retry' | null;
  status: CommentStatus;
};

interface CommentView {
  update(state: CommentState): void;
  insert(rows: Comment[], position: 'start' | 'end'): void;
}

export function createCommentController(store: CommentStore | null, view: CommentView) {
  let state: CommentState = {
    canComment: false, sending: false, loading: false, pageAction: null,
    status: { kind: store ? 'loading' : 'unavailable' },
  };
  let account: CommentAccount = { userId: null, canComment: false, isAuthor: false };
  let accountRevision = 0;
  let cursor: CommentCursor | null = null;
  let canReadPage = true;
  let openingThread = false;
  let openedThread = false;
  const seen = new Set<string>();

  function update(patch: Partial<CommentState>) {
    state = { ...state, ...patch };
    view.update(state);
  }

  function insert(rows: Comment[], position: 'start' | 'end') {
    const fresh = rows.filter(row => {
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    });
    if (fresh.length) view.insert(fresh, position);
  }

  async function load() {
    if (!store || state.loading || !canReadPage) return;
    update({ loading: true });
    try {
      const page = await store.list(cursor);
      insert(page.rows, 'end');
      cursor = page.nextCursor;
      canReadPage = cursor !== null;
      update({
        pageAction: canReadPage ? 'more' : null,
        status: { kind: seen.size ? 'ready' : 'empty' },
      });
    } catch {
      update({ pageAction: 'retry', status: { kind: 'read-error' } });
    } finally {
      update({ loading: false });
    }
  }

  async function setAccount(next: CommentAccount) {
    const changed = next.userId !== account.userId
      || next.canComment !== account.canComment || next.isAuthor !== account.isAuthor;
    if (changed) {
      accountRevision++;
      account = next;
      update({ canComment: next.canComment });
    }
    // Opening the thread is idempotent, but avoid repeating a successful request
    // on every auth refresh. A failed attempt may be retried by a later author event.
    if (!store || !next.isAuthor || openingThread || openedThread) return;
    openingThread = true;
    const revision = accountRevision;
    try {
      await store.openThread();
      openedThread = true;
    } catch {
      if (revision === accountRevision) update({ status: { kind: 'thread-error' } });
    } finally {
      openingThread = false;
    }
  }

  async function submit(raw: string): Promise<boolean> {
    if (!store || !state.canComment || state.sending) return false;
    const body = raw.trim();
    if (!body || [...body].length > COMMENT_MAX_LENGTH) {
      update({ status: { kind: 'invalid' } });
      return false;
    }

    const revision = accountRevision;
    update({ sending: true, status: { kind: 'posting' } });
    try {
      const comment = await store.post(body);
      if (revision !== accountRevision) {
        update({ status: { kind: 'account-changed' } });
        return false;
      }
      insert([comment], 'start');
      update({ status: { kind: 'posted' } });
      return true;
    } catch (error) {
      update({ status: error instanceof CommentRejected
        ? { kind: 'rejected', message: error.message }
        : { kind: 'post-error' } });
      return false;
    } finally {
      update({ sending: false });
    }
  }

  view.update(state);
  return { load, setAccount, submit };
}
