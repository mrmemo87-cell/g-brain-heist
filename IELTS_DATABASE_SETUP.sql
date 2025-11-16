-- Enable required extension for UUID generation
create extension if not exists "pgcrypto";

-- Table to store teacher/admin accounts allowed to manage IELTS content
create table if not exists ielts_teachers (
  user_id uuid primary key references users(id) on delete cascade,
  added_at timestamptz not null default now()
);

-- IELTS Reading Sets
create table if not exists ielts_reading_sets (
  id bigserial primary key,
  slug text unique not null,
  title text not null,
  description text,
  level text not null,
  est_band_min numeric(2,1),
  est_band_max numeric(2,1),
  duration_minutes integer not null,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  is_active boolean not null default true
);

create index if not exists idx_ielts_reading_sets_level on ielts_reading_sets(level);
create index if not exists idx_ielts_reading_sets_created_by on ielts_reading_sets(created_by);

-- IELTS Reading Questions
create table if not exists ielts_reading_questions (
  id bigserial primary key,
  set_id bigint not null references ielts_reading_sets(id) on delete cascade,
  question_order integer not null,
  question_type text not null,
  body text not null,
  options jsonb,
  correct_answer jsonb not null,
  explanation text
);

create unique index if not exists idx_ielts_reading_questions_order on ielts_reading_questions(set_id, question_order);

-- IELTS Listening Sets
create table if not exists ielts_listening_sets (
  id bigserial primary key,
  slug text unique not null,
  title text not null,
  description text,
  level text not null,
  est_band_min numeric(2,1),
  est_band_max numeric(2,1),
  duration_minutes integer not null,
  audio_url text not null,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  is_active boolean not null default true
);

create index if not exists idx_ielts_listening_sets_level on ielts_listening_sets(level);
create index if not exists idx_ielts_listening_sets_created_by on ielts_listening_sets(created_by);

-- IELTS Listening Questions
create table if not exists ielts_listening_questions (
  id bigserial primary key,
  set_id bigint not null references ielts_listening_sets(id) on delete cascade,
  question_order integer not null,
  question_type text not null,
  body text not null,
  options jsonb,
  correct_answer jsonb not null,
  explanation text
);

create unique index if not exists idx_ielts_listening_questions_order on ielts_listening_questions(set_id, question_order);

-- IELTS Writing Tasks
create table if not exists ielts_writing_tasks (
  id bigserial primary key,
  slug text unique not null,
  task_type text not null,
  title text,
  prompt text not null,
  bands_target text,
  sample_answer text,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  is_active boolean not null default true
);

create index if not exists idx_ielts_writing_tasks_task_type on ielts_writing_tasks(task_type);
create index if not exists idx_ielts_writing_tasks_created_by on ielts_writing_tasks(created_by);

-- IELTS Speaking Tasks
create table if not exists ielts_speaking_tasks (
  id bigserial primary key,
  slug text unique not null,
  part integer not null,
  prompt text not null,
  follow_ups jsonb,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  is_active boolean not null default true
);

create index if not exists idx_ielts_speaking_tasks_part on ielts_speaking_tasks(part);
create index if not exists idx_ielts_speaking_tasks_created_by on ielts_speaking_tasks(created_by);

-- IELTS Reading Attempts
create table if not exists ielts_reading_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  set_id bigint not null references ielts_reading_sets(id) on delete cascade,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  time_spent_seconds integer,
  raw_score integer,
  total_questions integer,
  percent numeric(5,2),
  est_band numeric(2,1),
  answers jsonb not null
);

create index if not exists idx_ielts_reading_attempts_user on ielts_reading_attempts(user_id, started_at desc);
create index if not exists idx_ielts_reading_attempts_set on ielts_reading_attempts(set_id);

-- IELTS Listening Attempts
create table if not exists ielts_listening_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  set_id bigint not null references ielts_listening_sets(id) on delete cascade,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  time_spent_seconds integer,
  raw_score integer,
  total_questions integer,
  percent numeric(5,2),
  est_band numeric(2,1),
  answers jsonb not null
);

create index if not exists idx_ielts_listening_attempts_user on ielts_listening_attempts(user_id, started_at desc);
create index if not exists idx_ielts_listening_attempts_set on ielts_listening_attempts(set_id);

