-- Fix rpc_bh_writing_teacher_analytics text/text[] COALESCE mismatch in retry-tag pipelines.
-- This keeps payload shape stable for frontend while hardening array handling.

create or replace function public.rpc_bh_writing_teacher_analytics(
  p_month text default null,
  p_grade int default null,
  p_genre text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  monitor jsonb;
  v_genre text := nullif(trim(p_genre), '');
begin
  monitor := public.rpc_bh_writing_teacher_monitoring(p_month, p_grade, p_genre);

  return (
    with roster as (
      select s.student_id
      from public.bh_writing_allowed_students() s
    ),
    rows as (
      select *
      from jsonb_to_recordset(coalesce(monitor->'student_rows', '[]'::jsonb))
        as x(student_id uuid, student_name text, current_grade int, completion_rate numeric, latest_score numeric, stalled boolean, improving boolean)
    ),
    weak as (
      select w.tag, count(*)::int as cnt
      from (
        select
          (rj->>'student_id')::uuid as student_id,
          tag
        from jsonb_array_elements(coalesce(monitor->'student_rows', '[]'::jsonb)) rj
        cross join lateral jsonb_array_elements_text(coalesce(rj->'repeated_weakness_hotspots', '[]'::jsonb)) tag
      ) w
      group by w.tag
      order by cnt desc
      limit 8
    ),
    attempts as (
      select
        (coalesce(a.payload->>'student_id', a.payload->>'user_id'))::uuid as student_id,
        nullif(trim(a.payload->>'revision_cycle_id'), '') as revision_cycle_id,
        case when jsonb_typeof(a.payload->'attempt_number') in ('number','string') then nullif(a.payload->>'attempt_number','')::int else null end as attempt_number,
        nullif(trim(a.payload->>'retry_kind'), '') as retry_kind,
        (a.payload->'assessment'->>'total_score')::numeric as total_score,
        case
          when jsonb_typeof(a.payload->'assessment'->'weakness_tags') = 'array'
            then coalesce(array(
              select jsonb_array_elements_text(a.payload->'assessment'->'weakness_tags')
            ), array[]::text[])
          else array[]::text[]
        end as weakness_tags,
        a.created_at
      from public.bh_writing_attempts a
      where (coalesce(a.payload->>'student_id', a.payload->>'user_id'))::uuid in (select student_id from roster)
        and (v_genre is null or a.payload->>'genre' = v_genre)
    ),
    retry_attempts as (
      select * from attempts where revision_cycle_id is not null
    ),
    cycles as (
      select
        student_id,
        revision_cycle_id,
        count(*)::int as attempt_count,
        count(*) filter (where retry_kind = 'same_prompt')::int as same_prompt_retry_count,
        count(*) filter (where retry_kind = 'new_prompt' and coalesce(attempt_number, 1) <= 1)::int as new_prompt_restart_count,
        (array_agg(total_score order by coalesce(attempt_number, 999), created_at))[1] as first_score,
        (array_agg(total_score order by coalesce(attempt_number, 999) desc, created_at desc))[1] as latest_score,
        (array_agg(weakness_tags order by coalesce(attempt_number, 999), created_at))[1] as first_tags,
        (array_agg(weakness_tags order by coalesce(attempt_number, 999) desc, created_at desc))[1] as latest_tags
      from retry_attempts
      group by student_id, revision_cycle_id
    ),
    cycles_enriched as (
      select
        c.*,
        round((coalesce(c.latest_score, 0) - coalesce(c.first_score, 0))::numeric, 2) as score_delta,
        (c.same_prompt_retry_count > 0) as has_same_prompt
      from cycles c
    ),
    retry_depth as (
      select attempt_count as attempts, count(*)::int as cycle_count
      from cycles_enriched
      group by attempt_count
      order by attempt_count
    ),
    repeated_cycle_tags as (
      select tag, count(*)::int as cnt
      from (
        select ce.student_id, ce.revision_cycle_id, t.tag
        from cycles_enriched ce
        cross join lateral unnest(case when ce.first_tags is null then array[]::text[] else ce.first_tags end) t(tag)
        where t.tag = any(case when ce.latest_tags is null then array[]::text[] else ce.latest_tags end)
      ) rt
      group by tag
      order by cnt desc
      limit 8
    ),
    student_retry as (
      select
        ce.student_id,
        count(*)::int as retry_cycle_count,
        round(avg(ce.attempt_count)::numeric, 2) as average_attempts_per_cycle,
        sum(ce.same_prompt_retry_count)::int as same_prompt_retry_count,
        sum(ce.new_prompt_restart_count)::int as new_prompt_restart_count,
        count(*) filter (where ce.has_same_prompt and ce.score_delta > 0)::int as improved_same_prompt_cycles,
        count(*) filter (where ce.has_same_prompt and ce.score_delta <= 0)::int as no_improvement_same_prompt_cycles,
        case when count(*) filter (where ce.has_same_prompt) > 0
          then round(avg(ce.score_delta) filter (where ce.has_same_prompt)::numeric, 2)
          else null::numeric
        end as average_same_prompt_score_delta,
        sum(ce.attempt_count)::int as retry_metadata_attempt_count,
        (
          count(*) >= 2
          and avg(ce.attempt_count) >= 2
          and coalesce(avg(ce.score_delta) filter (where ce.has_same_prompt), 0) <= 0
        ) as needs_intervention,
        (
          count(*) filter (where ce.has_same_prompt and ce.score_delta > 0) > 0
          and coalesce(avg(ce.score_delta) filter (where ce.has_same_prompt), 0) >= 0.5
          and avg(ce.attempt_count) <= 2
        ) as fast_gains
      from cycles_enriched ce
      group by ce.student_id
    ),
    class_retry as (
      select
        count(*)::int as retry_cycle_count,
        coalesce(round(avg(ce.attempt_count)::numeric, 2), 0) as average_attempts_per_cycle,
        coalesce(sum(ce.same_prompt_retry_count), 0)::int as same_prompt_retry_count,
        coalesce(sum(ce.new_prompt_restart_count), 0)::int as new_prompt_restart_count,
        count(*) filter (where ce.has_same_prompt and ce.score_delta > 0)::int as cycles_improved_count,
        count(*) filter (where ce.has_same_prompt and ce.score_delta <= 0)::int as cycles_not_improved_count,
        case when count(*) filter (where ce.has_same_prompt) > 0
          then round(avg(ce.score_delta) filter (where ce.has_same_prompt)::numeric, 2)
          else null::numeric
        end as average_same_prompt_score_delta,
        case when count(*) filter (where ce.has_same_prompt) > 0
          then round((count(*) filter (where ce.has_same_prompt and ce.score_delta > 0)::numeric / count(*) filter (where ce.has_same_prompt)::numeric), 2)
          else 0::numeric
        end as improved_cycle_rate
      from cycles_enriched ce
    ),
    retry_meta as (
      select
        (select count(*)::int from attempts) as total_attempts,
        (select count(*)::int from retry_attempts) as retry_metadata_attempts
    )
    select jsonb_build_object(
      'summary', jsonb_build_object(
        'total_students', (select count(*) from rows),
        'stalled_count', (select count(*) from rows where stalled),
        'improving_count', (select count(*) from rows where improving)
      ),
      'most_common_weakness_tags', coalesce((select jsonb_agg(jsonb_build_object('tag', tag, 'count', cnt)) from weak), '[]'::jsonb),
      'average_score_by_grade', coalesce((
        select jsonb_agg(jsonb_build_object('grade', ga.current_grade, 'average_score', ga.average_score))
        from (
          select current_grade, round(avg(latest_score)::numeric, 2) as average_score
          from rows
          where latest_score is not null
          group by current_grade
        ) ga
      ), '[]'::jsonb),
      'average_score_by_genre', '[]'::jsonb,
      'subscale_improvement_over_time', '[]'::jsonb,
      'prompt_effectiveness', '[]'::jsonb,
      'task_type_effectiveness', '[]'::jsonb,
      'pilot_readiness', jsonb_build_object(
        'monthly_comparison_ready_students', '[]'::jsonb,
        'incomplete_weekly_cycle_students', '[]'::jsonb,
        'overused_prompts', '[]'::jsonb,
        'low_improvement_target_tags', '[]'::jsonb
      ),
      'retry_insights', jsonb_build_object(
        'retry_metadata_attempts', (select retry_metadata_attempts from retry_meta),
        'total_attempts', (select total_attempts from retry_meta),
        'retry_metadata_coverage_rate', case when (select total_attempts from retry_meta) > 0
          then round(((select retry_metadata_attempts from retry_meta)::numeric / (select total_attempts from retry_meta)::numeric), 2)
          else 0::numeric
        end,
        'retry_cycle_count', coalesce((select retry_cycle_count from class_retry), 0),
        'average_attempts_per_cycle', coalesce((select average_attempts_per_cycle from class_retry), 0),
        'same_prompt_retry_count', coalesce((select same_prompt_retry_count from class_retry), 0),
        'new_prompt_restart_count', coalesce((select new_prompt_restart_count from class_retry), 0),
        'cycles_improved_count', coalesce((select cycles_improved_count from class_retry), 0),
        'cycles_not_improved_count', coalesce((select cycles_not_improved_count from class_retry), 0),
        'average_same_prompt_score_delta', (select average_same_prompt_score_delta from class_retry),
        'improved_cycle_rate', coalesce((select improved_cycle_rate from class_retry), 0),
        'retry_depth_distribution', coalesce((
          select jsonb_agg(jsonb_build_object('attempts', rd.attempts, 'cycle_count', rd.cycle_count) order by rd.attempts)
          from retry_depth rd
        ), '[]'::jsonb),
        'most_repeated_cycle_tags', coalesce((
          select jsonb_agg(jsonb_build_object('tag', rct.tag, 'count', rct.cnt)) from repeated_cycle_tags rct
        ), '[]'::jsonb),
        'students_needing_intervention', coalesce((
          select jsonb_agg(sr.student_id) from student_retry sr where sr.needs_intervention
        ), '[]'::jsonb),
        'students_showing_fast_gains', coalesce((
          select jsonb_agg(sr.student_id) from student_retry sr where sr.fast_gains
        ), '[]'::jsonb),
        'student_retry_profiles', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'student_id', sr.student_id,
              'retry_cycle_count', sr.retry_cycle_count,
              'average_attempts_per_cycle', sr.average_attempts_per_cycle,
              'same_prompt_retry_count', sr.same_prompt_retry_count,
              'new_prompt_restart_count', sr.new_prompt_restart_count,
              'improved_same_prompt_cycles', sr.improved_same_prompt_cycles,
              'no_improvement_same_prompt_cycles', sr.no_improvement_same_prompt_cycles,
              'average_same_prompt_score_delta', sr.average_same_prompt_score_delta,
              'recurring_mistake_tags', coalesce((
                select jsonb_agg(tag)
                from (
                  select tag
                  from (
                    select t.tag, count(*) as cnt
                    from cycles_enriched ce
                    cross join lateral unnest(case when ce.first_tags is null then array[]::text[] else ce.first_tags end) t(tag)
                    where ce.student_id = sr.student_id
                      and t.tag = any(case when ce.latest_tags is null then array[]::text[] else ce.latest_tags end)
                    group by t.tag
                    order by cnt desc
                    limit 4
                  ) top_tags
                ) final_tags
              ), '[]'::jsonb),
              'retry_metadata_attempt_count', sr.retry_metadata_attempt_count,
              'needs_intervention', sr.needs_intervention,
              'fast_gains', sr.fast_gains
            )
            order by sr.retry_cycle_count desc, sr.student_id
          )
          from student_retry sr
        ), '[]'::jsonb)
      )
    )
  );
end;
$$;

revoke all on function public.rpc_bh_writing_teacher_analytics(text, int, text) from public, anon;
grant execute on function public.rpc_bh_writing_teacher_analytics(text, int, text) to authenticated;
