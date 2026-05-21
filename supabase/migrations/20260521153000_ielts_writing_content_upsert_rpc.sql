create or replace function public.rpc_ielts_content_upsert_writing_task(
  p_id bigint default null,
  p_slug text default null,
  p_task_type text default null,
  p_title text default null,
  p_prompt text default null,
  p_bands_target text default null,
  p_sample_answer text default null,
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

  if nullif(trim(coalesce(p_title,'')), '') is null then raise exception 'title_required'; end if;
  if nullif(trim(coalesce(p_prompt,'')), '') is null then raise exception 'prompt_required'; end if;
  if lower(p_prompt) like '%tbd%' or lower(p_prompt) like '%placeholder%' then raise exception 'prompt_placeholder_not_allowed'; end if;
  if coalesce(p_is_active,false) and nullif(trim(coalesce(p_prompt,'')), '') is null then raise exception 'active_requires_prompt'; end if;

  v_slug := nullif(trim(coalesce(p_slug,'')), '');
  if v_slug is null then
    v_slug := regexp_replace(lower(trim(coalesce(p_title,''))), '[^a-z0-9]+', '-', 'g');
    v_slug := trim(both '-' from v_slug);
    if v_slug = '' then v_slug := 'writing-task'; end if;
  end if;

  if p_id is null then
    insert into public.ielts_writing_tasks (slug, task_type, title, prompt, bands_target, sample_answer, is_active, created_by)
    values (v_slug, nullif(trim(coalesce(p_task_type,'')), ''), trim(p_title), trim(p_prompt), nullif(trim(coalesce(p_bands_target,'')), ''), p_sample_answer, coalesce(p_is_active,false), v_uid)
    returning id into v_id;
  else
    update public.ielts_writing_tasks
    set slug = v_slug,
        task_type = nullif(trim(coalesce(p_task_type,'')), ''),
        title = trim(p_title),
        prompt = trim(p_prompt),
        bands_target = nullif(trim(coalesce(p_bands_target,'')), ''),
        sample_answer = p_sample_answer,
        is_active = coalesce(p_is_active,false),
        updated_at = now()
    where id = p_id
    returning id into v_id;
    if v_id is null then raise exception 'writing_task_not_found'; end if;
  end if;

  return jsonb_build_object('id', v_id, 'slug', v_slug);
end
$$;

grant execute on function public.rpc_ielts_content_upsert_writing_task(bigint,text,text,text,text,text,text,boolean) to authenticated;
