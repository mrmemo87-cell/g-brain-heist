-- Phase 5 IELTS Writing & Speaking Teacher Review Workflow foundation.
-- Adds school-scoped, human teacher review support for productive-skill attempts.
-- This migration intentionally does not add AI grading, analytics expansion, PDF
-- reporting, moderation AI, new exam systems, or protected answer data exposure.

create extension if not exists pgcrypto;

create table if not exists public.ielts_productive_skill_reviews (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.users(id) on delete cascade,
  attempt_type text not null check (attempt_type in ('writing', 'speaking')),
  attempt_id text not null,
  review_status text not null default 'pending' check (review_status in ('pending', 'in_review', 'finalized')),
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  rubric jsonb not null default '{}'::jsonb,
  overall_band numeric check (overall_band is null or (overall_band >= 0 and overall_band <= 9 and overall_band * 2 = floor(overall_band * 2))),
  strengths text,
  improvements text,
  next_steps text,
  teacher_feedback text,
  private_notes text,
  finalized boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (attempt_type, attempt_id)
);

create table if not exists public.ielts_productive_skill_review_events (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.ielts_productive_skill_reviews(id) on delete cascade,
  actor_id uuid references public.users(id) on delete set null,
  event_type text not null check (event_type in ('created', 'saved', 'finalized')),
  previous_status text,
  next_status text,
  previous_overall_band numeric,
  next_overall_band numeric,
  created_at timestamptz not null default now()
);

create index if not exists idx_ielts_productive_skill_reviews_school_status on public.ielts_productive_skill_reviews(school_id, review_status, updated_at desc);
create index if not exists idx_ielts_productive_skill_reviews_student on public.ielts_productive_skill_reviews(student_id, updated_at desc);
create index if not exists idx_ielts_productive_skill_reviews_attempt on public.ielts_productive_skill_reviews(attempt_type, attempt_id);
create index if not exists idx_ielts_productive_skill_review_events_review on public.ielts_productive_skill_review_events(review_id, created_at desc);

alter table public.ielts_productive_skill_reviews enable row level security;
alter table public.ielts_productive_skill_review_events enable row level security;

create or replace function public.ielts_review_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_ielts_productive_skill_reviews_updated_at on public.ielts_productive_skill_reviews;
create trigger trg_ielts_productive_skill_reviews_updated_at
  before update on public.ielts_productive_skill_reviews
  for each row execute function public.ielts_review_touch_updated_at();

-- Optional compatibility columns on legacy attempt tables. Attempts remain the
-- source history; finalized review metadata is also snapshotted onto attempts
-- when columns are present for readiness compatibility.
alter table if exists public.ielts_writing_attempts add column if not exists review_status text not null default 'pending';
alter table if exists public.ielts_writing_attempts add column if not exists reviewed_by uuid references public.users(id) on delete set null;
alter table if exists public.ielts_writing_attempts add column if not exists reviewed_at timestamptz;
alter table if exists public.ielts_writing_attempts add column if not exists rubric_bands jsonb not null default '{}'::jsonb;
alter table if exists public.ielts_writing_attempts add column if not exists band_overall numeric;
alter table if exists public.ielts_writing_attempts add column if not exists teacher_feedback jsonb not null default '{}'::jsonb;
alter table if exists public.ielts_writing_attempts add column if not exists private_notes text;

alter table if exists public.ielts_speaking_attempts add column if not exists review_status text not null default 'pending';
alter table if exists public.ielts_speaking_attempts add column if not exists reviewed_by uuid references public.users(id) on delete set null;
alter table if exists public.ielts_speaking_attempts add column if not exists reviewed_at timestamptz;
alter table if exists public.ielts_speaking_attempts add column if not exists rubric_bands jsonb not null default '{}'::jsonb;
alter table if exists public.ielts_speaking_attempts add column if not exists band_overall numeric;
alter table if exists public.ielts_speaking_attempts add column if not exists teacher_feedback jsonb not null default '{}'::jsonb;
alter table if exists public.ielts_speaking_attempts add column if not exists private_notes text;

create or replace function public.ielts_review_normalize_band(p_band numeric)
returns numeric
language sql
immutable
as $$
  select case
    when p_band is null then null::numeric
    when p_band < 0 or p_band > 9 then null::numeric
    else round(p_band * 2) / 2
  end;
$$;

