-- Finish Writing Hub current-context isolation across profile sync, calibration
-- roster and detailed teacher reports. Historical submissions remain preserved,
-- but cannot be presented as current Grade/Class support evidence.

create or replace function private.sync_writing_profile_grade_for_student(p_student_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_grade integer;
begin
  v_grade := public.bh_writing_authoritative_student_grade(p_student_id);
  if v_grade is null then return; end if;

  update public.bh_writing_student_profiles p
  set grade = v_grade,
      profile = jsonb_set(coalesce(p.profile, '{}'::jsonb), '{grade}', to_jsonb(v_grade), true),
      updated_at = now()
  where p.student_id = p_student_id
    and (
      p.grade is distinct from v_grade
      or coalesce(p.profile->>'grade', '') is distinct from v_grade::text
    );
end;
$$;

revoke all on function private.sync_writing_profile_grade_for_student(uuid)
  from public, anon, authenticated, service_role;

-- Repair existing profile rows whose structured grade and nested legacy grade
-- drifted apart during class moves.
with resolved as (
  select sp.student_id,
         public.bh_writing_authoritative_student_grade(sp.student_id) as grade
  from public.bh_writing_student_profiles sp
)
update public.bh_writing_student_profiles sp
set grade = r.grade,
    profile = jsonb_set(coalesce(sp.profile, '{}'::jsonb), '{grade}', to_jsonb(r.grade), true),
    updated_at = now()
from resolved r
where r.student_id = sp.student_id
  and r.grade between 1 and 12
  and (
    sp.grade is distinct from r.grade
    or coalesce(sp.profile->>'grade', '') is distinct from r.grade::text
  );

create or replace function public.rpc_bh_writing_teacher_calibration_queue(
  p_month text default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  return (
    with roster as (
      select s.student_id
      from public.bh_writing_allowed_students() s
    ),
    rows as (
      select
        r.student_id,
        coalesce(u.full_name, u.username, 'Student') as student_name,
        public.bh_writing_authoritative_student_grade(r.student_id) as grade
      from roster r
      join public.users u on u.id = r.student_id
      order by coalesce(u.full_name, u.username, 'Student'), r.student_id
      limit greatest(coalesce(p_limit, 50), 1)
    )
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'student_id', row.student_id,
        'student_name', row.student_name,
        'grade', row.grade,
        'latest_score', null,
        'priority_weak_areas', '[]'::jsonb,
        'completion_rate', 0,
        'grade_authority', 'current_academic_placement'
      )
    ), '[]'::jsonb)
    from rows row
  );
end;
$$;

revoke all on function public.rpc_bh_writing_teacher_calibration_queue(text, integer)
  from public, anon;
grant execute on function public.rpc_bh_writing_teacher_calibration_queue(text, integer)
  to authenticated, service_role;

-- Preserve the established branded/canonical report implementation behind a
-- current-placement wrapper.
alter function public.rpc_bh_writing_teacher_report(text, text, text, boolean)
  rename to rpc_bh_writing_teacher_report_pre_context_20260919;

revoke all on function public.rpc_bh_writing_teacher_report_pre_context_20260919(text, text, text, boolean)
  from public, anon, authenticated, service_role;

