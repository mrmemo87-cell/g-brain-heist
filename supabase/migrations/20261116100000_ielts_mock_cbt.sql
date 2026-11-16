-- Computer-delivered full mock tests (Listening, Reading, Writing) for self-paced and school learners.
-- Diagnostic Bible 2.5.1: 2.1A (computer delivery is the default), 4.1 (form / attempt / item response / scoring run),
-- 5.1-5.4 (keys stay on the server, server scoring, idempotent submission), 6.1 (measured audio, no restart),
-- 9.5 (bh-indicative-v1 ranges for complete, unexposed, timed forms), 12A (mocks feed the learning record).
--
-- Delivery conditions (recorded with every attempt through the form's timing record):
--   Listening: the approved recording plays once from the start of the section; the player cannot pause or rewind.
--     The section ends listen_end seconds after it starts plus 120 s to check answers (computer-delivered IELTS
--     gives 2 minutes, not the 10-minute paper transfer). A reload resumes the recording at the server-measured
--     position; time lost to a reload is not returned.
--   Reading and Writing: 60 minutes each, measured on the server.
--   Saves are accepted until 20 s after a deadline (network grace); the section is then marked with what was saved.
-- Release: 'pilot' (named users and superadmins) or 'full_access' (anyone with full IELTS course access).
-- Opening a form beyond the pilot is an owner decision recorded in authorized_by/authorized_at.

set lock_timeout = '5s';

-- 1. Forms: student payload (no keys), server key, audio and timing records.
create table if not exists private.ielts_mock_cbt_forms (
  code text primary key references private.ielts_mock_forms(code),
  version text not null,
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  payload jsonb not null,
  answer_key jsonb not null,
  audio jsonb not null,
  timing jsonb not null,
  release_scope text not null default 'off' check (release_scope in ('off', 'pilot', 'full_access')),
  pilot_users uuid[] not null default '{}',
  authorized_by uuid references public.users(id),
  authorized_at timestamptz,
  created_at timestamptz not null default now()
);
alter table private.ielts_mock_cbt_forms enable row level security;
revoke all on private.ielts_mock_cbt_forms from public, anon, authenticated;

-- Published content is immutable; corrections need a new form version (Bible 4.1).
create or replace function private.guard_ielts_mock_cbt_form() returns trigger
language plpgsql set search_path to '' as $$
begin
  if (new.code, new.version, new.content_sha256, new.source_sha256, new.payload, new.answer_key, new.audio, new.timing)
     is distinct from (old.code, old.version, old.content_sha256, old.source_sha256, old.payload, old.answer_key, old.audio, old.timing) then
    raise exception 'mock_cbt_form_content_immutable';
  end if;
  return new;
end $$;
drop trigger if exists guard_ielts_mock_cbt_form on private.ielts_mock_cbt_forms;
create trigger guard_ielts_mock_cbt_form before update on private.ielts_mock_cbt_forms
for each row execute function private.guard_ielts_mock_cbt_form();

-- 2. Attempts (one open attempt per learner and mock), scoring runs and Writing reviews.
create table if not exists private.ielts_mock_cbt_attempts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.users(id),
  mock_code text not null references private.ielts_mock_cbt_forms(code),
  form_version text not null,
  content_sha256 text not null,
  attempt_no int not null check (attempt_no > 0),
  exposed boolean not null,
  status text not null default 'in_progress' check (status in ('in_progress', 'completed')),
  section text not null default 'listening' check (section in ('listening', 'reading', 'writing', 'done')),
  section_started_at timestamptz,
  section_deadline timestamptz,
  answers jsonb not null default '{}'::jsonb,
  sections jsonb not null default '{}'::jsonb,
  saved_at timestamptz,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (student_id, mock_code, attempt_no)
);
create unique index if not exists ielts_mock_cbt_one_open on private.ielts_mock_cbt_attempts(student_id, mock_code) where status = 'in_progress';
create index if not exists ielts_mock_cbt_attempts_student on private.ielts_mock_cbt_attempts(student_id, started_at desc);
alter table private.ielts_mock_cbt_attempts enable row level security;
revoke all on private.ielts_mock_cbt_attempts from public, anon, authenticated;

create table if not exists private.ielts_mock_cbt_scores (
  id bigint generated always as identity primary key,
  attempt_id uuid not null references private.ielts_mock_cbt_attempts(id),
  section text not null check (section in ('listening', 'reading')),
  scoring_policy text not null default 'bh-mock-cbt-key-v1',
  raw int not null check (raw between 0 and 40),
  outcomes jsonb not null,
  scored_at timestamptz not null default now(),
  unique (attempt_id, section, scoring_policy)
);
alter table private.ielts_mock_cbt_scores enable row level security;
revoke all on private.ielts_mock_cbt_scores from public, anon, authenticated;

