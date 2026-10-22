import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('private draft permissions and versioning in PostgreSQL',async t=>{
  const db=new PGlite();
  const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',member='33333333-3333-4333-8333-333333333333',id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant usage on schema public to anon,authenticated;`);
  await db.exec(await readFile(new URL('../supabase/migrations/202610220001_private_drafts.sql',import.meta.url),'utf8'));
  await db.query('insert into auth.users(id) values($1),($2),($3)',[owner,other,member]);
  await db.query('insert into public.blog_owners(user_id) values($1),($2)',[owner,other]);
  const doc={title:'私密草稿',summary:'摘要',category:'学习笔记',tags:['C'],slug:'private-draft',markdown:'不公开的正文'};
  const as=async<T>(role:string,user:string,run:()=>Promise<T>)=>{await db.exec(`set role ${role}`);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);try{return await run();}finally{await db.exec('reset role');}};
  const save=(version:number,document:unknown=doc,manual=true)=>db.query<any>('select * from public.save_private_draft($1,$2,$3::jsonb,$4)',[id,version,JSON.stringify(document),manual]);
  try{
    await t.test('anonymous requests cannot read or save drafts',async()=>as('anon','',async()=>{
      await assert.rejects(()=>db.query('select * from public.drafts'),/permission denied/);
      await assert.rejects(()=>save(0),/permission denied/);
      assert.equal((await db.query<any>('select public.is_blog_owner() as allowed')).rows[0].allowed,false);
    }));
    await t.test('ordinary members cannot self-promote or create drafts',async()=>as('authenticated',member,async()=>{
      await assert.rejects(()=>db.query('insert into public.blog_owners(user_id) values($1)',[member]),/permission denied/);
      await assert.rejects(()=>save(0),/仅作者/);
      assert.equal((await db.query('select * from public.drafts')).rows.length,0);
    }));
    await t.test('author creation ignores forged ownership/version/timestamp fields',async()=>as('authenticated',owner,async()=>{
      const row=(await save(0,{...doc,owner_id:other,version:999,created_at:'2000-01-01'})).rows[0];
      assert.equal(row.owner_id,owner);assert.equal(row.version,1);assert.equal(row.markdown,doc.markdown);
      assert.notEqual(String(row.created_at).slice(0,4),'2000');
      await assert.rejects(()=>db.query("update public.drafts set version=999 where id=$1",[id]),/permission denied/);
    }));
    await t.test('even a second author cannot read or overwrite another author’s draft',async()=>as('authenticated',other,async()=>{
      assert.equal((await db.query('select * from public.drafts where id=$1',[id])).rows.length,0);
      await assert.rejects(()=>save(1,{...doc,markdown:'overwrite'}),/不可访问|已更新/);
      await assert.rejects(()=>save(0),/已更新/);
    }));
    await t.test('ordinary member sees no drafts or history',async()=>as('authenticated',member,async()=>{
      assert.equal((await db.query('select * from public.drafts')).rows.length,0);
      assert.equal((await db.query('select * from public.draft_revisions')).rows.length,0);
    }));
    await t.test('successful update increments version and retains the previous snapshot',async()=>as('authenticated',owner,async()=>{
      const updated=(await save(1,{...doc,markdown:'新的私密内容'})).rows[0];assert.equal(updated.version,2);
      const history=(await db.query<any>('select * from public.draft_revisions where draft_id=$1',[id])).rows;
      assert.equal(history.length,1);assert.equal(history[0].snapshot.markdown,doc.markdown);
      await assert.rejects(()=>save(1,{...doc,markdown:'stale overwrite'}),/另一处更新/);
      assert.equal((await db.query<any>('select markdown from public.drafts where id=$1',[id])).rows[0].markdown,'新的私密内容');
    }));
    await t.test('unchanged saves do not increment version',async()=>as('authenticated',owner,async()=>{
      assert.equal((await save(2,{...doc,markdown:'新的私密内容'})).rows[0].version,2);
    }));
    await t.test('archive and restore require the current version',async()=>as('authenticated',owner,async()=>{
      await db.query('select public.archive_private_draft($1,2,true)',[id]);
      await assert.rejects(()=>save(3),/先从归档/);
      await assert.rejects(()=>db.query('select public.archive_private_draft($1,2,false)',[id]),/已更新/);
      await db.query('select public.archive_private_draft($1,3,false)',[id]);
      assert.equal((await db.query<any>('select version,archived from public.drafts where id=$1',[id])).rows[0].version,4);
    }));
    await t.test('database rejects malformed documents and excessive tags',async()=>as('authenticated',owner,async()=>{
      await assert.rejects(()=>save(4,{...doc,title:null}),/必须为文字/);
      await assert.rejects(()=>save(4,{...doc,tags:[1]}),/标签/);
      await assert.rejects(()=>save(4,{...doc,tags:['x'.repeat(41)]}),/标签/);
      await assert.rejects(()=>save(4,{...doc,title:'x'.repeat(181)}),/check constraint/);
    }));
    await t.test('history is capped at 30 snapshots and remains private',async()=>{
      await as('authenticated',owner,async()=>{for(let i=0;i<34;i++)await save(4+i,{...doc,markdown:`修订 ${i}`});assert.equal((await db.query('select * from public.draft_revisions')).rows.length,30);});
      await as('authenticated',other,async()=>assert.equal((await db.query('select * from public.draft_revisions')).rows.length,0));
    });
    await t.test('revoked author permissions immediately hide existing drafts',async()=>{
      await db.query('delete from public.blog_owners where user_id=$1',[owner]);
      await as('authenticated',owner,async()=>{assert.equal((await db.query('select * from public.drafts')).rows.length,0);await assert.rejects(()=>save(38),/仅作者/);});
    });
  }finally{await db.close();}
});
