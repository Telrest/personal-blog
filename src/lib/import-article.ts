import { parseDocument } from 'yaml';
export function parseImportedArticle(text: string, filename: string) {
  if (!/\.(md|markdown|txt)$/i.test(filename)) throw new Error('目前支持 .md、.markdown 和 .txt 文件。');
  if (text.length > 1_000_000) throw new Error('文件过大，请使用 100 万字符以内的文章。');
  text = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  if (!text.trim()) throw new Error('文件内容为空。');
  const fallback = filename.replace(/\.[^.]+$/, '').slice(0,180);
  const result = { title:fallback, summary:'', category:'见解与思考', tags:[] as string[], slug:'', markdown:text, warnings:[] as string[] };
  if (/\.txt$/i.test(filename)) return result;
  if (/^---[ \t]*\n/.test(text)) {
    const close = /^---[ \t]*$/gm; close.lastIndex = text.indexOf('\n') + 1;
    const ending = close.exec(text);
    if (!ending) throw new Error('文章开头的 YAML 元数据缺少结束分隔线 ---。');
    const document = parseDocument(text.slice(text.indexOf('\n') + 1, ending.index), { uniqueKeys:true });
    if (document.errors.length) throw new Error('文章的 YAML 元数据格式有误。');
    let metadata: unknown;
    try { metadata = document.toJS({ maxAliasCount:20 }); } catch { throw new Error('文章的 YAML 元数据过于复杂。'); }
    if (metadata !== null && (typeof metadata !== 'object' || Array.isArray(metadata))) throw new Error('文章元数据需要使用字段和值。');
    const data = (metadata || {}) as Record<string, unknown>;
    for (const name of ['title','summary','description','category','slug']) if (Object.hasOwn(data,name) && typeof data[name] !== 'string') throw new Error(`元数据 ${name} 必须是文字。`);
    for (const name of ['title','category','slug'] as const) if (Object.hasOwn(data,name)) result[name] = String(data[name]);
    result.summary = Object.hasOwn(data,'summary') ? String(data.summary) : Object.hasOwn(data,'description') ? String(data.description) : '';
    if (Object.hasOwn(data,'tags')) {
      if (!Array.isArray(data.tags) || data.tags.length > 20 || data.tags.some(tag => typeof tag !== 'string')) throw new Error('标签需要是最多 20 项的文字数组。');
      result.tags = [...data.tags];
    }
    result.markdown = text.slice(ending.index + ending[0].length).replace(/^\n/, '');
  }
  // Ignore headings inside fenced code. 不将代码块中的 # 当成文章标题。
  const lines = result.markdown.split('\n'); let fence = ''; let heading = -1;
  for (let i=0; i<lines.length; i++) {
    const marker = lines[i].match(/^\s{0,3}(`{3,}|~{3,})/);
    if (marker) { if (!fence) fence=marker[1][0]; else if (fence===marker[1][0]) fence=''; continue; }
    if (!fence && /^#\s+/.test(lines[i])) { heading=i; break; }
  }
  if (heading >= 0) {
    const title = lines[heading].replace(/^#\s+/, '').replace(/\s+#+\s*$/, '').trim();
    if (result.title === fallback) result.title = title;
    if (title === result.title) { lines.splice(heading,1); result.markdown=lines.join('\n').replace(/^\n+/, ''); }
  }
  if (/!\[[^\]]*\]\((?!https?:|storage:|data:|#)[^)]+\)/i.test(result.markdown)) result.warnings.push('文章包含相对路径图片，请在编辑器中重新上传这些图片。');
  return result;
}
