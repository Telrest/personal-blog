export type DraftDocument={title:string;summary:string;category:string;tags:string[];slug:string;markdown:string};
export type PublishedArticle=DraftDocument & {format:1;id:string;published_at:string;updated_at:string;revision_id:string};
export type DraftSnapshot={draft:DraftDocument & {id:string;owner_id:string;version:number;created_at:string;updated_at:string;archived:boolean};revisions:{id:string;version:number;created_at:string;snapshot:Record<string,unknown>}[]};
export type BackupPayload={format:'telrest-blog-backup';version:1;created_at:string;snapshot:DraftSnapshot;publication:PublishedArticle|null;local_history:DraftSnapshot['revisions']};
export type BlogBackup=BackupPayload & {fingerprint:string};
export class PublishError extends Error{status:number;constructor(message:string,status=400){super(message);this.name='PublishError';this.status=status;}}
export const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export const digest=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);
const date=(value:unknown):value is string=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(value)&&Number.isFinite(Date.parse(value));
export function documentOf(value:unknown,publishing=false):DraftDocument{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new PublishError('文章格式有误。');
  const source=value as Record<string,unknown>;
  for(const key of ['title','summary','category','slug','markdown'])if(typeof source[key]!=='string')throw new PublishError(`文章字段格式有误：${key}`);
  const d=source as DraftDocument;
  if(d.title.length>180||d.summary.length>600||!d.category.trim()||d.category.length>60||d.slug.length>100||d.markdown.length>1_000_000)throw new PublishError('文章字段超出长度限制。');
  if(!Array.isArray(d.tags)||d.tags.length>20||d.tags.some(t=>typeof t!=='string'||t.length>40))throw new PublishError('标签格式或数量有误。');
  if(d.slug&&!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(d.slug))throw new PublishError('文章地址只使用小写字母、数字和连字符。');
  if(publishing&&(!d.title.trim()||!d.markdown.trim()||!d.slug))throw new PublishError('发布前请填写标题、正文和文章地址。');
  return {title:d.title,summary:d.summary,category:d.category,tags:[...d.tags],slug:d.slug,markdown:d.markdown};
}
export function canonical(value:unknown):string{
  if(value===null||typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);
  if(typeof value==='number'&&Number.isFinite(value))return JSON.stringify(value);
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical((value as Record<string,unknown>)[k])).join(',')+'}';
  throw new PublishError('备份包含无法保存的数据。');
}
export async function fingerprint(value:unknown){const bytes=new TextEncoder().encode(canonical(value));return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');}
export async function articleRevision(value:unknown){return fingerprint(documentOf(value,true));}
export async function validatePublished(value:unknown):Promise<PublishedArticle>{
  const document=documentOf(value,true),p=value as PublishedArticle;
  if(p.format!==1||!uuid(p.id)||!date(p.published_at)||!date(p.updated_at)||Date.parse(p.updated_at)<Date.parse(p.published_at)||!digest(p.revision_id)||await articleRevision(document)!==p.revision_id)throw new PublishError('已发布文章的信息或校验值有误。');
  return {...document,format:1,id:p.id,published_at:p.published_at,updated_at:p.updated_at,revision_id:p.revision_id};
}
export function validateSnapshot(value:unknown):DraftSnapshot{
  if(!value||typeof value!=='object')throw new PublishError('备份快照格式有误。');
  const s=value as DraftSnapshot,d=s.draft;documentOf(d);
  if(!uuid(d.id)||!uuid(d.owner_id)||!Number.isSafeInteger(d.version)||d.version<1||!date(d.created_at)||!date(d.updated_at)||typeof d.archived!=='boolean')throw new PublishError('草稿身份或版本格式有误。');
  validateHistory(s.revisions);return s;
}
function validateHistory(rows:unknown):asserts rows is DraftSnapshot['revisions']{
  if(!Array.isArray(rows)||rows.length>30)throw new PublishError('历史版本最多保留 30 条。');
  for(const r of rows){if(!uuid(r.id)||!Number.isSafeInteger(r.version)||r.version<1||!date(r.created_at))throw new PublishError('历史版本信息有误。');documentOf(r.snapshot);}
}
export async function makeBackup(snapshot:DraftSnapshot,publication:PublishedArticle|null,localHistory:DraftSnapshot['revisions']=[]):Promise<BlogBackup>{
  validateSnapshot(snapshot);validateHistory(localHistory);if(publication)await validatePublished(publication);
  const payload:BackupPayload={format:'telrest-blog-backup',version:1,created_at:new Date().toISOString(),snapshot,publication,local_history:localHistory};
  return {...payload,fingerprint:await fingerprint(payload)};
}
export async function parseBackup(text:string):Promise<BlogBackup>{
  if(text.length>128_000_000)throw new PublishError('备份文件过大。');
  let b:BlogBackup;try{b=JSON.parse(text);}catch{throw new PublishError('备份不是有效的 JSON 文件。');}
  if(!b||b.format!=='telrest-blog-backup'||b.version!==1||!date(b.created_at)||!digest(b.fingerprint))throw new PublishError('这不是支持的博客备份文件。');
  validateSnapshot(b.snapshot);validateHistory(b.local_history);if(b.publication)await validatePublished(b.publication);
  const {fingerprint:expected,...payload}=b;if(await fingerprint(payload)!==expected)throw new PublishError('备份校验失败，文件可能不完整或已被修改。');return b;
}
export async function requireCleanup(snapshot:DraftSnapshot,post:PublishedArticle,proof:{snapshotFingerprint:string;revision:string},liveRevision:string|undefined){
  validateSnapshot(snapshot);await validatePublished(post);
  if(await fingerprint(snapshot)!==proof.snapshotFingerprint)throw new PublishError('云端草稿或历史已改变，请重新备份。',409);
  if(post.revision_id!==proof.revision||await articleRevision(snapshot.draft)!==post.revision_id)throw new PublishError('发布内容与备份草稿不一致，不会清理云端。',409);
  if(liveRevision!==post.revision_id)throw new PublishError('尚未确认文章上线，不会清理云端。',409);
}
