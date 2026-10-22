import test from 'node:test';import assert from 'node:assert/strict';
import {DraftSession} from '../src/lib/draft-session.ts';
import {parseBackendConfig} from '../src/lib/backend-config.ts';
const empty={title:'',summary:'',category:'学习笔记',tags:[] as string[],slug:'',markdown:''};
const row=(document=empty,version=1)=>({...document,id:'a',owner_id:'owner',version,created_at:'2026-10-22T00:00:00Z',updated_at:'2026-10-22T00:00:00Z'});
test('private/legacy keys are rejected before bundling; incomplete config fails closed',()=>{
  assert.equal(parseBackendConfig('',''),null);assert.throws(()=>parseBackendConfig('https://example.supabase.co','sb_secret_example'),/publishable/);
  assert.throws(()=>parseBackendConfig('https://example.supabase.co','eyJlegacy'),/publishable/);assert.throws(()=>parseBackendConfig('https://example.supabase.co',''),/同时/);
  assert.throws(()=>parseBackendConfig('https://evil.example/path','sb_publishable_test'),/根网址/);
  assert.deepEqual(parseBackendConfig('https://example.supabase.co/','sb_publishable_test'),{url:'https://example.supabase.co',key:'sb_publishable_test'});
});
test('exporting provides a backup without pretending the cloud was saved',()=>{const s=new DraftSession(empty);s.edit({...empty,title:'新文章'});assert.equal(s.unprotected,true);s.markExported();assert.equal(s.unprotected,false);assert.equal(s.dirty,true);s.edit({...empty,title:'再次修改'});assert.equal(s.unprotected,true);});
test('typing during a save stays dirty and is not overwritten by the older response',async()=>{
  const s=new DraftSession(empty);s.edit({...empty,markdown:'第一版'});let finish!:(value:any)=>void;
  const saving=s.save(()=>new Promise(resolve=>{finish=resolve;}));s.edit({...empty,markdown:'正在输入第二版'});finish(row({...empty,markdown:'第一版'}));await saving;
  assert.equal(s.current?.version,1);assert.equal(s.document.markdown,'正在输入第二版');assert.equal(s.dirty,true);
  await s.save(async document=>row(document,2));assert.equal(s.dirty,false);assert.equal(s.current?.markdown,'正在输入第二版');
});
test('a failed network request never marks writing as saved',async()=>{const s=new DraftSession(empty);s.edit({...empty,title:'未保存'});await assert.rejects(()=>s.save(async()=>{throw new Error('offline');}),/offline/);assert.equal(s.dirty,true);assert.equal(s.saving,false);assert.equal(s.current,null);});
test('conflicting revisions block retries until a fresh draft is loaded',async()=>{const s=new DraftSession(empty);s.edit({...empty,title:'冲突'});const error=new Error('stale');error.name='DraftConflictError';await assert.rejects(()=>s.save(async()=>{throw error;}));assert.equal(s.conflict,true);await assert.rejects(()=>s.save(async()=>row()),/版本冲突/);s.load(row(),empty);assert.equal(s.conflict,false);});
test('a late response cannot replace a different draft loaded meanwhile',async()=>{const s=new DraftSession(empty);s.edit({...empty,title:'旧稿'});let finish!:(value:any)=>void;const saving=s.save(()=>new Promise(resolve=>{finish=resolve;}));s.load({...row(),id:'new'},empty);finish(row({...empty,title:'旧稿'}));await saving;assert.equal(s.current?.id,'new');assert.equal(s.dirty,false);});
