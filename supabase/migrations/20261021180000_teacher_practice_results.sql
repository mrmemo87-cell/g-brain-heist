-- Practice results back to the teacher.
--
-- Records which mission questions came from the teacher's focus, and gives each
-- teacher a summary of how their students did on the practice they set in the
-- last 14 days (from Follow-ups with a topic, or support plans they created).
-- This is practice evidence only: it never changes the academic profile's
-- official strengths and focus areas, which still come from assignments and tests.

alter table public.daily_missions add column if not exists teacher_question_ids uuid[];

create or replace function private.ensure_daily_mission(p_user_id uuid, p_today date)
returns public.daily_missions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.daily_missions;
  v_existing boolean := false;
  v_grade integer;
  v_f_subject text;
  v_f_skill_key text;
  v_f_topic text;
  v_f_skill text;
  v_f_subskill text;
  v_f_at timestamptz;
  v_payload jsonb;
  v_focus_ids uuid[];
  v_teacher_ids uuid[] := '{}';
  v_other_ids uuid[];
  v_ids uuid[];
  v_source text;
  v_label text;
begin
  -- Latest teacher-directed focus in the last 7 days.
  select x.subject, x.skill_key, x.topic, x.skill, x.subskill, x.focus_at
    into v_f_subject, v_f_skill_key, v_f_topic, v_f_skill, v_f_subskill, v_f_at
  from (
    select f.subject, f.skill_key, coalesce(f.topic, t.topic) as topic, f.skill, f.subskill, t.created_at as focus_at
    from public.teacher_followups t
    left join lateral (
      select fs.subject, fs.skill_key, fs.topic, fs.skill, fs.subskill
      from public.student_learning_focus_states fs
      where fs.student_id = t.student_id and lower(fs.topic) = lower(t.topic)
      order by fs.last_observed_at desc limit 1
    ) f on true
    where t.student_id = p_user_id and t.topic is not null and t.created_at > now() - interval '7 days'
    union all
    select i.subject, i.skill_key, i.topic, i.skill, null, coalesce(i.started_at, i.created_at)
    from public.student_learning_interventions i
    where i.student_id = p_user_id and i.status in ('planned', 'active')
      and coalesce(i.started_at, i.created_at) > now() - interval '7 days'
  ) x
  order by x.focus_at desc
  limit 1;

  select * into v_row from public.daily_missions where user_id = p_user_id and mission_date = p_today;
  if found then
    -- Keep today's mission unless a newer teacher focus arrived before the student started it.
    if cardinality(v_row.answered_ids) > 0 then return v_row; end if;
    if v_f_at is null then return v_row; end if;
    if v_row.teacher_focus_at is not distinct from v_f_at then return v_row; end if;
    if v_row.teacher_focus_at is null and v_f_at <= v_row.created_at then return v_row; end if;
    v_existing := true;
  end if;

  perform pg_advisory_xact_lock(hashtext(p_user_id::text), hashtext('daily_mission'));
  if not v_existing then
    select * into v_row from public.daily_missions where user_id = p_user_id and mission_date = p_today;
    if found then return v_row; end if;
  end if;

  select nullif(regexp_replace(coalesce(u.grade, ''), '\D', '', 'g'), '')::integer
    into v_grade
  from public.users u where u.id = p_user_id;

  -- Up to 3 questions on the teacher's focus.
  if v_f_at is not null then
    if v_f_skill_key is not null then
      v_payload := private.verified_questions_for_learning_focus(
        p_user_id, v_f_subject, v_f_skill_key, v_f_topic, v_f_skill, v_f_subskill);
      v_focus_ids := array(
        select distinct e::uuid
        from jsonb_array_elements_text(coalesce(v_payload -> 'recommended_question_ids', '[]') || coalesce(v_payload -> 'exact_question_ids', '[]')) e);
    end if;
    select coalesce(array_agg(c.id), '{}') into v_teacher_ids
    from (
      select q.id
      from public.questions q
      where q.is_active and q.is_public
        and q.question_type = 'multiple_choice'
        and jsonb_typeof(q.options) = 'array'
        and q.options ? q.correct_answer
        and q.verification_status not in ('retired', 'rejected')
        and not ('purpose:reassessment' = any (coalesce(q.tags, '{}')))
        and (
          (v_payload is not null and q.id = any (v_focus_ids))
          or (v_payload is null and lower(q.topic_name) = lower(v_f_topic)
              and (q.grade is null or v_grade is null or q.grade = v_grade))
        )
        and q.id not in (
          select qa.question_id from public.question_attempts qa
          where qa.student_id = p_user_id and qa.is_correct and qa.attempted_at > now() - interval '7 days')
      order by random()
      limit 3
    ) c;
  end if;

  -- The rest: the student's own recent mistakes, then their subjects (as before).
  with pool as (
    select q.id, q.subject, q.topic_name, q.grade
    from public.questions q
    where q.is_active and q.is_public
      and q.question_type = 'multiple_choice'
      and jsonb_typeof(q.options) = 'array'
      and q.options ? q.correct_answer
      and q.verification_status not in ('retired', 'rejected')
      and not (q.id = any (v_teacher_ids))
  ),
  recently_correct as (
    select qa.question_id from public.question_attempts qa
    where qa.student_id = p_user_id and qa.is_correct and qa.attempted_at > now() - interval '7 days'
  ),
  wrong as (
    select distinct x.question_id from (
      select a.question_id from public.student_assignment_answers a
      where a.student_id = p_user_id and a.is_correct = false and a.answered_at > now() - interval '60 days'
      union
      select qa.question_id from public.question_attempts qa
      where qa.student_id = p_user_id and qa.is_correct = false and qa.attempted_at > now() - interval '60 days'
    ) x
  ),
  wrong_topics as (
    select distinct p.subject, p.topic_name from pool p join wrong w on w.question_id = p.id
  ),
  studied_subjects as (
    select distinct p.subject from (
      select a.question_id from public.student_assignment_answers a where a.student_id = p_user_id
      union
      select qa.question_id from public.question_attempts qa where qa.student_id = p_user_id
    ) x join pool p on p.id = x.question_id
  ),
  assigned_subjects as (
    select distinct p.subject
    from public.student_assignments sa
    join public.assignment_questions aq on aq.assignment_id = sa.assignment_id
    join pool p on p.id = aq.question_id
    where sa.student_id = p_user_id
  ),
  candidates as (
    select p.id, 1 as tier, p.topic_name from pool p join wrong w on w.question_id = p.id
    union all
    select p.id, 2, p.topic_name from pool p join wrong_topics t on t.subject = p.subject and t.topic_name = p.topic_name
    union all
    select p.id, 3, p.topic_name from pool p join assigned_subjects s on s.subject = p.subject
      where p.grade is null or p.grade = v_grade
    union all
    select p.id, 4, p.topic_name from pool p join studied_subjects s on s.subject = p.subject
      where p.grade is null or p.grade = v_grade
    union all
    select p.id, 5, p.topic_name from pool p
      where v_grade is not null and p.grade = v_grade
        and p.subject in ('English', 'Mathematics', 'Maths', 'Science')
  ),
  best as (
    select c.id, min(c.tier) as tier, min(c.topic_name) as topic_name
    from candidates c
    where c.id not in (select question_id from recently_correct)
    group by c.id
  ),
  picked as (
    select b.id, b.tier, b.topic_name from best b order by b.tier, random() limit greatest(0, 5 - cardinality(v_teacher_ids))
  )
  select coalesce(array_agg(id order by tier), '{}'),
         (array['review', 'topic', 'subject', 'subject', 'grade'])[min(tier)],
         mode() within group (order by topic_name)
    into v_other_ids, v_source, v_label
  from picked;

  v_ids := v_teacher_ids || v_other_ids;
  if cardinality(v_ids) < 5 then
    return case when v_existing then v_row else null end;
  end if;
  if cardinality(v_teacher_ids) > 0 then
    v_source := coalesce(v_source, 'review');
  end if;

  if v_existing then
    update public.daily_missions
    set question_ids = v_ids, source = v_source, focus_label = v_label,
        teacher_topic = case when cardinality(v_teacher_ids) > 0 then v_f_topic end,
        teacher_focus_at = case when cardinality(v_teacher_ids) > 0 then v_f_at end,
        teacher_question_ids = case when cardinality(v_teacher_ids) > 0 then v_teacher_ids end,
        correct_count = 0
    where user_id = p_user_id and mission_date = p_today and cardinality(answered_ids) = 0
    returning * into v_row;
    return v_row;
  end if;

  insert into public.daily_missions (user_id, mission_date, question_ids, source, focus_label, teacher_topic, teacher_focus_at, teacher_question_ids)
  values (p_user_id, p_today, v_ids, v_source, v_label,
          case when cardinality(v_teacher_ids) > 0 then v_f_topic end,
          case when cardinality(v_teacher_ids) > 0 then v_f_at end,
          case when cardinality(v_teacher_ids) > 0 then v_teacher_ids end)
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function private.ensure_daily_mission(uuid, date) from public, anon, authenticated;

