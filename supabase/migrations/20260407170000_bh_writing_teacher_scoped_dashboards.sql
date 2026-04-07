-- Server-scoped teacher dashboard/analytics/calibration/export RPCs for Writing Hub

create or replace function public.bh_writing_allowed_students()
returns table(student_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select u.id, u.role, coalesce(u.is_admin, false) as is_admin, u.school_id
    from public.users u
    where u.id = auth.uid()
  )
  select distinct u.id
  from public.users u
  join me on true
  where (
    me.is_admin = true or me.role = 'admin'
  )
  and u.role = 'student'

  union

  select distinct u.id
  from public.users u
  join me on u.school_id = me.school_id
  where me.role = 'school_admin'
    and u.role = 'student'

  union

  select distinct cs.student_id
  from me
  join public.teachers t
    on t.user_id = me.id
  join public.class_teacher_assignments cta
    on cta.teacher_user_id = me.id
   and coalesce(cta.active, true) = true
  join public.classes c
    on c.id = cta.class_id
   and c.school_id = me.school_id
  join public.class_students cs
    on cs.class_id = cta.class_id
  where me.role = 'teacher';
$$;

comment on function public.bh_writing_allowed_students()
  is 'Returns roster-scoped writing student ids for current actor (admin/school_admin/teacher).';

drop function if exists public.rpc_bh_writing_teacher_monitoring(text);
create or replace function public.rpc_bh_writing_teacher_monitoring(
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
  v_month text := coalesce(nullif(trim(p_month), ''), to_char(now(), 'YYYY-MM'));
  v_genre text := nullif(trim(p_genre), '');
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  return (
    with roster as (
      select s.student_id
      from public.bh_writing_allowed_students() s
    ),
    state_rows as (
      select
        r.student_id,
        u.username as student_name,
        coalesce((sp.profile->>'grade')::int, nullif(u.grade::text, '')::int) as grade,
        ss.state as state_json
      from roster r
      join public.users u on u.id = r.student_id
      left join public.bh_writing_student_profiles sp on sp.student_id = r.student_id
      left join public.bh_writing_student_states ss on ss.student_id = r.student_id
      where (p_grade is null or coalesce((sp.profile->>'grade')::int, nullif(u.grade::text, '')::int) = p_grade)
        and (
          v_genre is null
          or coalesce(sp.profile->>'current_genre', sp.profile->>'genre', ss.state->>'current_genre') = v_genre
        )
    ),
    latest_scores as (
      select distinct on ((coalesce(a.payload->>'student_id', a.payload->>'user_id'))::uuid)
        (coalesce(a.payload->>'student_id', a.payload->>'user_id'))::uuid as student_id,
        (a.payload->'assessment'->>'total_score')::numeric as latest_score
      from public.bh_writing_attempts a
      where (coalesce(a.payload->>'student_id', a.payload->>'user_id'))::uuid in (select student_id from roster)
        and (v_genre is null or a.payload->>'genre' = v_genre)
      order by (coalesce(a.payload->>'student_id', a.payload->>'user_id'))::uuid, a.created_at desc
    ),
    rows as (
      select
        sr.student_id,
        coalesce(sr.student_name, 'Student') as student_name,
        sr.grade as current_grade,
        case
          when sr.state_json ? 'active_daily_tasks' and jsonb_array_length(sr.state_json->'active_daily_tasks') > 0
            then round((coalesce(jsonb_array_length(sr.state_json->'completed_daily_tasks'), 0)::numeric / jsonb_array_length(sr.state_json->'active_daily_tasks')::numeric)::numeric, 2)
          else 0::numeric
        end as completion_rate,
        rs.latest_score,
        coalesce(
          (
            select array_agg(key order by (value::int) desc)
            from jsonb_each_text(coalesce(sr.state_json->'repeated_error_memory'->'byStudent'->(sr.student_id::text)->'tagCounts', '{}'::jsonb))
          ),
          '{}'::text[]
        ) as weakness_hotspots
      from state_rows sr
      left join latest_scores rs on rs.student_id = sr.student_id
    )
    select jsonb_build_object(
      'student_rows', coalesce(jsonb_agg(
        jsonb_build_object(
          'student_name', r.student_name,
          'student_id', r.student_id,
          'current_grade', r.current_grade,
          'completion_rate', r.completion_rate,
          'latest_score', r.latest_score,
          'latest_subscale_scores', jsonb_build_object('content', null, 'communicative_achievement', null, 'organisation', null, 'language', null),
          'subscale_trend', jsonb_build_object('content', 0, 'communicative_achievement', 0, 'organisation', 0, 'language', 0),
          'repeated_weakness_hotspots', coalesce(to_jsonb(r.weakness_hotspots), '[]'::jsonb),
          'weekly_target_summary', 'See secure student summary',
          'stalled', r.completion_rate < 0.4,
          'improving', r.completion_rate >= 0.7,
          'ready_for_monthly_review', false
        )
      ), '[]'::jsonb),
      'hotspot_tags', '[]'::jsonb,
      'stalled_students', '[]'::jsonb,
      'monthly_review_ready_students', '[]'::jsonb
    )
    from rows r
  );
end;
$$;

drop function if exists public.rpc_bh_writing_teacher_analytics(text);
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
begin
  monitor := public.rpc_bh_writing_teacher_monitoring(p_month, p_grade, p_genre);

  return (
    with rows as (
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
    )
    select jsonb_build_object(
      'summary', jsonb_build_object(
        'total_students', (select count(*) from rows),
        'stalled_count', (select count(*) from rows where stalled),
        'improving_count', (select count(*) from rows where improving)
      ),
      'most_common_weakness_tags', coalesce((select jsonb_agg(jsonb_build_object('tag', tag, 'count', cnt)) from weak), '[]'::jsonb),
      'average_score_by_grade', coalesce((
        select jsonb_agg(jsonb_build_object('grade', current_grade, 'average_score', round(avg(latest_score)::numeric, 2)))
        from rows
        where latest_score is not null
        group by current_grade
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
      )
    )
  );
end;
$$;

create or replace function public.rpc_bh_writing_teacher_calibration_queue(
  p_month text default null,
  p_limit int default 50
)
returns jsonb
language plpgsql
security definer
set search_path = public
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
        coalesce(u.username, 'Student') as student_name,
        coalesce((sp.profile->>'grade')::int, nullif(u.grade::text, '')::int) as grade
      from roster r
      join public.users u on u.id = r.student_id
      left join public.bh_writing_student_profiles sp on sp.student_id = r.student_id
      order by coalesce(u.username, 'Student'), r.student_id
      limit greatest(coalesce(p_limit, 50), 1)
    )
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'student_id', row.student_id,
        'student_name', row.student_name,
        'grade', row.grade,
        'latest_score', null,
        'priority_weak_areas', '[]'::jsonb,
        'completion_rate', 0
      )
    ), '[]'::jsonb)
    from rows row
  );
