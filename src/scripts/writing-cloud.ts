import {backend,backendConfigured,authorAccount,signIn,saveCloudDraft,listCloudDrafts,loadCloudDraft,archiveCloudDraft,draftHistory,errorMessage} from '../lib/cloud-drafts';
import {validateDraft} from '../lib/article';
import type {DraftSession,DraftDocument} from '../lib/draft-session';
type Bridge={session:DraftSession;read:()=>DraftDocument;apply:(document:DraftDocument)=>void;empty:()=>DraftDocument;notify:(message:string,error?:boolean)=>void;canReplace:()=>boolean;readonly:(value:boolean)=>void;download:(document:DraftDocument)=>void};
const get=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const time=(value:string)=>new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value));
export function connectCloudWriting(bridge:Bridge){
  const {session,notify}=bridge;
  const status=get('account-status'), badge=get('writing-session-label');
  const login=get<HTMLButtonElement>('cloud-signin'),logout=get<HTMLButtonElement>('cloud-signout');
  const save=get<HTMLButtonElement>('cloud-save'),reload=get<HTMLButtonElement>('cloud-reload'),history=get<HTMLButtonElement>('cloud-history');
  const autosave=get<HTMLInputElement>('cloud-autosave'),archived=get<HTMLInputElement>('show-archived');
  const list=get<HTMLUListElement>('cloud-draft-list'),more=get<HTMLButtonElement>('cloud-load-more');
  let owner=false,managing=false,accountGeneration=0,listGeneration=0,openGeneration=0,offset=0;
  let saveTimer:ReturnType<typeof setTimeout>|undefined;
  function controls(){
    save.disabled=!owner||managing||session.saving||session.conflict||Boolean(session.current?.archived);
    history.disabled=!owner||!session.current;
    reload.hidden=!owner||!session.current;
    get('cloud-controls').hidden=!owner;get('cloud-drafts').hidden=!owner;
    bridge.readonly(Boolean(owner&&session.current?.archived));
    badge.textContent=owner?(session.current?.archived?'已归档':session.saving?'正在保存':session.dirty?'未保存修改':session.current?'私密云端草稿':'新草稿'):'本次试写';
  }
  function changed(){
    controls();clearTimeout(saveTimer);
    if(owner&&!managing&&autosave.checked&&!session.conflict&&!session.current?.archived)saveTimer=setTimeout(()=>void persist(false),2000);
  }
  async function persist(manual:boolean){
    if(!owner){notify('请先登录为作者；当前内容可以导出备份。',true);return;}
    if(managing){notify('正在管理草稿，请稍等。');return;}
    clearTimeout(saveTimer);
    try{
      validateDraft(session.document);notify('正在保存私密草稿……');
      const operation=session.save(saveCloudDraft,manual);controls();await operation;
      if(!owner)return;
      notify(session.dirty?'已保存较早的修改，正在等待保存最新内容。':`已保存到私密云端 · ${time(session.current!.updated_at)}`);
      controls();await refreshList();if(session.dirty)changed();
    }catch(error){notify(`未保存：${errorMessage(error)}`,true);}finally{controls();}
  }
  async function openDraft(id:string){
    if(!bridge.canReplace())return;
    const generation=++openGeneration,previous=JSON.stringify(session.document);
    clearTimeout(saveTimer);get('cloud-drafts-message').textContent='正在读取草稿……';
    try{
      const draft=await loadCloudDraft(id);if(!owner||generation!==openGeneration)return;
      // Do not replace text typed while the read request was in flight.
      // 读取期间若又开始输入，先保留编辑器中的新内容。
      if(JSON.stringify(session.document)!==previous&&!bridge.canReplace())return;
      session.load(draft,draft);bridge.apply(draft);controls();
      notify(draft.archived?'这是归档草稿，可以导出；恢复后可以继续编辑。':`已载入私密草稿 · ${time(draft.updated_at)}`);
    }catch(error){notify(errorMessage(error),true);}finally{get('cloud-drafts-message').textContent='';}
  }
  async function refreshList(append=false){
    if(!owner)return;const generation=++listGeneration;const requestedOffset=append?offset:0;
    more.disabled=true;
    try{
      const rows=await listCloudDrafts(archived.checked,requestedOffset);
      if(!owner||generation!==listGeneration)return;
      if(!append)list.replaceChildren();offset=requestedOffset+rows.length;
      for(const draft of rows){
        const li=document.createElement('li'),open=document.createElement('button'),title=document.createElement('strong'),meta=document.createElement('span'),action=document.createElement('button');
        open.className='cloud-draft-open';open.type='button';title.textContent=draft.title||'未命名草稿';meta.textContent=`${draft.category} · ${time(draft.updated_at)}`;open.append(title,meta);
        open.addEventListener('click',()=>void openDraft(draft.id));
        action.className='writing-text-button';action.type='button';action.textContent=draft.archived?'恢复':'归档';action.setAttribute('aria-label',`${action.textContent}「${draft.title||'未命名草稿'}」`);
        action.addEventListener('click',async()=>{
          if(session.saving||managing){notify('正在处理草稿，请稍等。');return;}
          try{
            action.disabled=true;
            if(session.current?.id===draft.id && session.dirty){await persist(true);if(session.dirty)return;}
            managing=true;clearTimeout(saveTimer);controls();
            const current=session.current;
            const version=current && current.id===draft.id?current.version:draft.version;
            await archiveCloudDraft(draft.id,version,!draft.archived);
            if(session.current && session.current.id===draft.id){
              // Keep any text typed while archiving; never clear it after an async reply.
              // 归档请求期间继续输入的文字仍留在编辑器中，不在响应后清空。
              session.current={...session.current,archived:!draft.archived,version:version+1};
              if(draft.archived)await openDraft(draft.id);
            }
            controls();notify(draft.archived?'草稿已恢复。':session.current?.id===draft.id&&session.dirty?'草稿已归档；操作期间的新修改仍在编辑器中，尚未保存，请先导出。':'草稿已归档，可以在归档列表中恢复。');await refreshList();
          }catch(error){notify(errorMessage(error),true);}finally{managing=false;action.disabled=false;controls();if(session.dirty&&!session.current?.archived)changed();}
        });
        li.append(open,action);list.append(li);
      }
      get('cloud-drafts-message').textContent=list.children.length?'':'这里还没有草稿。导入或写一点内容，然后保存。';
      more.hidden=rows.length<50;
    }catch(error){get('cloud-drafts-message').textContent=`列表读取失败：${errorMessage(error)}`;more.hidden=true;}finally{more.disabled=false;}
  }
  async function refreshAccount(){
    const generation=++accountGeneration;
    try{
      const account=await authorAccount();if(generation!==accountGeneration)return;
      owner=account.owner;login.hidden=Boolean(account.user);logout.hidden=!account.user;
      get('account-details').hidden=!account.user;get('account-user-id').textContent=account.user?.id||'';
      if(owner){status.textContent='已登录为作者。草稿只有你能读取，保存后可在其他设备继续编辑。';controls();await refreshList();if(session.dirty)changed();}
      else{clearTimeout(saveTimer);status.textContent=account.user?'已登录，当前账号尚未开通作者权限。可以继续本次试写，无法访问云端草稿。':'登录后可以保存私密草稿。未登录时，内容只保留在本次页面中。';list.replaceChildren();controls();}
    }catch(error){if(generation!==accountGeneration)return;owner=false;clearTimeout(saveTimer);status.textContent=`云端连接未完成：${errorMessage(error)} 当前内容请先导出。`;controls();}
  }
  login.addEventListener('click',async()=>{
    if(session.saving){notify('正在保存，请稍等。');return;}
    if(session.dirty&&!window.confirm('登录会跳转页面，当前试写不会自动带过去。请确认已经导出备份，再继续。'))return;
    try{login.disabled=true;await signIn();}catch(error){notify(errorMessage(error),true);login.disabled=false;}
  });
  logout.addEventListener('click',async()=>{
    if(!bridge.canReplace())return;clearTimeout(saveTimer);
    try{logout.disabled=true;const {error}=await backend().auth.signOut({scope:'local'});if(error)throw error;
      owner=false;session.load(null,bridge.empty());bridge.apply(session.document);controls();notify('已退出登录，当前编辑器已清空。');await refreshAccount();
    }catch(error){notify(errorMessage(error),true);}finally{logout.disabled=false;}
  });
  save.addEventListener('click',()=>void persist(true));
  reload.addEventListener('click',()=>{if(session.current)void openDraft(session.current.id);});
  get('cloud-refresh').addEventListener('click',()=>void refreshList());archived.addEventListener('change',()=>void refreshList());more.addEventListener('click',()=>void refreshList(true));
  autosave.addEventListener('change',()=>{clearTimeout(saveTimer);if(autosave.checked&&session.dirty)changed();});
  history.addEventListener('click',async()=>{
    if(!session.current)return;const draftId=session.current.id;const dialog=get<HTMLDialogElement>('history-dialog'),rows=get('history-list');rows.textContent='正在读取历史版本……';dialog.showModal();
    try{
      const versions=await draftHistory(draftId);rows.replaceChildren();
      if(!owner||session.current?.id!==draftId){dialog.close();return;}
      if(!versions.length)rows.textContent='第一次修改保存后，这里会出现历史版本。';
      for(const revision of versions){
        const row=document.createElement('div'),label=document.createElement('span'),restore=document.createElement('button'),download=document.createElement('button');row.className='history-row';label.textContent=`版本 ${revision.version} · ${time(revision.created_at)}`;
        restore.className=download.className='writing-button';restore.textContent='载入编辑器';download.textContent='导出';
        restore.disabled=Boolean(session.current?.archived);
        restore.addEventListener('click',()=>{if(!bridge.canReplace())return;try{validateDraft(revision.snapshot);session.edit(revision.snapshot);bridge.apply(revision.snapshot);dialog.close();notify('已载入历史内容，后续保存会生成新的版本。');changed();}catch(error){notify(errorMessage(error),true);}});
        download.addEventListener('click',()=>{try{bridge.download(revision.snapshot);}catch(error){notify(errorMessage(error),true);}});row.append(label,restore,download);rows.append(row);
      }
    }catch(error){rows.textContent=errorMessage(error);}
  });
  window.addEventListener('online',()=>{if(owner&&session.dirty)changed();});
  if(backendConfigured){
    login.disabled=false;status.textContent='正在检查登录状态……';
    backend().auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'){owner=false;clearTimeout(saveTimer);controls();}if(event==='SIGNED_IN'||event==='SIGNED_OUT'||event==='USER_UPDATED')setTimeout(()=>void refreshAccount(),0);});
    void refreshAccount();
  }else{login.disabled=true;status.textContent='私密草稿服务尚未连接。现在仍可导入、排版和导出，刷新或关闭前请导出备份。';controls();}
  return {changed,reset:()=>{openGeneration++;clearTimeout(saveTimer);controls();},isOwner:()=>owner,save:()=>persist(true)};
}
