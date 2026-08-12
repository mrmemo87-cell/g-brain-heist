-- Writing Hub premium release
-- One synchronized contract for student composition evidence, teacher monitoring,
-- analytics, and professional reports.

alter table public.bh_writing_attempts
  add column if not exists attempt_key text;

with ranked_attempt_keys as (
  select
    id,
    nullif(payload->>'id', '') as payload_attempt_key,
    row_number() over (
      partition by nullif(payload->>'id', '')
      order by created_at desc, id desc
    ) as duplicate_rank
  from public.bh_writing_attempts
  where nullif(payload->>'id', '') is not null
)
update public.bh_writing_attempts attempts
set attempt_key = case
  when ranked.duplicate_rank = 1 then ranked.payload_attempt_key
  else null
end
from ranked_attempt_keys ranked
where ranked.id = attempts.id;

create unique index if not exists uq_bh_writing_attempts_attempt_key
  on public.bh_writing_attempts (attempt_key);

create table if not exists public.bh_writing_integrity_settings (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  mode text not null default 'practice'
    check (mode in ('practice', 'independent', 'supervised')),
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (class_id)
);

alter table public.bh_writing_integrity_settings enable row level security;
revoke all on table public.bh_writing_integrity_settings from public, anon, authenticated;

create or replace function public.rpc_bh_writing_student_integrity_mode()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student_id uuid := (select auth.uid());
  v_context jsonb;
begin
  if v_student_id is null then
    raise exception 'Not authenticated';
  end if;

  select jsonb_build_object(
    'mode', coalesce(wis.mode, 'practice'),
    'class_id', c.id,
    'class_name', coalesce(nullif(c.class_name, ''), nullif(c.class_code, ''), 'Practice workspace')
  )
  into v_context
  from public.class_students cs
  join public.classes c
    on c.id = cs.class_id
   and coalesce(c.is_active, true) = true
  left join public.bh_writing_integrity_settings wis on wis.class_id = c.id
  where cs.student_id = v_student_id
  order by
    case coalesce(wis.mode, 'practice')
      when 'supervised' then 3
      when 'independent' then 2
      else 1
    end desc,
    c.created_at desc nulls last,
    c.id
  limit 1;

  return coalesce(
    v_context,
    jsonb_build_object(
      'mode', 'practice',
      'class_id', null,
      'class_name', 'Practice workspace'
    )
  );
end;
$$;

