create or replace function public.rpc_ielts_content_upsert_speaking_task(
  p_id bigint default null,
  p_slug text default null,
  p_part int default null,
  p_prompt text default null,
  p_follow_ups jsonb default null,
  p_is_active boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_id bigint;
  v_slug text;
begin
  select role into v_role from public.users where id = v_uid;
  if v_uid is null or coalesce(v_role, '') not in ('superadmin','admin','school_admin') then raise exception 'forbidden'; end if;

  if p_part is null or p_part < 1 then raise exception 'part_required'; end if;
  if nullif(trim(coalesce(p_prompt,'')), '') is null then raise exception 'prompt_required'; end if;
  if lower(p_prompt) like '%tbd%' or lower(p_prompt) like '%placeholder%' then raise exception 'prompt_placeholder_not_allowed'; end if;
  if coalesce(p_is_active,false) and nullif(trim(coalesce(p_prompt,'')), '') is null then raise exception 'active_requires_prompt'; end if;

  v_slug := nullif(trim(coalesce(p_slug,'')), '');
  if v_slug is null then
    v_slug := regexp_replace(lower(trim(p_prompt)), '[^a-z0-9]+', '-', 'g');
    v_slug := trim(both '-' from v_slug);
    if v_slug = '' then v_slug := 'speaking-task'; end if;
  end if;

  if p_id is null then
    insert into public.ielts_speaking_tasks (slug, part, prompt, follow_ups, is_active, created_by)
    values (v_slug, p_part, trim(p_prompt), p_follow_ups, coalesce(p_is_active,false), v_uid)
    returning id into v_id;
  else
    update public.ielts_speaking_tasks
    set slug = v_slug,
        part = p_part,
        prompt = trim(p_prompt),
        follow_ups = p_follow_ups,
        is_active = coalesce(p_is_active,false)
    where id = p_id
    returning id into v_id;
    if v_id is null then raise exception 'speaking_task_not_found'; end if;
  end if;

  return jsonb_build_object('id', v_id, 'slug', v_slug);
end
$$;

grant execute on function public.rpc_ielts_content_upsert_speaking_task(bigint,text,int,text,jsonb,boolean) to authenticated;
