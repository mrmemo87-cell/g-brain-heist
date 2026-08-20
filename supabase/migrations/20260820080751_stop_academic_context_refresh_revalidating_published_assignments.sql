create or replace function private.academic_refresh_school_context(p_school_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.school_subjects ss
  set academic_subject_id = public.academic_resolve_subject_id(ss.name, ss.school_id)
  where ss.school_id = p_school_id;

  -- Published assignments are historical evidence. Do not blanket-touch them
  -- during school calendar/enrolment refreshes: the verified-question coverage
  -- guard intentionally validates assignment writes, and revalidating unrelated
  -- historical assignments can block an otherwise valid academic setup save.
  -- Drafts remain safe to enrich because the coverage guard explicitly permits
  -- draft assignments until they are scheduled/published.
  update public.assignments a
  set subject_name = a.subject_name
  where a.school_id = p_school_id
    and coalesce(a.publish_status, 'published') = 'draft';

  update public.student_learning_observations o
  set subject = o.subject
  where o.school_id = p_school_id;

  update public.student_learning_focus_states f
  set academic_subject_id = public.academic_resolve_subject_id(f.subject, f.school_id)
  where f.school_id = p_school_id;
end;
$$;

revoke all on function private.academic_refresh_school_context(uuid) from public, anon, authenticated;