create or replace function public.rpc_bh_writing_teacher_set_integrity_mode(
  p_class_id uuid,
  p_mode text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.users%rowtype;
  v_class public.classes%rowtype;
begin
  select * into v_actor
  from public.users
  where id = (select auth.uid());

  if v_actor.id is null then
    raise exception 'Not authenticated';
  end if;
  if p_mode not in ('practice', 'independent', 'supervised') then
    raise exception 'Unsupported writing integrity mode';
  end if;

  select * into v_class
  from public.classes
  where id = p_class_id
    and coalesce(is_active, true) = true;

  if v_class.id is null then
    raise exception 'Class not found';
  end if;

  if not (
    coalesce(v_actor.is_admin, false) = true
    or v_actor.role = 'admin'
    or (v_actor.role = 'school_admin' and v_actor.school_id = v_class.school_id)
    or (
      v_actor.role = 'teacher'
      and exists (
        select 1
        from public.class_teacher_assignments cta
        where cta.class_id = v_class.id
          and cta.teacher_user_id = v_actor.id
          and coalesce(cta.active, true) = true
      )
    )
  ) then
    raise exception 'Forbidden: teacher is not assigned to this class';
  end if;

  insert into public.bh_writing_integrity_settings (
    school_id,
    class_id,
    mode,
    updated_by,
    updated_at
  )
  values (
    v_class.school_id,
    v_class.id,
    p_mode,
    v_actor.id,
    now()
  )
  on conflict (class_id) do update
    set mode = excluded.mode,
        school_id = excluded.school_id,
        updated_by = excluded.updated_by,
        updated_at = now();

  return jsonb_build_object(
    'mode', p_mode,
    'class_id', v_class.id,
    'class_name', coalesce(nullif(v_class.class_name, ''), nullif(v_class.class_code, ''), 'Class')
  );
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
    with roster_base as (
      select
        allowed.student_id,
        coalesce(nullif(u.full_name, ''), nullif(u.username, ''), 'Student') as student_name,
        coalesce(
          sp.grade,
          case when u.grade ~ '^[0-9]+$' then u.grade::integer else null end
        ) as current_grade
      from public.bh_writing_allowed_students() allowed
      join public.users u on u.id = allowed.student_id
      left join public.bh_writing_student_profiles sp on sp.student_id = allowed.student_id
      where p_grade is null
         or coalesce(sp.grade, case when u.grade ~ '^[0-9]+$' then u.grade::integer else null end) = p_grade
    ),
    roster as (
      select
        rb.*,
        class_pick.class_id,
        coalesce(class_pick.class_name, 'Unassigned') as class_name,
        coalesce(class_pick.integrity_mode, 'practice') as integrity_mode
      from roster_base rb
      left join lateral (
        select
          c.id as class_id,
          coalesce(nullif(c.class_name, ''), nullif(c.class_code, ''), 'Class') as class_name,
          coalesce(wis.mode, 'practice') as integrity_mode
        from public.class_students cs
        join public.classes c
          on c.id = cs.class_id
         and coalesce(c.is_active, true) = true
        left join public.bh_writing_integrity_settings wis on wis.class_id = c.id
        where cs.student_id = rb.student_id
          and (
            exists (
              select 1
              from public.users actor
              where actor.id = (select auth.uid())
                and (
                  coalesce(actor.is_admin, false) = true
                  or actor.role = 'admin'
                  or (actor.role = 'school_admin' and actor.school_id = c.school_id)
                )
            )
            or exists (
              select 1
              from public.class_teacher_assignments cta
              where cta.class_id = c.id
                and cta.teacher_user_id = (select auth.uid())
                and coalesce(cta.active, true) = true
            )
          )
        order by
          case coalesce(wis.mode, 'practice')
            when 'supervised' then 3
            when 'independent' then 2
            else 1
          end desc,
          c.created_at desc nulls last,
          c.id
        limit 1
      ) class_pick on true
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
    practice_stats as (
      select
        sl.student_id,
        coalesce(sum(
          case when jsonb_typeof(sl.lane_state->'active_daily_tasks') = 'array'
            then jsonb_array_length(sl.lane_state->'active_daily_tasks') else 0 end
        ), 0)::integer as practice_assigned_count,
        coalesce(sum(
          case when jsonb_typeof(sl.lane_state->'completed_daily_tasks') = 'array'
            then jsonb_array_length(sl.lane_state->'completed_daily_tasks') else 0 end
        ), 0)::integer as practice_completed_count,
        nullif(string_agg(distinct nullif(concat_ws(' / ',
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
        coalesce(a.payload->>'attempt_type', 'initial_assessment') as attempt_type,
        nullif(a.payload->'assessment'->>'total_score', '')::numeric as total_score,
        nullif(a.payload->'assessment'->'subscores'->>'content', '')::numeric as content_score,
        nullif(a.payload->'assessment'->'subscores'->>'communicative_achievement', '')::numeric as communicative_score,
        nullif(a.payload->'assessment'->'subscores'->>'organisation', '')::numeric as organisation_score,
        nullif(a.payload->'assessment'->'subscores'->>'language', '')::numeric as language_score,
        coalesce(a.payload->'integrity_signals', '{}'::jsonb) as integrity_signals,
        a.created_at
      from public.bh_writing_attempts a
      where coalesce(a.payload->>'student_id', a.payload->>'user_id') ~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and (coalesce(a.payload->>'student_id', a.payload->>'user_id'))::uuid in
          (select student_id from roster)
        and to_char(a.created_at, 'YYYY-MM') = v_month
        and (v_genre is null or a.payload->>'genre' = v_genre)
        and (a.attempt_key is not null or nullif(a.payload->>'id', '') is null)
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
        count(*)::integer as submission_count,
        count(*) filter (where ra.attempt_type = 'initial_assessment')::integer as baseline_submission_count,
        max(ra.total_score) filter (where ra.latest_rank = 1) as latest_score,
        max(ra.total_score) filter (where ra.first_rank = 1) as first_score,
        max(ra.content_score) filter (where ra.latest_rank = 1) as latest_content,
        max(ra.communicative_score) filter (where ra.latest_rank = 1) as latest_communicative,
        max(ra.organisation_score) filter (where ra.latest_rank = 1) as latest_organisation,
        max(ra.language_score) filter (where ra.latest_rank = 1) as latest_language,
        max(ra.content_score) filter (where ra.first_rank = 1) as first_content,
        max(ra.communicative_score) filter (where ra.first_rank = 1) as first_communicative,
        max(ra.organisation_score) filter (where ra.first_rank = 1) as first_organisation,
        max(ra.language_score) filter (where ra.first_rank = 1) as first_language,
        (array_agg(ra.integrity_signals order by ra.created_at desc, ra.id desc))[1] as latest_integrity_signals,
        max(ra.created_at) as latest_attempt_at
      from ranked_attempts ra
      group by ra.student_id
    ),
    weakness_counts as (
      select a.student_id, tag.value as tag, count(*)::integer as tag_count
      from attempts a
      cross join lateral jsonb_array_elements_text(
        case when jsonb_typeof(a.payload->'assessment'->'weakness_tags') = 'array'
          then a.payload->'assessment'->'weakness_tags' else '[]'::jsonb end
      ) tag(value)
      group by a.student_id, tag.value
    ),
    weakness_by_student as (
      select
        ranked.student_id,
        array_agg(ranked.tag order by ranked.tag_count desc, ranked.tag) as weakness_hotspots
      from (
        select
          wc.*,
          row_number() over (partition by wc.student_id order by wc.tag_count desc, wc.tag) as tag_rank
        from weakness_counts wc
      ) ranked
      where ranked.tag_rank <= 3
      group by ranked.student_id
    ),
    computed as (
      select
        r.student_id,
        r.student_name,
        r.current_grade,
        r.class_id,
        r.class_name,
        r.integrity_mode,
        coalesce(ast.submission_count, 0) as submission_count,
        coalesce(ast.baseline_submission_count, 0) as baseline_submission_count,
        coalesce(ps.practice_assigned_count, 0) as practice_assigned_count,
        coalesce(ps.practice_completed_count, 0) as practice_completed_count,
        case when coalesce(ps.practice_assigned_count, 0) > 0
          then round(least(1, ps.practice_completed_count::numeric / ps.practice_assigned_count::numeric), 2)
          else 0::numeric
        end as practice_completion_rate,
        ast.latest_score,
        case when coalesce(ast.submission_count, 0) >= 2
          then ast.latest_score - ast.first_score else null end as score_delta,
        ast.latest_content,
        ast.latest_communicative,
        ast.latest_organisation,
        ast.latest_language,
        case when coalesce(ast.submission_count, 0) >= 2 then coalesce(ast.latest_content, 0) - coalesce(ast.first_content, 0) else 0 end as content_delta,
        case when coalesce(ast.submission_count, 0) >= 2 then coalesce(ast.latest_communicative, 0) - coalesce(ast.first_communicative, 0) else 0 end as communicative_delta,
        case when coalesce(ast.submission_count, 0) >= 2 then coalesce(ast.latest_organisation, 0) - coalesce(ast.first_organisation, 0) else 0 end as organisation_delta,
        case when coalesce(ast.submission_count, 0) >= 2 then coalesce(ast.latest_language, 0) - coalesce(ast.first_language, 0) else 0 end as language_delta,
        coalesce(wbs.weakness_hotspots, '{}'::text[]) as weakness_hotspots,
        coalesce(ps.weekly_target_summary, 'Complete a writing task to unlock a personalized target') as weekly_target_summary,
        coalesce(ast.latest_integrity_signals, '{}'::jsonb) as latest_integrity_signals,
        ast.latest_attempt_at
      from roster r
      left join practice_stats ps on ps.student_id = r.student_id
      left join attempt_stats ast on ast.student_id = r.student_id
      left join weakness_by_student wbs on wbs.student_id = r.student_id
    ),
    final_rows as (
      select
        c.*,
        case
          when c.submission_count = 0 then 'not_started'
          when c.latest_integrity_signals->>'review_status' = 'review_recommended' then 'needs_review'
          when c.submission_count >= 2 and coalesce(c.score_delta, 0) >= 1 then 'improving'
          when c.submission_count >= 2 and coalesce(c.score_delta, 0) <= 0 then 'needs_support'
          when c.practice_completed_count > 0 and c.practice_completion_rate < 0.4 then 'needs_support'
          when c.submission_count = 1 and c.practice_completed_count = 0 then 'plan_ready'
          else 'on_track'
        end as status,
        case
          when c.submission_count = 0 then 'No writing has been submitted in this period.'
          when c.latest_integrity_signals->>'review_status' = 'review_recommended' then 'Writing-process evidence needs teacher review before this score is used.'
          when c.submission_count >= 2 and coalesce(c.score_delta, 0) >= 1 then 'The latest comparable score improved.'
          when c.submission_count >= 2 and coalesce(c.score_delta, 0) <= 0 then 'The latest comparable score is not yet improving.'
          when c.practice_completed_count > 0 and c.practice_completion_rate < 0.4 then 'The student started the practice plan but has completed less than 40 percent.'
          when c.submission_count = 1 and c.practice_completed_count = 0 then 'Baseline complete. The personalized practice plan is ready to begin.'
          else 'Writing and practice evidence are on track.'
        end as status_reason
      from computed c
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
            'class_id', fr.class_id,
            'class_name', fr.class_name,
            'integrity_mode', fr.integrity_mode,
            'submission_count', fr.submission_count,
            'baseline_submission_count', fr.baseline_submission_count,
            'practice_assigned_count', fr.practice_assigned_count,
            'practice_completed_count', fr.practice_completed_count,
            'practice_completion_rate', fr.practice_completion_rate,
            'completion_rate', fr.practice_completion_rate,
            'completed_tasks', fr.practice_completed_count,
            'total_tasks', fr.practice_assigned_count,
            'attempts_count', fr.submission_count,
            'latest_score', fr.latest_score,
            'score_trend_delta', fr.score_delta,
            'latest_attempt_at', fr.latest_attempt_at,
            'latest_integrity_signals', fr.latest_integrity_signals,
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
            'status', fr.status,
            'status_reason', fr.status_reason,
            'stalled', fr.status = 'needs_support',
            'improving', fr.status = 'improving',
            'ready_for_monthly_review', fr.submission_count >= 2
          )
          order by
            case fr.status when 'needs_review' then 1 when 'needs_support' then 2 when 'plan_ready' then 3 when 'not_started' then 4 else 5 end,
            fr.student_name
        )
        from final_rows fr
      ), '[]'::jsonb),
      'hotspot_tags', coalesce((
        select jsonb_agg(ch.tag order by ch.total_count desc, ch.tag)
        from class_hotspots ch
      ), '[]'::jsonb),
      'stalled_students', coalesce((
        select jsonb_agg(fr.student_id)
        from final_rows fr
        where fr.status = 'needs_support'
      ), '[]'::jsonb),
      'monthly_review_ready_students', coalesce((
        select jsonb_agg(fr.student_id)
        from final_rows fr
        where fr.submission_count >= 2
      ), '[]'::jsonb)
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
        current_grade integer,
        practice_completion_rate numeric,
        latest_score numeric,
        status text,
        improving boolean,
        ready_for_monthly_review boolean,
        submission_count integer,
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
        coalesce(
          nullif(a.payload->>'prompt_id', ''),
          md5(coalesce(a.payload->>'prompt_text', 'unknown'))
        ) as prompt_id,
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
        and (a.attempt_key is not null or nullif(a.payload->>'id', '') is null)
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
        coalesce(max(r.content_score) filter (where r.latest_rank = 1), 0)
          - coalesce(max(r.content_score) filter (where r.first_rank = 1), 0) as content_delta,
        coalesce(max(r.communicative_score) filter (where r.latest_rank = 1), 0)
          - coalesce(max(r.communicative_score) filter (where r.first_rank = 1), 0) as communicative_delta,
        coalesce(max(r.organisation_score) filter (where r.latest_rank = 1), 0)
          - coalesce(max(r.organisation_score) filter (where r.first_rank = 1), 0) as organisation_delta,
        coalesce(max(r.language_score) filter (where r.latest_rank = 1), 0)
          - coalesce(max(r.language_score) filter (where r.first_rank = 1), 0) as language_delta
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
        a.prompt_id,
        coalesce(
          max(pb.payload->>'title'),
          left(max(a.payload->>'prompt_text'), 90),
          'Writing prompt'
        ) as title,
        count(*)::integer as usage_count,
        round(avg(a.total_score), 2) as average_score
      from attempts a
      left join public.bh_writing_prompt_bank pb on pb.payload->>'id' = a.prompt_id
      group by a.prompt_id
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
        count(*) filter (
          where rc.same_prompt_count > 0
            and coalesce(rc.latest_score, 0) > coalesce(rc.first_score, 0)
        )::integer as cycles_improved_count,
        count(*) filter (
          where rc.same_prompt_count > 0
            and coalesce(rc.latest_score, 0) <= coalesce(rc.first_score, 0)
        )::integer as cycles_not_improved_count,
        round(avg(rc.latest_score - rc.first_score) filter (where rc.same_prompt_count > 0), 2)
          as average_same_prompt_score_delta
      from retry_cycles rc
    )
    select jsonb_build_object(
      'summary', jsonb_build_object(
        'total_students', (select count(*) from monitor_rows),
        'stalled_count', (
          select count(*) from monitor_rows
          where status in ('needs_review', 'needs_support')
        ),
        'improving_count', (select count(*) from monitor_rows where improving)
      ),
      'most_common_weakness_tags', coalesce((
        select jsonb_agg(
          jsonb_build_object('tag', weakness.tag, 'count', weakness.tag_count)
          order by weakness.tag_count desc, weakness.tag
        )
        from (
          select tag.value as tag, count(*)::integer as tag_count
          from monitor_rows mr
          cross join lateral jsonb_array_elements_text(
            coalesce(mr.repeated_weakness_hotspots, '[]'::jsonb)
          ) tag(value)
          group by tag.value
          order by tag_count desc
          limit 10
        ) weakness
      ), '[]'::jsonb),
      'average_score_by_grade', coalesce((
        select jsonb_agg(
          jsonb_build_object('grade', grades.current_grade, 'average_score', grades.average_score)
          order by grades.current_grade
        )
        from (
          select current_grade, round(avg(latest_score), 2) as average_score
          from monitor_rows
          where latest_score is not null
          group by current_grade
        ) grades
      ), '[]'::jsonb),
      'average_score_by_genre', coalesce((
        select jsonb_agg(
          jsonb_build_object('genre', gs.genre, 'average_score', gs.average_score)
          order by gs.genre
        )
        from genre_scores gs
      ), '[]'::jsonb),
      'subscale_improvement_over_time', coalesce((
        select jsonb_agg(to_jsonb(sg) order by sg.student_id)
        from subscale_growth sg
      ), '[]'::jsonb),
      'prompt_effectiveness', coalesce((
        select jsonb_agg(to_jsonb(ps) order by ps.usage_count desc, ps.prompt_id)
        from prompt_scores ps
      ), '[]'::jsonb),
      'task_type_effectiveness', '[]'::jsonb,
      'pilot_readiness', jsonb_build_object(
        'monthly_comparison_ready_students', coalesce((
          select jsonb_agg(student_id) from monitor_rows where ready_for_monthly_review
        ), '[]'::jsonb),
        'incomplete_weekly_cycle_students', coalesce((
          select jsonb_agg(student_id)
          from monitor_rows
          where practice_completion_rate > 0 and practice_completion_rate < 1
        ), '[]'::jsonb),
        'overused_prompts', coalesce((
          select jsonb_agg(prompt_id) from prompt_scores where usage_count >= 10
        ), '[]'::jsonb),
        'low_improvement_target_tags', '[]'::jsonb
      ),
      'retry_insights', jsonb_build_object(
        'retry_metadata_attempts', (select count(*) from attempts where revision_cycle_id is not null),
        'total_attempts', (select count(*) from attempts),
        'retry_metadata_coverage_rate', case when (select count(*) from attempts) > 0
          then round(
            (select count(*) from attempts where revision_cycle_id is not null)::numeric
            / (select count(*) from attempts)::numeric,
            2
          )
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
          when coalesce((
            select cycles_improved_count + cycles_not_improved_count from retry_summary
          ), 0) > 0
          then round(
            (select cycles_improved_count from retry_summary)::numeric
            / (select cycles_improved_count + cycles_not_improved_count from retry_summary)::numeric,
            2
          )
          else 0
        end,
        'retry_depth_distribution', coalesce((
          select jsonb_agg(
            jsonb_build_object('attempts', depth.attempt_count, 'cycle_count', depth.cycle_count)
            order by depth.attempt_count
          )
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
  v_strengths jsonb := '[]'::jsonb;
  v_weaknesses jsonb := '[]'::jsonb;
  v_actions jsonb := '[]'::jsonb;
  v_snippet text := null;
  v_school_name text := 'Brains Heist School';
  v_school_logo_url text := null;
  v_teacher_name text := 'Writing teacher';
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated';
  end if;
  if not public.can_access_bh_writing_student(v_sid) then
    raise exception 'Forbidden: teacher is not authorized for this student';
  end if;

  v_monitor := public.rpc_bh_writing_teacher_monitoring(v_month, null, v_genre);
  select value into v_row
  from jsonb_array_elements(coalesce(v_monitor->'student_rows', '[]'::jsonb))
  where value->>'student_id' = v_sid::text
  limit 1;

  if v_row is null or v_row = '{}'::jsonb then
    raise exception 'Student is outside the active writing roster';
  end if;

  select a.payload into v_latest_attempt
  from public.bh_writing_attempts a
  where coalesce(a.payload->>'student_id', a.payload->>'user_id') = v_sid::text
    and to_char(a.created_at, 'YYYY-MM') = v_month
    and (v_genre is null or a.payload->>'genre' = v_genre)
    and (a.attempt_key is not null or nullif(a.payload->>'id', '') is null)
  order by a.created_at desc, a.id desc
  limit 1;

  select
    coalesce(nullif(s.name, ''), 'Brains Heist School'),
    s.logo_url
  into v_school_name, v_school_logo_url
  from public.users student
  left join public.schools s on s.id = student.school_id
  where student.id = v_sid;

  select coalesce(nullif(u.full_name, ''), nullif(u.username, ''), 'Writing teacher')
  into v_teacher_name
  from public.users u
  where u.id = (select auth.uid());

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

  select coalesce(jsonb_agg(to_jsonb(action)), '[]'::jsonb)
  into v_actions
  from (
    select format(
      'Teach a short mini-lesson on %s.',
      replace(value, '_', ' ')
    ) as action
    from jsonb_array_elements_text(v_weaknesses)
    limit 2
  ) actions;

  if v_actions = '[]'::jsonb then
    v_actions := jsonb_build_array(
      'Ask the student to revise one paragraph using one cinematic feedback target.'
    );
  end if;

  if p_include_snippet then
    v_snippet := left(coalesce(v_latest_attempt->>'student_submission', ''), 600);
  end if;

  return jsonb_build_object(
    'report_type', 'teacher_writing_report',
    'generated_at', now(),
    'period', v_month,
    'institution', jsonb_build_object(
      'school_name', coalesce(v_school_name, 'Brains Heist School'),
      'school_logo_url', v_school_logo_url,
      'teacher_name', coalesce(v_teacher_name, 'Writing teacher')
    ),
    'student', jsonb_build_object(
      'student_id', v_sid,
      'student_name', coalesce(v_row->>'student_name', 'Student'),
      'grade', nullif(v_row->>'current_grade', '')::integer,
      'class_id', nullif(v_row->>'class_id', '')::uuid,
      'class_name', coalesce(nullif(v_row->>'class_name', ''), 'Unassigned')
    ),
    'genre', coalesce(v_genre, v_latest_attempt->>'genre', 'all genres'),
    'overall_summary', jsonb_build_object(
      'latest_score', nullif(v_row->>'latest_score', '')::numeric,
      'score_trend_delta', nullif(v_row->>'score_trend_delta', '')::numeric,
      'completion_rate_percent', round(coalesce((v_row->>'practice_completion_rate')::numeric, 0) * 100, 0),
      'completed_tasks', coalesce((v_row->>'practice_completed_count')::integer, 0),
      'total_tasks', coalesce((v_row->>'practice_assigned_count')::integer, 0),
      'submission_count', coalesce((v_row->>'submission_count')::integer, 0),
      'baseline_submission_count', coalesce((v_row->>'baseline_submission_count')::integer, 0),
      'practice_completed_count', coalesce((v_row->>'practice_completed_count')::integer, 0),
      'practice_assigned_count', coalesce((v_row->>'practice_assigned_count')::integer, 0)
    ),
    'rubric_scores', coalesce(v_row->'latest_subscale_scores', '{}'::jsonb),
    'integrity', jsonb_build_object(
      'mode', coalesce(v_row->>'integrity_mode', 'practice'),
      'review_status', coalesce(v_row->'latest_integrity_signals'->>'review_status', 'practice_mode'),
      'reasons', coalesce(v_row->'latest_integrity_signals'->'review_reasons', '[]'::jsonb),
      'paste_ratio_percent', round(coalesce((v_row->'latest_integrity_signals'->>'paste_ratio')::numeric, 0) * 100, 0)
    ),
    'strengths', v_strengths,
    'priority_weak_areas', v_weaknesses,
    'repeated_error_patterns', coalesce(v_row->'repeated_weakness_hotspots', '[]'::jsonb),
    'latest_evaluation', coalesce(v_latest_attempt->'assessment', '{}'::jsonb),
    'monthly_summary', jsonb_build_object(
      'status', v_row->>'status',
      'status_reason', v_row->>'status_reason'
    ),
    'teacher_actions', v_actions,
    'calibration_follow_up_flag', false,
    'evidence_snippet', v_snippet,
    'student_friendly_summary', jsonb_build_object(
      'strengths', v_strengths,
      'top_improvement_targets', v_weaknesses,
      'progress_summary', case
        when coalesce((v_row->>'submission_count')::integer, 0) = 0
          then 'No writing has been submitted in this period yet.'
        when coalesce((v_row->>'submission_count')::integer, 0) = 1
          then 'Your baseline is complete. Use the feedback in your first revision.'
        when nullif(v_row->>'score_trend_delta', '')::numeric >= 1
          then 'Your latest comparable score improved. Keep using feedback in the next draft.'
        when nullif(v_row->>'score_trend_delta', '')::numeric < 0
          then 'Your latest score dipped. Focus on one target, revise, and try again.'
        else 'Your score is stable. Choose one feedback target and show it in your next revision.'
      end,
      'next_steps', v_actions
    )
  );
end;
$$;

revoke all on function public.rpc_bh_writing_student_integrity_mode() from public, anon;
grant execute on function public.rpc_bh_writing_student_integrity_mode() to authenticated;

revoke all on function public.rpc_bh_writing_teacher_set_integrity_mode(uuid, text) from public, anon;
grant execute on function public.rpc_bh_writing_teacher_set_integrity_mode(uuid, text) to authenticated;

revoke all on function public.rpc_bh_writing_teacher_monitoring(text, integer, text) from public, anon;
grant execute on function public.rpc_bh_writing_teacher_monitoring(text, integer, text) to authenticated;

revoke all on function public.rpc_bh_writing_teacher_analytics(text, integer, text) from public, anon;
grant execute on function public.rpc_bh_writing_teacher_analytics(text, integer, text) to authenticated;

revoke all on function public.rpc_bh_writing_teacher_report(text, text, text, boolean) from public, anon;
grant execute on function public.rpc_bh_writing_teacher_report(text, text, text, boolean) to authenticated;

comment on function public.rpc_bh_writing_student_integrity_mode()
is 'Returns the authenticated student class Writing Hub integrity mode without exposing class settings.';

comment on function public.rpc_bh_writing_teacher_monitoring(text, integer, text)
is 'Returns synchronized class-scoped writing submissions, practice progress, trends, statuses, and integrity evidence.';

comment on function public.rpc_bh_writing_teacher_report(text, text, text, boolean)
is 'Returns a branded evidence-led Writing Hub report contract with distinct submissions, practice, rubric, and integrity data.';