create table if not exists private.ielts_mock_cbt_writing_reviews (
  id bigint generated always as identity primary key,
  attempt_id uuid not null references private.ielts_mock_cbt_attempts(id),
  criteria jsonb not null,
  comment text check (comment is null or length(comment) <= 4000),
  reviewer_id uuid not null references public.users(id),
  reviewed_at timestamptz not null default now()
);
create index if not exists ielts_mock_cbt_writing_reviews_attempt on private.ielts_mock_cbt_writing_reviews(attempt_id, reviewed_at desc);
alter table private.ielts_mock_cbt_writing_reviews enable row level security;
revoke all on private.ielts_mock_cbt_writing_reviews from public, anon, authenticated;

-- 3. Helpers.
create or replace function private.ielts_mock_cbt_can_take(p_code text) returns boolean
language sql stable security definer set search_path to '' as $$
  select auth.uid() is not null and exists(
    select 1 from private.ielts_mock_cbt_forms f join public.users u on u.id = auth.uid()
    where f.code = p_code and not coalesce(u.is_banned, false)
      and ((f.release_scope = 'pilot' and (auth.uid() = any(f.pilot_users) or public.is_superadmin(auth.uid())))
        or (f.release_scope = 'full_access' and private.ielts_course_has_full_access())));
$$;
revoke all on function private.ielts_mock_cbt_can_take(text) from public, anon, authenticated;

