import {PublishError,uuid,digest,documentOf,articleRevision,validatePublished,validateSnapshot,fingerprint,requireCleanup,type DraftSnapshot,type PublishedArticle} from './publication.ts';
const API='https://api.github.com/repos/Telrest/personal-blog';
const SITE='https://telrest.github.io/personal-blog/';
type Cloud={snapshot:(id:string,version:number)=>Promise<DraftSnapshot>;remove:(id:string,version:number)=>Promise<void>};
type Fetcher=typeof fetch;
function encode(text:string){const bytes=new TextEncoder().encode(text);let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(binary);}
function decode(text:string){return new TextDecoder().decode(Uint8Array.from(atob(text.replace(/\s/g,'')),c=>c.charCodeAt(0)));}
export class PublishingService{
  private token:string;private cloud:Cloud;private fetcher:Fetcher;
  constructor(token:string,cloud:Cloud,fetcher:Fetcher=fetch){this.token=token;this.cloud=cloud;this.fetcher=fetcher;}
  private async request(path:string,init:RequestInit={},raw=false){
    const response=await this.fetcher(API+path,{...init,headers:{Accept:raw?'application/vnd.github.raw+json':'application/vnd.github+json',Authorization:`Bearer ${this.token}`,'X-GitHub-Api-Version':'2022-11-28','User-Agent':'Telrest-Blog-Publisher','Content-Type':'application/json'},signal:AbortSignal.timeout(20000)});
    if(response.status===404)return null;
    if(!response.ok)throw new PublishError(response.status===409||response.status===422?'仓库中的文章已更新，请重新检查发布版本。':'GitHub 写入未完成，请检查服务端发布凭据和仓库权限。',response.status===409||response.status===422?409:502);
    return raw?await response.text():await response.json();
  }
  async source(slug:string):Promise<{post:PublishedArticle;sha:string}|null>{
    if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)||slug.length>100)throw new PublishError('文章地址无效。');
    const path=`/contents/src/content/published/${slug}.json?ref=main`;
    const result=await this.request(path);if(!result)return null;
    if(result.type!=='file'||typeof result.sha!=='string')throw new PublishError('目标文章文件格式有误。',409);
    const text=result.content?decode(result.content):await this.request(path,{},true);
    let value:unknown;try{value=JSON.parse(text);}catch{throw new PublishError('仓库中的文章无法读取，不会覆盖。',409);}
    return {post:await validatePublished(value),sha:result.sha};
  }
  private async snapshot(id:unknown,version:unknown){if(!uuid(id)||!Number.isSafeInteger(version)||Number(version)<1)throw new PublishError('草稿编号或版本无效。');return validateSnapshot(await this.cloud.snapshot(id,Number(version)));}
  async preview(id:unknown,version:unknown){const snapshot=await this.snapshot(id,version);const document=documentOf(snapshot.draft,true);const existing=await this.source(document.slug);return {existing:existing?.post||null,url:`${SITE}articles/${document.slug}/`,revision:await articleRevision(document)};}
  async publish(id:unknown,version:unknown,expected:unknown){
    if(expected!==null&&!digest(expected))throw new PublishError('请先检查发布版本。');
    const snapshot=await this.snapshot(id,version);if(snapshot.draft.archived)throw new PublishError('请先恢复归档草稿。');
    const document=documentOf(snapshot.draft,true),existing=await this.source(document.slug),revision=await articleRevision(document);
    // An identical retry is safe after a lost response. 不重复写入已经成功提交的相同内容。
    if(existing?.post.revision_id===revision)return {post:existing.post,url:`${SITE}articles/${document.slug}/`,unchanged:true};
    if((existing?.post.revision_id||null)!==expected)throw new PublishError('文章已在另一处更新，请重新检查后发布。',409);
    const now=new Date().toISOString();
    const post:PublishedArticle={...document,format:1,id:existing?.post.id||crypto.randomUUID(),published_at:existing?.post.published_at||now,updated_at:now,revision_id:revision};
    const result=await this.request(`/contents/src/content/published/${document.slug}.json`,{method:'PUT',body:JSON.stringify({message:`Publish article: ${document.slug}`,branch:'main',content:encode(JSON.stringify(post,null,2)+'\n'),...(existing?{sha:existing.sha}:{})})});
    if(!result?.commit?.sha)throw new PublishError('发布结果尚未确认，草稿会继续保留，请重试检查。',502);
    return {post,url:`${SITE}articles/${post.slug}/`,commit:result.commit.sha,unchanged:false};
  }
  async live(slug:string,revision:string){
    const source=await this.source(slug);if(!source||source.post.revision_id!==revision)return {deployed:false,superseded:Boolean(source)};
    let manifest: {articles?:{id:string;slug:string;revision_id:string}[]};
    try{const response=await this.fetcher(`${SITE}publication-manifest.json?check=${Date.now()}`,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(15000)});if(!response.ok)return {deployed:false};manifest=await response.json();}catch{return {deployed:false};}
    const deployed=Array.isArray(manifest.articles)&&manifest.articles.some(p=>p.slug===slug&&p.id===source.post.id&&p.revision_id===revision);
    return {deployed,post:source.post,url:`${SITE}articles/${slug}/`};
  }
  async cleanup(input:{id:unknown;version:unknown;slug:unknown;revision:unknown;snapshotFingerprint:unknown;backupVerified:unknown}){
    if(input.backupVerified!==true||!digest(input.revision)||!digest(input.snapshotFingerprint)||typeof input.slug!=='string')throw new PublishError('请先完成本地备份校验。');
    const snapshot=await this.snapshot(input.id,input.version);
    if(snapshot.draft.slug!==input.slug)throw new PublishError('文章地址与草稿不一致。',409);
    const state=await this.live(input.slug,input.revision);
    if(!state.post)throw new PublishError('尚未确认发布结果，云端草稿会保留。',409);
    await requireCleanup(snapshot,state.post,{snapshotFingerprint:input.snapshotFingerprint,revision:input.revision},state.deployed?state.post.revision_id:undefined);
    await this.cloud.remove(snapshot.draft.id,snapshot.draft.version);
    return {removed:true,url:state.url};
  }
}
