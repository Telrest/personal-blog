import { deepStrictEqual as equal, strictEqual as is } from 'node:assert';
import { test } from 'node:test';
import { createCommentController, type CommentState } from '../src/features/comments/logic/controller.ts';
import { COMMENT_MAX_LENGTH, CommentRejected, type Comment, type CommentStore } from '../src/features/comments/logic/model.ts';

const guest = { userId: null, canComment: false, isAuthor: false };
const member = { userId: 'member', canComment: true, isAuthor: false };
const author = { userId: 'owner', canComment: true, isAuthor: true };
const row = (id: string): Comment => ({
  id, github_login: 'reader', body: id, created_at: '2026-11-16T00:00:00Z',
});

function setup(overrides: Partial<CommentStore> = {}) {
  let state!: CommentState;
  const inserted: string[] = [];
  const store: CommentStore = {
    async list() { return { rows: [], nextCursor: null }; },
    async post(text) { return row(text); },
    async openThread() {},
    ...overrides,
  };
  const controller = createCommentController(store, {
    update(next) { state = next; },
    insert(rows, position) {
      if (position === 'start') inserted.unshift(...rows.map(row => row.id));
      else inserted.push(...rows.map(row => row.id));
    },
  });
  return { controller, inserted, state: () => state };
}

test('comment pagination retries the same cursor and deduplicates results', async () => {
  const first = row('first');
  const cursor = { id: first.id, created_at: first.created_at };
  const seen: unknown[] = [];
  const ui = setup({
    async list(cursor) {
      seen.push(cursor);
      if (seen.length === 1) return { rows: [first], nextCursor: { id: first.id, created_at: first.created_at } };
      if (seen.length === 2) throw new Error('offline');
      return { rows: [first, row('older')], nextCursor: null };
    },
  });
  await ui.controller.load();
  is(ui.state().pageAction, 'more');
  await ui.controller.load();
  is(ui.state().pageAction, 'retry');
  is(ui.state().status.kind, 'read-error');
  await ui.controller.load();
  await ui.controller.load();
  equal(seen, [null, cursor, cursor]);
  equal(ui.inserted, ['first', 'older']);
  is(ui.state().pageAction, null);
});

test('guests cannot post; invalid comments never reach storage', async () => {
  const sent: string[] = [];
  const ui = setup({ async post(text) { sent.push(text); return row(text); } });
  is(await ui.controller.submit('guest text'), false);
  await ui.controller.setAccount(member);
  is(await ui.controller.submit('   '), false);
  is(await ui.controller.submit('字'.repeat(COMMENT_MAX_LENGTH + 1)), false);
  is(ui.state().status.kind, 'invalid');
  equal(sent, []);
  is(await ui.controller.submit('  hello  '), true);
  equal(sent, ['hello']);
  equal(ui.inserted, ['hello']);
});

test('one submit stays pending across same-account refresh, but not across sign-out', async () => {
  let finish!: (comment: Comment) => void;
  const ui = setup({ post: () => new Promise(resolve => { finish = resolve; }) });
  await ui.controller.setAccount(member);
  const first = ui.controller.submit('written');
  is(await ui.controller.submit('duplicate'), false);
  await ui.controller.setAccount({ ...member });
  finish(row('written'));
  is(await first, true);
  const second = ui.controller.submit('pending');
  await ui.controller.setAccount(guest);
  finish(row('pending'));
  is(await second, false);
  equal(ui.inserted, ['written']);
  is(ui.state().status.kind, 'account-changed');
  is(ui.state().sending, false);
});

test('only the author opens the thread, once per mounted comment section', async () => {
  let calls = 0;
  const ui = setup({ async openThread() { calls++; } });
  await ui.controller.setAccount(member);
  await ui.controller.setAccount(guest);
  is(calls, 0);
  await Promise.all([ui.controller.setAccount(author), ui.controller.setAccount(author)]);
  await ui.controller.setAccount(author);
  is(calls, 1);
});

test('server rejections are reported, but unexpected transport details are not exposed', async () => {
  let failure: Error = new CommentRejected('请稍后再留言');
  const ui = setup({ async post() { throw failure; } });
  await ui.controller.setAccount(member);
  is(await ui.controller.submit('message'), false);
  equal(ui.state().status, { kind: 'rejected', message: '请稍后再留言' });
  failure = new Error('internal detail');
  is(await ui.controller.submit('retry'), false);
  equal(ui.state().status, { kind: 'post-error' });
});
