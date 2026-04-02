-- Fix student write access for Brains Heist Writing payload tables.
-- Allow authenticated students to create/update only rows tied to their own user id,
-- while preserving teacher/admin access via public.is_bh_admin_or_teacher().

drop policy if exists "bh writing attempts write" on public.bh_writing_attempts;
create policy "bh writing attempts write" on public.bh_writing_attempts
for all
using (
  public.is_bh_admin_or_teacher()
  or coalesce(payload->>'student_id', payload->>'user_id') = auth.uid()::text
)
with check (
  public.is_bh_admin_or_teacher()
  or coalesce(payload->>'student_id', payload->>'user_id') = auth.uid()::text
);

drop policy if exists "bh writing weekly plans write" on public.bh_writing_weekly_plans;
create policy "bh writing weekly plans write" on public.bh_writing_weekly_plans
for all
using (
  public.is_bh_admin_or_teacher()
  or coalesce(payload->>'student_id', payload->>'user_id') = auth.uid()::text
)
with check (
  public.is_bh_admin_or_teacher()
  or coalesce(payload->>'student_id', payload->>'user_id') = auth.uid()::text
);

drop policy if exists "bh writing daily tasks write" on public.bh_writing_daily_tasks;
create policy "bh writing daily tasks write" on public.bh_writing_daily_tasks
for all
using (
  public.is_bh_admin_or_teacher()
  or coalesce(payload->>'student_id', payload->>'user_id') = auth.uid()::text
)
with check (
  public.is_bh_admin_or_teacher()
  or coalesce(payload->>'student_id', payload->>'user_id') = auth.uid()::text
);

drop policy if exists "bh writing monthly reports write" on public.bh_writing_monthly_reports;
create policy "bh writing monthly reports write" on public.bh_writing_monthly_reports
for all
using (
  public.is_bh_admin_or_teacher()
  or coalesce(payload->>'student_id', payload->>'user_id') = auth.uid()::text
)
with check (
  public.is_bh_admin_or_teacher()
  or coalesce(payload->>'student_id', payload->>'user_id') = auth.uid()::text
);

drop policy if exists "bh writing memory write" on public.bh_writing_memory_snapshots;
create policy "bh writing memory write" on public.bh_writing_memory_snapshots
for all
using (
  public.is_bh_admin_or_teacher()
  or coalesce(payload->>'student_id', payload->>'user_id') = auth.uid()::text
)
with check (
  public.is_bh_admin_or_teacher()
  or coalesce(payload->>'student_id', payload->>'user_id') = auth.uid()::text
);
