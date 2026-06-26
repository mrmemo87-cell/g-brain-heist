-- Allow approved IELTS admins to reset launch funnel test/trial analytics from the control-center dashboard.
create policy "ielts funnel admin reset"
  on public.ielts_funnel_events
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid()
        and (u.is_admin = true or lower(coalesce(u.role, '')) in ('admin', 'superadmin', 'school_admin'))
    )
  );
