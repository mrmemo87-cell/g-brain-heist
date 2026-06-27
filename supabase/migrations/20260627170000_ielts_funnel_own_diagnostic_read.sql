-- Let authenticated learners read their own saved IELTS funnel rows so the
-- dashboard and retake guard can use diagnostic_completed as the source of truth.
create policy "ielts funnel authenticated own read"
  on public.ielts_funnel_events
  for select
  to authenticated
  using (user_id = auth.uid());