create function public.rpc_bh_writing_teacher_report(
  p_student_id text,
  p_month text default null,
  p_genre text default null,
  p_include_snippet boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sid uuid := public.bh_writing_resolve_student_uuid(p_student_id);
  v_month text := coalesce(nullif(trim(p_month), ''), to_char(now(), 'YYYY-MM'));
  v_genre text := nullif(lower(trim(p_genre)), '');
  v_report jsonb;
  v_school_id uuid;
  v_year_id uuid;
  v_context record;
  v_month_start timestamptz;
  v_month_end timestamptz;
  v_period_from timestamptz;
  v_period_attempt_count integer := 0;
  v_context_attempt_count integer := 0;
  v_all_time_count integer := 0;
  v_latest_payload jsonb;
  v_latest_score numeric;
  v_previous_score numeric;
  v_current_weaknesses jsonb := '[]'::jsonb;
  v_current_strengths jsonb := '[]'::jsonb;
  v_current_evaluation jsonb := '{}'::jsonb;
  v_canonical public.bh_writing_canonical_assessments%rowtype;
  v_teacher_actions jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.can_access_bh_writing_student(v_sid) then
    raise exception 'Forbidden: teacher is not authorized for this student';
  end if;

  v_report := public.rpc_bh_writing_teacher_report_pre_context_20260919(
    p_student_id, p_month, p_genre, p_include_snippet
  );

  select u.school_id into v_school_id
  from public.users u where u.id = v_sid;
  v_year_id := public.academic_resolve_operational_year_id(v_school_id, now());
  select * into v_context
  from private.student_current_academic_context(v_sid, v_year_id);

  v_month_start := (v_month || '-01')::date::timestamptz;
  v_month_end := (v_month_start + interval '1 month');
  v_period_from := greatest(
    coalesce(v_context.context_start_at, v_month_start),
    v_month_start
  );

  select count(*)::integer into v_all_time_count
  from public.bh_writing_attempts a
  where coalesce(a.payload->>'student_id', a.payload->>'user_id') = v_sid::text
    and (v_genre is null or lower(coalesce(a.payload->>'genre', '')) = v_genre);

  -- Archived months before the current placement remain historical reports.
  if v_month_end <= coalesce(v_context.context_start_at, '-infinity'::timestamptz) then
    return v_report || jsonb_build_object(
      'academic_context', 'historical_period',
      'current_academic_year_id', v_year_id,
      'current_context_start_at', v_context.context_start_at,
      'historical_submission_count', v_all_time_count,
      'historical_context_excluded_from_current_status', true
    );
  end if;

  select count(*)::integer into v_period_attempt_count
  from public.bh_writing_attempts a
  where coalesce(a.payload->>'student_id', a.payload->>'user_id') = v_sid::text
    and a.academic_year_id = v_year_id
    and a.created_at >= v_period_from
    and a.created_at < v_month_end
    and (v_genre is null or lower(coalesce(a.payload->>'genre', '')) = v_genre);

  select count(*)::integer into v_context_attempt_count
  from public.bh_writing_attempts a
  where coalesce(a.payload->>'student_id', a.payload->>'user_id') = v_sid::text
    and a.academic_year_id = v_year_id
    and a.created_at >= coalesce(v_context.context_start_at, '-infinity'::timestamptz)
    and a.created_at < v_month_end
    and (v_genre is null or lower(coalesce(a.payload->>'genre', '')) = v_genre);

  v_report := jsonb_set(
    v_report,
    '{student}',
    coalesce(v_report->'student', '{}'::jsonb) || jsonb_build_object(
      'grade', case when v_context.grade_level ~ '^\d+$' then v_context.grade_level::integer else null end,
      'class_id', v_context.class_id,
      'class_name', v_context.class_code
    ),
    true
  ) || jsonb_build_object(
    'current_academic_year_id', v_year_id,
    'current_context_start_at', v_context.context_start_at,
    'current_context_submission_count', v_context_attempt_count,
    'period_current_context_submission_count', v_period_attempt_count,
    'all_time_submission_count', v_all_time_count,
    'historical_submission_count', greatest(v_all_time_count - v_context_attempt_count, 0),
    'historical_context_excluded_from_current_status', true
  );

  if v_period_attempt_count = 0 then
    return jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(
                  v_report,
                  '{overall_summary}',
                  jsonb_build_object(
                    'latest_score', null,
                    'score_trend_delta', null,
                    'completion_rate_percent', 0,
                    'completed_tasks', 0,
                    'total_tasks', 0
                  ), true
                ),
                '{strengths}', '[]'::jsonb, true
              ),
              '{priority_weak_areas}', '[]'::jsonb, true
            ),
            '{repeated_error_patterns}', '[]'::jsonb, true
          ),
          '{latest_evaluation}', '{}'::jsonb, true
        ),
        '{monthly_summary}', '{}'::jsonb, true
      ),
      '{teacher_actions}',
      jsonb_build_array('Collect a current-placement writing sample before planning targeted writing support.'),
      true
    ) || jsonb_build_object(
      'assessment_authority', 'no_current_context_evidence',
      'evidence_snippet', null,
      'student_friendly_summary', jsonb_build_object(
        'strengths', '[]'::jsonb,
        'top_improvement_targets', '[]'::jsonb,
        'progress_summary', 'No current-placement writing evidence has been submitted for this period yet.',
        'next_steps', '[]'::jsonb
      )
    );
  end if;

  select a.payload into v_latest_payload
  from public.bh_writing_attempts a
  where coalesce(a.payload->>'student_id', a.payload->>'user_id') = v_sid::text
    and a.academic_year_id = v_year_id
    and a.created_at >= v_period_from
    and a.created_at < v_month_end
    and (v_genre is null or lower(coalesce(a.payload->>'genre', '')) = v_genre)
  order by a.created_at desc, a.id desc
  limit 1;

  with scores as (
    select
      case when a.payload #>> '{assessment,total_score}' ~ '^-?\d+(\.\d+)?$'
        then (a.payload #>> '{assessment,total_score}')::numeric end as score,
      row_number() over (order by a.created_at desc, a.id desc) as rn
    from public.bh_writing_attempts a
    where coalesce(a.payload->>'student_id', a.payload->>'user_id') = v_sid::text
      and a.academic_year_id = v_year_id
      and a.created_at >= coalesce(v_context.context_start_at, '-infinity'::timestamptz)
      and a.created_at < v_month_end
      and (v_genre is null or lower(coalesce(a.payload->>'genre', '')) = v_genre)
  )
  select max(score) filter (where rn = 1), max(score) filter (where rn = 2)
  into v_latest_score, v_previous_score
  from scores;

  v_current_weaknesses := case
    when jsonb_typeof(v_latest_payload->'assessment'->'weakness_tags') = 'array'
      then v_latest_payload->'assessment'->'weakness_tags'
    else '[]'::jsonb
  end;
  v_current_strengths := coalesce(
    case when jsonb_typeof(v_latest_payload->'rich_feedback'->'what_is_working') = 'array'
      then v_latest_payload->'rich_feedback'->'what_is_working' end,
    case when jsonb_typeof(v_latest_payload->'rich_feedback'->'strengths') = 'array'
      then v_latest_payload->'rich_feedback'->'strengths' end,
    '[]'::jsonb
  );

  select de.payload->'evaluation' into v_current_evaluation
  from public.bh_writing_daily_evaluations de
  where coalesce(de.payload->>'student_id', de.payload->>'user_id') = v_sid::text
    and de.created_at >= v_period_from
    and de.created_at < v_month_end
    and (v_genre is null or lower(coalesce(de.payload->>'genre', '')) = v_genre)
  order by de.created_at desc, de.id desc
  limit 1;
  v_current_evaluation := coalesce(v_current_evaluation, '{}'::jsonb);

  select c.* into v_canonical
  from public.bh_writing_canonical_assessments c
  join public.bh_writing_attempts a on a.attempt_key = c.attempt_key
  where c.student_id = v_sid
    and a.academic_year_id = v_year_id
    and a.created_at >= v_period_from
    and a.created_at < v_month_end
    and (v_genre is null or lower(coalesce(c.assessment_payload->>'genre', c.assessment_payload #>> '{prompt_definition,genre}', '')) = v_genre)
  order by c.canonical_at desc, c.assessment_id desc
  limit 1;

  if found then
    v_latest_score := v_canonical.total_score;
    v_current_weaknesses := coalesce(v_canonical.feedback_payload->'weakness_tags', '[]'::jsonb);
    v_current_strengths := coalesce(
      v_canonical.feedback_payload->'what_is_working',
      v_canonical.feedback_payload->'strengths',
      '[]'::jsonb
    );
    v_current_evaluation := v_canonical.assessment_payload || jsonb_build_object(
      'total_score', v_canonical.total_score,
      'assessment_status', v_canonical.canonical_status,
      'final_review_id', v_canonical.final_review_id
    );
  end if;

  if jsonb_array_length(v_current_weaknesses) > 0 then
    v_teacher_actions := jsonb_build_array(
      'Prioritize targeted practice for: ' || replace(v_current_weaknesses->>0, '_', ' ')
    );
  elsif v_context_attempt_count < 2 then
    v_teacher_actions := jsonb_build_array(
      'Collect another comparable current-placement writing sample before judging progress.'
    );
  else
    v_teacher_actions := '[]'::jsonb;
  end if;

  v_report := jsonb_set(
    v_report,
    '{overall_summary}',
    coalesce(v_report->'overall_summary', '{}'::jsonb) || jsonb_build_object(
      'latest_score', v_latest_score,
      'score_trend_delta', case
        when v_latest_score is not null and v_previous_score is not null
          then v_latest_score - v_previous_score
        else null
      end
    ), true
  );
  v_report := jsonb_set(v_report, '{strengths}', v_current_strengths, true);
  v_report := jsonb_set(v_report, '{priority_weak_areas}', v_current_weaknesses, true);
  v_report := jsonb_set(v_report, '{repeated_error_patterns}', v_current_weaknesses, true);
  v_report := jsonb_set(v_report, '{latest_evaluation}', v_current_evaluation, true);
  v_report := jsonb_set(v_report, '{teacher_actions}', v_teacher_actions, true);

  return v_report || jsonb_build_object(
    'assessment_authority', case when v_canonical.assessment_id is not null then v_canonical.canonical_status else 'current_context_legacy_estimate' end,
    'student_friendly_summary', jsonb_build_object(
      'strengths', v_current_strengths,
      'top_improvement_targets', v_current_weaknesses,
      'progress_summary', case
        when v_previous_score is null then 'A current-placement writing baseline is available; another comparable sample will show progress.'
        when v_latest_score > v_previous_score then 'The latest current-placement writing evidence has improved.'
        when v_latest_score < v_previous_score then 'The latest current-placement writing evidence needs focused follow-up.'
        else 'The current-placement writing evidence is stable.'
      end,
      'next_steps', v_teacher_actions
    )
  );
end;
$$;

revoke all on function public.rpc_bh_writing_teacher_report(text, text, text, boolean)
  from public, anon;
grant execute on function public.rpc_bh_writing_teacher_report(text, text, text, boolean)
  to authenticated, service_role;

comment on function public.rpc_bh_writing_teacher_report(text, text, text, boolean) is
  'Teacher writing report scoped to current academic placement for current periods. Historical reports remain available, while historical attempts cannot drive current scores, weaknesses, trends or support actions.';
