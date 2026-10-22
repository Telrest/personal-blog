import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { parseImportedArticle } from '../lib/import-article';
import { exportMarkdown, validateDraft } from '../lib/article';
import { DraftSession, type DraftDocument } from '../lib/draft-session';
import { connectCloudWriting } from './writing-cloud';
const get = <T extends HTMLElement>(id:string) => document.getElementById(id) as T;
const title = get<HTMLInputElement>('article-title');
const body = get<HTMLTextAreaElement>('article-body');
const category = get<HTMLInputElement>('article-category');
const tags = get<HTMLInputElement>('article-tags');
const summary = get<HTMLTextAreaElement>('article-summary');
const slug = get<HTMLInputElement>('article-slug');
const message = get<HTMLParagraphElement>('writing-message');
const preview = get<HTMLDivElement>('article-preview');
const pasteDialog = get<HTMLDialogElement>('paste-dialog');
const fields = [title,body,category,tags,summary,slug];
const read = () => ({title:title.value.trim(),markdown:body.value,category:category.value.trim(),tags:tags.value.split(/[,，]/).map(t=>t.trim()).filter(Boolean),summary:summary.value.trim(),slug:slug.value.trim()});
const session = new DraftSession(read());
const empty = ():DraftDocument => ({title:'',markdown:'',category:'见解与思考',tags:[],summary:'',slug:''});
function apply(article:DraftDocument) { title.value=article.title;body.value=article.markdown;category.value=article.category;tags.value=article.tags.join('，');summary.value=article.summary;slug.value=article.slug;render(); }
let timer: ReturnType<typeof setTimeout>;
function notify(text:string, error=false) { message.textContent=text; message.classList.toggle('is-error',error); }
function render() {
  get('preview-title').textContent=title.value.trim()||'未命名文章';
  get('word-count').textContent=`${[...body.value].length.toLocaleString('zh-CN')} 字符`;
  if (body.value.length>1_000_000) { notify('正文超过 100 万字符，暂时停止预览。',true); return; }
  preview.innerHTML = body.value.trim() ? DOMPurify.sanitize(marked.parse(body.value,{async:false,gfm:true}), {
    USE_PROFILES:{html:true},FORBID_TAGS:['style','form','input','button','iframe','object','embed'],FORBID_ATTR:['style','srcset'],
  }) : '<p class="preview-empty">文字会在这里慢慢成形。</p>';
  preview.querySelectorAll<HTMLAnchorElement>('a').forEach(link => {link.target='_blank';link.rel='noopener noreferrer';});
  preview.querySelectorAll<HTMLImageElement>('img').forEach(image=>{image.loading='lazy';image.referrerPolicy='no-referrer';});
}
function changed(){session.edit(read());cloud.changed();}
fields.forEach(field=>field.addEventListener('input',()=>{changed();clearTimeout(timer);timer=setTimeout(render,180);notify(cloud.isOwner()?'有新的修改，等待保存。':'本次修改仅在当前页面中，离开前请导出。');}));
window.addEventListener('beforeunload',event=>{if(session.unprotected){event.preventDefault();event.returnValue='';}});
function canReplace(){if(session.saving){notify('正在保存，请稍等。');return false;}return !session.unprotected||window.confirm('当前修改尚未保存或导出。要替换它吗？建议先取消并导出备份。');}
function importText(text:string,filename:string) {
  const article=parseImportedArticle(text,filename);
  validateDraft(article);
  if(!canReplace())return false;
  apply(article);session.load(null,read());session.edit(read());cloud.reset();cloud.changed();
  notify(article.warnings.length?article.warnings.join(' '):cloud.isOwner()?'文章已导入为新草稿。':'文章已导入本次试写；编辑完成后请导出。');return true;
}
get('import-file').addEventListener('click',()=>get<HTMLInputElement>('article-file').click());
get<HTMLInputElement>('article-file').addEventListener('change',async event=>{
  const input=event.target as HTMLInputElement; const file=input.files?.[0];if(!file)return;
  try { if(file.size>4_000_000)throw new Error('文件过大，请使用 4 MB 以内的文章。');importText(await file.text(),file.name); }
  catch(error){notify(error instanceof Error?error.message:'导入未完成。',true);}finally{input.value='';}
});
get('paste-open').addEventListener('click',()=>{pasteDialog.showModal();get<HTMLTextAreaElement>('paste-content').focus();});
get('paste-confirm').addEventListener('click',()=>{try{if(importText(get<HTMLTextAreaElement>('paste-content').value,'粘贴的文章.md')){pasteDialog.close();get<HTMLTextAreaElement>('paste-content').value='';}}catch(error){notify(error instanceof Error?error.message:'导入未完成。',true);pasteDialog.close();}});
function download(article:DraftDocument){
    validateDraft(article);if(!article.title&&!article.markdown.trim())throw new Error('先写一点内容，再导出吧。');
    const blob=new Blob([exportMarkdown(article)],{type:'text/markdown;charset=utf-8'});const url=URL.createObjectURL(blob);const link=document.createElement('a');
    link.href=url;link.download=`${(article.title||'未命名文章').replace(/[<>:"/\\|?*\u0000-\u001f]/g,'-').slice(0,100)}.md`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
get('export-file').addEventListener('click',()=>{
  try {
    download(read());session.markExported();notify('已生成 Markdown 下载文件，请确认下载完成；云端保存状态保持不变。');
  }catch(error){notify(error instanceof Error?error.message:'导出未完成。',true);}
});
get('new-article').addEventListener('click',()=>{if(!canReplace())return;session.load(null,empty());apply(session.document);cloud.reset();notify('已新建空白文章。');body.focus();});
document.querySelectorAll<HTMLButtonElement>('[data-format]').forEach(button=>button.addEventListener('click',()=>{
  const start=body.selectionStart,end=body.selectionEnd,selected=body.value.slice(start,end);let text='';
  switch(button.dataset.format){
    case 'heading':text=`## ${selected||'小标题'}`;break;
    case 'bold':text=`**${selected||'加粗文字'}**`;break;
    case 'italic':text=`*${selected||'斜体文字'}*`;break;
    case 'quote':text=(selected||'引用的文字').split('\n').map(line=>`> ${line}`).join('\n');break;
    case 'list':text=(selected||'列表内容').split('\n').map(line=>`- ${line}`).join('\n');break;
    case 'link':text=`[${selected||'链接文字'}](https://example.com)`;break;
    case 'code':text=`\n\`\`\`\n${selected||'在这里写代码'}\n\`\`\`\n`;break;
  }
  if(['heading','quote','list'].includes(button.dataset.format||'')&&start>0&&body.value[start-1]!=='\n')text='\n'+text;
  // Keep a closing code fence intact when inserting immediately after it.
  // 在代码围栏行末插入格式时先换行，避免破坏围栏。
  if(start===end && /(?:^|\n)[ \t]*(`{3,}|~{3,})[ \t]*$/.test(body.value.slice(0,start)))text='\n\n'+text;
  if(body.readOnly)return;
  body.setRangeText(text,start,end,'select');body.focus();changed();render();notify('排版已更新。');
}));
function setView(view:string){document.querySelector('.workbench-columns')?.setAttribute('data-view',view);document.querySelectorAll<HTMLButtonElement>('[data-view][aria-pressed]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.view===view)));}
document.querySelectorAll<HTMLButtonElement>('[data-view][aria-pressed]').forEach(button=>button.addEventListener('click',()=>setView(button.dataset.view!)));
if(matchMedia('(max-width:760px)').matches)setView('edit');
const themeButton=get<HTMLButtonElement>('writing-theme');
const cloud=connectCloudWriting({session,read,apply,empty,notify,canReplace,download,readonly:(value)=>{fields.forEach(field=>field.readOnly=value);document.querySelectorAll<HTMLButtonElement>('[data-format]').forEach(button=>button.disabled=value);}});
document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();if(cloud.isOwner())void cloud.save();else get('export-file').click();}});
const updateTheme=()=>{const dark=document.documentElement.dataset.theme!=='light';themeButton.setAttribute('aria-label',dark?'切换为浅色模式':'切换为深色模式');};
themeButton.addEventListener('click',()=>{const next=document.documentElement.dataset.theme==='light'?'dark':'light';document.documentElement.dataset.theme=next;try{localStorage.setItem('telrest-theme-v2',next);}catch{}updateTheme();});updateTheme();render();
