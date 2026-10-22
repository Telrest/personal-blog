import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { parseBackendConfig } from './backend-config';
import type { Draft } from './article';
import type { DraftDocument } from './draft-session';
const config = parseBackendConfig(import.meta.env.PUBLIC_SUPABASE_URL, import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY);
export const backendConfigured = Boolean(config);
let client: SupabaseClient | null = null;
export function backend() {
  if (!config) throw new Error('云端草稿尚未连接，当前内容请先导出。');
  client ??= createClient(config.url, config.key, {
    auth:{flowType:'pkce',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true},
    global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.any([...(init?.signal ? [init.signal]:[]),AbortSignal.timeout(15000)])})},
  });
  return client;
}
export async function signIn() {
  const redirectTo = new URL(`${import.meta.env.BASE_URL}admin/`,location.origin).href;
  const {error} = await backend().auth.signInWithOAuth({provider:'github',options:{redirectTo}});
  if(error)throw error;
}
export async function authorAccount() {
  const {data:{user},error} = await backend().auth.getUser();
  if(error && error.name !== 'AuthSessionMissingError')throw error;
  if(!user)return {user:null,owner:false};
  const {data:owner,error:permissionError}=await backend().rpc('is_blog_owner');
  if(permissionError)throw permissionError;
  return {user,owner:owner===true};
}
export class DraftConflictError extends Error {
  constructor(){super('云端草稿已在另一处更新。请先导出当前内容，再重新载入云端版本。');this.name='DraftConflictError';}
}
export async function saveCloudDraft(document:DraftDocument,current:Draft|null,manual:boolean):Promise<Draft> {
  const id=current?.id||crypto.randomUUID();
  const {data,error}=await backend().rpc('save_private_draft',{
    p_id:id,p_expected_version:current?.version||0,p_document:document,p_record_revision:manual,
  });
  if(error){if(error.code==='40001')throw new DraftConflictError();throw error;}
  if(!data || typeof data.version!=='number' || data.id!==id)throw new Error('保存结果无法确认，请保留当前内容并导出备份。');
  return data as Draft;
}
export async function listCloudDrafts(archived:boolean,offset=0) {
  const {data,error}=await backend().from('drafts').select('id,title,category,version,updated_at,archived').eq('archived',archived).order('updated_at',{ascending:false}).order('id').range(offset,offset+49);
  if(error)throw error;return data||[];
}
export async function loadCloudDraft(id:string):Promise<Draft> {
  const {data,error}=await backend().from('drafts').select('*').eq('id',id).single();
  if(error)throw error;return data as Draft;
}
export async function archiveCloudDraft(id:string,version:number,archived:boolean) {
  const {error}=await backend().rpc('archive_private_draft',{p_id:id,p_expected_version:version,p_archived:archived});
  if(error){if(error.code==='40001')throw new DraftConflictError();throw error;}
}
export async function draftHistory(id:string) {
  const {data,error}=await backend().from('draft_revisions').select('id,version,created_at,snapshot').eq('draft_id',id).order('created_at',{ascending:false}).limit(30);
  if(error)throw error;return data||[];
}
export function errorMessage(error:unknown) {
  return error instanceof Error ? error.message : error && typeof error==='object' && 'message' in error ? String(error.message) : '操作未完成，请保留当前内容并重试。';
}
