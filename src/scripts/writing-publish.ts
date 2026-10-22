import {backend,errorMessage} from '../lib/cloud-drafts';
import {documentOf,validateSnapshot,makeBackup,parseBackup,fingerprint,type BlogBackup,type PublishedArticle,type DraftSnapshot} from '../lib/publication';
import {chooseBackupDirectory,directorySupported,writeVerifiedBackup,downloadBackup,type BackupDirectory} from '../lib/local-backup';
import type {DraftSession,DraftDocument} from '../lib/draft-session';
type Bridge={session:DraftSession;cloud:{save:()=>Promise<void>;lock:(value:boolean)=>void;isBusy:()=>boolean;isOwner:()=>boolean;reset:()=>void;refresh:()=>Promise<void>};apply:(document:DraftDocument)=>void;notify:(message:string,error?:boolean)=>void;canReplace:()=>boolean};
const get=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
export function connectPublishing(bridge:Bridge){
  const {session,cloud,notify}=bridge;
  let directory:BackupDirectory|undefined,available=false,running=false,cancelled=false,imported:BlogBackup|undefined;
  let pending:{backup:BlogBackup;clean:boolean}|undefined;
  const status=get('publication-status'),publish=get<HTMLButtonElement>('publish-article'),backupButton=get<HTMLButtonElement>('backup-article'),verifyInput=get<HTMLInputElement>('verify-backup-file'),restoreInput=get<HTMLInputElement>('restore-backup-file');
  const update=()=>{get('publication-tools').hidden=!cloud.isOwner();publish.disabled=!available||running;backupButton.disabled=running;get<HTMLInputElement>('cleanup-after-publish').disabled=running;get<HTMLButtonElement>('choose-backup-folder').disabled=running;get<HTMLButtonElement>('restore-backup').disabled=running;get<HTMLButtonElement>('local-history').disabled=!imported||running;get<HTMLButtonElement>('verify-downloaded-backup').hidden=!pending;get<HTMLButtonElement>('verify-downloaded-backup').disabled=running;get<HTMLButtonElement>('cancel-publication').hidden=!running;};
  async function invoke(body:Record<string,unknown>){
    const {data,error}=await backend().functions.invoke('blog-publish',{body});
    if(error){let explanation='发布服务未连接，请完成服务端配置；云端草稿不会被删除。';if('context' in error&&error.context instanceof Response){try{const result=await error.context.json();if(typeof result.error==='string')explanation=result.error;}catch{}}throw new Error(explanation);}
    if(data?.error)throw new Error(data.error);return data;
  }
  async function capability(){if(!cloud.isOwner()){available=false;update();return;}try{const result=await invoke({action:'capabilities'});available=result.configured===true;status.textContent=result.message;}catch(error){available=false;status.textContent=errorMessage(error);}update();}
  async function saved(){
    if(cloud.isBusy()||session.saving)throw new Error('正在处理草稿，请稍等。');
    if(session.current?.archived)throw new Error('请先恢复归档草稿。');
    await cloud.save();if(session.dirty||!session.current)throw new Error('当前修改尚未保存，未开始发布或清理。');return session.current;
  }
  async function snapshot(){const current=session.current!;const {data,error}=await backend().rpc('private_draft_snapshot',{p_id:current.id,p_expected_version:current.version});if(error)throw new Error(error.code==='40001'?'草稿版本已改变，请重新载入。':'请先执行发布与备份的第二份建库脚本。');return validateSnapshot(data);}
  function localHistory(){if(!imported)return [];const rows=[{id:imported.snapshot.draft.id,version:imported.snapshot.draft.version,created_at:imported.snapshot.draft.updated_at,snapshot:imported.snapshot.draft},...imported.snapshot.revisions,...imported.local_history];return [...new Map(rows.map(r=>[r.id,r])).values()].sort((a,b)=>b.created_at.localeCompare(a.created_at)).slice(0,30);}
  async function cleanup(backup:BlogBackup,clean:boolean){
    if(!clean){status.textContent='文章与本地备份已完成，按本次设置保留云端草稿。';return;}
    const d=backup.snapshot.draft,p=backup.publication!;
    await invoke({action:'cleanup',id:d.id,version:d.version,slug:p.slug,revision:p.revision_id,snapshotFingerprint:await fingerprint(backup.snapshot),backupVerified:true});
    // Only detach the exact cleaned version; never discard newer editor text.
    // 仅断开已经清理的同一版本，操作期间的新文字仍保留。
    if(session.current?.id===d.id&&session.current.version===d.version&&!session.dirty){const document=session.document;session.load(null,document);session.edit(document);session.markExported();get<HTMLInputElement>('cloud-autosave').checked=false;cloud.reset();}
    await cloud.refresh();status.textContent='文章已上线，本地备份已校验，云端草稿及历史已清理。';notify('已完成发布、备份和清理。当前文字仍可查看；继续修改时可重新保存为草稿。');
  }
  async function store(backup:BlogBackup,clean:boolean,publication=false){
    if(directory){await writeVerifiedBackup(directory,backup);pending=undefined;if(publication)await cleanup(backup,clean);else{session.markExported();status.textContent='完整备份已写入所选文件夹，并通过读回校验。';}}
    else{downloadBackup(backup);pending={backup,clean:publication&&clean};status.textContent='备份包已发起下载。请点击“校验下载的备份”，选择刚下载的文件；校验前不会清理云端。';update();}
  }
  get('choose-backup-folder').addEventListener('click',async()=>{try{if(!directorySupported()){status.textContent='当前浏览器使用下载备份方式，下载后可选回文件进行校验。';return;}directory=await chooseBackupDirectory();status.textContent='已选择本次会话的备份文件夹。请使用网站仓库之外的文件夹保存私密备份。';}catch(error){if(!(error instanceof DOMException&&error.name==='AbortError'))notify(errorMessage(error),true);}});
  backupButton.addEventListener('click',async()=>{try{await saved();running=true;cloud.lock(true);update();await store(await makeBackup(await snapshot(),null,localHistory()),false);}catch(error){notify(errorMessage(error),true);}finally{running=false;cloud.lock(false);update();}});
  publish.addEventListener('click',async()=>{
    try{
      documentOf(session.document,true);await saved();running=true;cancelled=false;cloud.lock(true);update();
      const d=session.current!,preview=await invoke({action:'preview',id:d.id,version:d.version});
      const clean=get<HTMLInputElement>('cleanup-after-publish').checked;
      if(!window.confirm(`${preview.existing?'将更新这个地址的已发布文章，并保留原发布时间。':'将把当前定稿公开发布到 GitHub 和博客。'}\n${preview.url}\n\n${clean?'上线并校验本地完整备份后，将删除这份云端草稿和历史版本。':'本次保留云端草稿。'}\n私密草稿历史只进入本地备份，不会发布。继续吗？`))return;
      status.textContent='正在提交定稿……';const result=await invoke({action:'publish',id:d.id,version:d.version,expectedRevision:preview.existing?.revision_id||null});
      const post=result.post as PublishedArticle;let deployed=false;
      for(let attempt=0;attempt<36;attempt++){
        if(cancelled)throw new Error('已停止等待；发布提交可能仍在部署，云端草稿已保留，可稍后再次检查。');
        status.textContent=`正在等待文章上线（${attempt+1}/36）……`;
        const state=await invoke({action:'status',slug:post.slug,revision:post.revision_id});if(state.superseded)throw new Error('文章有更新的发布版本，未清理云端。');if(state.deployed){deployed=true;break;}await new Promise(resolve=>setTimeout(resolve,5000));
      }
      if(!deployed)throw new Error('还未确认部署完成，云端草稿会保留。稍后点击发布可继续检查，不会重复创建文章。');
      const {error:commentsError}=await backend().rpc('open_article_comments',{p_article_id:post.id,p_slug:post.slug});
      if(commentsError)throw new Error('文章已上线，评论区尚未准备完成；云端草稿已保留，请稍后重试。');
      const full=await snapshot();const bundle=await makeBackup(full,post,localHistory());
      await store(bundle,clean,true);if(!pending)status.textContent+=` 文章地址：${result.url}`;
    }catch(error){notify(errorMessage(error),true);status.textContent=errorMessage(error);}finally{running=false;cloud.lock(false);update();}
  });
  get('cancel-publication').addEventListener('click',()=>{cancelled=true;});
  get('verify-downloaded-backup').addEventListener('click',()=>verifyInput.click());
  verifyInput.addEventListener('change',async()=>{
    const file=verifyInput.files?.[0];if(!file||!pending||running)return;
    try{
      if(file.size>128_000_000)throw new Error('备份文件过大。');const loaded=await parseBackup(await file.text());
      if(loaded.fingerprint!==pending.backup.fingerprint)throw new Error('所选文件不是本次备份，云端草稿未清理。');
      running=true;cloud.lock(true);update();const item=pending;
      if(item.backup.publication)await cleanup(item.backup,item.clean);else{session.markExported();status.textContent='下载的完整备份校验成功。';}
      pending=undefined;
    }catch(error){notify(errorMessage(error),true);}finally{verifyInput.value='';running=false;cloud.lock(false);update();}
  });
  get('restore-backup').addEventListener('click',()=>restoreInput.click());
  restoreInput.addEventListener('change',async()=>{
    const file=restoreInput.files?.[0];if(!file)return;try{
      if(file.size>128_000_000)throw new Error('备份文件过大。');const backup=await parseBackup(await file.text());if(!bridge.canReplace())return;
      imported=backup;session.load(null,documentOf(backup.snapshot.draft));session.edit(session.document);bridge.apply(session.document);cloud.reset();update();
      notify('完整备份已校验并载入。尚未写入云端；可以查看本地历史，或点击保存私密草稿继续编辑。');
    }catch(error){notify(errorMessage(error),true);}finally{restoreInput.value='';}
  });
  get('local-history').addEventListener('click',()=>{
    if(!imported)return;const dialog=get<HTMLDialogElement>('local-history-dialog'),list=get('local-history-list');list.replaceChildren();
    for(const row of localHistory()){
      const button=document.createElement('button');button.className='writing-button';button.type='button';button.textContent=`载入版本 ${row.version} · ${new Date(row.created_at).toLocaleString('zh-CN')}`;
      button.addEventListener('click',()=>{if(!bridge.canReplace())return;session.load(null,documentOf(row.snapshot));session.edit(session.document);bridge.apply(session.document);cloud.reset();dialog.close();notify('本地历史版本已载入，尚未保存到云端。');});list.append(button);
    }
    dialog.showModal();
  });
  document.addEventListener('blog-author-change',()=>void capability());update();if(cloud.isOwner())void capability();
  for(const event of ['writing-reset','writing-cloud-open'])document.addEventListener(event,()=>{imported=undefined;update();});
}
