-- IELTS access model (owner decision 2026-11-05, Asia/Bishkek): a school member without an IELTS seat, or in a school
-- whose agreement does not include IELTS, is an independent learner: free Unit 1 and V1, then IELTS Prime.
--
-- 1. rpc_ielts_student_journey: a learner can always read their own journey. The school IELTS check stays for staff
--    reading another student's journey.
-- 2. private.ielts_can_access_practice_content: a task inside an unlocked course unit opens before the school package
--    check, so the free Unit 1 tasks work for students of schools without IELTS. The course decides unit access
--    (private.ielts_course_unit_unlocked: free preview, Prime or a school seat).

create or replace function public.rpc_ielts_student_journey(p_student_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_student_id uuid := coalesce(p_student_id, v_actor);
  v_school_id uuid := (select u.school_id from public.users u where u.id = v_student_id);
  v_result jsonb;
  v_completed_practice jsonb;
begin
  if v_student_id is null then
    raise exception 'not_authenticated';
  end if;

  if v_student_id is distinct from v_actor
     and v_school_id is not null
     and not private.actor_can_access_school_programme(v_school_id, 'ielts', false) then
    raise exception 'IELTS is not included in this school agreement' using errcode='42501';
  end if;

  v_result := public.rpc_ielts_student_journey_entitlement_internal(v_student_id);

  select coalesce(jsonb_agg(item - 'estimated_band'), '[]'::jsonb)
    into v_completed_practice
  from jsonb_array_elements(coalesce(v_result->'completed_practice', '[]'::jsonb)) item;

  v_result := jsonb_set(
    v_result,
    '{current_estimates}',
    jsonb_build_object(
      'reading', null,
      'listening', null,
      'writing', null,
      'speaking', null,
      'overall', null
    ),
    true
  );
  v_result := jsonb_set(v_result, '{confidence_level}', to_jsonb('low'::text), true);
  v_result := jsonb_set(v_result, '{weak_skill}', 'null'::jsonb, true);
  v_result := jsonb_set(v_result, '{recent_practice}', '[]'::jsonb, true);
  v_result := jsonb_set(v_result, '{completed_practice}', coalesce(v_completed_practice, '[]'::jsonb), true);
  v_result := jsonb_set(
    v_result,
    '{next_recommendation}',
    to_jsonb('Complete assigned practice and reviewed baseline tasks while Brains Heist builds verified four-skill readiness evidence.'::text),
    true
  );

  return v_result;
end;
$$;

revoke all on function public.rpc_ielts_student_journey(uuid) from public, anon;
grant execute on function public.rpc_ielts_student_journey(uuid) to authenticated;

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
  v_context:=coalesce(p_access_context,private.ielts_extra_practice_access_context());
  v_school_id:=nullif(v_context->>'school_id','')::uuid;
  if v_school_id is not null and not public.school_has_module_access(v_school_id,'ielts')
     and not public.ielts_user_has_prime_access(v_actor) then return false; end if;
  if coalesce((v_context->>'is_staff')::boolean,false) then return true; end if;
  if p_is_active is not true then return false; end if;
  if private.ielts_content_is_assigned_to_current_user(p_content_type,p_content_id) then return true; end if;
  if not coalesce((v_context->>'resolved')::boolean,false) or not coalesce((v_context->>'enabled')::boolean,false) then return false; end if;
  if coalesce(p_required_tier,'free')<>'free' and not public.ielts_user_has_prime_access(v_actor) then return false; end if;
  return true;
end;
$$;

revoke all on function private.ielts_can_access_practice_content(text, text, boolean, text, jsonb) from public, anon;
grant execute on function private.ielts_can_access_practice_content(text, text, boolean, text, jsonb) to authenticated;