create or replace function public.can_review_ielts_productive_submission(p_school_id uuid, p_class_id uuid, p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and public.can_manage_ielts_practice_school(p_school_id);
$$;

create or replace function public.ielts_productive_review_seed(
  p_attempt_type text,
  p_attempt_id text,
  p_student_id uuid,
  p_school_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_review_id uuid;
begin
  insert into public.ielts_productive_skill_reviews (attempt_type, attempt_id, student_id, school_id, review_status)
  values (p_attempt_type, p_attempt_id, p_student_id, p_school_id, 'pending')
  on conflict (attempt_type, attempt_id) do update
    set school_id = excluded.school_id,
        student_id = excluded.student_id
  returning id into v_review_id;

  return v_review_id;
end;
$$;

create or replace function public.ielts_review_attempt_payload(p_skill text, p_attempt_id text, p_for_student boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb := '{}'::jsonb;
begin
  if p_skill = 'writing' and to_regclass('public.ielts_writing_attempts') is not null then
    select jsonb_build_object(
      'attempt_id', a.id::text,
      'skill', 'writing',
      'student_id', a.user_id,
      'submitted_at', a.submitted_at,
      'prompt', t.prompt,
      'task_title', t.title,
      'task_type', t.task_type,
      'student_answer', case when p_for_student then null else a.answer_text end,
      'word_count', a.word_count
    ) into v_payload
    from public.ielts_writing_attempts a
    left join public.ielts_writing_tasks t on t.id::text = a.task_id::text
    where a.id::text = p_attempt_id;
  elsif p_skill = 'speaking' and to_regclass('public.ielts_speaking_attempts') is not null then
    select jsonb_build_object(
      'attempt_id', a.id::text,
      'skill', 'speaking',
      'student_id', a.user_id,
      'submitted_at', a.submitted_at,
      'prompt', t.prompt,
      'task_title', t.title,
      'part', t.part,
      'transcript', case when p_for_student then null else coalesce(to_jsonb(a)->>'transcript', to_jsonb(a)->>'transcript_text') end,
      'audio_url', case when p_for_student then null else a.audio_url end,
      'duration_seconds', nullif(to_jsonb(a)->>'duration_seconds', '')::int
    ) into v_payload
    from public.ielts_speaking_attempts a
    left join public.ielts_speaking_tasks t on t.id::text = a.task_id::text
    where a.id::text = p_attempt_id;
  end if;
  return coalesce(v_payload, '{}'::jsonb);
end;
$$;

create or replace function public.rpc_ielts_review_queue(
  p_school_id uuid default null,
  p_class_id uuid default null,
  p_student_id uuid default null,
  p_skill text default null,
  p_review_status text default null,
  p_limit int default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_school_id uuid;
  v_limit int := least(greatest(coalesce(p_limit, 100), 1), 200);
begin
  if v_actor_id is null then raise exception 'not_authenticated'; end if;

  v_school_id := p_school_id;
  if v_school_id is null and p_student_id is not null then
    select u.school_id into v_school_id from public.users u where u.id = p_student_id;
  end if;
  if v_school_id is null then
    select u.school_id into v_school_id from public.users u where u.id = v_actor_id;
  end if;
  if v_school_id is null then raise exception 'school_required'; end if;

  if not public.can_manage_ielts_practice_school(v_school_id) then
    raise exception 'forbidden';
  end if;

  create temporary table if not exists tmp_ielts_review_queue (
    skill text,
    attempt_id text,
    student_id uuid,
    student_name text,
    class_id uuid,
    class_name text,
    submitted_at timestamptz,
    review_id uuid,
    review_status text,
    overall_band numeric,
    reviewed_by uuid,
    reviewed_at timestamptz,
    prompt text,
    task_title text,
    word_count int,
    duration_seconds int
  ) on commit drop;
  truncate tmp_ielts_review_queue;

  if (p_skill is null or p_skill = 'writing') and to_regclass('public.ielts_writing_attempts') is not null then
    insert into tmp_ielts_review_queue
    select 'writing', a.id::text, u.id, coalesce(u.username, u.email), c.id, c.class_name, a.submitted_at,
      r.id, coalesce(r.review_status, coalesce(a.review_status, 'pending')), coalesce(r.overall_band, a.band_overall), coalesce(r.reviewed_by, a.reviewed_by), coalesce(r.reviewed_at, a.reviewed_at),
      t.prompt, t.title, a.word_count, null::int
    from public.ielts_writing_attempts a
    join public.users u on u.id = a.user_id and u.school_id = v_school_id
    left join public.class_students cs on cs.student_id = u.id
    left join public.classes c on c.id = cs.class_id and c.school_id = v_school_id
    left join public.ielts_writing_tasks t on t.id::text = a.task_id::text
    left join public.ielts_productive_skill_reviews r on r.attempt_type = 'writing' and r.attempt_id = a.id::text
    where (p_class_id is null or c.id = p_class_id)
      and (p_student_id is null or u.id = p_student_id)
      and public.can_review_ielts_productive_submission(v_school_id, c.id, u.id)
      and (p_review_status is null or coalesce(r.review_status, coalesce(a.review_status, 'pending')) = p_review_status);
  end if;

  if (p_skill is null or p_skill = 'speaking') and to_regclass('public.ielts_speaking_attempts') is not null then
    insert into tmp_ielts_review_queue
    select 'speaking', a.id::text, u.id, coalesce(u.username, u.email), c.id, c.class_name, a.submitted_at,
      r.id, coalesce(r.review_status, coalesce(a.review_status, 'pending')), coalesce(r.overall_band, a.band_overall), coalesce(r.reviewed_by, a.reviewed_by), coalesce(r.reviewed_at, a.reviewed_at),
      t.prompt, t.title, null::int, nullif(to_jsonb(a)->>'duration_seconds', '')::int
    from public.ielts_speaking_attempts a
    join public.users u on u.id = a.user_id and u.school_id = v_school_id
    left join public.class_students cs on cs.student_id = u.id
    left join public.classes c on c.id = cs.class_id and c.school_id = v_school_id
    left join public.ielts_speaking_tasks t on t.id::text = a.task_id::text
    left join public.ielts_productive_skill_reviews r on r.attempt_type = 'speaking' and r.attempt_id = a.id::text
    where (p_class_id is null or c.id = p_class_id)
      and (p_student_id is null or u.id = p_student_id)
      and public.can_review_ielts_productive_submission(v_school_id, c.id, u.id)
      and (p_review_status is null or coalesce(r.review_status, coalesce(a.review_status, 'pending')) = p_review_status);
  end if;

  return coalesce((
    select jsonb_agg(to_jsonb(q) order by q.submitted_at desc nulls last)
    from (select distinct on (skill, attempt_id) * from tmp_ielts_review_queue order by skill, attempt_id, class_name nulls last limit v_limit) q
  ), '[]'::jsonb);
end;
$$;

create or replace function public.rpc_ielts_review_detail(p_skill text, p_attempt_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_payload jsonb;
  v_student_id uuid;
  v_school_id uuid;
  v_class_id uuid;
  v_review public.ielts_productive_skill_reviews%rowtype;
  v_for_student boolean := false;
begin
  if v_actor_id is null then raise exception 'not_authenticated'; end if;
  if p_skill not in ('writing', 'speaking') then raise exception 'invalid_skill'; end if;

  v_payload := public.ielts_review_attempt_payload(p_skill, p_attempt_id, false);
  v_student_id := nullif(v_payload->>'student_id', '')::uuid;
  if v_student_id is null then raise exception 'submission_not_found'; end if;
  select u.school_id into v_school_id from public.users u where u.id = v_student_id;
  select cs.class_id into v_class_id from public.class_students cs join public.classes c on c.id = cs.class_id and c.school_id = v_school_id where cs.student_id = v_student_id limit 1;

  v_for_student := (v_actor_id = v_student_id);
  if not v_for_student and not public.can_review_ielts_productive_submission(v_school_id, v_class_id, v_student_id) then
    raise exception 'forbidden';
  end if;

  perform public.ielts_productive_review_seed(p_skill, p_attempt_id, v_student_id, v_school_id);
  select * into v_review from public.ielts_productive_skill_reviews where attempt_type = p_skill and attempt_id = p_attempt_id;

  if v_for_student then
    v_payload := public.ielts_review_attempt_payload(p_skill, p_attempt_id, true);
  end if;

  return v_payload || jsonb_build_object(
    'review_id', v_review.id,
    'review_status', v_review.review_status,
    'rubric', v_review.rubric,
    'overall_band', v_review.overall_band,
    'strengths', v_review.strengths,
    'improvements', v_review.improvements,
    'next_steps', v_review.next_steps,
    'teacher_feedback', v_review.teacher_feedback,
    'private_notes', case when v_for_student then null else v_review.private_notes end,
    'reviewed_by', v_review.reviewed_by,
    'reviewed_at', v_review.reviewed_at
  );
end;
$$;

create or replace function public.rpc_ielts_submit_review(
  p_skill text,
  p_attempt_id text,
  p_rubric jsonb,
  p_overall_band numeric,
  p_strengths text default null,
  p_improvements text default null,
  p_next_steps text default null,
  p_teacher_feedback text default null,
  p_private_notes text default null,
  p_finalize boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_payload jsonb;
  v_student_id uuid;
  v_school_id uuid;
  v_class_id uuid;
  v_existing public.ielts_productive_skill_reviews%rowtype;
  v_review public.ielts_productive_skill_reviews%rowtype;
  v_overall numeric := public.ielts_review_normalize_band(p_overall_band);
  v_next_status text := case when p_finalize then 'finalized' else 'in_review' end;
begin
  if v_actor_id is null then raise exception 'not_authenticated'; end if;
  if p_skill not in ('writing', 'speaking') then raise exception 'invalid_skill'; end if;
  if p_finalize and v_overall is null then raise exception 'overall_band_required'; end if;

  v_payload := public.ielts_review_attempt_payload(p_skill, p_attempt_id, false);
  v_student_id := nullif(v_payload->>'student_id', '')::uuid;
  if v_student_id is null then raise exception 'submission_not_found'; end if;
  select u.school_id into v_school_id from public.users u where u.id = v_student_id;
  select cs.class_id into v_class_id from public.class_students cs join public.classes c on c.id = cs.class_id and c.school_id = v_school_id where cs.student_id = v_student_id limit 1;

  if not public.can_review_ielts_productive_submission(v_school_id, v_class_id, v_student_id) then
    raise exception 'forbidden';
  end if;

  perform public.ielts_productive_review_seed(p_skill, p_attempt_id, v_student_id, v_school_id);
  select * into v_existing from public.ielts_productive_skill_reviews where attempt_type = p_skill and attempt_id = p_attempt_id for update;
  if v_existing.finalized then raise exception 'review_locked'; end if;

  update public.ielts_productive_skill_reviews
  set review_status = v_next_status,
      rubric = coalesce(p_rubric, '{}'::jsonb),
      overall_band = v_overall,
      strengths = p_strengths,
      improvements = p_improvements,
      next_steps = p_next_steps,
      teacher_feedback = p_teacher_feedback,
      private_notes = p_private_notes,
      reviewed_by = case when p_finalize then v_actor_id else reviewed_by end,
      reviewed_at = case when p_finalize then now() else reviewed_at end,
      finalized = p_finalize
  where id = v_existing.id
  returning * into v_review;

  insert into public.ielts_productive_skill_review_events (review_id, actor_id, event_type, previous_status, next_status, previous_overall_band, next_overall_band)
  values (v_review.id, v_actor_id, case when p_finalize then 'finalized' else 'saved' end, v_existing.review_status, v_review.review_status, v_existing.overall_band, v_review.overall_band);

  if p_skill = 'writing' and p_finalize and to_regclass('public.ielts_writing_attempts') is not null then
    update public.ielts_writing_attempts
    set review_status = 'finalized', reviewed_by = v_actor_id, reviewed_at = v_review.reviewed_at, rubric_bands = v_review.rubric, band_overall = v_review.overall_band,
        teacher_feedback = jsonb_build_object('strengths', v_review.strengths, 'improvements', v_review.improvements, 'next_steps', v_review.next_steps, 'teacher_feedback', v_review.teacher_feedback),
        private_notes = v_review.private_notes
    where id::text = p_attempt_id;
  elsif p_skill = 'speaking' and p_finalize and to_regclass('public.ielts_speaking_attempts') is not null then
    update public.ielts_speaking_attempts
    set review_status = 'finalized', reviewed_by = v_actor_id, reviewed_at = v_review.reviewed_at, rubric_bands = v_review.rubric, band_overall = v_review.overall_band,
        teacher_feedback = jsonb_build_object('strengths', v_review.strengths, 'improvements', v_review.improvements, 'next_steps', v_review.next_steps, 'teacher_feedback', v_review.teacher_feedback),
        private_notes = v_review.private_notes
    where id::text = p_attempt_id;
  end if;

  return public.rpc_ielts_review_detail(p_skill, p_attempt_id);
end;
$$;

create policy "ielts review scoped select" on public.ielts_productive_skill_reviews
for select using (
  student_id = auth.uid()
  or public.can_review_ielts_productive_submission(school_id, null, student_id)
);

create policy "ielts review scoped write" on public.ielts_productive_skill_reviews
for all using (public.can_review_ielts_productive_submission(school_id, null, student_id))
with check (public.can_review_ielts_productive_submission(school_id, null, student_id));

create policy "ielts review events scoped select" on public.ielts_productive_skill_review_events
for select using (
  exists (
    select 1 from public.ielts_productive_skill_reviews r
    where r.id = review_id
      and (r.student_id = auth.uid() or public.can_review_ielts_productive_submission(r.school_id, null, r.student_id))
  )
);

grant execute on function public.rpc_ielts_review_queue(uuid, uuid, uuid, text, text, int) to authenticated;
grant execute on function public.rpc_ielts_review_detail(text, text) to authenticated;
grant execute on function public.rpc_ielts_submit_review(text, text, jsonb, numeric, text, text, text, text, text, boolean) to authenticated;
grant execute on function public.ielts_latest_skill_readiness(uuid) to authenticated;