-- Text answers: case, spacing, curly quotes, currency signs and a final full stop do not matter; spelling does.
create or replace function private.ielts_mock_cbt_norm(p text) returns text
language sql immutable set search_path to '' as $$
  select nullif(btrim(regexp_replace(regexp_replace(lower(translate(coalesce(p, ''), '’‘“”£$€', '''''""')),
    '[[:space:]]+', ' ', 'g'), '[.,;:!?]+$', '')), '');
$$;
revoke all on function private.ielts_mock_cbt_norm(text) from public, anon, authenticated;

create or replace function private.ielts_mock_cbt_words(p text) returns int
language sql immutable set search_path to '' as $$
  select coalesce(array_length(regexp_split_to_array(nullif(btrim(coalesce(p, '')), ''), '[[:space:]]+'), 1), 0);
$$;
revoke all on function private.ielts_mock_cbt_words(text) from public, anon, authenticated;

-- One mark per question. Completion: any accepted answer within the word limit. Choose TWO: one mark per correct
-- letter in either order. Unanswered is recorded separately from incorrect (Bible 4.1).
create or replace function private.ielts_mock_cbt_score(p_key jsonb, p_answers jsonb) returns jsonb
language plpgsql immutable set search_path to '' as $$
declare
  n int; k jsonb; r text; nr text; ok boolean; outs jsonb := '[]'::jsonb; raw int := 0;
  sel text[]; hits int; a int; b int;
begin
  for n in 1..40 loop
    k := p_key -> (n::text);
    if k is null then raise exception 'mock_cbt_key_incomplete:%', n; end if;
    r := nullif(btrim(coalesce(p_answers ->> (n::text), '')), '');
    if k ->> 't' = 'multi' then
      a := (k -> 'g' ->> 0)::int; b := (k -> 'g' ->> 1)::int;
      select coalesce(array_agg(x order by x), '{}') into sel from (
        select distinct upper(btrim(p_answers ->> (i::text))) x from generate_series(a, b) i
      ) s where x is not null and x <> '';
      select count(*) into hits from unnest(sel) x where x in (select jsonb_array_elements_text(k -> 'a'));
      r := sel[n - a + 1];
      ok := hits >= (n - a + 1);
    elsif k ->> 't' in ('completion', 'short') then
      nr := private.ielts_mock_cbt_norm(r);
      ok := nr is not null and private.ielts_mock_cbt_words(nr) <= (k ->> 'w')::int
        and nr in (select private.ielts_mock_cbt_norm(x) from jsonb_array_elements_text(k -> 'a') x);
    else
      ok := r is not null and upper(regexp_replace(r, '[[:space:]]+', ' ', 'g')) = k -> 'a' ->> 0;
    end if;
    if ok then raw := raw + 1; end if;
    outs := outs || jsonb_build_object('n', n, 'response', r, 'state', case when r is null then 'blank' else 'answered' end, 'correct', ok);
  end loop;
  return jsonb_build_object('raw', raw, 'outcomes', outs);
end $$;
revoke all on function private.ielts_mock_cbt_score(jsonb, jsonb) from public, anon, authenticated;

create or replace function private.ielts_mock_cbt_duration(f private.ielts_mock_cbt_forms, p_section text) returns interval
language sql immutable set search_path to '' as $$
  select case p_section
    when 'listening' then make_interval(secs => (f.audio ->> 'listen_end')::numeric + (f.timing ->> 'listening_review_seconds')::numeric)
    when 'reading' then make_interval(secs => (f.timing ->> 'reading_seconds')::numeric)
    when 'writing' then make_interval(secs => (f.timing ->> 'writing_seconds')::numeric)
  end;
$$;
revoke all on function private.ielts_mock_cbt_duration(private.ielts_mock_cbt_forms, text) from public, anon, authenticated;

-- Close the current section: mark it on the server (Listening/Reading) and move on. Idempotent per section.
create or replace function private.ielts_mock_cbt_close_section(p_attempt uuid, p_reason text) returns void
language plpgsql security definer set search_path to '' as $$
declare t private.ielts_mock_cbt_attempts; f private.ielts_mock_cbt_forms; s jsonb; nxt text;
begin
  select * into t from private.ielts_mock_cbt_attempts where id = p_attempt for update;
  if t.status <> 'in_progress' or t.section = 'done' then return; end if;
  select * into f from private.ielts_mock_cbt_forms where code = t.mock_code;
  if t.section in ('listening', 'reading') then
    s := private.ielts_mock_cbt_score(f.answer_key -> t.section, coalesce(t.answers -> t.section, '{}'::jsonb));
    insert into private.ielts_mock_cbt_scores(attempt_id, section, raw, outcomes)
    values (t.id, t.section, (s ->> 'raw')::int, s -> 'outcomes')
    on conflict (attempt_id, section, scoring_policy) do nothing;
  end if;
  nxt := case t.section when 'listening' then 'reading' when 'reading' then 'writing' else 'done' end;
  update private.ielts_mock_cbt_attempts set
    sections = sections || jsonb_build_object(t.section, jsonb_build_object(
      'started_at', t.section_started_at, 'deadline', t.section_deadline, 'closed_at', now(), 'closed_by', p_reason)),
    section = nxt, section_started_at = null, section_deadline = null,
    status = case when nxt = 'done' then 'completed' else status end,
    completed_at = case when nxt = 'done' then now() else completed_at end
  where id = t.id;
end $$;
revoke all on function private.ielts_mock_cbt_close_section(uuid, text) from public, anon, authenticated;

-- The learner's own attempt, with any expired section closed first.
create or replace function private.ielts_mock_cbt_own_attempt(p_attempt uuid) returns private.ielts_mock_cbt_attempts
language plpgsql security definer set search_path to '' as $$
declare t private.ielts_mock_cbt_attempts; f private.ielts_mock_cbt_forms;
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'not_authenticated'; end if;
  select * into t from private.ielts_mock_cbt_attempts where id = p_attempt and student_id = auth.uid();
  if t.id is null then raise exception using errcode = '42501', message = 'mock_attempt_not_found'; end if;
  select * into f from private.ielts_mock_cbt_forms where code = t.mock_code;
  if t.status = 'in_progress' and t.section_deadline is not null
     and now() > t.section_deadline + make_interval(secs => (f.timing ->> 'grace_seconds')::numeric) then
    perform private.ielts_mock_cbt_close_section(t.id, 'time');
    select * into t from private.ielts_mock_cbt_attempts where id = p_attempt;
  end if;
  return t;
end $$;
revoke all on function private.ielts_mock_cbt_own_attempt(uuid) from public, anon, authenticated;

-- An attempt is practice (exposed) when the learner already met this mock: an earlier computer attempt or a paper sitting.
create or replace function private.ielts_mock_cbt_seen_before(p_student uuid, p_code text, p_before timestamptz) returns boolean
language sql stable security definer set search_path to '' as $$
  select exists(select 1 from private.ielts_mock_cbt_attempts a where a.student_id = p_student and a.mock_code = p_code and a.started_at < p_before)
      or exists(select 1 from private.ielts_mock_results r join private.ielts_mock_sittings s on s.id = r.sitting_id
                where r.student_id = p_student and s.mock_code = p_code
                  and (s.sat_on::timestamp at time zone 'Asia/Bishkek') < p_before);
$$;
revoke all on function private.ielts_mock_cbt_seen_before(uuid, text, timestamptz) from public, anon, authenticated;

-- A paper sitting is also exposed when the learner already took the same mock on computer.
create or replace function private.ielts_mock_exposed(p_student uuid, p_sitting uuid) returns boolean
language sql stable security definer set search_path to '' as $$
 select exists(select 1 from private.ielts_mock_results r join private.ielts_mock_sittings s on s.id = r.sitting_id
  join private.ielts_mock_sittings me on me.id = p_sitting
  where r.student_id = p_student and s.mock_code = me.mock_code and s.id <> me.id and (s.sat_on, s.created_at) < (me.sat_on, me.created_at))
 or exists(select 1 from private.ielts_mock_cbt_attempts a join private.ielts_mock_sittings me on me.id = p_sitting
  where a.student_id = p_student and a.mock_code = me.mock_code and a.started_at < (me.sat_on::timestamp at time zone 'Asia/Bishkek'))
$$;
revoke all on function private.ielts_mock_exposed(uuid, uuid) from public, anon, authenticated;

-- 4. Learner RPCs.
create or replace function public.rpc_ielts_mock_cbt_home() returns jsonb
language plpgsql volatile security definer set search_path to '' as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'not_authenticated'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'code', f.code, 'title', f.payload ->> 'title', 'version', f.version,
      'available', private.ielts_mock_cbt_can_take(f.code),
      'minutes', round(((f.audio ->> 'listen_end')::numeric + (f.timing ->> 'listening_review_seconds')::numeric
                 + (f.timing ->> 'reading_seconds')::numeric + (f.timing ->> 'writing_seconds')::numeric) / 60),
      'attempts', (select coalesce(jsonb_agg(jsonb_build_object(
          'id', a.id, 'status', a.status, 'section', a.section, 'attempt_no', a.attempt_no, 'practice', a.exposed,
          'started_at', a.started_at, 'completed_at', a.completed_at,
          'listening', (select s.raw from private.ielts_mock_cbt_scores s where s.attempt_id = a.id and s.section = 'listening'),
          'reading', (select s.raw from private.ielts_mock_cbt_scores s where s.attempt_id = a.id and s.section = 'reading'),
          'writing_reviewed', exists(select 1 from private.ielts_mock_cbt_writing_reviews w where w.attempt_id = a.id))
          order by a.started_at desc), '[]'::jsonb)
        from private.ielts_mock_cbt_attempts a where a.student_id = v_actor and a.mock_code = f.code))
    order by f.code)
    from private.ielts_mock_cbt_forms f
    where private.ielts_mock_cbt_can_take(f.code)
       or exists(select 1 from private.ielts_mock_cbt_attempts a where a.student_id = v_actor and a.mock_code = f.code)), '[]'::jsonb);
end $$;
revoke all on function public.rpc_ielts_mock_cbt_home() from public, anon;
grant execute on function public.rpc_ielts_mock_cbt_home() to authenticated;

create or replace function public.rpc_ielts_mock_cbt_start(p_code text) returns jsonb
language plpgsql volatile security definer set search_path to '' as $$
declare v_actor uuid := auth.uid(); f private.ielts_mock_cbt_forms; v_id uuid; v_no int;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'not_authenticated'; end if;
  select id into v_id from private.ielts_mock_cbt_attempts where student_id = v_actor and mock_code = p_code and status = 'in_progress';
  if v_id is not null then return jsonb_build_object('attempt_id', v_id, 'resumed', true); end if;
  if not private.ielts_mock_cbt_can_take(p_code) then raise exception using errcode = '42501', message = 'mock_not_available'; end if;
  select * into f from private.ielts_mock_cbt_forms where code = p_code;
  perform pg_advisory_xact_lock(hashtext('ielts_mock_cbt:' || v_actor::text || ':' || p_code));
  select id into v_id from private.ielts_mock_cbt_attempts where student_id = v_actor and mock_code = p_code and status = 'in_progress';
  if v_id is not null then return jsonb_build_object('attempt_id', v_id, 'resumed', true); end if;
  select coalesce(max(attempt_no), 0) + 1 into v_no from private.ielts_mock_cbt_attempts where student_id = v_actor and mock_code = p_code;
  insert into private.ielts_mock_cbt_attempts(student_id, mock_code, form_version, content_sha256, attempt_no, exposed)
  values (v_actor, f.code, f.version, f.content_sha256, v_no, private.ielts_mock_cbt_seen_before(v_actor, f.code, now()))
  returning id into v_id;
  return jsonb_build_object('attempt_id', v_id, 'resumed', false);
end $$;
revoke all on function public.rpc_ielts_mock_cbt_start(text) from public, anon;
grant execute on function public.rpc_ielts_mock_cbt_start(text) to authenticated;

-- Current section only: Reading content is not sent before the Reading section starts, and so on.
create or replace function public.rpc_ielts_mock_cbt_state(p_attempt uuid) returns jsonb
language plpgsql volatile security definer set search_path to '' as $$
declare t private.ielts_mock_cbt_attempts; f private.ielts_mock_cbt_forms; v_payload jsonb;
begin
  t := private.ielts_mock_cbt_own_attempt(p_attempt);
  select * into f from private.ielts_mock_cbt_forms where code = t.mock_code;
  if t.section in ('listening', 'reading', 'writing') and t.section_started_at is not null then
    v_payload := f.payload -> t.section;
  end if;
  return jsonb_build_object(
    'attempt_id', t.id, 'code', t.mock_code, 'title', f.payload ->> 'title', 'version', t.form_version,
    'status', t.status, 'section', t.section, 'practice', t.exposed, 'attempt_no', t.attempt_no,
    'started', t.section_started_at is not null, 'section_started_at', t.section_started_at,
    'deadline', t.section_deadline, 'server_now', now(),
    'remaining_seconds', case when t.section_deadline is null then null else greatest(0, extract(epoch from (t.section_deadline - now())))::int end,
    'section_seconds', case when t.section in ('listening', 'reading', 'writing') then extract(epoch from private.ielts_mock_cbt_duration(f, t.section))::int end,
    'audio', case when t.section = 'listening' then jsonb_build_object('url', f.audio ->> 'url', 'listen_end', (f.audio ->> 'listen_end')::numeric,
      'sample_end', (f.audio ->> 'sample_end')::numeric, 'review_seconds', (f.timing ->> 'listening_review_seconds')::int,
      'elapsed', case when t.section_started_at is null then null else extract(epoch from (now() - t.section_started_at)) end) end,
    'payload', v_payload,
    'answers', case when v_payload is null then null else coalesce(t.answers -> t.section, '{}'::jsonb) end,
    'saved_at', t.saved_at);
end $$;
revoke all on function public.rpc_ielts_mock_cbt_state(uuid) from public, anon;
grant execute on function public.rpc_ielts_mock_cbt_state(uuid) to authenticated;

create or replace function public.rpc_ielts_mock_cbt_begin_section(p_attempt uuid, p_section text) returns jsonb
language plpgsql volatile security definer set search_path to '' as $$
declare t private.ielts_mock_cbt_attempts; f private.ielts_mock_cbt_forms;
begin
  t := private.ielts_mock_cbt_own_attempt(p_attempt);
  if t.status = 'in_progress' and t.section = p_section and t.section_started_at is null then
    select * into f from private.ielts_mock_cbt_forms where code = t.mock_code;
    update private.ielts_mock_cbt_attempts
      set section_started_at = now(), section_deadline = now() + private.ielts_mock_cbt_duration(f, p_section)
      where id = t.id and section_started_at is null;
  end if;
  return public.rpc_ielts_mock_cbt_state(p_attempt);
end $$;
revoke all on function public.rpc_ielts_mock_cbt_begin_section(uuid, text) from public, anon;
grant execute on function public.rpc_ielts_mock_cbt_begin_section(uuid, text) to authenticated;

-- Answers: Listening/Reading {"1".."40": text up to 60 characters}; Writing {"t1","t2": text up to 12,000 characters}.
create or replace function private.ielts_mock_cbt_clean(p_section text, p_answers jsonb) returns jsonb
language plpgsql immutable set search_path to '' as $$
declare v jsonb := '{}'::jsonb; k text; x jsonb;
begin
  if jsonb_typeof(p_answers) is distinct from 'object' then raise exception 'invalid_answers'; end if;
  for k, x in select * from jsonb_each(p_answers) loop
    if jsonb_typeof(x) <> 'string' then raise exception 'invalid_answers'; end if;
    if p_section = 'writing' then
      if k not in ('t1', 't2') or length(x #>> '{}') > 12000 then raise exception 'invalid_answers'; end if;
      v := v || jsonb_build_object(k, x #>> '{}');
    else
      if k !~ '^[0-9]{1,2}$' or k::int not between 1 and 40 or length(x #>> '{}') > 60 then raise exception 'invalid_answers'; end if;
      if btrim(x #>> '{}') <> '' then v := v || jsonb_build_object(k, btrim(x #>> '{}')); end if;
    end if;
  end loop;
  return v;
end $$;
revoke all on function private.ielts_mock_cbt_clean(text, jsonb) from public, anon, authenticated;

create or replace function public.rpc_ielts_mock_cbt_save(p_attempt uuid, p_section text, p_answers jsonb) returns jsonb
language plpgsql volatile security definer set search_path to '' as $$
declare t private.ielts_mock_cbt_attempts; v jsonb;
begin
  t := private.ielts_mock_cbt_own_attempt(p_attempt);
  if t.status <> 'in_progress' or t.section <> p_section or t.section_started_at is null then
    return jsonb_build_object('saved', false, 'reason', 'section_closed', 'section', t.section, 'status', t.status);
  end if;
  v := private.ielts_mock_cbt_clean(p_section, p_answers);
  update private.ielts_mock_cbt_attempts set answers = answers || jsonb_build_object(p_section, v), saved_at = now()
  where id = t.id and section = p_section and status = 'in_progress';
  return jsonb_build_object('saved', true, 'saved_at', now(),
    'remaining_seconds', greatest(0, extract(epoch from (t.section_deadline - now())))::int);
end $$;
revoke all on function public.rpc_ielts_mock_cbt_save(uuid, text, jsonb) from public, anon;
grant execute on function public.rpc_ielts_mock_cbt_save(uuid, text, jsonb) to authenticated;

-- Finish the section early (learner confirms) or at time-out; the final answers are saved first if still in time.
create or replace function public.rpc_ielts_mock_cbt_finish_section(p_attempt uuid, p_section text, p_answers jsonb default null) returns jsonb
language plpgsql volatile security definer set search_path to '' as $$
declare t private.ielts_mock_cbt_attempts;
begin
  t := private.ielts_mock_cbt_own_attempt(p_attempt);
  if t.status = 'in_progress' and t.section = p_section and t.section_started_at is not null then
    if p_answers is not null then perform public.rpc_ielts_mock_cbt_save(p_attempt, p_section, p_answers); end if;
    perform private.ielts_mock_cbt_close_section(t.id, case when now() >= t.section_deadline then 'time' else 'learner' end);
  end if;
  return public.rpc_ielts_mock_cbt_state(p_attempt);
end $$;
revoke all on function public.rpc_ielts_mock_cbt_finish_section(uuid, text, jsonb) from public, anon;
grant execute on function public.rpc_ielts_mock_cbt_finish_section(uuid, text, jsonb) to authenticated;

-- 5. Results: only for a completed attempt, to its learner or a superadmin. Keys are shown after scoring (Bible 5.1).
create or replace function private.ielts_mock_cbt_key_text(k jsonb) returns text
language sql immutable set search_path to '' as $$
  select case when k ->> 't' = 'multi' then (k -> 'a' ->> 0) || ' and ' || (k -> 'a' ->> 1) || ' (in either order)'
    when k ->> 't' in ('completion', 'short') then (select string_agg(x, ' / ') from jsonb_array_elements_text(k -> 'a') x)
    when k -> 'a' ->> 0 = 'NOT GIVEN' then 'NOT GIVEN' else k -> 'a' ->> 0 end;
$$;
revoke all on function private.ielts_mock_cbt_key_text(jsonb) from public, anon, authenticated;

create or replace function private.ielts_mock_cbt_result_json(p_attempt uuid) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare t private.ielts_mock_cbt_attempts; f private.ielts_mock_cbt_forms; v_out jsonb; s private.ielts_mock_cbt_scores; sk text;
  w private.ielts_mock_cbt_writing_reviews; skills jsonb := '{}'::jsonb;
begin
  select * into t from private.ielts_mock_cbt_attempts where id = p_attempt;
  select * into f from private.ielts_mock_cbt_forms where code = t.mock_code;
  foreach sk in array array['listening', 'reading'] loop
    select * into s from private.ielts_mock_cbt_scores where attempt_id = t.id and section = sk order by scored_at desc limit 1;
    if s.id is not null then
      skills := skills || jsonb_build_object(sk, jsonb_build_object(
        'raw', s.raw, 'scoring_policy', s.scoring_policy,
        'indicative', case when not t.exposed then private.ielts_indicative_objective(sk, s.raw) end,
        'items', (select jsonb_agg(o || jsonb_build_object('key', private.ielts_mock_cbt_key_text(f.answer_key -> sk -> (o ->> 'n'))) order by (o ->> 'n')::int)
                  from jsonb_array_elements(s.outcomes) o)));
    end if;
  end loop;
  select * into w from private.ielts_mock_cbt_writing_reviews where attempt_id = t.id order by reviewed_at desc, id desc limit 1;
  skills := skills || jsonb_build_object('writing', jsonb_build_object(
    't1', coalesce(t.answers -> 'writing' ->> 't1', ''), 't2', coalesce(t.answers -> 'writing' ->> 't2', ''),
    't1_words', private.ielts_mock_cbt_words(t.answers -> 'writing' ->> 't1'),
    't2_words', private.ielts_mock_cbt_words(t.answers -> 'writing' ->> 't2'),
    'review', case when w.id is null then null else jsonb_build_object('criteria', w.criteria, 'comment', w.comment, 'reviewed_at', w.reviewed_at,
      'indicative', case when not t.exposed then private.ielts_indicative_productive('writing', w.criteria) end) end));
  v_out := jsonb_build_object('attempt_id', t.id, 'code', t.mock_code, 'title', f.payload ->> 'title', 'version', t.form_version,
    'status', t.status, 'practice', t.exposed, 'attempt_no', t.attempt_no, 'started_at', t.started_at, 'completed_at', t.completed_at,
    'sections', t.sections, 'skills', skills,
    'payload', jsonb_build_object('listening', f.payload -> 'listening', 'reading', f.payload -> 'reading', 'writing', f.payload -> 'writing'));
  return v_out;
end $$;
revoke all on function private.ielts_mock_cbt_result_json(uuid) from public, anon, authenticated;

create or replace function public.rpc_ielts_mock_cbt_result(p_attempt uuid) returns jsonb
language plpgsql volatile security definer set search_path to '' as $$
declare t private.ielts_mock_cbt_attempts;
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'not_authenticated'; end if;
  if public.is_superadmin(auth.uid()) then
    select * into t from private.ielts_mock_cbt_attempts where id = p_attempt;
  else
    t := private.ielts_mock_cbt_own_attempt(p_attempt);
  end if;
  if t.id is null then raise exception using errcode = '42501', message = 'mock_attempt_not_found'; end if;
  if t.status <> 'completed' then return jsonb_build_object('attempt_id', t.id, 'status', t.status, 'section', t.section); end if;
  return private.ielts_mock_cbt_result_json(t.id);
end $$;
revoke all on function public.rpc_ielts_mock_cbt_result(uuid) from public, anon;
grant execute on function public.rpc_ielts_mock_cbt_result(uuid) to authenticated;

-- 6. Writing marking (superadmin, until school teacher marking is added). Both tasks, four criteria each, half bands.
create or replace function public.rpc_ielts_mock_cbt_marking_queue() returns jsonb
language plpgsql stable security definer set search_path to '' as $$
begin
  if not public.is_superadmin(auth.uid()) then raise exception using errcode = '42501', message = 'not_authorized'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'attempt_id', a.id, 'code', a.mock_code, 'student', coalesce(nullif(u.full_name, ''), u.username), 'completed_at', a.completed_at,
      'practice', a.exposed, 'attempt_no', a.attempt_no,
      't1_words', private.ielts_mock_cbt_words(a.answers -> 'writing' ->> 't1'),
      't2_words', private.ielts_mock_cbt_words(a.answers -> 'writing' ->> 't2'),
      'reviewed_at', (select max(w.reviewed_at) from private.ielts_mock_cbt_writing_reviews w where w.attempt_id = a.id))
      order by (exists(select 1 from private.ielts_mock_cbt_writing_reviews w where w.attempt_id = a.id)), a.completed_at desc)
    from private.ielts_mock_cbt_attempts a join public.users u on u.id = a.student_id
    where a.status = 'completed'), '[]'::jsonb);
end $$;
revoke all on function public.rpc_ielts_mock_cbt_marking_queue() from public, anon;
grant execute on function public.rpc_ielts_mock_cbt_marking_queue() to authenticated;

create or replace function public.rpc_ielts_mock_cbt_mark_writing(p_attempt uuid, p_criteria jsonb, p_comment text default null) returns jsonb
language plpgsql volatile security definer set search_path to '' as $$
declare v jsonb;
begin
  if not public.is_superadmin(auth.uid()) then raise exception using errcode = '42501', message = 'not_authorized'; end if;
  if not exists(select 1 from private.ielts_mock_cbt_attempts where id = p_attempt and status = 'completed') then
    raise exception 'mock_attempt_not_completed';
  end if;
  v := jsonb_build_object('t1', jsonb_build_object('ta', p_criteria -> 't1' -> 'ta', 'cc', p_criteria -> 't1' -> 'cc', 'lr', p_criteria -> 't1' -> 'lr', 'gra', p_criteria -> 't1' -> 'gra'),
                          't2', jsonb_build_object('tr', p_criteria -> 't2' -> 'tr', 'cc', p_criteria -> 't2' -> 'cc', 'lr', p_criteria -> 't2' -> 'lr', 'gra', p_criteria -> 't2' -> 'gra'));
  if private.ielts_indicative_productive('writing', v) is null then raise exception 'invalid_writing_criteria'; end if;
  insert into private.ielts_mock_cbt_writing_reviews(attempt_id, criteria, comment, reviewer_id)
  values (p_attempt, v, nullif(btrim(coalesce(p_comment, '')), ''), auth.uid());
  return private.ielts_mock_cbt_result_json(p_attempt);
end $$;
revoke all on function public.rpc_ielts_mock_cbt_mark_writing(uuid, jsonb, text) from public, anon;
grant execute on function public.rpc_ielts_mock_cbt_mark_writing(uuid, jsonb, text) to authenticated;

-- 7. Computer-delivered item outcomes join the learning record through the approved mock construct maps (Bible 12A).
create or replace function private.ielts_student_construct_sources(p_student uuid)
returns table(node_id uuid, skill text, kind text, source_key text, at timestamptz, opps int, correct int, independent boolean)
language sql stable security definer set search_path to '' as $$
 with attempts as (
  select e.attempt_id, e.version_id, e.started_at,
         row_number() over (partition by e.version_id order by e.started_at, e.attempt_id) as nth
  from private.ielts_diagnostic_attempt_evidence e
  where e.student_id = p_student and exists(select 1 from private.ielts_diagnostic_scoring_runs r where r.attempt_id = e.attempt_id)
 ), runs as (
  select distinct on (r.attempt_id) r.attempt_id, r.outcomes, r.created_at
  from private.ielts_diagnostic_scoring_runs r join attempts a on a.attempt_id = r.attempt_id
  where r.server_verified
  order by r.attempt_id, r.run_version desc, r.created_at desc
 ), screener as (
  select n.id as node_id, o->>'skill' as skill, 'screener'::text as kind, a.attempt_id::text as source_key,
         coalesce(a.started_at, r.created_at) as at,
         sum((o->>'marks_possible')::int)::int as opps, sum((o->>'marks_awarded')::int)::int as correct, a.nth = 1 as independent
  from runs r join attempts a using (attempt_id)
  cross join lateral jsonb_array_elements(r.outcomes) o
  join public.academic_skill_registry_nodes n on n.code = o->>'construct'
  where o->>'response_state' = 'answered'
  group by n.id, o->>'skill', a.attempt_id, a.started_at, r.created_at, a.nth
 ), targeted as (
  select (o->>'taxonomy_node_id')::uuid as node_id, t.skill, 'targeted'::text as kind, al.id::text as source_key, s.submitted_at as at,
         count(*)::int as opps, count(*) filter (where (o->>'correct')::boolean)::int as correct,
         t.purpose = 'independent_check' and not exists(
           select 1 from private.ielts_learning_allocations p where p.student_id = al.student_id and p.task_code = al.task_code and p.created_at < al.created_at) as independent
  from private.ielts_learning_allocations al
  join private.ielts_learning_submissions s on s.allocation_id = al.id
  join private.ielts_learning_tasks t on t.code = al.task_code
  cross join lateral jsonb_array_elements(s.outcomes) o
  where al.student_id = p_student and t.skill in ('listening','reading') and o ? 'taxonomy_node_id' and o->>'response_state' = 'answered'
  group by 1, t.skill, al.id, al.student_id, al.task_code, al.created_at, s.submitted_at, t.purpose
 ), mock as (
  select m.node_id, r.section as skill, 'mock'::text as kind, s.id::text || ':' || r.section as source_key,
         (s.sat_on::timestamp at time zone 'Asia/Bishkek') as at,
         count(*)::int as opps, count(*) filter (where substr(r.marks, i, 1) = '1')::int as correct,
         not private.ielts_mock_exposed(r.student_id, s.id) as independent
  from private.ielts_mock_results r
  join private.ielts_mock_sittings s on s.id = r.sitting_id
  cross join generate_series(1, 40) i
  join private.ielts_material_construct_maps m on m.material_type = 'mock' and m.material_id = s.mock_code
   and m.item_key = (case r.section when 'listening' then 'L' else 'R' end) || i::text and m.status = 'approved' and m.role = 'primary'
  where r.student_id = p_student and r.marks is not null and substr(r.marks, i, 1) <> '-'
  group by m.node_id, r.section, s.id, s.sat_on, r.student_id
 ), mock_cbt as (
  select m.node_id, sc.section as skill, 'mock'::text as kind, 'cbt:' || a.id::text || ':' || sc.section as source_key,
         sc.scored_at as at,
         count(*)::int as opps, count(*) filter (where (o->>'correct')::boolean)::int as correct,
         not a.exposed as independent
  from private.ielts_mock_cbt_attempts a
  join private.ielts_mock_cbt_scores sc on sc.attempt_id = a.id
  cross join lateral jsonb_array_elements(sc.outcomes) o
  join private.ielts_material_construct_maps m on m.material_type = 'mock' and m.material_id = a.mock_code
   and m.item_key = (case sc.section when 'listening' then 'L' else 'R' end) || (o->>'n') and m.status = 'approved' and m.role = 'primary'
  where a.student_id = p_student and o->>'state' = 'answered'
  group by m.node_id, sc.section, a.id, sc.scored_at, a.exposed
 )
 select * from screener union all select * from targeted union all select * from mock union all select * from mock_cbt;
$$;
revoke all on function private.ielts_student_construct_sources(uuid) from public, anon, authenticated;