-- IELTS Writing Attempts
create table if not exists ielts_writing_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  task_id bigint not null references ielts_writing_tasks(id) on delete cascade,
  submitted_at timestamptz not null default now(),
  answer_text text not null,
  word_count integer,
  band_overall numeric(2,1),
  band_task_response numeric(2,1),
  band_coherence numeric(2,1),
  band_lexical numeric(2,1),
  band_grammar numeric(2,1),
  feedback jsonb
);

create index if not exists idx_ielts_writing_attempts_user on ielts_writing_attempts(user_id, submitted_at desc);
create index if not exists idx_ielts_writing_attempts_task on ielts_writing_attempts(task_id);

-- IELTS Speaking Attempts
create table if not exists ielts_speaking_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  task_id bigint not null references ielts_speaking_tasks(id) on delete cascade,
  submitted_at timestamptz not null default now(),
  audio_url text not null,
  transcript text,
  band_overall numeric(2,1),
  band_fluency numeric(2,1),
  band_lexical numeric(2,1),
  band_grammar numeric(2,1),
  band_pronunciation numeric(2,1),
  feedback jsonb
);

create index if not exists idx_ielts_speaking_attempts_user on ielts_speaking_attempts(user_id, submitted_at desc);
create index if not exists idx_ielts_speaking_attempts_task on ielts_speaking_attempts(task_id);

-- IELTS Mock Tests
create table if not exists ielts_mock_tests (
  id bigserial primary key,
  slug text unique not null,
  title text not null,
  description text,
  duration_minutes integer,
  reading_set_id bigint references ielts_reading_sets(id),
  listening_set_id bigint references ielts_listening_sets(id),
  writing_task1_id bigint references ielts_writing_tasks(id),
  writing_task2_id bigint references ielts_writing_tasks(id),
  speaking_task_part1_id bigint references ielts_speaking_tasks(id),
  speaking_task_part2_id bigint references ielts_speaking_tasks(id),
  speaking_task_part3_id bigint references ielts_speaking_tasks(id),
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  is_active boolean not null default true
);

create index if not exists idx_ielts_mock_tests_created_by on ielts_mock_tests(created_by);

-- IELTS Mock Test Attempts
create table if not exists ielts_mock_test_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  test_id bigint not null references ielts_mock_tests(id) on delete cascade,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  overall_band_est numeric(2,1),
  reading_band_est numeric(2,1),
  listening_band_est numeric(2,1),
  writing_band_est numeric(2,1),
  speaking_band_est numeric(2,1),
  summary jsonb
);

create index if not exists idx_ielts_mock_test_attempts_user on ielts_mock_test_attempts(user_id, started_at desc);
create index if not exists idx_ielts_mock_test_attempts_test on ielts_mock_test_attempts(test_id);

-- Enable RLS on all tables
alter table ielts_teachers enable row level security;
alter table ielts_reading_sets enable row level security;
alter table ielts_reading_questions enable row level security;
alter table ielts_listening_sets enable row level security;
alter table ielts_listening_questions enable row level security;
alter table ielts_writing_tasks enable row level security;
alter table ielts_speaking_tasks enable row level security;
alter table ielts_reading_attempts enable row level security;
alter table ielts_listening_attempts enable row level security;
alter table ielts_writing_attempts enable row level security;
alter table ielts_speaking_attempts enable row level security;
alter table ielts_mock_tests enable row level security;
alter table ielts_mock_test_attempts enable row level security;

-- Policies for ielts_teachers table
drop policy if exists "Teachers can view their membership" on ielts_teachers;
create policy "Teachers can view their membership" on ielts_teachers
for select
using (auth.uid() = user_id);

drop policy if exists "Service roles manage teacher membership" on ielts_teachers;
create policy "Service roles manage teacher membership" on ielts_teachers
as permissive
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

-- Content table policies
drop policy if exists "Reading sets selectable when active" on ielts_reading_sets;
create policy "Reading sets selectable when active" on ielts_reading_sets
for select
using (is_active and auth.uid() is not null);

drop policy if exists "Reading sets full access for teachers" on ielts_reading_sets;
create policy "Reading sets full access for teachers" on ielts_reading_sets
for all
using (exists (select 1 from ielts_teachers t where t.user_id = auth.uid()))
with check (exists (select 1 from ielts_teachers t where t.user_id = auth.uid()));

