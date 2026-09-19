-- The legacy writing monitor preferred profile.profile.grade over the live class
-- grade. After a class move that left otherwise-correct students invisible from
-- their current grade filter. Load the authorized roster without that stale
-- grade filter, then apply the authoritative current-placement grade here.

create or replace function public.rpc_bh_writing_teacher_monitoring(
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

  -- Deliberately do not pass p_grade to the legacy layer. That layer can carry
  -- an old grade inside bh_writing_student_profiles.profile. The authoritative
  -- grade filter is applied below from student_current_academic_context.
  v_base := public.rpc_bh_writing_teacher_monitoring_pre_context_20260919(
    p_month, null, p_genre
  );

  select coalesce(jsonb_agg(
    row_item.value || jsonb_build_object(
      'current_grade', coalesce(
        case when ctx.grade_level ~ '^\d+$' then ctx.grade_level::integer end,
        (row_item.value->>'current_grade')::integer
      ),
      'class_name', coalesce(nullif(ctx.class_code, ''), row_item.value->>'class_name'),
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
        'content', coalesce(coalesce(latest_verified.content_score::numeric, cur.latest_content) - coalesce(first_verified.content_score::numeric, cur.first_content), 0),
        'communicative_achievement', coalesce(coalesce(latest_verified.communicative_achievement_score::numeric, cur.latest_communicative) - coalesce(first_verified.communicative_achievement_score::numeric, cur.first_communicative), 0),
        'organisation', coalesce(coalesce(latest_verified.organisation_score::numeric, cur.latest_organisation) - coalesce(first_verified.organisation_score::numeric, cur.first_organisation), 0),
        'language', coalesce(coalesce(latest_verified.language_score::numeric, cur.latest_language) - coalesce(first_verified.language_score::numeric, cur.first_language), 0)
      ),
      'repeated_weakness_hotspots', coalesce(focus.focus_tags, '[]'::jsonb),
      'focus_area_counts', coalesce(focus.focus_area_counts, '[]'::jsonb),
      'weekly_target_summary', case
        when jsonb_array_length(coalesce(focus.focus_area_counts, '[]'::jsonb)) > 0
          then 'Prioritize ' || replace(focus.focus_area_counts->0->>'tag', '_', ' ')
        else 'Build enough current-placement writing evidence to identify a focus area'
      end,
      'stalled', coalesce(cur.context_count, 0) >= 2
        and coalesce(latest_verified.total_score::numeric, cur.latest_score) is not null
        and coalesce(first_verified.total_score::numeric, cur.first_score) is not null
        and coalesce(latest_verified.total_score::numeric, cur.latest_score) - coalesce(first_verified.total_score::numeric, cur.first_score) <= 0,
      'improving', coalesce(cur.context_count, 0) >= 2
        and coalesce(latest_verified.total_score::numeric, cur.latest_score) is not null
        and coalesce(first_verified.total_score::numeric, cur.first_score) is not null
        and coalesce(latest_verified.total_score::numeric, cur.latest_score) - coalesce(first_verified.total_score::numeric, cur.first_score) > 0,
      'ready_for_monthly_review', coalesce(cur.month_count, 0) >= 2,
      'status', case
        when coalesce(cur.context_count, 0) = 0 then 'not_started'
        when coalesce(cur.latest_payload->'integrity'->>'review_status', cur.latest_payload->'integrity_signals'->>'review_status') = 'review_recommended' then 'needs_review'
        when coalesce(cur.context_count, 0) >= 2
          and coalesce(latest_verified.total_score::numeric, cur.latest_score) is not null
          and coalesce(first_verified.total_score::numeric, cur.first_score) is not null
          and coalesce(latest_verified.total_score::numeric, cur.latest_score) - coalesce(first_verified.total_score::numeric, cur.first_score) > 0 then 'improving'
        when coalesce(latest_verified.total_score::numeric, cur.latest_score) is not null
          and coalesce(latest_verified.total_score::numeric, cur.latest_score) < 14 then 'needs_support'
        else 'on_track'
      end,
      'status_reason', case
        when coalesce(cur.context_count, 0) = 0 and coalesce((row_item.value->>'all_time_submission_count')::integer, 0) > 0 then 'No writing has been submitted in the current placement yet. Earlier writing remains archived and does not affect current support status.'
        when coalesce(cur.context_count, 0) = 0 then 'No writing has been submitted in the current placement yet.'
        when coalesce(cur.context_count, 0) = 1 then 'A current-placement baseline is available; another comparable submission will show progress.'
        when coalesce(latest_verified.total_score::numeric, cur.latest_score) is not null and coalesce(first_verified.total_score::numeric, cur.first_score) is not null and coalesce(latest_verified.total_score::numeric, cur.latest_score) - coalesce(first_verified.total_score::numeric, cur.first_score) > 0 then 'The latest current-placement writing evidence has improved.'
        when coalesce(latest_verified.total_score::numeric, cur.latest_score) is not null and coalesce(latest_verified.total_score::numeric, cur.latest_score) < 14 then 'The latest current-placement writing evidence shows focus areas that need teacher support.'
        else 'The current-placement writing evidence is stable.'
      end,
      'latest_attempt_at', cur.latest_attempt_at,
      'latest_integrity_signals', coalesce(cur.latest_payload->'integrity_signals', cur.latest_payload->'integrity', 'null'::jsonb),
      'assessment_authority', case
        when latest_verified.assessment_id is not null then latest_verified.canonical_status
        when coalesce(cur.context_count, 0) > 0 then 'legacy_estimate'
        else 'no_current_context_evidence'
      end
    ) order by row_item.ordinality
  ), '[]'::jsonb)
  into v_rows
  from jsonb_array_elements(coalesce(v_base->'student_rows', '[]'::jsonb)) with ordinality row_item(value, ordinality)
  left join public.users u on u.id = nullif(row_item.value->>'student_id', '')::uuid
  left join public.school_academic_years year_row on year_row.id = public.academic_resolve_operational_year_id(u.school_id, now())
  left join lateral private.student_current_academic_context(u.id, year_row.id) ctx on true
  left join lateral (
    with attempts as (
      select a.id,a.payload,a.created_at,
        case when a.payload #>> '{assessment,total_score}' ~ '^-?\d+(\.\d+)?$' then (a.payload #>> '{assessment,total_score}')::numeric end total_score,
        case when a.payload #>> '{assessment,subscores,content}' ~ '^-?\d+(\.\d+)?$' then (a.payload #>> '{assessment,subscores,content}')::numeric end content_score,
        case when a.payload #>> '{assessment,subscores,communicative_achievement}' ~ '^-?\d+(\.\d+)?$' then (a.payload #>> '{assessment,subscores,communicative_achievement}')::numeric end communicative_score,
        case when coalesce(a.payload #>> '{assessment,subscores,organisation}',a.payload #>> '{assessment,subscores,organization}') ~ '^-?\d+(\.\d+)?$' then coalesce(a.payload #>> '{assessment,subscores,organisation}',a.payload #>> '{assessment,subscores,organization}')::numeric end organisation_score,
        case when a.payload #>> '{assessment,subscores,language}' ~ '^-?\d+(\.\d+)?$' then (a.payload #>> '{assessment,subscores,language}')::numeric end language_score
      from public.bh_writing_attempts a
      where coalesce(a.payload->>'student_id',a.payload->>'user_id') = row_item.value->>'student_id'
        and a.academic_year_id = year_row.id
        and a.created_at >= coalesce(ctx.context_start_at, year_row.starts_on::timestamptz)
        and (v_genre is null or lower(coalesce(a.payload->>'genre','')) = v_genre)
    )
    select count(*)::integer context_count,
      count(*) filter (where to_char(created_at,'YYYY-MM')=v_month)::integer month_count,
      count(*) filter (where to_char(created_at,'YYYY-MM')=v_month and coalesce(payload->>'attempt_type','')='initial_assessment')::integer baseline_month_count,
      (array_agg(total_score order by created_at desc,id desc))[1] latest_score,
      (array_agg(total_score order by created_at,id))[1] first_score,
      (array_agg(content_score order by created_at desc,id desc))[1] latest_content,
      (array_agg(content_score order by created_at,id))[1] first_content,
      (array_agg(communicative_score order by created_at desc,id desc))[1] latest_communicative,
      (array_agg(communicative_score order by created_at,id))[1] first_communicative,
      (array_agg(organisation_score order by created_at desc,id desc))[1] latest_organisation,
      (array_agg(organisation_score order by created_at,id))[1] first_organisation,
      (array_agg(language_score order by created_at desc,id desc))[1] latest_language,
      (array_agg(language_score order by created_at,id))[1] first_language,
      max(created_at) latest_attempt_at,
      (array_agg(payload order by created_at desc,id desc))[1] latest_payload
    from attempts
  ) cur on true
  left join lateral (
    with current_attempts as (
      select a.payload from public.bh_writing_attempts a
      where coalesce(a.payload->>'student_id',a.payload->>'user_id')=row_item.value->>'student_id'
        and a.academic_year_id=year_row.id
        and a.created_at>=coalesce(ctx.context_start_at,year_row.starts_on::timestamptz)
        and (v_genre is null or lower(coalesce(a.payload->>'genre',''))=v_genre)
    ), tags as (
      select entry.key tag,greatest(1,case when entry.value #>> '{}' ~ '^\d+$' then (entry.value #>> '{}')::integer else 1 end) occurrence_count
      from current_attempts a cross join lateral jsonb_each(case when jsonb_typeof(a.payload->'feedback_weakness_tag_counts')='object' then a.payload->'feedback_weakness_tag_counts' when jsonb_typeof(a.payload->'rich_feedback'->'weakness_tag_counts')='object' then a.payload->'rich_feedback'->'weakness_tag_counts' else '{}'::jsonb end) entry
      union all
      select tag.value,1 from current_attempts a cross join lateral jsonb_array_elements_text(case when jsonb_typeof(a.payload->'assessment'->'weakness_tags')='array' then a.payload->'assessment'->'weakness_tags' else '[]'::jsonb end) tag(value)
      where jsonb_typeof(a.payload->'feedback_weakness_tag_counts') is distinct from 'object' and jsonb_typeof(a.payload->'rich_feedback'->'weakness_tag_counts') is distinct from 'object'
    ), ranked as (
      select tag,sum(occurrence_count)::integer count from tags where nullif(trim(tag),'') is not null group by tag order by count desc,tag limit 8
    )
    select coalesce(jsonb_agg(jsonb_build_object('tag',tag,'count',count) order by count desc,tag),'[]'::jsonb) focus_area_counts,
      coalesce(jsonb_agg(to_jsonb(tag) order by count desc,tag),'[]'::jsonb) focus_tags from ranked
  ) focus on true
  left join lateral (
    select c.* from public.bh_writing_canonical_assessments c join public.bh_writing_attempts a on a.attempt_key=c.attempt_key
    where c.student_id=u.id and a.academic_year_id=year_row.id and a.created_at>=coalesce(ctx.context_start_at,year_row.starts_on::timestamptz)
      and (v_genre is null or lower(coalesce(c.assessment_payload->>'genre',c.assessment_payload #>> '{prompt_definition,genre}',''))=v_genre)
    order by c.canonical_at desc,c.assessment_id desc limit 1
  ) latest_verified on true
  left join lateral (
    select c.* from public.bh_writing_canonical_assessments c join public.bh_writing_attempts a on a.attempt_key=c.attempt_key
    where c.student_id=u.id and a.academic_year_id=year_row.id and a.created_at>=coalesce(ctx.context_start_at,year_row.starts_on::timestamptz)
      and (v_genre is null or lower(coalesce(c.assessment_payload->>'genre',c.assessment_payload #>> '{prompt_definition,genre}',''))=v_genre)
    order by c.canonical_at,c.assessment_id limit 1
  ) first_verified on true
  where p_grade is null
     or (ctx.grade_level ~ '^\d+$' and ctx.grade_level::integer = p_grade);

  select coalesce(jsonb_agg(class_item.value || jsonb_build_object(
    'submission_count',coalesce(stats.month_count,0),
    'current_context_submission_count',coalesce(stats.context_count,0),
    'historical_submission_count',coalesce(stats.historical_count,0),
    'all_time_submission_count',coalesce(stats.all_time_count,0)
  ) order by class_item.ordinality),'[]'::jsonb) into v_class_rows
  from jsonb_array_elements(coalesce(v_base->'class_rows','[]'::jsonb)) with ordinality class_item(value,ordinality)
  left join lateral (
    select coalesce(sum((r.value->>'submission_count')::integer),0)::integer month_count,
      coalesce(sum((r.value->>'current_context_submission_count')::integer),0)::integer context_count,
      coalesce(sum((r.value->>'historical_submission_count')::integer),0)::integer historical_count,
      coalesce(sum((r.value->>'all_time_submission_count')::integer),0)::integer all_time_count
    from jsonb_array_elements(v_rows) r(value) where r.value->>'class_id'=class_item.value->>'class_id'
  ) stats on true
  where p_grade is null or coalesce((class_item.value->>'current_grade')::integer,-1)=p_grade;

  select coalesce(jsonb_agg(to_jsonb(tag) order by count desc,tag),'[]'::jsonb) into v_hotspots
  from (select f.value->>'tag' tag,sum(coalesce((f.value->>'count')::integer,0))::integer count
    from jsonb_array_elements(v_rows) r(value) cross join lateral jsonb_array_elements(coalesce(r.value->'focus_area_counts','[]'::jsonb)) f(value)
    where nullif(f.value->>'tag','') is not null group by f.value->>'tag' order by count desc,tag limit 12) ranked;

  select coalesce(jsonb_agg(to_jsonb(r.value->>'student_id') order by r.value->>'student_name'),'[]'::jsonb) into v_stalled
  from jsonb_array_elements(v_rows) r(value) where coalesce((r.value->>'stalled')::boolean,false);
  select coalesce(jsonb_agg(to_jsonb(r.value->>'student_id') order by r.value->>'student_name'),'[]'::jsonb) into v_review_ready
  from jsonb_array_elements(v_rows) r(value) where coalesce((r.value->>'ready_for_monthly_review')::boolean,false);

  return jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(v_base,'{student_rows}',v_rows,true),'{class_rows}',v_class_rows,true),'{hotspot_tags}',v_hotspots,true),'{stalled_students}',v_stalled,true),'{monthly_review_ready_students}',v_review_ready,true)
    || jsonb_build_object(
      'score_authority','canonical_v2_when_available_current_placement_only',
      'academic_context_policy','current_placement_for_status_historical_preserved',
      'roster_grade_authority','current_academic_placement'
    );
end;
$$;

revoke all on function public.rpc_bh_writing_teacher_monitoring(text, integer, text) from public, anon;
grant execute on function public.rpc_bh_writing_teacher_monitoring(text, integer, text) to authenticated, service_role;

comment on function public.rpc_bh_writing_teacher_monitoring(text, integer, text) is
  'Writing monitor uses authoritative current placement for roster grade/class, preserves all-time history, and derives current support/trend only from current-placement writing evidence.';
