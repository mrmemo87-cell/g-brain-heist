-- Proving Grounds arena (Phase 1): a 3-vs-3 bot battle students unlock by studying.
--
-- Rules this migration enforces on the server, so the client can never bend them:
--   * The arena is off for every school until a school admin turns it on. Teachers can
--     switch it off for a class or require today's assignment first, never widen it.
--   * Every match costs one ticket. Tickets come only from learning work (quest missions,
--     quizzes at 70%+, assignments, streaks), cap at 10 in hand and expire each week.
--   * Fighter power comes from subject mastery, never from spending.
--   * Respawn questions come from the verified public bank only, never from IELTS content,
--     and every answer is recorded as a practice attempt.
--   * Rewards are paid only for matches the server opened, of a believable length, within
--     the daily cap. Arena trophies are a separate currency; XP and gems payouts are small.

------------------------------------------------------------------------------
-- Tables and columns
------------------------------------------------------------------------------
alter table public.users add column if not exists arena_trophies integer not null default 0;
alter table public.users add column if not exists arena_tickets integer not null default 0;
alter table public.users add column if not exists arena_tickets_week date;

create table if not exists public.arena_settings (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  class_id uuid references public.classes(id) on delete cascade,
  enabled boolean not null default false,
  daily_cap integer not null default 5 check (daily_cap between 0 and 20),
  window_start time not null default '15:00',
  window_end time not null default '23:59',
  weekend_all_day boolean not null default true,
  require_assignment boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create unique index if not exists arena_settings_scope_idx
  on public.arena_settings (school_id, coalesce(class_id, '00000000-0000-0000-0000-000000000000'::uuid));
alter table public.arena_settings enable row level security;
-- No policies on purpose: fail closed. The RPCs below are the only readers and writers.
revoke all on table public.arena_settings from public, anon, authenticated;

create table if not exists public.arena_matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  school_id uuid references public.schools(id) on delete set null,
  class_id uuid,
  fighter text not null check (fighter in ('rivet', 'fizz', 'vex', 'boulder')),
  power integer not null default 1 check (power between 1 and 5),
  bot_power integer not null default 1 check (bot_power between 1 and 5),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  result text check (result in ('win', 'loss', 'draw', 'abandoned')),
  score_mine integer,
  score_theirs integer,
  mvp boolean not null default false,
  trophies_delta integer not null default 0,
  xp_awarded integer not null default 0,
  gems_awarded integer not null default 0,
  respawn_questions integer not null default 0,
  respawn_correct integer not null default 0,
  paid boolean not null default false
);
create index if not exists arena_matches_user_started_idx on public.arena_matches (user_id, started_at desc);
create index if not exists arena_matches_class_started_idx on public.arena_matches (class_id, started_at desc);
alter table public.arena_matches enable row level security;
create policy arena_matches_select_own on public.arena_matches
  for select to authenticated using (user_id = auth.uid());
grant select on table public.arena_matches to authenticated;

-- Served respawn questions: the answer key stays here, never in the client.
create table if not exists private.arena_respawn_prompts (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.arena_matches(id) on delete cascade,
  question_id uuid not null,
  correct_answer text not null,
  served_at timestamptz not null default now(),
  answered_at timestamptz,
  answer_given text,
  is_correct boolean
);
revoke all on table private.arena_respawn_prompts from public, anon, authenticated;

-- Every ticket grant, so teachers can see what studying earned this week.
create table if not exists private.arena_ticket_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  amount integer not null,
  source text not null,
  created_at timestamptz not null default now()
);
create index if not exists arena_ticket_ledger_user_idx on private.arena_ticket_ledger (user_id, created_at desc);
revoke all on table private.arena_ticket_ledger from public, anon, authenticated;

------------------------------------------------------------------------------
-- Helpers
------------------------------------------------------------------------------
create or replace function private.arena_today()
returns date language sql stable set search_path = '' as $$
  select (now() at time zone 'Asia/Bishkek')::date
$$;
revoke all on function private.arena_today() from public, anon, authenticated;

create or replace function private.arena_week_start(p_day date)
returns date language sql immutable set search_path = '' as $$
  select (p_day - ((extract(isodow from p_day)::integer) - 1))::date
$$;
revoke all on function private.arena_week_start(date) from public, anon, authenticated;