drop policy if exists "Reading questions selectable from active sets" on ielts_reading_questions;
create policy "Reading questions selectable from active sets" on ielts_reading_questions
for select
using (
  auth.uid() is not null and
  exists (
    select 1 from ielts_reading_sets s
    where s.id = ielts_reading_questions.set_id
      and s.is_active
  )
);

drop policy if exists "Reading questions full access for teachers" on ielts_reading_questions;
create policy "Reading questions full access for teachers" on ielts_reading_questions
for all
using (exists (select 1 from ielts_teachers t where t.user_id = auth.uid()))
with check (exists (select 1 from ielts_teachers t where t.user_id = auth.uid()));

drop policy if exists "Listening sets selectable when active" on ielts_listening_sets;
create policy "Listening sets selectable when active" on ielts_listening_sets
for select
using (is_active and auth.uid() is not null);

drop policy if exists "Listening sets full access for teachers" on ielts_listening_sets;
create policy "Listening sets full access for teachers" on ielts_listening_sets
for all
using (exists (select 1 from ielts_teachers t where t.user_id = auth.uid()))
with check (exists (select 1 from ielts_teachers t where t.user_id = auth.uid()));

drop policy if exists "Listening questions selectable from active sets" on ielts_listening_questions;
create policy "Listening questions selectable from active sets" on ielts_listening_questions
for select
using (
  auth.uid() is not null and
  exists (
    select 1 from ielts_listening_sets s
    where s.id = ielts_listening_questions.set_id
      and s.is_active
  )
);

drop policy if exists "Listening questions full access for teachers" on ielts_listening_questions;
create policy "Listening questions full access for teachers" on ielts_listening_questions
for all
using (exists (select 1 from ielts_teachers t where t.user_id = auth.uid()))
with check (exists (select 1 from ielts_teachers t where t.user_id = auth.uid()));

drop policy if exists "Writing tasks selectable when active" on ielts_writing_tasks;
create policy "Writing tasks selectable when active" on ielts_writing_tasks
for select
using (is_active and auth.uid() is not null);

drop policy if exists "Writing tasks full access for teachers" on ielts_writing_tasks;
create policy "Writing tasks full access for teachers" on ielts_writing_tasks
for all
using (exists (select 1 from ielts_teachers t where t.user_id = auth.uid()))
with check (exists (select 1 from ielts_teachers t where t.user_id = auth.uid()));

drop policy if exists "Speaking tasks selectable when active" on ielts_speaking_tasks;
create policy "Speaking tasks selectable when active" on ielts_speaking_tasks
for select
using (is_active and auth.uid() is not null);

drop policy if exists "Speaking tasks full access for teachers" on ielts_speaking_tasks;
create policy "Speaking tasks full access for teachers" on ielts_speaking_tasks
for all
using (exists (select 1 from ielts_teachers t where t.user_id = auth.uid()))
with check (exists (select 1 from ielts_teachers t where t.user_id = auth.uid()));

drop policy if exists "Mock tests selectable when active" on ielts_mock_tests;
create policy "Mock tests selectable when active" on ielts_mock_tests
for select
using (is_active and auth.uid() is not null);

drop policy if exists "Mock tests full access for teachers" on ielts_mock_tests;
create policy "Mock tests full access for teachers" on ielts_mock_tests
for all
using (exists (select 1 from ielts_teachers t where t.user_id = auth.uid()))
with check (exists (select 1 from ielts_teachers t where t.user_id = auth.uid()));

-- Attempt table policies (students manage own attempts)
drop policy if exists "Students manage reading attempts" on ielts_reading_attempts;
create policy "Students manage reading attempts" on ielts_reading_attempts
for select using (auth.uid() = user_id);

drop policy if exists "Students insert reading attempts" on ielts_reading_attempts;
create policy "Students insert reading attempts" on ielts_reading_attempts
for insert with check (auth.uid() = user_id);

drop policy if exists "Students update reading attempts" on ielts_reading_attempts;
create policy "Students update reading attempts" on ielts_reading_attempts
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Teachers view reading attempts" on ielts_reading_attempts;
create policy "Teachers view reading attempts" on ielts_reading_attempts
for select
using (exists (select 1 from ielts_teachers t where t.user_id = auth.uid()));

