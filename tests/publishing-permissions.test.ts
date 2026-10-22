import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
test('snapshot privacy and server-only version-guarded cleanup in PostgreSQL',async t=>{
  const db=new PGlite();const owner='11111111-1111-4111-8111-111111111111',member='22222222-2222-4222-8222-222222222222',id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to anon,authenticated,service_role;`);
  for(const file of ['202610220001_private_drafts.sql','202610220002_publishing_backup.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
  await db.query('insert into auth.users(id) values($1),($2)',[owner,member]);await db.query('insert into public.blog_owners(user_id) values($1)',[owner]);
  const as=async(role:string,user:string,fn:()=>Promise<void>)=>{await db.exec('set role '+role);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);try{await fn();}finally{await db.exec('reset role');}};
  try{
    const document={title:'正文',summary:'',category:'学习笔记',tags:[],slug:'test',markdown:'正文'};
    await as('authenticated',owner,async()=>{await db.query('select public.save_private_draft($1,0,$2::jsonb,true)',[id,JSON.stringify(document)]);await db.query('select public.save_private_draft($1,1,$2::jsonb,true)',[id,JSON.stringify({...document,markdown:'更新正文'})]);});
    await t.test('ordinary readers cannot obtain a backup',async()=>as('authenticated',member,async()=>{await assert.rejects(()=>db.query('select public.private_draft_snapshot($1,2)',[id]),/仅作者/);}));
    await t.test('author receives draft and history in one snapshot but cannot call delete directly',async()=>as('authenticated',owner,async()=>{const result=await db.query<any>('select public.private_draft_snapshot($1,2) as backup',[id]);assert.equal(result.rows[0].backup.draft.markdown,'更新正文');assert.equal(result.rows[0].backup.revisions.length,1);await assert.rejects(()=>db.query('select public.delete_private_draft_after_publish($1,$2,2)',[owner,id]),/permission denied/);}));
    await t.test('stale backup requests fail instead of mixing revisions',async()=>as('authenticated',owner,async()=>{await assert.rejects(()=>db.query('select public.private_draft_snapshot($1,1)',[id]),/已更新/);}));
    await t.test('server cleanup rejects changed draft versions and wrong owners',async()=>as('service_role','',async()=>{await assert.rejects(()=>db.query('select public.delete_private_draft_after_publish($1,$2,1)',[owner,id]),/未删除/);await assert.rejects(()=>db.query('select public.delete_private_draft_after_publish($1,$2,2)',[member,id]),/权限/);}));
    await t.test('server cleanup removes only the matching draft and its history',async()=>as('service_role','',async()=>{await db.query('select public.delete_private_draft_after_publish($1,$2,2)',[owner,id]);}));
    assert.equal((await db.query('select * from public.drafts')).rows.length,0);assert.equal((await db.query('select * from public.draft_revisions')).rows.length,0);
  }finally{await db.close();}
});
