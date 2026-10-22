import {parseBackup,type BlogBackup} from './publication.ts';
type Writable={write:(data:string)=>Promise<void>;close:()=>Promise<void>;abort:()=>Promise<void>};
type LocalFile={createWritable:()=>Promise<Writable>;getFile:()=>Promise<File>};
export type BackupDirectory={getFileHandle:(name:string,options:{create:boolean})=>Promise<LocalFile>};
export const directorySupported=()=>typeof (window as unknown as {showDirectoryPicker?:unknown}).showDirectoryPicker==='function';
export async function chooseBackupDirectory(){return (window as unknown as {showDirectoryPicker:(options:{mode:string;id:string})=>Promise<BackupDirectory>}).showDirectoryPicker({mode:'readwrite',id:'telrest-private-backups'});}
export function backupName(backup:BlogBackup){return `${backup.snapshot.draft.slug||'draft'}-${backup.snapshot.draft.id.slice(0,8)}-${backup.created_at.replace(/[:.]/g,'-')}.blog-backup.json`;}
export async function writeVerifiedBackup(directory:BackupDirectory,backup:BlogBackup){
  const text=JSON.stringify(backup,null,2);if(text.length>128_000_000)throw new Error('备份文件过大，未清理云端。');
  const file=await directory.getFileHandle(backupName(backup),{create:true});const writer=await file.createWritable();
  try{await writer.write(text);await writer.close();}catch(error){try{await writer.abort();}catch{}throw error;}
  const verified=await parseBackup(await (await file.getFile()).text());
  if(verified.fingerprint!==backup.fingerprint)throw new Error('写入后的备份校验失败，未清理云端。');return verified;
}
export function downloadBackup(backup:BlogBackup){
  const text=JSON.stringify(backup,null,2);if(text.length>128_000_000)throw new Error('备份文件过大，未清理云端。');
  const url=URL.createObjectURL(new Blob([text],{type:'application/json;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=backupName(backup);document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
