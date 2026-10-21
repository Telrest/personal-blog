import test from 'node:test';
import assert from 'node:assert/strict';
import { parseImportedArticle } from '../src/lib/import-article.ts';
import { exportMarkdown, validateDraft } from '../src/lib/article.ts';
test('Markdown BOM/CRLF and first heading become editable metadata',()=>{
  const article=parseImportedArticle('\uFEFF# 我的文章\r\n\r\n正文。','example.md');
  assert.equal(article.title,'我的文章');assert.equal(article.markdown,'正文。');
});
test('frontmatter imports only allowed fields, ignoring dates and publication status',()=>{
  const article=parseImportedArticle('---\ntitle: 外部文章\nsummary: 摘要\ncategory: 学习笔记\ntags: [C, 学习]\nslug: test-post\nstatus: published\npublishedAt: 2000-01-01\n__proto__: {polluted: true}\n---\n# 外部文章\n\n正文','example.md');
  assert.equal(article.title,'外部文章');assert.equal(article.summary,'摘要');assert.deepEqual(article.tags,['C','学习']);
  assert.equal(article.markdown,'正文');assert.equal('status' in article,false);assert.equal('publishedAt' in article,false);assert.equal('polluted' in article,false);assert.equal(({} as Record<string,unknown>).polluted,undefined);
});
test('malformed metadata and wrong field types are rejected',()=>{
  assert.throws(()=>parseImportedArticle('---\ntitle: [broken\n---\nbody','a.md'),/YAML/);
  assert.throws(()=>parseImportedArticle('---\ntitle: 1\n---\nbody','a.md'),/必须是文字/);
  assert.throws(()=>parseImportedArticle('---\ntags: [one, 2]\n---\nbody','a.md'),/标签/);
  assert.throws(()=>parseImportedArticle('---\ntitle: missing end','a.md'),/分隔线/);
});
test('headings inside fences do not become article title',()=>{
  const article=parseImportedArticle('```c\n# not a title\n```\n\n# 真标题\n内容','a.md');
  assert.equal(article.title,'真标题');assert.match(article.markdown,/# not a title/);
});
test('relative images warn; external images are left untouched',()=>{
  assert.equal(parseImportedArticle('![图](./image.png)','a.md').warnings.length,1);
  assert.equal(parseImportedArticle('![图](https://example.com/a.png)','a.md').warnings.length,0);
});
test('plain text retains content and derives filename title',()=>{
  const article=parseImportedArticle('# 原文\n内容','生活.TXT');assert.equal(article.title,'生活');assert.equal(article.markdown,'# 原文\n内容');
});
test('invalid files and oversized content fail without replacing current writing',()=>{
  assert.throws(()=>parseImportedArticle('x','a.docx'),/支持/);
  assert.throws(()=>parseImportedArticle('  ','a.md'),/为空/);
  assert.throws(()=>parseImportedArticle('a'.repeat(1_000_001),'a.md'),/过大/);
});
test('export can be imported again without losing metadata or body',()=>{
  const article={title:'标题：带 "引号"',summary:'第一行\n第二行',category:'学习笔记',tags:['C','a: b'],slug:'test-post',markdown:'## 正文\n\n```c\nint main(void) {}\n```'};
  const roundTrip=parseImportedArticle(exportMarkdown(article),'roundtrip.md');
  for(const field of ['title','summary','category','slug'] as const)assert.equal(roundTrip[field],article[field]);
  assert.deepEqual(roundTrip.tags,article.tags);assert.equal(roundTrip.markdown.trim(),article.markdown);
});
test('draft metadata limits and publish requirements are enforced',()=>{
  const draft={title:'标题',summary:'',category:'学习笔记',tags:[],slug:'',markdown:''};
  assert.doesNotThrow(()=>validateDraft(draft));
  assert.throws(()=>validateDraft({...draft,slug:'../bad'}),/地址/);
  assert.throws(()=>validateDraft({...draft,title:'a'.repeat(181)}),/标题/);
  assert.throws(()=>validateDraft(draft,true),/标题和正文/);
});