-- Which fighter a question subject feeds. Null means the subject has no fighter yet.
create or replace function private.arena_fighter_for_subject(p_subject text)
returns text language sql immutable set search_path = '' as $$
  select case
    when p_subject is null then null
    when lower(p_subject) like '%ielts%' then null
    when lower(p_subject) ~ '(english|grammar|reading|writing|vocab|literature|language)' then 'rivet'
    when lower(p_subject) ~ 'chem' then 'fizz'
    when lower(p_subject) ~ '(math|algebra|geometry|physic|calcul)' then 'vex'
    when lower(p_subject) ~ 'bio' then 'boulder'
    else null end
$$;
revoke all on function private.arena_fighter_for_subject(text) from public, anon, authenticated;

create or replace function private.arena_power_for(p_attempts integer, p_correct integer)
returns integer language sql immutable set search_path = '' as $$
  select case
    when coalesce(p_attempts, 0) < 10 then 1
    when p_correct * 100 < p_attempts * 20 then 1
    when p_correct * 100 < p_attempts * 40 then 2
    when p_correct * 100 < p_attempts * 60 then 3
    when p_correct * 100 < p_attempts * 80 then 4
    else 5 end
$$;
revoke all on function private.arena_power_for(integer, integer) from public, anon, authenticated;

-- Mastery per fighter from the last 90 days of practice and assignment answers.
create or replace function private.arena_mastery(p_uid uuid)
returns table (fighter text, attempts integer, correct integer, power integer)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_has_attempts boolean := to_regclass('public.question_attempts') is not null;
  v_has_answers boolean := to_regclass('public.student_assignment_answers') is not null;
  v_sql text := '';
begin
  if v_has_attempts then
    v_sql := v_sql || 'select q.subject, qa.is_correct from public.question_attempts qa join public.questions q on q.id = qa.question_id where qa.student_id = $1 and qa.attempted_at > now() - interval ''90 days''';
  end if;
  if v_has_answers then
    if v_sql <> '' then v_sql := v_sql || ' union all '; end if;
    v_sql := v_sql || 'select q.subject, sa.is_correct from public.student_assignment_answers sa join public.questions q on q.id = sa.question_id where sa.student_id = $1 and sa.answered_at > now() - interval ''90 days''';
  end if;
  if v_sql = '' then
    v_sql := 'select null::text as subject, null::boolean as is_correct where false';
  end if;
  return query execute
    'select f.id, coalesce(m.attempts, 0)::integer, coalesce(m.correct, 0)::integer, private.arena_power_for(coalesce(m.attempts, 0)::integer, coalesce(m.correct, 0)::integer)
     from (values (''rivet''), (''fizz''), (''vex''), (''boulder'')) f(id)
     left join (
       select private.arena_fighter_for_subject(subject) as fighter, count(*) as attempts, count(*) filter (where is_correct) as correct
       from (' || v_sql || ') src
       group by 1
     ) m on m.fighter = f.id
     order by f.id'
  using p_uid;
end $$;
revoke all on function private.arena_mastery(uuid) from public, anon, authenticated;

-- Effective settings for a student: the school row, narrowed by the class row.
create or replace function private.arena_rules(p_uid uuid)
returns table (school_id uuid, class_id uuid, enabled boolean, daily_cap integer, window_start time, window_end time,
               weekend_all_day boolean, require_assignment boolean, reason text)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_role text; v_school uuid; v_banned boolean; v_class uuid;
  v_school_row public.arena_settings%rowtype; v_class_row public.arena_settings%rowtype;
begin
  select u.role, u.school_id, coalesce(u.is_banned, false) into v_role, v_school, v_banned from public.users u where u.id = p_uid;
  if not found or v_banned then return query select null::uuid, null::uuid, false, 0, null::time, null::time, false, false, 'no_user'; return; end if;
  if v_role <> 'student' then return query select v_school, null::uuid, false, 0, null::time, null::time, false, false, 'not_student'; return; end if;
  if v_school is null then return query select null::uuid, null::uuid, false, 0, null::time, null::time, false, false, 'no_school'; return; end if;

  select c.id into v_class
  from public.class_students cs join public.classes c on c.id = cs.class_id
  where cs.student_id = p_uid and coalesce(c.is_active, true)
  order by cs.joined_at desc nulls last limit 1;

  select * into v_school_row from public.arena_settings s where s.school_id = v_school and s.class_id is null;
  if not found or not v_school_row.enabled then
    return query select v_school, v_class, false, coalesce(v_school_row.daily_cap, 5), v_school_row.window_start, v_school_row.window_end, coalesce(v_school_row.weekend_all_day, true), false, 'school_off'; return;
  end if;
  if v_class is not null then
    select * into v_class_row from public.arena_settings s where s.school_id = v_school and s.class_id = v_class;
    if found and not v_class_row.enabled then
      return query select v_school, v_class, false, v_school_row.daily_cap, v_school_row.window_start, v_school_row.window_end, v_school_row.weekend_all_day, v_class_row.require_assignment, 'class_off'; return;
    end if;
  end if;
  return query select v_school, v_class, true, v_school_row.daily_cap, v_school_row.window_start, v_school_row.window_end,
    v_school_row.weekend_all_day, coalesce(v_class_row.require_assignment, false), null::text;
