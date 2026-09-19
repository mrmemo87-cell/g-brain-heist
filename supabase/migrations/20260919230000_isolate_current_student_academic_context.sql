-- Isolate current-placement evidence from historical placement evidence.
-- Historical records remain immutable and queryable; current Academic Profile,
-- Interventions and Writing Monitor decisions must not inherit evidence from a
-- previous class/grade placement in the same academic year.

create or replace function private.student_current_academic_context(
  p_student_id uuid,
  p_academic_year_id uuid
)
returns table(
  context_start_at timestamptz,
  grade_level text,
  class_id uuid,
  class_code text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_year public.school_academic_years%rowtype;
  v_live_class public.classes%rowtype;
  v_enrol public.student_academic_enrolments%rowtype;
  v_operational_year_id uuid;
  v_transfer_date date;
begin
  select y.* into v_year
  from public.school_academic_years y
  join public.users u on u.school_id = y.school_id
  where y.id = p_academic_year_id
    and u.id = p_student_id;
  if not found then return; end if;

  v_operational_year_id := public.academic_resolve_operational_year_id(v_year.school_id, now());

  if v_year.id = v_operational_year_id then
    select c.* into v_live_class
    from public.class_students cs
    join public.classes c
      on c.id = cs.class_id
     and c.school_id = v_year.school_id
     and coalesce(c.is_active, true)
    join public.school_members sm
      on sm.school_id = v_year.school_id
     and sm.user_id = cs.student_id
     and sm.status in ('active', 'suspended')
     and sm.role_in_school = 'student'
    where cs.student_id = p_student_id
    order by cs.joined_at desc nulls last, c.created_at desc, c.id
    limit 1;
  end if;

  select e.* into v_enrol
  from public.student_academic_enrolments e
  where e.student_id = p_student_id
    and e.school_id = v_year.school_id
    and e.academic_year_id = v_year.id
  order by
    case when v_live_class.id is not null and e.class_id = v_live_class.id then 0 else 1 end,
    case e.context_quality when 'confirmed' then 0 else 1 end,
    e.updated_at desc,
    e.id
  limit 1;

  class_id := coalesce(v_live_class.id, v_enrol.class_id);
  grade_level := coalesce(v_live_class.grade_level, v_enrol.grade_level);
  class_code := coalesce(
    nullif(trim(v_live_class.class_code), ''),
    nullif(trim(v_live_class.class_name), ''),
    nullif(trim(v_enrol.class_code), '')
  );

  context_start_at := v_year.starts_on::timestamptz;
  if v_enrol.id is not null then
    context_start_at := greatest(context_start_at, v_enrol.starts_on::timestamptz);
  end if;

  if class_id is not null then
    select max(h.effective_date) into v_transfer_date
    from public.school_student_placement_history h
    where h.school_id = v_year.school_id
      and h.student_user_id = p_student_id
      and h.to_class_id = class_id
      and h.effective_date between v_year.starts_on and v_year.ends_on
      and h.effective_date <= current_date;
    if v_transfer_date is not null then
      context_start_at := greatest(context_start_at, v_transfer_date::timestamptz);
    end if;
  end if;

  return next;
end;
$$;

revoke all on function private.student_current_academic_context(uuid, uuid)
  from public, anon, authenticated, service_role;

-- Preserve the complete historical implementation, then put a small context
-- boundary in front of it. This avoids rewriting the established profile logic.
alter function public.rpc_student_academic_profile_for_year(
  uuid, text, uuid, timestamptz, timestamptz
) rename to rpc_student_academic_profile_for_year_pre_context_20260919;

revoke all on function public.rpc_student_academic_profile_for_year_pre_context_20260919(
  uuid, text, uuid, timestamptz, timestamptz
) from public, anon, authenticated, service_role;

create function public.rpc_student_academic_profile_for_year(
  p_student_id uuid,
  p_subject text,
  p_academic_year_id uuid,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_student_id uuid := coalesce(p_student_id, auth.uid());
  v_school_id uuid;
  v_operational_year_id uuid;
  v_context record;
  v_effective_from timestamptz := p_date_from;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select u.school_id into v_school_id
  from public.users u where u.id = v_student_id;
  if v_school_id is null then raise exception 'Student is not attached to a school'; end if;

  v_operational_year_id := public.academic_resolve_operational_year_id(v_school_id, now());
  if p_academic_year_id = v_operational_year_id then
    select * into v_context
    from private.student_current_academic_context(v_student_id, p_academic_year_id);
    if v_context.context_start_at is not null then
      v_effective_from := greatest(
        v_context.context_start_at,
        coalesce(p_date_from, v_context.context_start_at)
      );
    end if;
  end if;

  v_result := public.rpc_student_academic_profile_for_year_pre_context_20260919(
    v_student_id, p_subject, p_academic_year_id, v_effective_from, p_date_to
  );

  return jsonb_set(
    v_result,
    '{scope}',
    coalesce(v_result->'scope', '{}'::jsonb) || jsonb_build_object(
      'placement_context_start_at', case
        when p_academic_year_id = v_operational_year_id then v_context.context_start_at
        else null
      end,
      'current_placement_only', p_academic_year_id = v_operational_year_id,
      'historical_placement_evidence_excluded', p_academic_year_id = v_operational_year_id
    ),
    true
  );
end;
$$;

revoke all on function public.rpc_student_academic_profile_for_year(
  uuid, text, uuid, timestamptz, timestamptz
) from public, anon;
grant execute on function public.rpc_student_academic_profile_for_year(
  uuid, text, uuid, timestamptz, timestamptz
) to authenticated, service_role;

-- Interventions use the same current-placement boundary. Existing historical
-- focus states remain intact, but they cannot surface as a current recommendation.
alter function public.rpc_teacher_student_intervention_pilot(uuid, text)
  rename to rpc_teacher_student_intervention_pilot_pre_context_20260919;

revoke all on function public.rpc_teacher_student_intervention_pilot_pre_context_20260919(uuid, text)
  from public, anon, authenticated, service_role;

create function public.rpc_teacher_student_intervention_pilot(
  p_student_id uuid,
  p_subject text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_base jsonb;
  v_school_id uuid;
  v_year_id uuid;
  v_context record;
  v_recommendations jsonb := '[]'::jsonb;
begin
  v_base := public.rpc_teacher_student_intervention_pilot_pre_context_20260919(
    p_student_id, p_subject
  );

  select u.school_id into v_school_id
  from public.users u where u.id = p_student_id;
  v_year_id := public.academic_resolve_operational_year_id(v_school_id, now());
  select * into v_context
  from private.student_current_academic_context(p_student_id, v_year_id);

  select coalesce(jsonb_agg(item), '[]'::jsonb)
  into v_recommendations
  from jsonb_array_elements(coalesce(v_base->'recommendations', '[]'::jsonb)) item
  where exists (
    select 1
    from public.student_learning_focus_states f
    join public.student_learning_observations o
      on o.student_id = f.student_id
     and o.skill_key = f.skill_key
     and o.academic_year_id is not distinct from f.academic_year_id
    where f.student_id = p_student_id
      and f.skill_key = item->>'skill_key'
      and f.academic_year_id = v_year_id
      and o.observed_at >= coalesce(v_context.context_start_at, '-infinity'::timestamptz)
      and public.student_learning_observation_is_qualified(
        o.source_type, o.contributes_to_focus_state, o.evidence
      )
      and (
        o.grade_level_at_time is null
        or v_context.grade_level is null
        or nullif(regexp_replace(o.grade_level_at_time, '\D', '', 'g'), '')
           = nullif(regexp_replace(v_context.grade_level, '\D', '', 'g'), '')
      )
      and (
        o.class_code_at_time is null
        or v_context.class_code is null
        or upper(regexp_replace(o.class_code_at_time, '\s', '', 'g'))
           = upper(regexp_replace(v_context.class_code, '\s', '', 'g'))
      )
  );

  return jsonb_set(v_base, '{recommendations}', v_recommendations, true)
    || jsonb_build_object(
      'academicYearId', v_year_id,
      'currentPlacementContextStartAt', v_context.context_start_at,
      'historicalPlacementSignalsExcluded', true
    );
end;
$$;

revoke all on function public.rpc_teacher_student_intervention_pilot(uuid, text)
  from public, anon;
grant execute on function public.rpc_teacher_student_intervention_pilot(uuid, text)
  to authenticated, service_role;

-- Writing Monitor keeps all-time history visible, but all live status, trend,
-- weakness and support decisions are rebuilt from the student's current
-- placement context only.
alter function public.rpc_bh_writing_teacher_monitoring(text, integer, text)
  rename to rpc_bh_writing_teacher_monitoring_pre_context_20260919;

revoke all on function public.rpc_bh_writing_teacher_monitoring_pre_context_20260919(text, integer, text)
  from public, anon, authenticated, service_role;

create function public.rpc_bh_writing_teacher_monitoring(
  p_month text default null,
  p_grade integer default null,
  p_genre text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base jsonb;
  v_rows jsonb := '[]'::jsonb;
  v_class_rows jsonb := '[]'::jsonb;
  v_hotspots jsonb := '[]'::jsonb;
  v_stalled jsonb := '[]'::jsonb;
  v_review_ready jsonb := '[]'::jsonb;
  v_month text := coalesce(nullif(trim(p_month), ''), to_char(now(), 'YYYY-MM'));
  v_genre text := nullif(lower(trim(p_genre)), '');
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  v_base := public.rpc_bh_writing_teacher_monitoring_pre_context_20260919(
    p_month, p_grade, p_genre
  );

  select coalesce(jsonb_agg(
    row_item.value || jsonb_build_object(
      'submission_count', coalesce(cur.month_count, 0),
      'baseline_submission_count', coalesce(cur.baseline_month_count, 0),
      'attempts_count', coalesce(cur.context_count, 0),
      'current_context_submission_count', coalesce(cur.context_count, 0),
      'historical_submission_count', greatest(
        coalesce((row_item.value->>'all_time_submission_count')::integer, 0)
          - coalesce(cur.context_count, 0),
        0
      ),
      'current_academic_year_id', year_row.id,
      'current_academic_year_name', year_row.name,
      'current_context_start_at', ctx.context_start_at,
      'historical_context_excluded_from_status', true,
      'latest_score', coalesce(latest_verified.total_score::numeric, cur.latest_score),
      'first_score', coalesce(first_verified.total_score::numeric, cur.first_score),
      'latest_subscale_scores', jsonb_build_object(
        'content', coalesce(latest_verified.content_score::numeric, cur.latest_content),
        'communicative_achievement', coalesce(latest_verified.communicative_achievement_score::numeric, cur.latest_communicative),
        'organisation', coalesce(latest_verified.organisation_score::numeric, cur.latest_organisation),
        'language', coalesce(latest_verified.language_score::numeric, cur.latest_language)
      ),
      'subscale_trend', jsonb_build_object(
        'content', coalesce(
          coalesce(latest_verified.content_score::numeric, cur.latest_content)
            - coalesce(first_verified.content_score::numeric, cur.first_content), 0
        ),
        'communicative_achievement', coalesce(
          coalesce(latest_verified.communicative_achievement_score::numeric, cur.latest_communicative)
            - coalesce(first_verified.communicative_achievement_score::numeric, cur.first_communicative), 0
        ),
        'organisation', coalesce(
          coalesce(latest_verified.organisation_score::numeric, cur.latest_organisation)
            - coalesce(first_verified.organisation_score::numeric, cur.first_organisation), 0
        ),
        'language', coalesce(
          coalesce(latest_verified.language_score::numeric, cur.latest_language)
            - coalesce(first_verified.language_score::numeric, cur.first_language), 0
        )
      ),
      'repeated_weakness_hotspots', coalesce(focus.focus_tags, '[]'::jsonb),
      'focus_area_counts', coalesce(focus.focus_area_counts, '[]'::jsonb),
      'weekly_target_summary', case
        when jsonb_array_length(coalesce(focus.focus_area_counts, '[]'::jsonb)) > 0
          then 'Prioritize ' || replace(focus.focus_area_counts->0->>'tag', '_', ' ')
        else 'Build enough current-placement writing evidence to identify a focus area'
      end,
      'stalled',
        coalesce(cur.context_count, 0) >= 2
        and coalesce(latest_verified.total_score::numeric, cur.latest_score) is not null
        and coalesce(first_verified.total_score::numeric, cur.first_score) is not null
        and coalesce(latest_verified.total_score::numeric, cur.latest_score)
          - coalesce(first_verified.total_score::numeric, cur.first_score) <= 0,
      'improving',
        coalesce(cur.context_count, 0) >= 2
        and coalesce(latest_verified.total_score::numeric, cur.latest_score) is not null
        and coalesce(first_verified.total_score::numeric, cur.first_score) is not null
        and coalesce(latest_verified.total_score::numeric, cur.latest_score)
          - coalesce(first_verified.total_score::numeric, cur.first_score) > 0,
      'ready_for_monthly_review', coalesce(cur.month_count, 0) >= 2,
      'status', case
        when coalesce(cur.context_count, 0) = 0 then 'not_started'
        when coalesce(cur.latest_payload->'integrity'->>'review_status', cur.latest_payload->'integrity_signals'->>'review_status') = 'review_recommended'
          then 'needs_review'
        when coalesce(cur.context_count, 0) >= 2
          and coalesce(latest_verified.total_score::numeric, cur.latest_score) is not null
          and coalesce(first_verified.total_score::numeric, cur.first_score) is not null
          and coalesce(latest_verified.total_score::numeric, cur.latest_score)
            - coalesce(first_verified.total_score::numeric, cur.first_score) > 0
          then 'improving'
        when coalesce(latest_verified.total_score::numeric, cur.latest_score) is not null
          and coalesce(latest_verified.total_score::numeric, cur.latest_score) < 14
          then 'needs_support'
        else 'on_track'
      end,
      'status_reason', case
        when coalesce(cur.context_count, 0) = 0
          and coalesce((row_item.value->>'all_time_submission_count')::integer, 0) > 0
          then 'No writing has been submitted in the current placement yet. Earlier writing remains archived and does not affect current support status.'
        when coalesce(cur.context_count, 0) = 0
          then 'No writing has been submitted in the current placement yet.'
        when coalesce(cur.context_count, 0) = 1
          then 'A current-placement baseline is available; another comparable submission will show progress.'
        when coalesce(latest_verified.total_score::numeric, cur.latest_score) is not null
          and coalesce(first_verified.total_score::numeric, cur.first_score) is not null
          and coalesce(latest_verified.total_score::numeric, cur.latest_score)
            - coalesce(first_verified.total_score::numeric, cur.first_score) > 0
          then 'The latest current-placement writing evidence has improved.'
        when coalesce(latest_verified.total_score::numeric, cur.latest_score) is not null
          and coalesce(latest_verified.total_score::numeric, cur.latest_score) < 14
          then 'The latest current-placement writing evidence shows focus areas that need teacher support.'
        else 'The current-placement writing evidence is stable.'
      end,
      'latest_attempt_at', cur.latest_attempt_at,
      'latest_integrity_signals', coalesce(
        cur.latest_payload->'integrity_signals',
        cur.latest_payload->'integrity',
        'null'::jsonb
      ),
      'assessment_authority', case
        when latest_verified.assessment_id is not null then latest_verified.canonical_status
        when coalesce(cur.context_count, 0) > 0 then 'legacy_estimate'
        else 'no_current_context_evidence'
      end
    )
    order by row_item.ordinality
  ), '[]'::jsonb)
  into v_rows
  from jsonb_array_elements(coalesce(v_base->'student_rows', '[]'::jsonb))
    with ordinality row_item(value, ordinality)
  left join public.users u
    on u.id = nullif(row_item.value->>'student_id', '')::uuid
  left join public.school_academic_years year_row
    on year_row.id = public.academic_resolve_operational_year_id(u.school_id, now())
  left join lateral private.student_current_academic_context(
    u.id, year_row.id
  ) ctx on true
  left join lateral (
    with attempts as (
      select
        a.id,
        a.payload,
        a.created_at,
        case when a.payload #>> '{assessment,total_score}' ~ '^-?\d+(\.\d+)?$'
          then (a.payload #>> '{assessment,total_score}')::numeric end as total_score,
        case when a.payload #>> '{assessment,subscores,content}' ~ '^-?\d+(\.\d+)?$'
          then (a.payload #>> '{assessment,subscores,content}')::numeric end as content_score,
        case when a.payload #>> '{assessment,subscores,communicative_achievement}' ~ '^-?\d+(\.\d+)?$'
          then (a.payload #>> '{assessment,subscores,communicative_achievement}')::numeric end as communicative_score,
        case when coalesce(a.payload #>> '{assessment,subscores,organisation}', a.payload #>> '{assessment,subscores,organization}') ~ '^-?\d+(\.\d+)?$'
          then coalesce(a.payload #>> '{assessment,subscores,organisation}', a.payload #>> '{assessment,subscores,organization}')::numeric end as organisation_score,
        case when a.payload #>> '{assessment,subscores,language}' ~ '^-?\d+(\.\d+)?$'
          then (a.payload #>> '{assessment,subscores,language}')::numeric end as language_score
      from public.bh_writing_attempts a
      where coalesce(a.payload->>'student_id', a.payload->>'user_id') = row_item.value->>'student_id'
        and a.academic_year_id = year_row.id
        and a.created_at >= coalesce(ctx.context_start_at, year_row.starts_on::timestamptz)
        and (v_genre is null or lower(coalesce(a.payload->>'genre', '')) = v_genre)
    )
    select
      count(*)::integer as context_count,
      count(*) filter (where to_char(created_at, 'YYYY-MM') = v_month)::integer as month_count,
      count(*) filter (
        where to_char(created_at, 'YYYY-MM') = v_month
          and coalesce(payload->>'attempt_type', '') = 'initial_assessment'
      )::integer as baseline_month_count,
      (array_agg(total_score order by created_at desc, id desc))[1] as latest_score,
      (array_agg(total_score order by created_at, id))[1] as first_score,
      (array_agg(content_score order by created_at desc, id desc))[1] as latest_content,
      (array_agg(content_score order by created_at, id))[1] as first_content,
      (array_agg(communicative_score order by created_at desc, id desc))[1] as latest_communicative,
      (array_agg(communicative_score order by created_at, id))[1] as first_communicative,
      (array_agg(organisation_score order by created_at desc, id desc))[1] as latest_organisation,
      (array_agg(organisation_score order by created_at, id))[1] as first_organisation,
      (array_agg(language_score order by created_at desc, id desc))[1] as latest_language,
      (array_agg(language_score order by created_at, id))[1] as first_language,
      max(created_at) as latest_attempt_at,
      (array_agg(payload order by created_at desc, id desc))[1] as latest_payload
    from attempts
  ) cur on true
  left join lateral (
    with current_attempts as (
      select a.payload
      from public.bh_writing_attempts a
      where coalesce(a.payload->>'student_id', a.payload->>'user_id') = row_item.value->>'student_id'
        and a.academic_year_id = year_row.id
        and a.created_at >= coalesce(ctx.context_start_at, year_row.starts_on::timestamptz)
        and (v_genre is null or lower(coalesce(a.payload->>'genre', '')) = v_genre)
    ), tags as (
      select entry.key as tag,
        greatest(1, case when entry.value #>> '{}' ~ '^\d+$' then (entry.value #>> '{}')::integer else 1 end) as occurrence_count
      from current_attempts a
      cross join lateral jsonb_each(
        case
          when jsonb_typeof(a.payload->'feedback_weakness_tag_counts') = 'object'
            then a.payload->'feedback_weakness_tag_counts'
          when jsonb_typeof(a.payload->'rich_feedback'->'weakness_tag_counts') = 'object'
            then a.payload->'rich_feedback'->'weakness_tag_counts'
          else '{}'::jsonb
        end
      ) entry
      union all
      select tag.value, 1
      from current_attempts a
      cross join lateral jsonb_array_elements_text(
        case when jsonb_typeof(a.payload->'assessment'->'weakness_tags') = 'array'
          then a.payload->'assessment'->'weakness_tags' else '[]'::jsonb end
      ) tag(value)
      where jsonb_typeof(a.payload->'feedback_weakness_tag_counts') is distinct from 'object'
        and jsonb_typeof(a.payload->'rich_feedback'->'weakness_tag_counts') is distinct from 'object'
    ), ranked as (
      select tag, sum(occurrence_count)::integer as count
      from tags
      where nullif(trim(tag), '') is not null
      group by tag
      order by count desc, tag
      limit 8
    )
    select
      coalesce(jsonb_agg(jsonb_build_object('tag', tag, 'count', count) order by count desc, tag), '[]'::jsonb) as focus_area_counts,
      coalesce(jsonb_agg(to_jsonb(tag) order by count desc, tag), '[]'::jsonb) as focus_tags
    from ranked
  ) focus on true
  left join lateral (
    select c.*
    from public.bh_writing_canonical_assessments c
    join public.bh_writing_attempts a on a.attempt_key = c.attempt_key
    where c.student_id = u.id
      and a.academic_year_id = year_row.id
      and a.created_at >= coalesce(ctx.context_start_at, year_row.starts_on::timestamptz)
      and (v_genre is null or lower(coalesce(c.assessment_payload->>'genre', c.assessment_payload #>> '{prompt_definition,genre}', '')) = v_genre)
    order by c.canonical_at desc, c.assessment_id desc
    limit 1
  ) latest_verified on true
  left join lateral (
    select c.*
    from public.bh_writing_canonical_assessments c
    join public.bh_writing_attempts a on a.attempt_key = c.attempt_key
    where c.student_id = u.id
      and a.academic_year_id = year_row.id
      and a.created_at >= coalesce(ctx.context_start_at, year_row.starts_on::timestamptz)
      and (v_genre is null or lower(coalesce(c.assessment_payload->>'genre', c.assessment_payload #>> '{prompt_definition,genre}', '')) = v_genre)
    order by c.canonical_at, c.assessment_id
    limit 1
  ) first_verified on true;

  select coalesce(jsonb_agg(
    class_item.value || jsonb_build_object(
      'submission_count', coalesce(stats.month_count, 0),
      'current_context_submission_count', coalesce(stats.context_count, 0),
      'historical_submission_count', coalesce(stats.historical_count, 0),
      'all_time_submission_count', coalesce(stats.all_time_count, 0)
    ) order by class_item.ordinality
  ), '[]'::jsonb)
  into v_class_rows
  from jsonb_array_elements(coalesce(v_base->'class_rows', '[]'::jsonb))
    with ordinality class_item(value, ordinality)
  left join lateral (
    select
      coalesce(sum((r.value->>'submission_count')::integer), 0)::integer as month_count,
      coalesce(sum((r.value->>'current_context_submission_count')::integer), 0)::integer as context_count,
      coalesce(sum((r.value->>'historical_submission_count')::integer), 0)::integer as historical_count,
      coalesce(sum((r.value->>'all_time_submission_count')::integer), 0)::integer as all_time_count
    from jsonb_array_elements(v_rows) r(value)
    where r.value->>'class_id' = class_item.value->>'class_id'
  ) stats on true;

  select coalesce(jsonb_agg(to_jsonb(tag) order by count desc, tag), '[]'::jsonb)
  into v_hotspots
  from (
    select f.value->>'tag' as tag,
      sum(coalesce((f.value->>'count')::integer, 0))::integer as count
    from jsonb_array_elements(v_rows) r(value)
    cross join lateral jsonb_array_elements(coalesce(r.value->'focus_area_counts', '[]'::jsonb)) f(value)
    where nullif(f.value->>'tag', '') is not null
    group by f.value->>'tag'
    order by count desc, tag
    limit 12
  ) ranked;

  select coalesce(jsonb_agg(to_jsonb(r.value->>'student_id') order by r.value->>'student_name'), '[]'::jsonb)
  into v_stalled
  from jsonb_array_elements(v_rows) r(value)
  where coalesce((r.value->>'stalled')::boolean, false);

  select coalesce(jsonb_agg(to_jsonb(r.value->>'student_id') order by r.value->>'student_name'), '[]'::jsonb)
  into v_review_ready
  from jsonb_array_elements(v_rows) r(value)
  where coalesce((r.value->>'ready_for_monthly_review')::boolean, false);

  return jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(v_base, '{student_rows}', v_rows, true),
          '{class_rows}', v_class_rows, true
        ),
        '{hotspot_tags}', v_hotspots, true
      ),
      '{stalled_students}', v_stalled, true
    ),
    '{monthly_review_ready_students}', v_review_ready, true
  ) || jsonb_build_object(
    'score_authority', 'canonical_v2_when_available_current_placement_only',
    'academic_context_policy', 'current_placement_for_status_historical_preserved'
  );
end;
$$;

revoke all on function public.rpc_bh_writing_teacher_monitoring(text, integer, text)
  from public, anon;
grant execute on function public.rpc_bh_writing_teacher_monitoring(text, integer, text)
  to authenticated, service_role;

comment on function public.rpc_student_academic_profile_for_year(uuid, text, uuid, timestamptz, timestamptz) is
  'Academic-year profile with current operational-year evidence clamped to the student current placement context; earlier placement evidence remains historical.';
comment on function public.rpc_teacher_student_intervention_pilot(uuid, text) is
  'Intervention pilot scoped to qualifying evidence from the student current placement context; historical placement signals are preserved but excluded from current recommendations.';
comment on function public.rpc_bh_writing_teacher_monitoring(text, integer, text) is
  'Writing monitor keeps all-time history visible while status, trend, weakness and support decisions use current-placement writing evidence only.';
