-- Daily mission: keep fill-up questions relevant.
-- Previously, when a student had too few mistakes to review, the mission was
-- filled with any subject at their grade (e.g. German for a student who does
-- not study German). Fill-up now comes from, in order:
--   3. subjects the student has been assigned
--   4. subjects the student has answered questions in before
--   5. core subjects at their grade (English, Maths, Science)
-- Missions already created are not changed.

create or replace function private.ensure_daily_mission(p_user_id uuid, p_today date)
returns public.daily_missions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.daily_missions;
  v_grade integer;
  v_ids uuid[];
  v_source text;
  v_label text;
begin
  select * into v_row from public.daily_missions where user_id = p_user_id and mission_date = p_today;
  if found then return v_row; end if;

  perform pg_advisory_xact_lock(hashtext(p_user_id::text), hashtext('daily_mission'));
  select * into v_row from public.daily_missions where user_id = p_user_id and mission_date = p_today;
  if found then return v_row; end if;

  select nullif(regexp_replace(coalesce(u.grade, ''), '\D', '', 'g'), '')::integer
    into v_grade
  from public.users u where u.id = p_user_id;

  with pool as (
    select q.id, q.subject, q.topic_name, q.grade
    from public.questions q
    where q.is_active and q.is_public
      and q.question_type = 'multiple_choice'
      and jsonb_typeof(q.options) = 'array'
      and q.options ? q.correct_answer
      and q.verification_status not in ('retired', 'rejected')
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
    select b.id, b.tier, b.topic_name from best b order by b.tier, random() limit 5
  )
  select array_agg(id order by tier),
         (array['review', 'topic', 'subject', 'subject', 'grade'])[min(tier)],
         mode() within group (order by topic_name)
    into v_ids, v_source, v_label
  from picked;

  if v_ids is null or cardinality(v_ids) < 5 then
    return null;
  end if;

  insert into public.daily_missions (user_id, mission_date, question_ids, source, focus_label)
  values (p_user_id, p_today, v_ids, v_source, v_label)
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function private.ensure_daily_mission(uuid, date) from public, anon, authenticated;