end;
$$;

create or replace function public.rpc_bh_writing_teacher_export_rows(p_month text default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'student_id', (row->>'student_id'),
          'student_name', (row->>'student_name'),
          'grade', (row->>'current_grade')::int,
          'completion_rate', coalesce((row->>'completion_rate')::numeric, 0),
          'latest_score', case when row ? 'latest_score' then (row->>'latest_score')::numeric else null end
        )
      )
      from jsonb_array_elements(coalesce(public.rpc_bh_writing_teacher_monitoring(p_month, null, null)->'student_rows', '[]'::jsonb)) row
    ),
    '[]'::jsonb
  );
$$;

create or replace function public.rpc_bh_writing_teacher_student_summary(
  p_student_id uuid,
  p_month text default null,
  p_genre text default null,
  p_include_snippet boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if to_regprocedure('public.rpc_bh_writing_teacher_report(uuid,text,text,boolean)') is null then
    raise exception 'Missing dependency: public.rpc_bh_writing_teacher_report(uuid,text,text,boolean)';
  end if;

  execute
    'select public.rpc_bh_writing_teacher_report($1, $2, $3, $4)'
    into v_result
    using p_student_id, p_month, p_genre, p_include_snippet;

  return v_result;
end;
$$;

revoke all on function public.bh_writing_allowed_students() from public, anon;
grant execute on function public.bh_writing_allowed_students() to authenticated;

revoke all on function public.rpc_bh_writing_teacher_monitoring(text, int, text) from public, anon;
grant execute on function public.rpc_bh_writing_teacher_monitoring(text, int, text) to authenticated;

revoke all on function public.rpc_bh_writing_teacher_analytics(text, int, text) from public, anon;
grant execute on function public.rpc_bh_writing_teacher_analytics(text, int, text) to authenticated;

revoke all on function public.rpc_bh_writing_teacher_calibration_queue(text, int) from public, anon;
grant execute on function public.rpc_bh_writing_teacher_calibration_queue(text, int) to authenticated;

revoke all on function public.rpc_bh_writing_teacher_export_rows(text) from public, anon;
grant execute on function public.rpc_bh_writing_teacher_export_rows(text) to authenticated;

revoke all on function public.rpc_bh_writing_teacher_student_summary(uuid, text, text, boolean) from public, anon;
grant execute on function public.rpc_bh_writing_teacher_student_summary(uuid, text, text, boolean) to authenticated;