end $$;
revoke all on function private.arena_rules(uuid) from public, anon, authenticated;

create or replace function private.arena_open_now(p_window_start time, p_window_end time, p_weekend_all_day boolean)
returns boolean language sql stable set search_path = '' as $$
  select case
    when p_weekend_all_day and extract(isodow from (now() at time zone 'Asia/Bishkek')) in (6, 7) then true
    else (now() at time zone 'Asia/Bishkek')::time between p_window_start and p_window_end end
$$;
revoke all on function private.arena_open_now(time, time, boolean) from public, anon, authenticated;

-- Tickets expire each week: reset the balance when the week has moved on.
create or replace function private.arena_sync_tickets(p_uid uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_week date := private.arena_week_start(private.arena_today()); v_tickets integer;
begin
  update public.users u
  set arena_tickets = case when u.arena_tickets_week is distinct from v_week then 0 else u.arena_tickets end,
      arena_tickets_week = v_week
  where u.id = p_uid
  returning arena_tickets into v_tickets;
  return coalesce(v_tickets, 0);
end $$;
revoke all on function private.arena_sync_tickets(uuid) from public, anon, authenticated;

create or replace function private.arena_grant_tickets(p_uid uuid, p_amount integer, p_source text)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_tickets integer; v_granted integer;
begin
  if p_amount <= 0 then return 0; end if;
  if not exists (select 1 from public.users u where u.id = p_uid and u.role = 'student') then return 0; end if;
  v_tickets := private.arena_sync_tickets(p_uid);
  v_granted := least(p_amount, greatest(0, 10 - v_tickets));
  if v_granted = 0 then return 0; end if;
  update public.users set arena_tickets = arena_tickets + v_granted where id = p_uid;
  insert into private.arena_ticket_ledger (user_id, amount, source) values (p_uid, v_granted, p_source);
  return v_granted;
end $$;
revoke all on function private.arena_grant_tickets(uuid, integer, text) from public, anon, authenticated;

create or replace function private.arena_blocking_assignment(p_uid uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  if to_regclass('public.student_assignments') is null then return false; end if;
  return exists (
    select 1 from public.student_assignments sa
    where sa.student_id = p_uid and coalesce(sa.status, 'pending') not in ('completed', 'graded', 'submitted', 'released')
  );
end $$;
revoke all on function private.arena_blocking_assignment(uuid) from public, anon, authenticated;

create or replace function private.arena_played_today(p_uid uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.arena_matches m
  where m.user_id = p_uid and m.finished_at is not null and m.result <> 'abandoned'
    and (m.started_at at time zone 'Asia/Bishkek')::date = private.arena_today()
$$;
revoke all on function private.arena_played_today(uuid) from public, anon, authenticated;

create or replace function private.arena_can_manage_school(p_uid uuid, p_school uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.users u where u.id = p_uid and u.school_id = p_school and u.role = 'school_admin' and not coalesce(u.is_banned, false)
  ) or exists (
    select 1 from public.school_members sm where sm.user_id = p_uid and sm.school_id = p_school
      and sm.role_in_school = 'school_admin' and coalesce(sm.status, 'active') = 'active'
  )
$$;
revoke all on function private.arena_can_manage_school(uuid, uuid) from public, anon, authenticated;

create or replace function private.arena_can_manage_class(p_uid uuid, p_class uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.classes c
    left join public.teachers t on t.id = c.teacher_id
    left join public.class_teacher_assignments cta on cta.class_id = c.id and cta.active and cta.teacher_user_id = p_uid
    where c.id = p_class and (t.user_id = p_uid or cta.teacher_user_id is not null or private.arena_can_manage_school(p_uid, c.school_id))
  )
$$;
revoke all on function private.arena_can_manage_class(uuid, uuid) from public, anon, authenticated;

------------------------------------------------------------------------------
-- Student RPCs
------------------------------------------------------------------------------
create or replace function public.rpc_arena_status()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid(); r record; v_tickets integer; v_trophies integer; v_fighters jsonb; v_played integer;
  v_open boolean; v_blocked boolean;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into r from private.arena_rules(v_uid);
  if r.reason in ('no_user', 'not_student', 'no_school') then
    return jsonb_build_object('available', false, 'reason', r.reason);
  end if;
  v_tickets := private.arena_sync_tickets(v_uid);
  select coalesce(u.arena_trophies, 0) into v_trophies from public.users u where u.id = v_uid;
  select coalesce(jsonb_agg(jsonb_build_object('id', m.fighter, 'power', m.power, 'attempts', m.attempts, 'correct', m.correct,
           'unlocked', v_trophies >= case m.fighter when 'vex' then 40 when 'boulder' then 100 else 0 end)), '[]'::jsonb)
    into v_fighters from private.arena_mastery(v_uid) m;
  v_played := private.arena_played_today(v_uid);
  v_open := r.enabled and private.arena_open_now(r.window_start, r.window_end, r.weekend_all_day);
  v_blocked := r.enabled and r.require_assignment and private.arena_blocking_assignment(v_uid);
  return jsonb_build_object(
    'available', r.enabled, 'reason', r.reason, 'open_now', v_open, 'assignment_blocked', v_blocked,
    'window_start', to_char(r.window_start, 'HH24:MI'), 'window_end', to_char(r.window_end, 'HH24:MI'), 'weekend_all_day', r.weekend_all_day,
    'daily_cap', r.daily_cap, 'played_today', v_played, 'tickets', v_tickets, 'trophies', v_trophies, 'fighters', v_fighters,
    'today', private.arena_today());
end $$;
revoke all on function public.rpc_arena_status() from public, anon;
grant execute on function public.rpc_arena_status() to authenticated;

create or replace function public.rpc_arena_start_match(p_fighter text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid(); r record; v_tickets integer; v_trophies integer; v_power integer; v_avg numeric; v_id uuid;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_fighter not in ('rivet', 'fizz', 'vex', 'boulder') then raise exception 'INVALID_FIGHTER'; end if;
  perform pg_advisory_xact_lock(hashtext(v_uid::text), hashtext('arena'));
  select * into r from private.arena_rules(v_uid);
  if not r.enabled then raise exception 'ARENA_CLOSED:%', coalesce(r.reason, 'school_off'); end if;
  if not private.arena_open_now(r.window_start, r.window_end, r.weekend_all_day) then raise exception 'ARENA_CLOSED:window'; end if;
  if r.require_assignment and private.arena_blocking_assignment(v_uid) then raise exception 'ARENA_CLOSED:assignment'; end if;
  if private.arena_played_today(v_uid) >= r.daily_cap then raise exception 'DAILY_CAP'; end if;
  v_tickets := private.arena_sync_tickets(v_uid);
  if v_tickets < 1 then raise exception 'NO_TICKETS'; end if;
  select coalesce(u.arena_trophies, 0) into v_trophies from public.users u where u.id = v_uid;
  if v_trophies < (case p_fighter when 'vex' then 40 when 'boulder' then 100 else 0 end) then raise exception 'FIGHTER_LOCKED'; end if;

  select max(m.power) filter (where m.fighter = p_fighter), avg(m.power) into v_power, v_avg from private.arena_mastery(v_uid) m;
  v_power := coalesce(v_power, 1);

  -- A match left open is abandoned: it was paid for and pays nothing.
  update public.arena_matches set finished_at = now(), result = 'abandoned'
  where user_id = v_uid and finished_at is null;

  update public.users set arena_tickets = arena_tickets - 1 where id = v_uid;
  insert into public.arena_matches (user_id, school_id, class_id, fighter, power, bot_power)
  values (v_uid, r.school_id, r.class_id, p_fighter, v_power, greatest(1, least(5, round(coalesce(v_avg, 1))::integer)))
  returning id into v_id;
  return jsonb_build_object('match_id', v_id, 'fighter', p_fighter, 'power', v_power,
    'bot_power', greatest(1, least(5, round(coalesce(v_avg, 1))::integer)), 'tickets', v_tickets - 1);
end $$;
revoke all on function public.rpc_arena_start_match(text) from public, anon;
grant execute on function public.rpc_arena_start_match(text) to authenticated;

-- One multiple-choice question for the respawn countdown. Never IELTS, never with the answer key.
create or replace function public.rpc_arena_respawn_question(p_match_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid(); v_grade integer; q record; v_prompt uuid; v_count integer;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not exists (select 1 from public.arena_matches m where m.id = p_match_id and m.user_id = v_uid and m.finished_at is null) then
    raise exception 'MATCH_NOT_OPEN';
  end if;
  select count(*)::integer into v_count from private.arena_respawn_prompts p where p.match_id = p_match_id;
  if v_count >= 12 then raise exception 'PROMPT_LIMIT'; end if;
  select nullif(regexp_replace(coalesce(u.grade, ''), '\D', '', 'g'), '')::integer into v_grade from public.users u where u.id = v_uid;

  select q2.id, q2.question_text, q2.options, q2.correct_answer, q2.subject into q
  from public.questions q2
  where q2.is_active and coalesce(q2.is_public, true)
    and q2.verification_status = 'verified' and coalesce(q2.pool_scope, 'global') = 'global'
    and q2.question_type = 'multiple_choice'
    and q2.verified_content_hash is not null and q2.verified_content_hash = q2.current_content_hash
    and lower(coalesce(q2.subject, '')) not like '%ielts%'
    and private.arena_fighter_for_subject(q2.subject) is not null
    and q2.image_url is null
    and jsonb_typeof(q2.options) = 'array' and jsonb_array_length(q2.options) between 2 and 4
    and not exists (select 1 from jsonb_array_elements(q2.options) o where jsonb_typeof(o) <> 'string')
    and q2.correct_answer in (select jsonb_array_elements_text(q2.options))
    and (v_grade is null or q2.eligible_grade_levels is null or v_grade = any(q2.eligible_grade_levels))
    and not exists (select 1 from private.arena_respawn_prompts p where p.match_id = p_match_id and p.question_id = q2.id)
  order by random() limit 1;
  if not found then return jsonb_build_object('available', false); end if;

  insert into private.arena_respawn_prompts (match_id, question_id, correct_answer) values (p_match_id, q.id, q.correct_answer) returning id into v_prompt;
  update public.arena_matches set respawn_questions = respawn_questions + 1 where id = p_match_id;
  return jsonb_build_object('available', true, 'prompt_id', v_prompt, 'question_id', q.id, 'text', q.question_text,
    'options', q.options, 'fighter', private.arena_fighter_for_subject(q.subject));
end $$;
revoke all on function public.rpc_arena_respawn_question(uuid) from public, anon;
grant execute on function public.rpc_arena_respawn_question(uuid) to authenticated;

create or replace function public.rpc_arena_answer_respawn(p_match_id uuid, p_prompt_id uuid, p_answer text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); p record; v_correct boolean; v_xp integer := 0;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select pr.* into p from private.arena_respawn_prompts pr
  join public.arena_matches m on m.id = pr.match_id
  where pr.id = p_prompt_id and pr.match_id = p_match_id and m.user_id = v_uid and m.finished_at is null
  for update of pr;
  if not found then raise exception 'PROMPT_NOT_FOUND'; end if;
  if p.answered_at is not null then return jsonb_build_object('correct', p.is_correct, 'repeated', true); end if;
  v_correct := (p_answer is not null and p_answer = p.correct_answer);
  update private.arena_respawn_prompts set answered_at = now(), answer_given = p_answer, is_correct = v_correct where id = p_prompt_id;
  if v_correct then
    update public.arena_matches set respawn_correct = respawn_correct + 1 where id = p_match_id;
    v_xp := 2;
    update public.users set xp = greatest(0, coalesce(xp, 0) + v_xp) where id = v_uid;
  end if;
  if to_regclass('public.question_attempts') is not null then
    insert into public.question_attempts (student_id, question_id, answer_given, is_correct, points_earned)
    values (v_uid, p.question_id, coalesce(p_answer, ''), v_correct, 0);
  end if;
  return jsonb_build_object('correct', v_correct, 'xp', v_xp);
end $$;
revoke all on function public.rpc_arena_answer_respawn(uuid, uuid, text) from public, anon;
grant execute on function public.rpc_arena_answer_respawn(uuid, uuid, text) to authenticated;

create or replace function public.rpc_arena_finish_match(p_match_id uuid, p_score_mine integer, p_score_theirs integer, p_mvp boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid(); m public.arena_matches%rowtype; r record; v_secs numeric; v_result text;
  v_trophies integer := 0; v_xp integer := 0; v_gems integer := 0; v_paid boolean := false; v_before integer; v_after integer; v_unlocked jsonb := '[]'::jsonb;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  perform pg_advisory_xact_lock(hashtext(v_uid::text), hashtext('arena'));
  select * into m from public.arena_matches where id = p_match_id and user_id = v_uid for update;
  if not found then raise exception 'MATCH_NOT_FOUND'; end if;
  if m.finished_at is not null then
    return jsonb_build_object('result', m.result, 'paid', m.paid, 'trophies_delta', m.trophies_delta, 'xp', m.xp_awarded, 'gems', m.gems_awarded, 'repeated', true);
  end if;
  if p_score_mine is null or p_score_theirs is null or p_score_mine not between 0 and 100 or p_score_theirs not between 0 and 100 then
    raise exception 'INVALID_SCORE';
  end if;
  v_secs := extract(epoch from (now() - m.started_at));
  v_result := case when p_score_mine > p_score_theirs then 'win' when p_score_mine < p_score_theirs then 'loss' else 'draw' end;
  select * into r from private.arena_rules(v_uid);
  -- Pay only for believable matches, inside the rules, within the daily cap.
  if v_secs between 40 and 240 and r.enabled and private.arena_played_today(v_uid) < r.daily_cap then
    v_paid := true;
    v_trophies := case v_result when 'win' then 8 + case when p_mvp then 2 else 0 end when 'loss' then -3 else 0 end;
    v_xp := case v_result when 'win' then 15 when 'loss' then 5 else 8 end;
    v_gems := case v_result when 'win' then 2 when 'draw' then 1 else 0 end;
  end if;
  select coalesce(u.arena_trophies, 0) into v_before from public.users u where u.id = v_uid;
  v_after := greatest(0, v_before + v_trophies);
  v_trophies := v_after - v_before;
  update public.users
  set arena_trophies = v_after, xp = greatest(0, coalesce(xp, 0) + v_xp), gemstones = greatest(0, coalesce(gemstones, 0) + v_gems)
  where id = v_uid;
  update public.arena_matches
  set finished_at = now(), result = v_result, score_mine = p_score_mine, score_theirs = p_score_theirs, mvp = coalesce(p_mvp, false),
      trophies_delta = v_trophies, xp_awarded = v_xp, gems_awarded = v_gems, paid = v_paid
  where id = p_match_id;
  if v_before < 40 and v_after >= 40 then v_unlocked := v_unlocked || '"vex"'::jsonb; end if;
  if v_before < 100 and v_after >= 100 then v_unlocked := v_unlocked || '"boulder"'::jsonb; end if;
  return jsonb_build_object('result', v_result, 'paid', v_paid, 'trophies_delta', v_trophies, 'trophies', v_after,
    'xp', v_xp, 'gems', v_gems, 'unlocked', v_unlocked, 'played_today', private.arena_played_today(v_uid), 'daily_cap', r.daily_cap);
end $$;
revoke all on function public.rpc_arena_finish_match(uuid, integer, integer, boolean) from public, anon;
grant execute on function public.rpc_arena_finish_match(uuid, integer, integer, boolean) to authenticated;

------------------------------------------------------------------------------
-- School admin and teacher RPCs
------------------------------------------------------------------------------
create or replace function public.rpc_arena_admin_settings(p_school_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); s public.arena_settings%rowtype; v_classes jsonb; v_week date := private.arena_week_start(private.arena_today());
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not private.arena_can_manage_school(v_uid, p_school_id) then raise exception 'NOT_AUTHORIZED'; end if;
  select * into s from public.arena_settings where school_id = p_school_id and class_id is null;
  select coalesce(jsonb_agg(jsonb_build_object('class_id', c.id, 'class_name', c.class_name, 'enabled', coalesce(cs.enabled, true),
           'require_assignment', coalesce(cs.require_assignment, false)) order by c.class_name), '[]'::jsonb)
    into v_classes
  from public.classes c left join public.arena_settings cs on cs.class_id = c.id
  where c.school_id = p_school_id and coalesce(c.is_active, true);
  return jsonb_build_object('enabled', coalesce(s.enabled, false), 'daily_cap', coalesce(s.daily_cap, 5),
    'window_start', to_char(coalesce(s.window_start, '15:00'::time), 'HH24:MI'), 'window_end', to_char(coalesce(s.window_end, '23:59'::time), 'HH24:MI'),
    'weekend_all_day', coalesce(s.weekend_all_day, true), 'classes', v_classes,
    'matches_this_week', (select count(*) from public.arena_matches m where m.school_id = p_school_id and m.finished_at is not null and m.result <> 'abandoned' and (m.started_at at time zone 'Asia/Bishkek')::date >= v_week));
end $$;
revoke all on function public.rpc_arena_admin_settings(uuid) from public, anon;
grant execute on function public.rpc_arena_admin_settings(uuid) to authenticated;

create or replace function public.rpc_arena_update_school_settings(p_school_id uuid, p_enabled boolean, p_daily_cap integer, p_window_start text, p_window_end text, p_weekend_all_day boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_start time; v_end time;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not private.arena_can_manage_school(v_uid, p_school_id) then raise exception 'NOT_AUTHORIZED'; end if;
  if p_daily_cap is null or p_daily_cap not between 0 and 20 then raise exception 'INVALID_CAP'; end if;
  begin v_start := p_window_start::time; v_end := p_window_end::time; exception when others then raise exception 'INVALID_WINDOW'; end;
  if v_start > v_end then raise exception 'INVALID_WINDOW'; end if;
  insert into public.arena_settings (school_id, class_id, enabled, daily_cap, window_start, window_end, weekend_all_day, updated_at, updated_by)
  values (p_school_id, null, coalesce(p_enabled, false), p_daily_cap, v_start, v_end, coalesce(p_weekend_all_day, true), now(), v_uid)
  on conflict (school_id, coalesce(class_id, '00000000-0000-0000-0000-000000000000'::uuid)) do update
  set enabled = excluded.enabled, daily_cap = excluded.daily_cap, window_start = excluded.window_start, window_end = excluded.window_end,
      weekend_all_day = excluded.weekend_all_day, updated_at = now(), updated_by = v_uid;
  return public.rpc_arena_admin_settings(p_school_id);
end $$;
revoke all on function public.rpc_arena_update_school_settings(uuid, boolean, integer, text, text, boolean) from public, anon;
grant execute on function public.rpc_arena_update_school_settings(uuid, boolean, integer, text, text, boolean) to authenticated;

create or replace function public.rpc_arena_update_class_settings(p_class_id uuid, p_enabled boolean, p_require_assignment boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_school uuid;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not private.arena_can_manage_class(v_uid, p_class_id) then raise exception 'NOT_AUTHORIZED'; end if;
  select c.school_id into v_school from public.classes c where c.id = p_class_id;
  insert into public.arena_settings (school_id, class_id, enabled, require_assignment, updated_at, updated_by)
  values (v_school, p_class_id, coalesce(p_enabled, true), coalesce(p_require_assignment, false), now(), v_uid)
  on conflict (school_id, coalesce(class_id, '00000000-0000-0000-0000-000000000000'::uuid)) do update
  set enabled = excluded.enabled, require_assignment = excluded.require_assignment, updated_at = now(), updated_by = v_uid;
  return public.rpc_arena_teacher_summary(p_class_id);
end $$;
revoke all on function public.rpc_arena_update_class_settings(uuid, boolean, boolean) from public, anon;
grant execute on function public.rpc_arena_update_class_settings(uuid, boolean, boolean) to authenticated;

create or replace function public.rpc_arena_teacher_summary(p_class_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_school uuid; s public.arena_settings%rowtype; cs public.arena_settings%rowtype; v_week date := private.arena_week_start(private.arena_today());
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not private.arena_can_manage_class(v_uid, p_class_id) then raise exception 'NOT_AUTHORIZED'; end if;
  select c.school_id into v_school from public.classes c where c.id = p_class_id;
  select * into s from public.arena_settings where school_id = v_school and class_id is null;
  select * into cs from public.arena_settings where class_id = p_class_id;
  return jsonb_build_object(
    'school_enabled', coalesce(s.enabled, false), 'class_enabled', coalesce(cs.enabled, true), 'require_assignment', coalesce(cs.require_assignment, false),
    'daily_cap', coalesce(s.daily_cap, 5),
    'matches_this_week', (select count(*) from public.arena_matches m where m.class_id = p_class_id and m.finished_at is not null and m.result <> 'abandoned' and (m.started_at at time zone 'Asia/Bishkek')::date >= v_week),
    'respawn_questions_this_week', (select coalesce(sum(m.respawn_questions), 0) from public.arena_matches m where m.class_id = p_class_id and (m.started_at at time zone 'Asia/Bishkek')::date >= v_week),
    'respawn_correct_this_week', (select coalesce(sum(m.respawn_correct), 0) from public.arena_matches m where m.class_id = p_class_id and (m.started_at at time zone 'Asia/Bishkek')::date >= v_week),
    'tickets_earned_this_week', (select coalesce(sum(l.amount), 0) from private.arena_ticket_ledger l join public.class_students st on st.student_id = l.user_id where st.class_id = p_class_id and (l.created_at at time zone 'Asia/Bishkek')::date >= v_week),
    'students', (select count(*) from public.class_students st where st.class_id = p_class_id));
end $$;
revoke all on function public.rpc_arena_teacher_summary(uuid) from public, anon;
grant execute on function public.rpc_arena_teacher_summary(uuid) to authenticated;

-- A teacher can hand a class one bonus ticket each, at most once a day.
create or replace function public.rpc_arena_class_bonus(p_class_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_n integer := 0; st record;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not private.arena_can_manage_class(v_uid, p_class_id) then raise exception 'NOT_AUTHORIZED'; end if;
  if exists (select 1 from private.arena_ticket_ledger l where l.source = 'teacher_bonus:' || p_class_id::text and (l.created_at at time zone 'Asia/Bishkek')::date = private.arena_today()) then
    raise exception 'BONUS_ALREADY_GIVEN';
  end if;
  for st in select cs.student_id from public.class_students cs where cs.class_id = p_class_id loop
    v_n := v_n + private.arena_grant_tickets(st.student_id, 1, 'teacher_bonus:' || p_class_id::text);
  end loop;
  return jsonb_build_object('granted', v_n);
end $$;
revoke all on function public.rpc_arena_class_bonus(uuid) from public, anon;
grant execute on function public.rpc_arena_class_bonus(uuid) to authenticated;

------------------------------------------------------------------------------
-- Tickets from learning work
------------------------------------------------------------------------------
create or replace function private.arena_on_quest_completed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'completed' and (tg_op = 'INSERT' or old.status is distinct from 'completed') then
    perform private.arena_grant_tickets(new.user_id, 1, 'quest');
  end if;
  return new;
end $$;
revoke all on function private.arena_on_quest_completed() from public, anon, authenticated;

create or replace function private.arena_on_assignment_result()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.arena_grant_tickets(new.student_id, 2, 'assignment');
  return new;
end $$;
revoke all on function private.arena_on_assignment_result() from public, anon, authenticated;

create or replace function private.arena_on_quiz_score()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.student_id is not null and coalesce(new.percentage, 0) >= 70 then
    perform private.arena_grant_tickets(new.student_id, 1, 'quiz');
  end if;
  return new;
end $$;
revoke all on function private.arena_on_quiz_score() from public, anon, authenticated;

create or replace function private.arena_on_streak_reward()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.arena_grant_tickets(new.user_id, 1, 'streak');
  return new;
end $$;
revoke all on function private.arena_on_streak_reward() from public, anon, authenticated;

do $$
begin
  if to_regclass('public.quest_runs') is not null then
    drop trigger if exists arena_tickets_on_quest on public.quest_runs;
    create trigger arena_tickets_on_quest after insert or update of status on public.quest_runs
      for each row execute function private.arena_on_quest_completed();
  end if;
  if to_regclass('public.student_assignment_results') is not null then
    drop trigger if exists arena_tickets_on_assignment on public.student_assignment_results;
    create trigger arena_tickets_on_assignment after insert on public.student_assignment_results
      for each row execute function private.arena_on_assignment_result();
  end if;
  if to_regclass('public.quiz_scores') is not null and exists (
    select 1 from information_schema.columns where table_schema = 'public' and table_name = 'quiz_scores' and column_name = 'student_id'
  ) then
    drop trigger if exists arena_tickets_on_quiz on public.quiz_scores;
    create trigger arena_tickets_on_quiz after insert on public.quiz_scores
      for each row execute function private.arena_on_quiz_score();
  end if;
  if to_regclass('public.daily_streak_rewards') is not null then
    drop trigger if exists arena_tickets_on_streak on public.daily_streak_rewards;
    create trigger arena_tickets_on_streak after insert on public.daily_streak_rewards
      for each row execute function private.arena_on_streak_reward();
  end if;
end $$;
