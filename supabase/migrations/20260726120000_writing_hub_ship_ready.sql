-- Writing Hub ship-readiness release
-- - student-safe access to the approved prompt bank
-- - accurate teacher monitoring across per-genre state
-- - real month, class, score, rubric, trend, hotspot, and prompt analytics
-- - hardened function search paths and explicit execute grants

create or replace function public.can_access_bh_writing_student(p_student_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  with me as (
    select u.id, u.role, coalesce(u.is_admin, false) as is_admin, u.school_id
    from public.users u
    where u.id = (select auth.uid())
  ),
  target as (
    select u.id, u.school_id
    from public.users u
    where u.id = p_student_id
  )
  select
    exists (
      select 1 from me where is_admin = true or role = 'admin'
    )
    or exists (
      select 1
      from me
      join target on target.school_id = me.school_id
      where me.role = 'school_admin'
    )
    or exists (
      select 1
      from me
      join target on target.school_id = me.school_id
      join public.teachers t on t.user_id = me.id
      join public.class_teacher_assignments cta
        on cta.teacher_user_id = me.id
       and coalesce(cta.active, true) = true
      join public.classes c
        on c.id = cta.class_id
       and c.school_id = me.school_id
      join public.class_students cs
        on cs.class_id = cta.class_id
       and cs.student_id = target.id
      where me.role = 'teacher'
    );
$$;

create or replace function public.bh_writing_allowed_students()
returns table(student_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select u.id, u.role, coalesce(u.is_admin, false) as is_admin, u.school_id
    from public.users u
    where u.id = (select auth.uid())
  )
  select distinct u.id
  from public.users u
  join me on true
  where (me.is_admin = true or me.role = 'admin')
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
  join public.teachers t on t.user_id = me.id
  join public.class_teacher_assignments cta
    on cta.teacher_user_id = me.id
   and coalesce(cta.active, true) = true
  join public.classes c
    on c.id = cta.class_id
   and c.school_id = me.school_id
  join public.class_students cs on cs.class_id = cta.class_id
  where me.role = 'teacher';
$$;

create or replace function public.rpc_bh_writing_student_prompt(
  p_grade integer,
  p_genre text,
  p_current_prompt_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student_id uuid := (select auth.uid());
  v_prompt jsonb;
  v_pool_size integer := 0;
begin
  if v_student_id is null then
    raise exception 'Not authenticated';
  end if;
  if p_grade is null or p_grade < 6 or p_grade > 12 then
    raise exception 'Grade must be between 6 and 12';
  end if;
  if p_genre not in ('email', 'article', 'review', 'story', 'essay', 'report', 'paragraph') then
    raise exception 'Unsupported writing genre';
  end if;

  with eligible as (
    select
      pb.payload,
      coalesce(nullif(pb.payload->>'id', ''), pb.id::text) as prompt_id,
      (
        select count(*)::integer
        from public.bh_writing_attempts a
        where coalesce(a.payload->>'student_id', a.payload->>'user_id') = v_student_id::text
          and a.payload->>'prompt_id' = coalesce(nullif(pb.payload->>'id', ''), pb.id::text)
      ) as student_usage
    from public.bh_writing_prompt_bank pb
    where coalesce((pb.payload->>'is_active')::boolean, false) = true
      and coalesce((pb.payload->>'is_archived')::boolean, false) = false
      and pb.payload->>'safety_status' = 'approved'
      and coalesce(pb.payload->>'prompt_quality_flag', 'ok') = 'ok'
      and pb.payload->>'genre' = p_genre
      and split_part(pb.payload->>'grade_band', '-', 1) ~ '^[0-9]+$'
      and split_part(pb.payload->>'grade_band', '-', 2) ~ '^[0-9]+$'
      and p_grade between split_part(pb.payload->>'grade_band', '-', 1)::integer
                      and split_part(pb.payload->>'grade_band', '-', 2)::integer
  ),
  counted as (
    select *, count(*) over ()::integer as pool_size
    from eligible
  )
  select
    jsonb_build_object(
      'prompt_id', c.prompt_id,
      'prompt_text', c.payload->>'prompt_text',
      'title', c.payload->>'title',
      'genre', c.payload->>'genre',
      'difficulty_label', coalesce(c.payload->>'difficulty_label', 'core'),
      'target_word_count', coalesce((c.payload->>'target_word_count')::integer, case when p_grade <= 7 then 80 when p_grade <= 9 then 120 else 160 end),
      'focus_tags', coalesce(c.payload->'focus_tags', '[]'::jsonb),
      'context_tags', coalesce(c.payload->'context_tags', '[]'::jsonb),
      'curriculum_tags', coalesce(c.payload->'curriculum_tags', '[]'::jsonb),
      'pool_size', c.pool_size
    ),
    c.pool_size
  into v_prompt, v_pool_size
  from counted c
  order by
    case when c.prompt_id = nullif(trim(p_current_prompt_id), '') then 1 else 0 end,
    c.student_usage,
    coalesce((c.payload->>'usage_count')::integer, 0),
    md5(v_student_id::text || current_date::text || c.prompt_id)
  limit 1;

  if v_prompt is null then
    return null;
  end if;
  return v_prompt || jsonb_build_object('pool_size', v_pool_size);
end;
$$;

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
  v_month text := coalesce(nullif(trim(p_month), ''), to_char(now(), 'YYYY-MM'));
  v_genre text := nullif(trim(p_genre), '');
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated';
  end if;
  if v_month !~ '^[0-9]{4}-[0-9]{2}$' then
    raise exception 'Invalid month key';
  end if;

  return (
    with roster as (
      select
        s.student_id,
        coalesce(nullif(u.full_name, ''), nullif(u.username, ''), 'Student') as student_name,
        coalesce(
          sp.grade,
          case when u.grade ~ '^[0-9]+$' then u.grade::integer else null end
        ) as current_grade
      from public.bh_writing_allowed_students() s
      join public.users u on u.id = s.student_id
      left join public.bh_writing_student_profiles sp on sp.student_id = s.student_id
      where p_grade is null
         or coalesce(sp.grade, case when u.grade ~ '^[0-9]+$' then u.grade::integer else null end) = p_grade
    ),
    class_info as (
      select
        r.student_id,
        string_agg(distinct c.class_name, ', ' order by c.class_name) as class_name
      from roster r
      left join public.class_students cs on cs.student_id = r.student_id
      left join public.classes c on c.id = cs.class_id and coalesce(c.is_active, true) = true
      group by r.student_id
    ),
    state_lanes as (
      select r.student_id, lane.key as genre, lane.value as lane_state
      from roster r
      left join public.bh_writing_student_states ss on ss.student_id = r.student_id
      left join lateral jsonb_each(
        case
          when jsonb_typeof(ss.state->'by_genre') = 'object' then ss.state->'by_genre'
          else '{}'::jsonb
        end
      ) lane on true
      where v_genre is null or lane.key = v_genre
    ),
    task_stats as (
      select
        sl.student_id,
        coalesce(sum(case when jsonb_typeof(sl.lane_state->'active_daily_tasks') = 'array' then jsonb_array_length(sl.lane_state->'active_daily_tasks') else 0 end), 0)::integer as total_tasks,
        coalesce(sum(case when jsonb_typeof(sl.lane_state->'completed_daily_tasks') = 'array' then jsonb_array_length(sl.lane_state->'completed_daily_tasks') else 0 end), 0)::integer as completed_tasks,
        nullif(string_agg(distinct nullif(concat_ws(' • ',
          nullif(sl.lane_state->'active_week_plan'->>'primary_target', ''),
          nullif(sl.lane_state->'active_week_plan'->>'secondary_target', '')
        ), ''), ' | '), '') as weekly_target_summary
      from state_lanes sl
      group by sl.student_id
    ),
    attempts as (
      select
        a.id,
        (coalesce(a.payload->>'student_id', a.payload->>'user_id'))::uuid as student_id,
        a.payload,
        a.payload->>'genre' as genre,
        nullif(a.payload->>'prompt_id', '') as prompt_id,
        nullif(a.payload->'assessment'->>'total_score', '')::numeric as total_score,
        nullif(a.payload->'assessment'->'subscores'->>'content', '')::numeric as content_score,
        nullif(a.payload->'assessment'->'subscores'->>'communicative_achievement', '')::numeric as communicative_score,
        nullif(a.payload->'assessment'->'subscores'->>'organisation', '')::numeric as organisation_score,
        nullif(a.payload->'assessment'->'subscores'->>'language', '')::numeric as language_score,
        a.created_at
      from public.bh_writing_attempts a
      where coalesce(a.payload->>'student_id', a.payload->>'user_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and (coalesce(a.payload->>'student_id', a.payload->>'user_id'))::uuid in (select student_id from roster)
        and to_char(a.created_at, 'YYYY-MM') = v_month
        and (v_genre is null or a.payload->>'genre' = v_genre)
    ),
    ranked_attempts as (
      select
        a.*,
        row_number() over (partition by a.student_id order by a.created_at desc, a.id desc) as latest_rank,
        row_number() over (partition by a.student_id order by a.created_at asc, a.id asc) as first_rank
      from attempts a
    ),
    attempt_stats as (
      select
        ra.student_id,
        count(*)::integer as attempts_count,
        max(ra.total_score) filter (where ra.latest_rank = 1) as latest_score,
        max(ra.total_score) filter (where ra.first_rank = 1) as first_score,
        max(ra.content_score) filter (where ra.latest_rank = 1) as latest_content,
        max(ra.communicative_score) filter (where ra.latest_rank = 1) as latest_communicative,
        max(ra.organisation_score) filter (where ra.latest_rank = 1) as latest_organisation,
        max(ra.language_score) filter (where ra.latest_rank = 1) as latest_language,
        max(ra.content_score) filter (where ra.first_rank = 1) as first_content,
        max(ra.communicative_score) filter (where ra.first_rank = 1) as first_communicative,
        max(ra.organisation_score) filter (where ra.first_rank = 1) as first_organisation,
        max(ra.language_score) filter (where ra.first_rank = 1) as first_language
      from ranked_attempts ra
      group by ra.student_id
    ),
    weakness_counts as (
      select
        a.student_id,
        tag.value as tag,
        count(*)::integer as tag_count
      from attempts a
      cross join lateral jsonb_array_elements_text(
        case
          when jsonb_typeof(a.payload->'assessment'->'weakness_tags') = 'array'
            then a.payload->'assessment'->'weakness_tags'
          else '[]'::jsonb
        end
      ) tag(value)
      group by a.student_id, tag.value
    ),
    weakness_by_student as (
      select
        wc.student_id,
        array_agg(wc.tag order by wc.tag_count desc, wc.tag) as weakness_hotspots
      from weakness_counts wc
      group by wc.student_id
    ),
    rows as (
      select
        r.student_id,
        r.student_name,
        r.current_grade,
        coalesce(ci.class_name, 'Unassigned') as class_name,
        coalesce(ts.total_tasks, 0) as total_tasks,
        coalesce(ts.completed_tasks, 0) as completed_tasks,
        case
          when coalesce(ts.total_tasks, 0) > 0
            then round(least(1, ts.completed_tasks::numeric / ts.total_tasks::numeric), 2)
          when coalesce(ast.attempts_count, 0) > 0 then 1::numeric
          else 0::numeric
        end as completion_rate,
        coalesce(ast.attempts_count, 0) as attempts_count,
        ast.latest_score,
        case when coalesce(ast.attempts_count, 0) >= 2 then ast.latest_score - ast.first_score else null end as score_delta,
        ast.latest_content,
        ast.latest_communicative,
        ast.latest_organisation,
        ast.latest_language,
        case when coalesce(ast.attempts_count, 0) >= 2 then coalesce(ast.latest_content, 0) - coalesce(ast.first_content, 0) else 0 end as content_delta,
        case when coalesce(ast.attempts_count, 0) >= 2 then coalesce(ast.latest_communicative, 0) - coalesce(ast.first_communicative, 0) else 0 end as communicative_delta,
        case when coalesce(ast.attempts_count, 0) >= 2 then coalesce(ast.latest_organisation, 0) - coalesce(ast.first_organisation, 0) else 0 end as organisation_delta,
        case when coalesce(ast.attempts_count, 0) >= 2 then coalesce(ast.latest_language, 0) - coalesce(ast.first_language, 0) else 0 end as language_delta,
        coalesce(wbs.weakness_hotspots, '{}'::text[]) as weakness_hotspots,
        coalesce(ts.weekly_target_summary, 'Complete a writing task to unlock a personalized target') as weekly_target_summary
      from roster r
      left join class_info ci on ci.student_id = r.student_id
      left join task_stats ts on ts.student_id = r.student_id
      left join attempt_stats ast on ast.student_id = r.student_id
      left join weakness_by_student wbs on wbs.student_id = r.student_id
    ),
    final_rows as (
      select
        rows.*,
        (
          (rows.total_tasks > 0 and rows.completion_rate < 0.4)
          or (rows.attempts_count >= 2 and coalesce(rows.score_delta, 0) <= 0)
        ) as stalled,
        (rows.attempts_count >= 2 and coalesce(rows.score_delta, 0) >= 1) as improving,
        (rows.attempts_count >= 4) as ready_for_monthly_review
      from rows
    ),
    class_hotspots as (
      select wc.tag, sum(wc.tag_count)::integer as total_count
      from weakness_counts wc
      group by wc.tag
      order by total_count desc, wc.tag
      limit 10
    )
    select jsonb_build_object(
      'period', v_month,
      'student_rows', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'student_name', fr.student_name,
            'student_id', fr.student_id,
            'current_grade', fr.current_grade,
            'class_name', fr.class_name,
            'completion_rate', fr.completion_rate,
            'completed_tasks', fr.completed_tasks,
            'total_tasks', fr.total_tasks,
            'attempts_count', fr.attempts_count,
            'latest_score', fr.latest_score,
            'score_trend_delta', fr.score_delta,
            'latest_subscale_scores', jsonb_build_object(
              'content', fr.latest_content,
              'communicative_achievement', fr.latest_communicative,
              'organisation', fr.latest_organisation,
              'language', fr.latest_language
            ),
            'subscale_trend', jsonb_build_object(
              'content', fr.content_delta,
              'communicative_achievement', fr.communicative_delta,
              'organisation', fr.organisation_delta,
              'language', fr.language_delta
            ),
            'repeated_weakness_hotspots', to_jsonb(fr.weakness_hotspots),
            'weekly_target_summary', fr.weekly_target_summary,
            'stalled', fr.stalled,
            'improving', fr.improving,
            'ready_for_monthly_review', fr.ready_for_monthly_review
          )
          order by fr.stalled desc, fr.student_name
        )
        from final_rows fr
      ), '[]'::jsonb),
      'hotspot_tags', coalesce((select jsonb_agg(ch.tag order by ch.total_count desc, ch.tag) from class_hotspots ch), '[]'::jsonb),
      'stalled_students', coalesce((select jsonb_agg(fr.student_id) from final_rows fr where fr.stalled), '[]'::jsonb),
      'monthly_review_ready_students', coalesce((select jsonb_agg(fr.student_id) from final_rows fr where fr.ready_for_monthly_review), '[]'::jsonb)
    )
  );
