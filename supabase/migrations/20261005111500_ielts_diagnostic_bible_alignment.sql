-- IELTS Diagnostic Bible v1.1.0 alignment.
-- Fail closed: legacy practice estimates must not be promoted to school readiness.
-- This migration intentionally preserves practice attempts and teacher feedback history.

comment on function public.ielts_estimated_readiness_band(numeric,numeric,numeric) is
  'LEGACY PRACTICE HELPER ONLY. Generic percentage-to-band conversion is not approved for Brains Heist IELTS diagnostic or school readiness under IELTS_DIAGNOSTIC_BIBLE v1.1.0.';

revoke all on function public.ielts_estimated_readiness_band(numeric,numeric,numeric) from public, anon, authenticated;
grant execute on function public.ielts_estimated_readiness_band(numeric,numeric,numeric) to service_role;

create or replace function public.ielts_latest_skill_readiness(p_student_id uuid)
returns table (
  skill text,
  estimated_band numeric,
  source_type text,
  source_id text,
  confidence text,
  last_activity_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  -- Bible v1.1.0 fail-closed bridge.
  -- Existing reading/listening attempt bands are client/practice-derived.
  -- Existing writing/speaking rows do not yet establish the full task coverage
  -- required for a skill-level IELTS readiness claim.
  -- Keep the contract callable internally, but return no readiness evidence
  -- until the governed diagnostic evidence model is implemented.
  select
    null::text,
    null::numeric,
    null::text,
    null::text,
    null::text,
    null::timestamptz
  where false;
$$;

comment on function public.ielts_latest_skill_readiness(uuid) is
  'Bible v1.1.0 fail-closed readiness bridge. Returns no skill readiness until validated, versioned diagnostic evidence satisfies the required coverage and verification gates.';

revoke all on function public.ielts_latest_skill_readiness(uuid) from public, anon, authenticated;
grant execute on function public.ielts_latest_skill_readiness(uuid) to service_role;

create or replace function public.rpc_ielts_student_journey(p_student_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student_id uuid := coalesce(p_student_id, auth.uid());
  v_school_id uuid := (select u.school_id from public.users u where u.id = v_student_id);
  v_result jsonb;
  v_completed_practice jsonb;
begin
  if v_student_id is null then
    raise exception 'not_authenticated';
  end if;

  if v_school_id is not null
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

comment on function public.rpc_ielts_student_journey(uuid) is
  'Bible v1.1.0 school-safe journey. Practice scores and reviewed feedback remain visible, but legacy practice band estimates are excluded from readiness conclusions.';

revoke all on function public.rpc_ielts_student_journey(uuid) from public, anon;
grant execute on function public.rpc_ielts_student_journey(uuid) to authenticated;

create or replace function public.rpc_ielts_school_results(
  p_school_id uuid default null,
  p_class_id uuid default null,
  p_student_id uuid default null,
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school_id uuid := coalesce(
    p_school_id,
    (select u.school_id from public.users u where u.id = auth.uid()),
    (select u.school_id from public.users u where u.id = p_student_id)
  );
  v_result jsonb;
  v_students jsonb;
begin
  if not private.actor_can_access_school_programme(v_school_id, 'ielts', false) then
    raise exception 'IELTS is not included in this school agreement' using errcode='42501';
  end if;

  v_result := public.rpc_ielts_school_results_entitlement_internal(
    v_school_id,
    p_class_id,
    p_student_id,
    p_limit
  );

  select coalesce(
    jsonb_agg(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(student, '{latest_reading_estimate}', 'null'::jsonb, true),
              '{latest_listening_estimate}', 'null'::jsonb, true
            ),
            '{latest_writing_estimate}', 'null'::jsonb, true
          ),
          '{latest_speaking_estimate}', 'null'::jsonb, true
        ),
        '{latest_overall_estimate}', 'null'::jsonb, true
      )
    ),
    '[]'::jsonb
  )
  into v_students
  from jsonb_array_elements(coalesce(v_result->'students', '[]'::jsonb)) student;

  v_result := jsonb_set(v_result, '{students}', coalesce(v_students, '[]'::jsonb), true);
  v_result := jsonb_set(
    v_result,
    '{summary,average_estimated_overall}',
    'null'::jsonb,
    true
  );

  return v_result;
end;
$$;

comment on function public.rpc_ielts_school_results(uuid,uuid,uuid,integer) is
  'Bible v1.1.0 school results. Practice/completion data is available, but legacy practice-derived readiness is suppressed until validated four-skill evidence exists.';

revoke all on function public.rpc_ielts_school_results(uuid,uuid,uuid,integer) from public, anon;
grant execute on function public.rpc_ielts_school_results(uuid,uuid,uuid,integer) to authenticated;


create or replace function public.rpc_ielts_school_student_snapshot(p_student_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $
declare
  v_school_id uuid := (select u.school_id from public.users u where u.id = p_student_id);
  v_result jsonb;
begin
  if not private.actor_can_access_school_programme(v_school_id, 'ielts', false) then
    raise exception 'IELTS is not included in this school agreement' using errcode='42501';
  end if;

  v_result := public.rpc_ielts_school_student_snapshot_entitlement_internal(p_student_id);

  v_result := jsonb_set(
    v_result,
    '{readiness}',
    jsonb_build_object(
      'status_label', 'Verified readiness pending',
      'target_band', coalesce(v_result #> '{readiness,target_band}', 'null'::jsonb),
      'overall_band', null,
      'reading_band', null,
      'listening_band', null,
      'writing_band', null,
      'speaking_band', null,
      'sources', jsonb_build_object(
        'Reading', null,
        'Listening', null,
        'Writing', null,
        'Speaking', null
      )
    ),
    true
  );

  return v_result;
end;
$;

comment on function public.rpc_ielts_school_student_snapshot(uuid) is
  'Bible v1.1.0 school snapshot. Assignment/activity evidence remains visible, but legacy practice-derived readiness is suppressed until governed diagnostic evidence exists.';

revoke all on function public.rpc_ielts_school_student_snapshot(uuid) from public, anon;
grant execute on function public.rpc_ielts_school_student_snapshot(uuid) to authenticated;
