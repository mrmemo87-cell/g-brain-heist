create or replace function public.rpc_ielts_content_list()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_school_id uuid;
begin
  select u.role, u.school_id into v_role, v_school_id from public.users u where u.id = v_uid;
  if v_uid is null or coalesce(v_role, '') not in ('superadmin','admin','school_admin') then
    raise exception 'forbidden';
  end if;

  return (
    select coalesce(jsonb_agg(x), '[]'::jsonb)
    from (
      select id::text, title, 'reading'::text as skill, is_active, level as difficulty, estimated_band as band_min, estimated_band as band_max, created_at,
        (is_active and exists (select 1 from public.ielts_reading_questions q where q.reading_set_id = rs.id)) as ready_to_assign,
        (case when not is_active then array['Inactive']::text[] when not exists (select 1 from public.ielts_reading_questions q where q.reading_set_id = rs.id) then array['Missing questions']::text[] else array[]::text[] end) as warnings
      from public.ielts_reading_sets rs
      union all
      select id::text, title, 'listening'::text, is_active, level, estimated_band, estimated_band, created_at,
        (is_active and coalesce(audio_url,'')<>'' and exists (select 1 from public.ielts_listening_questions q where q.listening_set_id = ls.id)) as ready_to_assign,
        (array_remove(array[case when not is_active then 'Inactive' end, case when coalesce(audio_url,'')='' then 'Missing audio' end, case when not exists (select 1 from public.ielts_listening_questions q where q.listening_set_id = ls.id) then 'Missing questions' end], null)) as warnings
      from public.ielts_listening_sets ls
      union all
      select id::text, title, 'writing'::text, is_active, task_type, null::numeric, null::numeric, created_at, is_active, (case when not is_active then array['Inactive']::text[] else array[]::text[] end)
      from public.ielts_writing_tasks
      union all
      select id::text, coalesce(title, 'Part '||part::text), 'speaking'::text, is_active, 'part '||part::text, null::numeric, null::numeric, created_at, is_active, (case when not is_active then array['Inactive']::text[] else array[]::text[] end)
      from public.ielts_speaking_tasks
    ) x
  );
end
$$;

grant execute on function public.rpc_ielts_content_list() to authenticated;
