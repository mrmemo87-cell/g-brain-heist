-- Daily mission: 5 personalised questions a day.
-- The daily streak reward is now earned by finishing today's mission instead of
-- by logging in. Students for whom no mission can be built (fewer than 5
-- suitable questions) keep the old login reward, so nobody is locked out.
--
-- Question choice, best first:
--   review  - questions the student got wrong in the last 60 days
--   topic   - other questions from the topics of those mistakes
--   subject - questions from subjects the student has been assigned, at their grade
--   grade   - any question at the student's grade
-- Questions answered correctly in the last 7 days are skipped.

create table if not exists public.daily_missions (
  user_id       uuid not null references public.users(id) on delete cascade,
  mission_date  date not null,
  question_ids  uuid[] not null,
  source        text not null check (source in ('review', 'topic', 'subject', 'grade')),
  focus_label   text,
  answered_ids  uuid[] not null default '{}',
  correct_count integer not null default 0 check (correct_count >= 0),
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  primary key (user_id, mission_date),
  check (cardinality(question_ids) between 1 and 10)
);

alter table public.daily_missions enable row level security;

create policy daily_missions_select_own on public.daily_missions
  for select to authenticated using (user_id = auth.uid());

grant select on table public.daily_missions to authenticated;

------------------------------------------------------------------------------
-- Shared streak award (previously inline in rpc_record_daily_streak).
------------------------------------------------------------------------------
create or replace function private.award_daily_streak(p_user_id uuid, p_today date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_last_reward date;
  v_current_streak integer;
  v_new_streak integer;
  v_reward integer;
  v_coins integer;
begin
  perform pg_advisory_xact_lock(hashtext(p_user_id::text), hashtext('daily_streak'));

  select coalesce(streak, 0), coins into v_current_streak, v_coins
  from public.users where id = p_user_id for update;

  if exists (select 1 from public.daily_streak_rewards where user_id = p_user_id and reward_date = p_today) then
    return jsonb_build_object('claimed', false, 'reward_date', p_today, 'streak', v_current_streak,
                              'coins_awarded', 0, 'coins', v_coins);
  end if;

  select max(reward_date) into v_last_reward
  from public.daily_streak_rewards where user_id = p_user_id;

  v_new_streak := case when v_last_reward = p_today - 1 then greatest(v_current_streak, 0) + 1 else 1 end;
  v_reward := case
    when v_new_streak % 30 = 0 then 2500
    when v_new_streak % 14 = 0 then 1000
    when v_new_streak % 7 = 0 then 500
    when v_new_streak % 3 = 0 then 250
    else 100
  end;

  update public.users
  set streak = v_new_streak, coins = coalesce(coins, 0) + v_reward, last_seen = now()
  where id = p_user_id returning coins into v_coins;

  insert into public.daily_streak_rewards(user_id, reward_date, streak, coins_awarded)
  values (p_user_id, p_today, v_new_streak, v_reward);

  return jsonb_build_object('claimed', true, 'reward_date', p_today, 'streak', v_new_streak,
                            'coins_awarded', v_reward, 'coins', v_coins);
end;
$$;

revoke all on function private.award_daily_streak(uuid, date) from public, anon, authenticated;

------------------------------------------------------------------------------
-- Build (or return) today's mission row. Returns null when fewer than 5
-- suitable questions exist for this student.
------------------------------------------------------------------------------
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
    select p.id, 4, p.topic_name from pool p where v_grade is not null and p.grade = v_grade
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
         (array['review', 'topic', 'subject', 'grade'])[min(tier)],
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

------------------------------------------------------------------------------
-- Login no longer pays the streak reward when a mission is available.
------------------------------------------------------------------------------
create or replace function public.rpc_record_daily_streak()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_today date := (now() at time zone 'Asia/Bishkek')::date;
  v_mission public.daily_missions;
  v_streak integer;
  v_coins integer;
begin
  if v_user_id is null then raise exception 'Not authenticated'; end if;

  if exists (select 1 from public.daily_streak_rewards where user_id = v_user_id and reward_date = v_today) then
    return private.award_daily_streak(v_user_id, v_today);  -- returns claimed = false
  end if;

  if exists (select 1 from public.users where id = v_user_id and role = 'student') then
    v_mission := private.ensure_daily_mission(v_user_id, v_today);
    if v_mission.user_id is not null then
      select coalesce(streak, 0), coins into v_streak, v_coins from public.users where id = v_user_id;
      update public.users set last_seen = now() where id = v_user_id;
      return jsonb_build_object('claimed', false, 'mission_required', true, 'reward_date', v_today,
                                'streak', v_streak, 'coins_awarded', 0, 'coins', v_coins);
    end if;
  end if;

  return private.award_daily_streak(v_user_id, v_today);
end;
$$;

revoke all on function public.rpc_record_daily_streak() from public, anon;
grant execute on function public.rpc_record_daily_streak() to authenticated;

------------------------------------------------------------------------------
-- Student-facing mission API.
------------------------------------------------------------------------------
create or replace function public.rpc_get_daily_mission()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_today date := (now() at time zone 'Asia/Bishkek')::date;
  v_mission public.daily_missions;
  v_claimed boolean;
begin
  if v_user_id is null then raise exception 'Not authenticated'; end if;

  perform 1 from public.users where id = v_user_id and role = 'student'
    and not coalesce(is_admin, false) and not coalesce(is_banned, false);
  if not found then
    return jsonb_build_object('available', false, 'reason', 'not_student');
  end if;

  v_mission := private.ensure_daily_mission(v_user_id, v_today);
  if v_mission.user_id is null then
    return jsonb_build_object('available', false, 'reason', 'no_questions');
  end if;

  v_claimed := exists (select 1 from public.daily_streak_rewards where user_id = v_user_id and reward_date = v_today);

  return jsonb_build_object(
    'available', true,
    'mission_date', v_mission.mission_date,
    'source', v_mission.source,
    'focus_label', v_mission.focus_label,
    'total', cardinality(v_mission.question_ids),
    'answered', cardinality(v_mission.answered_ids),
    'correct', v_mission.correct_count,
    'completed', v_mission.completed_at is not null,
    'reward_claimed_today', v_claimed,
    'questions', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', q.id,
        'question_text', q.question_text,
        'options', q.options,
        'subject', q.subject,
        'topic_name', q.topic_name,
        'image_url', q.image_url,
        'image_alt_text', q.image_alt_text,
        'answered', q.id = any (v_mission.answered_ids)
      ) order by ord.n), '[]'::jsonb)
      from unnest(v_mission.question_ids) with ordinality as ord(qid, n)
      join public.questions q on q.id = ord.qid
    )
  );
