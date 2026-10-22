import {marked} from 'marked';
import sanitizeHtml from 'sanitize-html';
import {validatePublished,type PublishedArticle} from './publication';
export type {PublishedArticle} from './publication';
const files=import.meta.glob('../content/published/*.json',{eager:true,import:'default'});
let loaded:Promise<PublishedArticle[]>|undefined;
export function getPublishedPosts(){
  return loaded??=Promise.all(Object.entries(files).map(async([path,value])=>{const post=await validatePublished(value);if(!path.endsWith(`/${post.slug}.json`))throw new Error('文章地址与文件名不一致。');return post;})).then(posts=>{
    if(new Set(posts.map(p=>p.id)).size!==posts.length)throw new Error('文章编号重复。');
    return posts.sort((a,b)=>b.published_at.localeCompare(a.published_at)||a.slug.localeCompare(b.slug));
  });
}
export function renderMarkdown(markdown:string){
  return sanitizeHtml(marked.parse(markdown,{async:false,gfm:true}),{
    allowedTags:[...sanitizeHtml.defaults.allowedTags,'img','del'],
    allowedAttributes:{a:['href','title','target','rel'],img:['src','alt','title','loading','referrerpolicy'],code:['class'],th:['align'],td:['align']},
    allowedSchemes:['http','https','mailto'],allowProtocolRelative:false,
    transformTags:{a:(_tag,attrs)=>({tagName:'a',attribs:{...attrs,target:'_blank',rel:'noopener noreferrer'}}),img:(_tag,attrs)=>({tagName:'img',attribs:{...attrs,loading:'lazy',referrerpolicy:'no-referrer'}})},
  });
}