drop policy if exists "Students manage listening attempts" on ielts_listening_attempts;
create policy "Students manage listening attempts" on ielts_listening_attempts
for select using (auth.uid() = user_id);

drop policy if exists "Students insert listening attempts" on ielts_listening_attempts;
create policy "Students insert listening attempts" on ielts_listening_attempts
for insert with check (auth.uid() = user_id);

drop policy if exists "Students update listening attempts" on ielts_listening_attempts;
create policy "Students update listening attempts" on ielts_listening_attempts
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Teachers view listening attempts" on ielts_listening_attempts;
create policy "Teachers view listening attempts" on ielts_listening_attempts
for select
using (exists (select 1 from ielts_teachers t where t.user_id = auth.uid()));

drop policy if exists "Students manage writing attempts" on ielts_writing_attempts;
create policy "Students manage writing attempts" on ielts_writing_attempts
for select using (auth.uid() = user_id);

drop policy if exists "Students insert writing attempts" on ielts_writing_attempts;
create policy "Students insert writing attempts" on ielts_writing_attempts
for insert with check (auth.uid() = user_id);

drop policy if exists "Students update writing attempts" on ielts_writing_attempts;
create policy "Students update writing attempts" on ielts_writing_attempts
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Teachers view writing attempts" on ielts_writing_attempts;
create policy "Teachers view writing attempts" on ielts_writing_attempts
for select
using (exists (select 1 from ielts_teachers t where t.user_id = auth.uid()));

drop policy if exists "Students manage speaking attempts" on ielts_speaking_attempts;
create policy "Students manage speaking attempts" on ielts_speaking_attempts
for select using (auth.uid() = user_id);

drop policy if exists "Students insert speaking attempts" on ielts_speaking_attempts;
create policy "Students insert speaking attempts" on ielts_speaking_attempts
for insert with check (auth.uid() = user_id);

drop policy if exists "Students update speaking attempts" on ielts_speaking_attempts;
create policy "Students update speaking attempts" on ielts_speaking_attempts
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Teachers view speaking attempts" on ielts_speaking_attempts;
create policy "Teachers view speaking attempts" on ielts_speaking_attempts
for select
using (exists (select 1 from ielts_teachers t where t.user_id = auth.uid()));

drop policy if exists "Students manage mock test attempts" on ielts_mock_test_attempts;
create policy "Students manage mock test attempts" on ielts_mock_test_attempts
for select using (auth.uid() = user_id);

drop policy if exists "Students insert mock test attempts" on ielts_mock_test_attempts;
create policy "Students insert mock test attempts" on ielts_mock_test_attempts
for insert with check (auth.uid() = user_id);

drop policy if exists "Students update mock test attempts" on ielts_mock_test_attempts;
create policy "Students update mock test attempts" on ielts_mock_test_attempts
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Teachers view mock test attempts" on ielts_mock_test_attempts;
create policy "Teachers view mock test attempts" on ielts_mock_test_attempts
for select
using (exists (select 1 from ielts_teachers t where t.user_id = auth.uid()));

-- Example queries
-- 1. Fetch all active reading sets with question counts
select
  rs.id,
  rs.slug,
  rs.title,
  rs.level,
  rs.duration_minutes,
  count(rq.id) as question_count
from ielts_reading_sets rs
left join ielts_reading_questions rq on rq.set_id = rs.id
where rs.is_active = true
group by rs.id
order by rs.created_at desc;

-- 2. Fetch a user's last 5 reading attempts
select
  ra.id,
  ra.set_id,
  rs.title,
  ra.started_at,
  ra.completed_at,
  ra.raw_score,
  ra.total_questions,
  ra.percent,
  ra.est_band
from ielts_reading_attempts ra
join ielts_reading_sets rs on rs.id = ra.set_id
where ra.user_id = auth.uid()
order by ra.started_at desc
limit 5;

-- 3. Fetch average overall band per user for writing attempts (teacher dashboard)
select
  ra.user_id,
  avg(ra.band_overall) as avg_band_overall,
  count(*) as attempt_count
from ielts_writing_attempts ra
where ra.band_overall is not null
group by ra.user_id
order by avg_band_overall desc;