end;
$$;

revoke all on function public.rpc_get_daily_mission() from public, anon;
grant execute on function public.rpc_get_daily_mission() to authenticated;

create or replace function public.rpc_submit_daily_mission_answer(p_question_id uuid, p_answer text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_today date := (now() at time zone 'Asia/Bishkek')::date;
  v_mission public.daily_missions;
  v_result jsonb;
  v_correct boolean;
  v_answer text;
  v_explanation text;
  v_reward jsonb := null;
begin
  if v_user_id is null then raise exception 'Not authenticated'; end if;

  select * into v_mission from public.daily_missions
  where user_id = v_user_id and mission_date = v_today for update;
  if not found then raise exception 'No mission for today' using errcode = '22023'; end if;

  if not (p_question_id = any (v_mission.question_ids)) then
    raise exception 'Question is not part of today''s mission' using errcode = '22023';
  end if;
  if p_question_id = any (v_mission.answered_ids) then
    raise exception 'Question already answered' using errcode = '22023';
  end if;

  -- Normal answer path: grading, XP/coins with caps, and the question_attempts record.
  v_result := public.rpc_submit_mcq_answer(p_question_id, p_answer);
  v_correct := coalesce((v_result ->> 'correct')::boolean, false);

  select q.correct_answer, q.explanation into v_answer, v_explanation
  from public.questions q where q.id = p_question_id;

  update public.daily_missions
  set answered_ids = answered_ids || p_question_id,
      correct_count = correct_count + case when v_correct then 1 else 0 end
  where user_id = v_user_id and mission_date = v_today
  returning * into v_mission;

  if v_mission.completed_at is null
     and cardinality(v_mission.answered_ids) >= cardinality(v_mission.question_ids) then
    update public.daily_missions set completed_at = now()
    where user_id = v_user_id and mission_date = v_today
    returning * into v_mission;
    v_reward := private.award_daily_streak(v_user_id, v_today);
  end if;

  return v_result || jsonb_build_object(
    'correct_answer', v_answer,
    'explanation', v_explanation,
    'answered', cardinality(v_mission.answered_ids),
    'total', cardinality(v_mission.question_ids),
    'mission_correct', v_mission.correct_count,
    'completed', v_mission.completed_at is not null,
    'streak_reward', v_reward
  );
end;
$$;

revoke all on function public.rpc_submit_daily_mission_answer(uuid, text) from public, anon;
grant execute on function public.rpc_submit_daily_mission_answer(uuid, text) to authenticated;