create or replace function public.rpc_get_teacher_practice_results()
returns table (
  student_id uuid,
  display_name text,
  topic text,
  set_at timestamptz,
  days_practised integer,
  answered integer,
  correct integer,
  last_practised date
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if not exists (select 1 from public.users u where u.id = v_uid and u.role in ('teacher', 'school_admin')) then
    raise exception 'Only teachers can see practice results' using errcode = '42501';
  end if;

  return query
  with sets as (
    select distinct on (x.student_id, lower(x.topic)) x.student_id, x.topic, x.set_at
    from (
      select t.student_id, t.topic, t.created_at as set_at
      from public.teacher_followups t
      where t.teacher_user_id = v_uid and t.topic is not null and t.created_at > now() - interval '14 days'
      union all
      select i.student_id, i.topic, coalesce(i.started_at, i.created_at)
      from public.student_learning_interventions i
      where i.created_by = v_uid and i.topic is not null and i.status in ('planned', 'active')
        and coalesce(i.started_at, i.created_at) > now() - interval '14 days'
    ) x
    order by x.student_id, lower(x.topic), x.set_at desc
  ),
  practised as (
    select s.student_id, lower(s.topic) as topic_key, dm.mission_date, q.id as question_id
    from sets s
    join public.daily_missions dm
      on dm.user_id = s.student_id
     and lower(dm.teacher_topic) = lower(s.topic)
     and dm.mission_date >= (s.set_at at time zone 'Asia/Bishkek')::date
    cross join lateral unnest(coalesce(dm.teacher_question_ids, dm.question_ids[1:3])) as q(id)
    where q.id = any (dm.answered_ids)
  ),
  graded as (
    select p.*, coalesce((
      select qa.is_correct from public.question_attempts qa
      where qa.student_id = p.student_id and qa.question_id = p.question_id
        and (qa.attempted_at at time zone 'Asia/Bishkek')::date = p.mission_date
      order by qa.attempted_at asc limit 1), false) as is_correct
    from practised p
  )
  select s.student_id,
         coalesce(nullif(u.full_name, ''), u.username),
         s.topic,
         s.set_at,
         coalesce(count(distinct g.mission_date), 0)::integer,
         coalesce(count(g.question_id), 0)::integer,
         coalesce(count(*) filter (where g.is_correct), 0)::integer,
         max(g.mission_date)
  from sets s
  join public.users u on u.id = s.student_id
  left join graded g on g.student_id = s.student_id and g.topic_key = lower(s.topic)
  group by s.student_id, u.full_name, u.username, s.topic, s.set_at
  order by s.set_at desc;
end;
$$;

revoke all on function public.rpc_get_teacher_practice_results() from public, anon;
grant execute on function public.rpc_get_teacher_practice_results() to authenticated;
