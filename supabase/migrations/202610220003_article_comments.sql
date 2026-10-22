begin;
-- Public comments are separate from private drafts. / 公开评论与私密草稿分表保存。
create table public.article_threads(
  article_id uuid primary key,slug text not null unique check(slug~'^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug)<=100)
);
alter table public.article_threads enable row level security;
revoke all on public.article_threads from anon,authenticated;
grant select on public.article_threads to anon,authenticated;
create policy read_article_threads on public.article_threads for select to anon,authenticated using(true);
create function public.open_article_comments(p_article_id uuid,p_slug text) returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.is_blog_owner() then raise exception '仅作者可以开启文章评论' using errcode='42501';end if;
  insert into public.article_threads(article_id,slug) values(p_article_id,p_slug) on conflict(article_id) do update set slug=excluded.slug;
end;$$;
revoke all on function public.open_article_comments(uuid,text) from public;
grant execute on function public.open_article_comments(uuid,text) to authenticated;
create table public.blog_comments(
  id uuid primary key default gen_random_uuid(),article_id uuid not null references public.article_threads(article_id),
  user_id uuid not null references auth.users(id),github_login text not null check(github_login~'^[a-zA-Z0-9-]{1,39}$'),
  body text not null check(char_length(btrim(body)) between 1 and 3000),created_at timestamptz not null default clock_timestamp(),removed boolean not null default false
);
create index blog_comments_article_created on public.blog_comments(article_id,created_at desc,id desc) where not removed;
create index blog_comments_user_created on public.blog_comments(user_id,created_at desc);
alter table public.blog_comments enable row level security;
revoke all on public.blog_comments from anon,authenticated;
-- Never publish user UUIDs, email or identity data. / 不公开账号 UUID、邮箱和身份数据。
grant select(id,article_id,github_login,body,created_at) on public.blog_comments to anon,authenticated;
create policy read_visible_comments on public.blog_comments for select to anon,authenticated using(not removed);
create function public.post_blog_comment(p_article_id uuid,p_body text) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();handle text;saved public.blog_comments;
begin
  if uid is null then raise exception '请先用 GitHub 登录';end if;
  select coalesce(identity_data->>'user_name',identity_data->>'preferred_username') into handle from auth.identities where user_id=uid and provider='github' limit 1;
  if handle is null or handle!~'^[a-zA-Z0-9-]{1,39}$' then raise exception '请先用 GitHub 登录';end if;
  if p_body is null or char_length(btrim(p_body)) not between 1 and 3000 then raise exception '留言需要 1 到 3000 字';end if;
  if not exists(select 1 from public.article_threads where article_id=p_article_id) then raise exception '这篇文章的评论区尚未开启，请稍后重试';end if;
  -- Serialize submissions by user to prevent concurrent rate-limit bypass.
  -- 按账号串行检查，防止并发请求绕过留言间隔。
  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
  if exists(select 1 from public.blog_comments where user_id=uid and created_at>clock_timestamp()-interval '30 seconds') then raise exception '留言太快啦，请等 30 秒再试';end if;
  if (select count(*) from public.blog_comments where user_id=uid and created_at>clock_timestamp()-interval '1 day')>=100 then raise exception '今天留言较多，请明天再来';end if;
  insert into public.blog_comments(article_id,user_id,github_login,body) values(p_article_id,uid,handle,btrim(p_body)) returning * into saved;
  return jsonb_build_object('id',saved.id,'article_id',saved.article_id,'github_login',saved.github_login,'body',saved.body,'created_at',saved.created_at);
end;$$;
revoke all on function public.post_blog_comment(uuid,text) from public;
grant execute on function public.post_blog_comment(uuid,text) to authenticated;
commit;
