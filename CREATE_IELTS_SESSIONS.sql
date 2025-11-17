-- Migration: Create ielts_sessions table with RLS policies
-- This migration intentionally does not modify any existing objects.

create table if not exists public.ielts_sessions (
    id uuid primary key default gen_random_uuid(),
    student_id uuid not null references public.profiles(id) on delete cascade,
    module text not null check (module in ('general','academic')),
    target_band numeric(2,1),
    created_at timestamptz not null default now(),
    completed_at timestamptz,
    reference_code text not null unique,
    reading_block jsonb not null,
    listening_block jsonb not null,
    writing_task jsonb not null,
    reading_answers jsonb,
    listening_answers jsonb,
    writing_answer text,
    analytics jsonb,
    band_reading numeric(2,1),
    band_listening numeric(2,1),
    band_writing numeric(2,1),
    band_overall numeric(2,1)
);

create index if not exists idx_ielts_sessions_student_created
    on public.ielts_sessions (student_id, created_at desc);

create index if not exists idx_ielts_sessions_reference_code
    on public.ielts_sessions (reference_code);

alter table public.ielts_sessions enable row level security;

create policy if not exists "ielts_sessions_select_own"
    on public.ielts_sessions
    for select
    using (auth.uid() = student_id);

create policy if not exists "ielts_sessions_insert_own"
    on public.ielts_sessions
    for insert
    with check (auth.uid() = student_id);

create policy if not exists "ielts_sessions_update_own"
    on public.ielts_sessions
    for update
    using (auth.uid() = student_id)
    with check (auth.uid() = student_id);
