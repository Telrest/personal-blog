begin;
-- One statement returns a consistent draft/history snapshot under RLS.
-- 在一条查询内读取草稿和历史，备份不会混入两个时刻的数据。
create function public.private_draft_snapshot(p_id uuid,p_expected_version integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
  if not public.is_blog_owner() then raise exception '仅作者可以备份草稿' using errcode='42501';end if;
  select jsonb_build_object('draft',to_jsonb(d),'revisions',coalesce((select jsonb_agg(to_jsonb(r) order by r.version desc) from public.draft_revisions r where r.draft_id=d.id),'[]'::jsonb)) into result
    from public.drafts d where d.id=p_id and d.version=p_expected_version;
  if result is null then raise exception '草稿已更新或不可访问，请重新载入' using errcode='40001';end if;
  return result;
end; $$;
revoke all on function public.private_draft_snapshot(uuid,integer) from public;
grant execute on function public.private_draft_snapshot(uuid,integer) to authenticated;

-- Only the server can call this, after checking deployment and backup proofs.
-- 仅服务端在确认上线和备份校验后调用，浏览器不能直接删除草稿。
create function public.delete_private_draft_after_publish(p_owner_id uuid,p_id uuid,p_expected_version integer)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.blog_owners where user_id=p_owner_id) then raise exception '作者权限已失效' using errcode='42501';end if;
  delete from public.drafts where id=p_id and owner_id=p_owner_id and version=p_expected_version;
  if not found then raise exception '草稿已更新或不可访问，未删除' using errcode='40001';end if;
end; $$;
revoke all on function public.delete_private_draft_after_publish(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.delete_private_draft_after_publish(uuid,uuid,integer) to service_role;
commit;
