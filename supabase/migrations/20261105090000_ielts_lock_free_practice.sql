-- IELTS: practice outside the course is part of IELTS Prime (owner decision 2026-11-05, Asia/Bishkek).
--
-- A learner without full IELTS access (IELTS Prime, a school IELTS seat, staff of an IELTS school, or the owner) opens
-- practice tasks only through the course (free Unit 1 and V1) or when a teacher assigned the task. Opening any other
-- task by direct link is refused with 'prime_required', so the app sends them to the Prime page.
-- Learners with full access keep the previous rules (school Extra Practice setting, Prime-tier tasks).

create or replace function private.ielts_can_access_practice_content(
  p_content_type text, p_content_id text, p_is_active boolean, p_required_tier text, p_access_context jsonb)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_actor uuid:=auth.uid(); v_id bigint; v_context jsonb; v_school_id uuid;
begin
  if v_actor is null or p_content_id is null or p_content_id!~'^[0-9]+$' then return false; end if;
  begin v_id:=p_content_id::bigint; exception when numeric_value_out_of_range then return false; end;
  if p_content_type not in ('ielts_reading_set','ielts_listening_set','ielts_writing_task','ielts_speaking_task') then return false; end if;
  -- Course tasks follow the course's own unlock rules for every learner.
  if p_is_active is true and private.ielts_course_task_unlocked(p_content_type, v_id) then return true; end if;
  -- Work a teacher assigned stays open.
  if p_is_active is true and private.ielts_content_is_assigned_to_current_user(p_content_type,p_content_id) then return true; end if;
  -- Everything else needs full IELTS access.
  if not private.ielts_course_has_full_access() then return false; end if;
  v_context:=coalesce(p_access_context,private.ielts_extra_practice_access_context());
  v_school_id:=nullif(v_context->>'school_id','')::uuid;
  if v_school_id is not null and not public.school_has_module_access(v_school_id,'ielts')
     and not public.ielts_user_has_prime_access(v_actor) then return false; end if;
  if coalesce((v_context->>'is_staff')::boolean,false) then return true; end if;
  if p_is_active is not true then return false; end if;
  if not coalesce((v_context->>'resolved')::boolean,false) or not coalesce((v_context->>'enabled')::boolean,false) then return false; end if;
  if coalesce(p_required_tier,'free')<>'free' and not public.ielts_user_has_prime_access(v_actor) then return false; end if;
  return true;
end;
$$;

revoke all on function private.ielts_can_access_practice_content(text, text, boolean, text, jsonb) from public, anon;
grant execute on function private.ielts_can_access_practice_content(text, text, boolean, text, jsonb) to authenticated;

-- The access check reports 'prime_required' to learners without full access, so the app offers Prime instead of a
-- misleading "disabled by your school" message.
create or replace function public.rpc_ielts_check_practice_access(p_skill text, p_task_id text)
returns table(allowed boolean, reason text, required_tier text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_content_id bigint;
  v_content_type text;
  v_required_tier text;
  v_context jsonb;
begin
  if v_user_id is null then
    return query select false, 'not_authenticated'::text, null::text;
    return;
  end if;

  if p_task_id is null or p_task_id !~ '^[0-9]+$' then
    return query select false, 'not_found'::text, null::text;
    return;
  end if;

  begin
    v_content_id := p_task_id::bigint;
  exception when numeric_value_out_of_range then
    return query select false, 'not_found'::text, null::text;
    return;
  end;

  case lower(trim(coalesce(p_skill, '')))
    when 'reading' then
      v_content_type := 'ielts_reading_set';
      select coalesce(r.required_tier, 'free') into v_required_tier
      from public.ielts_reading_sets r where r.id = v_content_id and r.is_active = true;
    when 'listening' then
      v_content_type := 'ielts_listening_set';
      select coalesce(l.required_tier, 'prime_prep_user') into v_required_tier
      from public.ielts_listening_sets l where l.id = v_content_id and l.is_active = true;
    when 'writing' then
      v_content_type := 'ielts_writing_task';
      select coalesce(w.required_tier, 'free') into v_required_tier
      from public.ielts_writing_tasks w where w.id = v_content_id and w.is_active = true;
    when 'speaking' then
      v_content_type := 'ielts_speaking_task';
      select coalesce(s.required_tier, 'free') into v_required_tier
      from public.ielts_speaking_tasks s where s.id = v_content_id and s.is_active = true;
    else
      return query select false, 'not_found'::text, null::text;
      return;
  end case;

  if not found then
    return query select false, 'not_found'::text, null::text;
    return;
  end if;

  v_context := private.ielts_extra_practice_access_context();
  if private.ielts_can_access_practice_content(v_content_type, p_task_id, true, v_required_tier, v_context) then
    return query select true, 'allowed'::text, v_required_tier;
    return;
  end if;

  if not private.ielts_course_has_full_access() then
    return query select false, 'prime_required'::text, v_required_tier;
    return;
  end if;

  if coalesce((v_context->>'resolved')::boolean, false)
     and coalesce((v_context->>'enabled')::boolean, false)
     and coalesce(v_required_tier, 'free') <> 'free'
     and not public.ielts_user_has_prime_access(v_user_id) then
    return query select false, 'prime_required'::text, v_required_tier;
    return;
  end if;

  return query select false, 'extra_practice_disabled'::text, v_required_tier;
end;
$$;

revoke all on function public.rpc_ielts_check_practice_access(text, text) from public, anon;
grant execute on function public.rpc_ielts_check_practice_access(text, text) to authenticated;
