-- Fix remaining student RLS access for Brains Heist Writing daily submissions/evaluations.
-- These payload tables store student ownership inside payload.student_id (fallback payload.user_id).

-- Daily submissions: allow students to read/write only their own rows, keep teacher/admin access.
drop policy if exists "bh writing submissions read" on public.bh_writing_daily_submissions;
create policy "bh writing submissions read" on public.bh_writing_daily_submissions
for select
using (
  public.is_bh_admin_or_teacher()
  or coalesce(payload->>'student_id', payload->>'user_id') = auth.uid()::text
);

drop policy if exists "bh writing submissions write" on public.bh_writing_daily_submissions;
create policy "bh writing submissions write" on public.bh_writing_daily_submissions
for all
using (
  public.is_bh_admin_or_teacher()
  or coalesce(payload->>'student_id', payload->>'user_id') = auth.uid()::text
)
with check (
  public.is_bh_admin_or_teacher()
  or coalesce(payload->>'student_id', payload->>'user_id') = auth.uid()::text
);

-- Daily evaluations: allow students to read/write only their own rows, keep teacher/admin access.
drop policy if exists "bh writing evaluations read" on public.bh_writing_daily_evaluations;
create policy "bh writing evaluations read" on public.bh_writing_daily_evaluations
for select
using (
  public.is_bh_admin_or_teacher()
  or coalesce(payload->>'student_id', payload->>'user_id') = auth.uid()::text
);

drop policy if exists "bh writing evaluations write" on public.bh_writing_daily_evaluations;
create policy "bh writing evaluations write" on public.bh_writing_daily_evaluations
for all
using (
  public.is_bh_admin_or_teacher()
  or coalesce(payload->>'student_id', payload->>'user_id') = auth.uid()::text
)
with check (
  public.is_bh_admin_or_teacher()
  or coalesce(payload->>'student_id', payload->>'user_id') = auth.uid()::text
);