end;
$$;

create or replace function public.rpc_bh_writing_teacher_analytics(
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
  v_month text := coalesce(nullif(trim(p_month), ''), to_char(now(), 'YYYY-MM'));
  v_genre text := nullif(trim(p_genre), '');
  v_monitor jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated';
  end if;

  v_monitor := public.rpc_bh_writing_teacher_monitoring(v_month, p_grade, v_genre);

  return (
    with monitor_rows as (
      select *
      from jsonb_to_recordset(coalesce(v_monitor->'student_rows', '[]'::jsonb)) as r(
        student_id uuid,
        student_name text,
        current_grade integer,
        class_name text,
        completion_rate numeric,
        latest_score numeric,
        stalled boolean,
        improving boolean,
        ready_for_monthly_review boolean,
        attempts_count integer,
        latest_subscale_scores jsonb,
        subscale_trend jsonb,
        repeated_weakness_hotspots jsonb
      )
    ),
    attempts as (
      select
        a.id,
        (coalesce(a.payload->>'student_id', a.payload->>'user_id'))::uuid as student_id,
        a.payload,
        a.payload->>'genre' as genre,
        nullif(a.payload->>'prompt_id', '') as prompt_id,
        nullif(a.payload->>'revision_cycle_id', '') as revision_cycle_id,
        nullif(a.payload->>'attempt_number', '')::integer as attempt_number,
        nullif(a.payload->>'retry_kind', '') as retry_kind,
        nullif(a.payload->'assessment'->>'total_score', '')::numeric as total_score,
        nullif(a.payload->'assessment'->'subscores'->>'content', '')::numeric as content_score,
        nullif(a.payload->'assessment'->'subscores'->>'communicative_achievement', '')::numeric as communicative_score,
        nullif(a.payload->'assessment'->'subscores'->>'organisation', '')::numeric as organisation_score,
        nullif(a.payload->'assessment'->'subscores'->>'language', '')::numeric as language_score,
        a.created_at
      from public.bh_writing_attempts a
      join monitor_rows mr
        on mr.student_id::text = coalesce(a.payload->>'student_id', a.payload->>'user_id')
      where to_char(a.created_at, 'YYYY-MM') = v_month
        and (v_genre is null or a.payload->>'genre' = v_genre)
    ),
    ranked as (
      select
        a.*,
        row_number() over (partition by a.student_id order by a.created_at, a.id) as first_rank,
        row_number() over (partition by a.student_id order by a.created_at desc, a.id desc) as latest_rank
      from attempts a
    ),
    subscale_growth as (
      select
        r.student_id,
        coalesce(max(r.content_score) filter (where r.latest_rank = 1), 0) - coalesce(max(r.content_score) filter (where r.first_rank = 1), 0) as content_delta,
        coalesce(max(r.communicative_score) filter (where r.latest_rank = 1), 0) - coalesce(max(r.communicative_score) filter (where r.first_rank = 1), 0) as communicative_delta,
        coalesce(max(r.organisation_score) filter (where r.latest_rank = 1), 0) - coalesce(max(r.organisation_score) filter (where r.first_rank = 1), 0) as organisation_delta,
        coalesce(max(r.language_score) filter (where r.latest_rank = 1), 0) - coalesce(max(r.language_score) filter (where r.first_rank = 1), 0) as language_delta
      from ranked r
      group by r.student_id
      having count(*) >= 2
    ),
    genre_scores as (
      select a.genre, round(avg(a.total_score), 2) as average_score
      from attempts a
      where a.total_score is not null and a.genre is not null
      group by a.genre
    ),
    prompt_scores as (
      select
        coalesce(a.prompt_id, md5(coalesce(a.payload->>'prompt_text', 'unknown'))) as prompt_id,
        coalesce(max(pb.payload->>'title'), left(max(a.payload->>'prompt_text'), 90), 'Writing prompt') as title,
        count(*)::integer as usage_count,
        round(avg(a.total_score), 2) as average_score
      from attempts a
      left join public.bh_writing_prompt_bank pb
        on pb.payload->>'id' = a.prompt_id
      group by coalesce(a.prompt_id, md5(coalesce(a.payload->>'prompt_text', 'unknown')))
      order by count(*) desc
      limit 20
    ),
    retry_cycles as (
      select
        a.student_id,
        a.revision_cycle_id,
        count(*)::integer as attempt_count,
        count(*) filter (where a.retry_kind = 'same_prompt')::integer as same_prompt_count,
        (array_agg(a.total_score order by coalesce(a.attempt_number, 1), a.created_at))[1] as first_score,
        (array_agg(a.total_score order by coalesce(a.attempt_number, 1) desc, a.created_at desc))[1] as latest_score
      from attempts a
      where a.revision_cycle_id is not null
      group by a.student_id, a.revision_cycle_id
    ),
    retry_summary as (
      select
        count(*)::integer as retry_cycle_count,
        coalesce(round(avg(rc.attempt_count), 2), 0) as average_attempts_per_cycle,
        coalesce(sum(rc.same_prompt_count), 0)::integer as same_prompt_retry_count,
        count(*) filter (where rc.same_prompt_count > 0 and coalesce(rc.latest_score, 0) > coalesce(rc.first_score, 0))::integer as cycles_improved_count,
        count(*) filter (where rc.same_prompt_count > 0 and coalesce(rc.latest_score, 0) <= coalesce(rc.first_score, 0))::integer as cycles_not_improved_count,
        case
          when count(*) filter (where rc.same_prompt_count > 0) > 0
            then round(avg(rc.latest_score - rc.first_score) filter (where rc.same_prompt_count > 0), 2)
          else null
        end as average_same_prompt_score_delta
      from retry_cycles rc
    )
    select jsonb_build_object(
      'summary', jsonb_build_object(
        'total_students', (select count(*) from monitor_rows),
        'stalled_count', (select count(*) from monitor_rows where stalled),
        'improving_count', (select count(*) from monitor_rows where improving)
      ),
      'most_common_weakness_tags', coalesce((
        select jsonb_agg(jsonb_build_object('tag', tag, 'count', count) order by count desc)
        from (
          select value as tag, count(*)::integer as count
          from monitor_rows mr
          cross join lateral jsonb_array_elements_text(coalesce(mr.repeated_weakness_hotspots, '[]'::jsonb))
          group by value
          order by count desc
          limit 10
        ) weakness_summary
      ), '[]'::jsonb),
      'average_score_by_grade', coalesce((
        select jsonb_agg(jsonb_build_object('grade', current_grade, 'average_score', average_score) order by current_grade)
        from (
          select current_grade, round(avg(latest_score), 2) as average_score
          from monitor_rows
          where latest_score is not null
          group by current_grade
        ) grade_summary
      ), '[]'::jsonb),
      'average_score_by_genre', coalesce((select jsonb_agg(jsonb_build_object('genre', gs.genre, 'average_score', gs.average_score) order by gs.genre) from genre_scores gs), '[]'::jsonb),
      'subscale_improvement_over_time', coalesce((select jsonb_agg(to_jsonb(sg) order by sg.student_id) from subscale_growth sg), '[]'::jsonb),
      'prompt_effectiveness', coalesce((select jsonb_agg(to_jsonb(ps) order by ps.usage_count desc) from prompt_scores ps), '[]'::jsonb),
      'task_type_effectiveness', '[]'::jsonb,
      'pilot_readiness', jsonb_build_object(
        'monthly_comparison_ready_students', coalesce((select jsonb_agg(student_id) from monitor_rows where ready_for_monthly_review), '[]'::jsonb),
        'incomplete_weekly_cycle_students', coalesce((select jsonb_agg(student_id) from monitor_rows where completion_rate > 0 and completion_rate < 1), '[]'::jsonb),
        'overused_prompts', coalesce((select jsonb_agg(prompt_id) from prompt_scores where usage_count >= 10), '[]'::jsonb),
        'low_improvement_target_tags', coalesce((
          select jsonb_agg(tag)
          from (
            select value as tag
            from monitor_rows mr
            cross join lateral jsonb_array_elements_text(coalesce(mr.repeated_weakness_hotspots, '[]'::jsonb))
            group by value
            having count(*) >= 3
            order by count(*) desc
          ) recurring_tags
        ), '[]'::jsonb)
      ),
      'retry_insights', jsonb_build_object(
        'retry_metadata_attempts', (select count(*) from attempts where revision_cycle_id is not null),
        'total_attempts', (select count(*) from attempts),
        'retry_metadata_coverage_rate', case when (select count(*) from attempts) > 0
          then round((select count(*) from attempts where revision_cycle_id is not null)::numeric / (select count(*) from attempts)::numeric, 2)
          else 0
        end,
        'retry_cycle_count', coalesce((select retry_cycle_count from retry_summary), 0),
        'average_attempts_per_cycle', coalesce((select average_attempts_per_cycle from retry_summary), 0),
        'same_prompt_retry_count', coalesce((select same_prompt_retry_count from retry_summary), 0),
        'new_prompt_restart_count', (select count(*) from attempts where retry_kind = 'new_prompt'),
        'cycles_improved_count', coalesce((select cycles_improved_count from retry_summary), 0),
        'cycles_not_improved_count', coalesce((select cycles_not_improved_count from retry_summary), 0),
        'average_same_prompt_score_delta', (select average_same_prompt_score_delta from retry_summary),
        'improved_cycle_rate', case
          when coalesce((select cycles_improved_count + cycles_not_improved_count from retry_summary), 0) > 0
            then round((select cycles_improved_count from retry_summary)::numeric / (select cycles_improved_count + cycles_not_improved_count from retry_summary)::numeric, 2)
          else 0
        end,
        'retry_depth_distribution', coalesce((
          select jsonb_agg(jsonb_build_object('attempts', attempt_count, 'cycle_count', cycle_count) order by attempt_count)
          from (
            select attempt_count, count(*)::integer as cycle_count
            from retry_cycles
            group by attempt_count
          ) depth
        ), '[]'::jsonb),
        'most_repeated_cycle_tags', '[]'::jsonb,
        'students_needing_intervention', coalesce((
          select jsonb_agg(distinct student_id)
          from retry_cycles
          where same_prompt_count > 0 and coalesce(latest_score, 0) <= coalesce(first_score, 0)
        ), '[]'::jsonb),
        'students_showing_fast_gains', coalesce((
          select jsonb_agg(distinct student_id)
          from retry_cycles
          where same_prompt_count > 0 and coalesce(latest_score, 0) > coalesce(first_score, 0)
        ), '[]'::jsonb),
        'student_retry_profiles', '[]'::jsonb
      )
    )
  );
end;
$$;

create or replace function public.rpc_bh_writing_teacher_report(
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
  v_genre text := nullif(trim(p_genre), '');
  v_monitor jsonb;
  v_row jsonb := '{}'::jsonb;
  v_latest_attempt jsonb := '{}'::jsonb;
  v_latest_evaluation jsonb := '{}'::jsonb;
  v_monthly jsonb := '{}'::jsonb;
  v_strengths jsonb := '[]'::jsonb;
  v_weaknesses jsonb := '[]'::jsonb;
  v_actions jsonb := '[]'::jsonb;
  v_follow_up boolean := false;
  v_snippet text := null;
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated';
  end if;
  if not public.can_access_bh_writing_student(v_sid) then
    raise exception 'Forbidden: teacher is not authorized for this student';
  end if;

  v_monitor := public.rpc_bh_writing_teacher_monitoring(v_month, null, v_genre);
  select value
  into v_row
  from jsonb_array_elements(coalesce(v_monitor->'student_rows', '[]'::jsonb))
  where value->>'student_id' = v_sid::text
  limit 1;

  if v_row is null or v_row = '{}'::jsonb then
    raise exception 'Student is outside the active writing roster';
  end if;

  select a.payload
  into v_latest_attempt
  from public.bh_writing_attempts a
  where coalesce(a.payload->>'student_id', a.payload->>'user_id') = v_sid::text
    and to_char(a.created_at, 'YYYY-MM') = v_month
    and (v_genre is null or a.payload->>'genre' = v_genre)
  order by a.created_at desc, a.id desc
  limit 1;

  select de.payload
  into v_latest_evaluation
  from public.bh_writing_daily_evaluations de
  where coalesce(de.payload->>'student_id', de.payload->>'user_id') = v_sid::text
    and to_char(de.created_at, 'YYYY-MM') = v_month
    and (v_genre is null or de.payload->>'genre' = v_genre)
  order by de.created_at desc, de.id desc
  limit 1;

  select mr.payload
  into v_monthly
  from public.bh_writing_monthly_reports mr
  where coalesce(mr.payload->>'student_id', mr.payload->>'user_id') = v_sid::text
    and coalesce(mr.payload->>'month', to_char(mr.created_at, 'YYYY-MM')) = v_month
    and (v_genre is null or mr.payload->>'genre' = v_genre)
  order by mr.created_at desc, mr.id desc
  limit 1;

  v_strengths := case
    when jsonb_typeof(v_latest_attempt->'rich_feedback'->'what_is_working') = 'array'
      then v_latest_attempt->'rich_feedback'->'what_is_working'
    when jsonb_typeof(v_latest_attempt->'rich_feedback'->'strengths') = 'array'
      then v_latest_attempt->'rich_feedback'->'strengths'
    else '[]'::jsonb
  end;

  v_weaknesses := case
    when jsonb_typeof(v_latest_attempt->'assessment'->'weakness_tags') = 'array'
      then v_latest_attempt->'assessment'->'weakness_tags'
    else coalesce(v_row->'repeated_weakness_hotspots', '[]'::jsonb)
  end;

  select coalesce(jsonb_agg(action), '[]'::jsonb)
  into v_actions
  from (
    select to_jsonb(format('Teach a short mini-lesson on %s.', replace(value, '_', ' '))) as action
    from jsonb_array_elements_text(v_weaknesses)
    limit 2
  ) actions;

  if v_actions = '[]'::jsonb then
    v_actions := jsonb_build_array('Ask the student to revise one sentence using the cinematic feedback.');
  end if;

  select coalesce((cf.payload->>'flagged')::boolean, false)
  into v_follow_up
  from public.bh_writing_calibration_followups cf
  where cf.student_id = v_sid
  order by cf.updated_at desc
  limit 1;

  if p_include_snippet then
    v_snippet := left(coalesce(v_latest_attempt->>'student_submission', ''), 240);
  end if;

  return jsonb_build_object(
    'report_type', 'teacher_writing_report',
    'generated_at', now(),
    'period', v_month,
    'student', jsonb_build_object(
      'student_id', v_sid,
      'student_name', coalesce(v_row->>'student_name', 'Student'),
      'grade', nullif(v_row->>'current_grade', '')::integer,
      'class_id', null,
      'class_name', coalesce(nullif(v_row->>'class_name', ''), 'Unassigned')
    ),
    'genre', coalesce(v_genre, v_latest_attempt->>'genre', 'all genres'),
    'overall_summary', jsonb_build_object(
      'latest_score', nullif(v_row->>'latest_score', '')::numeric,
      'score_trend_delta', nullif(v_row->>'score_trend_delta', '')::numeric,
      'completion_rate_percent', round(coalesce((v_row->>'completion_rate')::numeric, 0) * 100, 0),
      'completed_tasks', coalesce((v_row->>'attempts_count')::integer, 0),
      'total_tasks', greatest(coalesce((v_row->>'attempts_count')::integer, 0), coalesce((v_row->>'total_tasks')::integer, 0))
    ),
    'strengths', v_strengths,
    'priority_weak_areas', v_weaknesses,
    'repeated_error_patterns', coalesce(v_row->'repeated_weakness_hotspots', '[]'::jsonb),
    'latest_evaluation', coalesce(v_latest_evaluation->'evaluation', '{}'::jsonb),
    'monthly_summary', coalesce(v_monthly->'report', '{}'::jsonb),
    'teacher_actions', v_actions,
    'calibration_follow_up_flag', coalesce(v_follow_up, false),
    'evidence_snippet', v_snippet,
    'student_friendly_summary', jsonb_build_object(
      'strengths', v_strengths,
      'top_improvement_targets', v_weaknesses,
      'progress_summary', case
        when coalesce((v_row->>'attempts_count')::integer, 0) = 0 then 'No writing submitted in this period yet.'
        when nullif(v_row->>'score_trend_delta', '')::numeric >= 1 then 'Your writing score is moving up. Keep using feedback in the next draft.'
        when nullif(v_row->>'score_trend_delta', '')::numeric < 0 then 'Your latest score dipped. Focus on one target, revise, and try again.'
        else 'Keep practising and use one feedback target in your next submission.'
      end,
      'next_steps', v_actions
    )
  );
end;
$$;

revoke all on function public.can_access_bh_writing_student(uuid) from public, anon;
grant execute on function public.can_access_bh_writing_student(uuid) to authenticated;

revoke all on function public.bh_writing_allowed_students() from public, anon;
grant execute on function public.bh_writing_allowed_students() to authenticated;

revoke all on function public.rpc_bh_writing_student_prompt(integer, text, text) from public, anon;
grant execute on function public.rpc_bh_writing_student_prompt(integer, text, text) to authenticated;

revoke all on function public.rpc_bh_writing_teacher_monitoring(text, integer, text) from public, anon;
grant execute on function public.rpc_bh_writing_teacher_monitoring(text, integer, text) to authenticated;

revoke all on function public.rpc_bh_writing_teacher_analytics(text, integer, text) from public, anon;
grant execute on function public.rpc_bh_writing_teacher_analytics(text, integer, text) to authenticated;

revoke all on function public.rpc_bh_writing_teacher_report(text, text, text, boolean) from public, anon;
grant execute on function public.rpc_bh_writing_teacher_report(text, text, text, boolean) to authenticated;

comment on function public.rpc_bh_writing_student_prompt(integer, text, text)
is 'Returns one safety-approved, grade-appropriate Writing Hub prompt without exposing prompt-bank administration data.';

comment on function public.rpc_bh_writing_teacher_monitoring(text, integer, text)
is 'Returns class-scoped Writing Hub progress from per-genre state and real attempts for the selected calendar month.';
