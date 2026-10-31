-- Demo seed 04: the story's student results and the weekly English checks.
-- Every check is created with rpc_create_assignment by the demo teacher and answered by
-- each student through rpc_submit_assignment_answer_v2 / rpc_submit_assignment_result_v2,
-- so grading, results, XP and evidence come from the real app code. Afterwards the
-- check is moved to its place in the story and evidence is ingested with those dates.

do $$ begin
  if to_regclass('private.demo_environment') is null then raise exception 'demo only'; end if;
end $$;

-- The demo teacher's teacher profile, created the way the Teacher Portal does on first visit.
do $$ begin
  perform private.demo_as('teacher');
  if not exists (select 1 from public.teachers t join private.demo_people p on p.user_id = t.user_id and p.key = 'teacher') then
    perform public.create_teacher_profile('Demo International School', array['English'], 'Head of English, Grade 7.');
  end if;
end $$;

insert into private.demo_state(key, value)
values ('story_today', to_jsonb(date_trunc('day', now() at time zone 'Europe/London') at time zone 'Europe/London'))
on conflict (key) do update set value = excluded.value;

-- Story clock: "today" is the day the seed runs. Week 8's check was set on Monday of the
-- current week, week 1's seven Mondays earlier; each at 09:00 London time.
create or replace function private.demo_today() returns timestamptz
language sql stable as $$
  select coalesce((select (value #>> '{}')::timestamptz from private.demo_state where key = 'story_today'),
                  date_trunc('day', now() at time zone 'Europe/London') at time zone 'Europe/London')
$$;

create or replace function private.demo_week_start(p_week integer) returns timestamptz
language sql stable as $$
  select (date_trunc('week', (private.demo_today() - interval '3 days' - make_interval(days => 7 * (8 - p_week))) at time zone 'Europe/London')
          + interval '9 hours') at time zone 'Europe/London'
$$;

-- How many of a skill's 3 questions a student gets right in week k (null = did not do it).
create or replace function private.demo_correct(p_student text, p_skill text, p_week integer)
returns integer language plpgsql immutable as $$
declare
  v_story text;
  v_noise integer := ('x' || substr(md5(p_student || p_skill || p_week), 1, 2))::bit(8)::integer; -- 0..255
begin
  v_story := case
    when p_student in ('s25','s26','s27') then 'strong'           -- 7B
    when p_student in ('s01','s02','s03') then 'perfect_recovered'
    when p_student = 's04' then 'perfect_still_measuring'
    when p_student = 's05' then 'perfect_no_change'
    when p_student = 's06' then 'slipping_agreement'
    when p_student = 's07' then 'low_data'
    when p_student in ('s08','s09','s10') then 'strong'
    else 'steady' end;

  if v_story = 'low_data' and p_week <> 8 then return null; end if;          -- joined late: one check only

  if p_skill = 'P' and v_story like 'perfect_%' then
    if p_week <= 3 then return (array[1,0,1])[p_week]; end if;          -- focus x3 -> intervention
    if v_story = 'perfect_recovered' then return (array[2,3,3,3,3])[p_week - 3]; end if;
    if v_story = 'perfect_still_measuring' then return (array[1,2,1,2,2])[p_week - 3]; end if;
    return (array[2,1,1,2,1])[p_week - 3];                              -- no change (some partial success)
  end if;

  if p_skill = 'A' and v_story = 'slipping_agreement' then
    return (array[3,3,3,3,2,1,1,0])[p_week];                           -- strong, then slipping
  end if;

  if v_story = 'strong' then return case when v_noise < 40 then 2 else 3 end; end if;
  -- steady and everyone's other skills: 2 or 3 of 3, so only the story's needs get flagged
  return case when v_noise < 110 then 2 else 3 end;
end $$;

create or replace function private.demo_wrong_option(p_snapshot jsonb) returns text
language sql immutable as $$
  select o from jsonb_array_elements_text(coalesce(p_snapshot->'options', '[]'::jsonb)) o
  where private.normalize_assignment_answer(o) <> private.normalize_assignment_answer(p_snapshot->>'correct_answer')
  order by md5(o) limit 1
$$;

-- One weekly check per class (7A and 7B get the same questions on the same Monday).
create or replace procedure private.demo_run_week(p_week integer)
language plpgsql as $$
begin
  call private.demo_run_week_class(p_week, '7A');
  call private.demo_run_week_class(p_week, '7B');
end $$;

create or replace procedure private.demo_run_week_class(p_week integer, p_class text)
language plpgsql as $$
declare
  v_teacher_profile uuid := (select id from public.teachers where user_id = (select user_id from private.demo_people where key = 'teacher'));
  v_at timestamptz := private.demo_week_start(p_week);
  v_assignment public.assignments;
  v_questions uuid[];
  v_skill text; v_set uuid[]; v_n integer; v_i integer;
  st record; q record;
  v_correct integer; v_total integer; v_answer text; v_done timestamptz;
begin
  select array_agg(qid order by s.skill, ord) into v_questions
  from private.demo_question_sets s, unnest(s.question_ids) with ordinality u(qid, ord)
  where s.set_no = p_week and s.skill in ('P','A','C','Q');

  perform private.demo_as('teacher');
  select * into v_assignment from public.rpc_create_assignment(
    v_teacher_profile, 'english', 'English', 'Grammar check', p_class, v_questions,
    v_at, v_at + interval '4 days',
    format('Week %s English check', p_week),
    'Answer every question. Take your time and read each sentence carefully.',
    'medium', 'quiz', 'Europe/London', 'batch', null,
    'Weekly check covering perfect forms, subject-verb agreement, comparatives and question formation.',
    'published', false, false);

  for st in select key, user_id from private.demo_people where role = 'student' and class_code = p_class order by key loop
    if private.demo_correct(st.key, 'P', p_week) is null then continue; end if;
    perform private.demo_as(st.key);
    v_total := 0;
    for v_skill in select unnest(array['P','A','C','Q']) loop
      select question_ids into v_set from private.demo_question_sets where skill = v_skill and set_no = p_week;
      v_n := private.demo_correct(st.key, v_skill, p_week);
      v_i := 0;
      for q in select aq.question_id, aq.question_snapshot from unnest(v_set) with ordinality u(qid, ord)
               join public.assignment_questions aq on aq.assignment_id = v_assignment.id and aq.question_id = u.qid
               order by u.ord loop
        v_i := v_i + 1;
        v_answer := case when v_i <= v_n then q.question_snapshot->>'correct_answer'
                         else private.demo_wrong_option(q.question_snapshot) end;
        perform public.rpc_submit_assignment_answer_v2(v_assignment.id, q.question_id,
          q.question_snapshot->>'question_text', null, v_answer, null, 25000 + 1000 * v_i);
      end loop;
      v_total := v_total + v_n;
    end loop;
    perform public.rpc_submit_assignment_result_v2(v_assignment.id, v_total, 12 - v_total,
      round(100.0 * v_total / 12)::integer, v_total * 10, 600);
  end loop;

  -- Move the check to its week in the story (real flows stamp "now").
  set local session_replication_role = replica;
  update public.assignments set created_at = v_at - interval '1 hour', updated_at = v_at,
    assigned_at = v_at, published_at = v_at, due_at = v_at + interval '4 days'
  where id = v_assignment.id;
  update public.assignment_students set added_at = v_at where assignment_id = v_assignment.id;
  for st in select p.key, p.user_id from private.demo_people p where p.role = 'student' and p.class_code = p_class loop
    -- each student finishes 1-2 days after it is set, at a slightly different time
    v_done := v_at + interval '1 day' + make_interval(mins => (('x' || substr(md5(st.key || p_week), 1, 3))::bit(12)::integer % 1800));
    update public.student_assignment_answers a set answered_at = v_done - make_interval(secs => 30 * (12 - x.rn)::integer),
      reviewed_at = v_done - make_interval(secs => 30 * (12 - x.rn)::integer)
    from (select id, row_number() over (order by answered_at, id) rn from public.student_assignment_answers
          where assignment_id = v_assignment.id and student_id = st.user_id) x
    where a.id = x.id;
    update public.student_assignment_results set completed_at = v_done
    where assignment_id = v_assignment.id and student_id = st.user_id;
    update public.student_assignments set assigned_at = v_at, due_at = v_at + interval '4 days',
      completed_at = case when status = 'completed' then v_done end
    where assignment_id = v_assignment.id and student_id = st.user_id;
  end loop;
  set local session_replication_role = origin;

  -- Turn the (now correctly dated) answers into learning evidence.
  for st in select p.user_id from private.demo_people p
            join public.student_assignments sa on sa.student_id = p.user_id and sa.assignment_id = v_assignment.id
            where sa.status = 'completed' loop
    perform private.ingest_verified_assignment_registry_evidence(v_assignment.id, st.user_id);
  end loop;

  insert into private.demo_state(key, value) values ('week_' || p_week || '_' || p_class, to_jsonb(v_assignment.id))
  on conflict (key) do update set value = excluded.value;
end $$;
