begin;
-- Author access is granted manually in SQL, never through profile metadata.
-- 作者权限只由数据库管理员授予，不能通过注册或修改个人资料取得。
create table public.blog_owners (user_id uuid primary key references auth.users(id) on delete cascade);
alter table public.blog_owners enable row level security;
revoke all on public.blog_owners from anon,authenticated;
create function public.is_blog_owner() returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.blog_owners where user_id=(select auth.uid()));
$$;
revoke all on function public.is_blog_owner() from public;
grant execute on function public.is_blog_owner() to anon,authenticated;

create table public.drafts (
  id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id),
  title text not null default '' check(char_length(title)<=180),
  summary text not null default '' check(char_length(summary)<=600),
  category text not null default '见解与思考' check(char_length(btrim(category)) between 1 and 60),
  tags text[] not null default '{}' check(cardinality(tags)<=20),
  slug text not null default '' check(slug='' or(slug~'^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug)<=100)),
  markdown text not null default '' check(char_length(markdown)<=1000000),
  archived boolean not null default false,version integer not null default 1 check(version>0),
  created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index drafts_owner_updated on public.drafts(owner_id,archived,updated_at desc);
create table public.draft_revisions (
  id uuid primary key default gen_random_uuid(),draft_id uuid not null references public.drafts(id) on delete cascade,
  version integer not null,snapshot jsonb not null,created_at timestamptz not null default now(),unique(draft_id,version)
);
alter table public.drafts enable row level security;
alter table public.draft_revisions enable row level security;
revoke all on public.drafts,public.draft_revisions from anon,authenticated;
grant select on public.drafts,public.draft_revisions to authenticated;
create policy owner_read_drafts on public.drafts for select to authenticated
  using(public.is_blog_owner() and owner_id=(select auth.uid()));
create policy owner_read_revisions on public.draft_revisions for select to authenticated
  using(public.is_blog_owner() and exists(select 1 from public.drafts d where d.id=draft_id and d.owner_id=(select auth.uid())));

create function public.save_private_draft(p_id uuid,p_expected_version integer,p_document jsonb,p_record_revision boolean default false)
returns public.drafts language plpgsql security definer set search_path='' as $$
declare current_draft public.drafts;saved public.drafts;field text;document_tags text[];last_revision timestamptz;
begin
  if not public.is_blog_owner() then raise exception '仅作者可以保存草稿' using errcode='42501';end if;
  if p_id is null or p_expected_version is null or p_expected_version<0 then raise exception '草稿版本无效';end if;
  if jsonb_typeof(p_document) is distinct from 'object' then raise exception '草稿内容格式有误';end if;
  foreach field in array array['title','summary','category','slug','markdown'] loop
    if jsonb_typeof(p_document->field) is distinct from 'string' then raise exception '草稿字段必须为文字：%',field;end if;
  end loop;
  if jsonb_typeof(p_document->'tags') is distinct from 'array' then raise exception '标签必须是文字数组';end if;
  if jsonb_array_length(p_document->'tags')>20 or exists(select 1 from jsonb_array_elements(p_document->'tags') t where jsonb_typeof(t) is distinct from 'string' or char_length(t#>>'{}')>40) then raise exception '标签数量或长度超出限制';end if;
  select array_agg(value) into document_tags from jsonb_array_elements_text(p_document->'tags');
  document_tags:=coalesce(document_tags,'{}');
  select * into current_draft from public.drafts where id=p_id and owner_id=auth.uid() for update;
  if not found then
    if p_expected_version<>0 then raise exception '草稿已更新或不可访问，请重新载入' using errcode='40001';end if;
    insert into public.drafts(id,owner_id,title,summary,category,tags,slug,markdown)
    values(p_id,auth.uid(),p_document->>'title',p_document->>'summary',p_document->>'category',document_tags,p_document->>'slug',p_document->>'markdown') returning * into saved;
    return saved;
  end if;
  if current_draft.version<>p_expected_version then raise exception '草稿已在另一处更新，请重新载入' using errcode='40001';end if;
  if current_draft.archived then raise exception '请先从归档中恢复这篇草稿';end if;
  if current_draft.title=p_document->>'title' and current_draft.summary=p_document->>'summary' and current_draft.category=p_document->>'category' and current_draft.tags=document_tags and current_draft.slug=p_document->>'slug' and current_draft.markdown=p_document->>'markdown' then return current_draft;end if;
  select max(created_at) into last_revision from public.draft_revisions where draft_id=p_id;
  if p_record_revision or last_revision is null or last_revision<now()-interval '5 minutes' then
    insert into public.draft_revisions(draft_id,version,snapshot) values(p_id,current_draft.version,to_jsonb(current_draft)) on conflict(draft_id,version) do nothing;
    delete from public.draft_revisions where draft_id=p_id and id in(select id from public.draft_revisions where draft_id=p_id order by created_at desc,version desc offset 30);
  end if;
  update public.drafts set title=p_document->>'title',summary=p_document->>'summary',category=p_document->>'category',tags=document_tags,slug=p_document->>'slug',markdown=p_document->>'markdown',version=version+1,updated_at=clock_timestamp() where id=p_id returning * into saved;
  return saved;
exception when unique_violation then raise exception '草稿已更新，请重新载入' using errcode='40001';
end; $$;
revoke all on function public.save_private_draft(uuid,integer,jsonb,boolean) from public;
grant execute on function public.save_private_draft(uuid,integer,jsonb,boolean) to authenticated;

create function public.archive_private_draft(p_id uuid,p_expected_version integer,p_archived boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.is_blog_owner() then raise exception '仅作者可以管理草稿' using errcode='42501';end if;
  if p_archived is null then raise exception '归档状态无效';end if;
  update public.drafts set archived=p_archived,version=version+1,updated_at=clock_timestamp()
    where id=p_id and owner_id=auth.uid() and version=p_expected_version;
  if not found then raise exception '草稿已更新或不可访问，请重新载入' using errcode='40001';end if;
end; $$;
revoke all on function public.archive_private_draft(uuid,integer,boolean) from public;
grant execute on function public.archive_private_draft(uuid,integer,boolean) to authenticated;
commit;
