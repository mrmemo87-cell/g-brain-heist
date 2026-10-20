-- Teacher-chosen IELTS emails (owner 2026-10-20: teachers choose whether to notify students; defaults: new task on,
-- feedback off, reminder the day before the due date, students only, the teacher's private reason never in email).
-- Uses the existing transactional outbox, dispatcher, verified-recipient, preference and suppression rules. Email never
-- carries scores, bands, answers, weaknesses or teacher notes; it links to the authenticated IELTS workspace.
--
-- Events (p_refs are the records the teacher just created or shared):
--   targeted_assigned  allocation ids        -> ielts_task_assigned (+ optional ielts_task_due_reminder)
--   course_assigned    practice assignment id -> ielts_task_assigned per assigned student (+ optional reminder)
--   targeted_feedback  allocation ids        -> ielts_task_feedback_ready
--   practice_feedback  attempt ids (finalized productive reviews) -> existing ielts_feedback_ready template
-- Every email has a fixed idempotency key, so a repeated click never sends twice.

-- Who may email about a record: a school IELTS manager or batch manager, or the teacher who created or reviewed it.
create or replace function private.ielts_email_allowed(p_school uuid, p_owner uuid)
returns boolean language sql stable security definer set search_path to '' as $$
 select auth.uid() is not null and p_school is not null and (
  public.can_manage_ielts_practice_school(p_school) or private.ielts_batch_manager(p_school)
  or (p_owner = auth.uid() and exists(select 1 from public.school_members m where m.school_id = p_school and m.user_id = auth.uid() and m.status = 'active' and m.role_in_school <> 'student')));
$$;
revoke all on function private.ielts_email_allowed(uuid, uuid) from public, anon, authenticated;

create or replace function public.rpc_ielts_notify_students(p_event text, p_refs text[], p_remind_due boolean default false)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare
 r record; keys text[] := '{}'; k text; teacher text; title text;
begin
 if auth.uid() is null or coalesce((select is_banned from public.users where id = auth.uid()), true) then raise exception using errcode = '42501', message = 'not_authorized'; end if;
 if p_refs is null or cardinality(p_refs) not between 1 and 500 then raise exception 'refs_required'; end if;
 select coalesce(nullif(full_name, ''), username) into teacher from public.users where id = auth.uid();

 if p_event in ('targeted_assigned', 'targeted_feedback') then
  for r in
   select a.id, a.school_id, a.student_id, a.due_at, a.status, a.teacher_id, t.title, t.skill, t.purpose, private.ielts_material_code('targeted', t.code) as code,
          (select v.reviewer_id from private.ielts_learning_reviews v where v.allocation_id = a.id order by v.reviewed_at desc limit 1) as reviewer,
          exists(select 1 from private.ielts_learning_reviews v where v.allocation_id = a.id) as reviewed
   from private.ielts_learning_allocations a join private.ielts_learning_tasks t on t.code = a.task_code
   where a.id::text = any(p_refs)
  loop
   if not private.ielts_email_allowed(r.school_id, case when p_event = 'targeted_assigned' then r.teacher_id else r.reviewer end) then raise exception using errcode = '42501', message = 'not_authorized'; end if;
   title := coalesce(r.code || ' · ', '') || r.title;
   if p_event = 'targeted_assigned' then
    k := 'ielts-task-assigned:targeted:' || r.id;
    perform private.enqueue_transactional_email('ielts_task_assigned', 'academic', 'student', 'ielts_task_assigned', k,
     jsonb_build_object('title', title, 'skill', r.skill, 'kind', case when r.purpose = 'independent_check' then 'fresh_check' else 'practice' end,
      'due_at', r.due_at, 'teacher_name', teacher, 'path', '/ielts/practice/targeted/' || r.id), r.student_id, null, r.school_id, null, now());
    keys := keys || k;
    if coalesce(p_remind_due, false) and r.due_at is not null and r.due_at - interval '24 hours' > now() + interval '30 minutes' and r.status = 'assigned' then
     perform private.enqueue_transactional_email('ielts_task_due_reminder', 'reminders', 'student', 'ielts_task_due_reminder', 'ielts-task-due:targeted:' || r.id,
      jsonb_build_object('title', title, 'skill', r.skill, 'due_at', r.due_at, 'path', '/ielts/practice/targeted/' || r.id), r.student_id, null, r.school_id, null, r.due_at - interval '24 hours');
    end if;
   else
    if not r.reviewed then raise exception 'feedback_not_shared'; end if;
    k := 'ielts-task-feedback:targeted:' || r.id;
    perform private.enqueue_transactional_email('ielts_task_feedback_ready', 'academic', 'student', 'ielts_task_feedback_ready', k,
     jsonb_build_object('title', title, 'skill', r.skill, 'teacher_name', teacher, 'path', '/ielts/practice/targeted/' || r.id), r.student_id, null, r.school_id, null, now());
    keys := keys || k;
   end if;
  end loop;

 elsif p_event = 'course_assigned' then
  for r in
   select a.id, a.school_id, a.title, a.due_at, a.assigned_by, s.student_id, s.status,
          (select string_agg(distinct i.skill, ', ') from public.ielts_practice_assignment_items i where i.assignment_id = a.id) as skill
   from public.ielts_practice_assignments a join public.ielts_practice_assignment_students s on s.assignment_id = a.id
   where a.id::text = any(p_refs)
  loop
   if not private.ielts_email_allowed(r.school_id, r.assigned_by) then raise exception using errcode = '42501', message = 'not_authorized'; end if;
   k := 'ielts-task-assigned:course:' || r.id || ':' || r.student_id;
   perform private.enqueue_transactional_email('ielts_task_assigned', 'academic', 'student', 'ielts_task_assigned', k,
    jsonb_build_object('title', r.title, 'skill', r.skill, 'kind', 'practice', 'due_at', r.due_at, 'teacher_name', teacher, 'path', '/ielts/practice/assigned'),
    r.student_id, null, r.school_id, null, now());
   keys := keys || k;
   if coalesce(p_remind_due, false) and r.due_at is not null and r.due_at - interval '24 hours' > now() + interval '30 minutes' and r.status is distinct from 'completed' then
    perform private.enqueue_transactional_email('ielts_task_due_reminder', 'reminders', 'student', 'ielts_task_due_reminder', 'ielts-task-due:course:' || r.id || ':' || r.student_id,
     jsonb_build_object('title', r.title, 'skill', r.skill, 'due_at', r.due_at, 'path', '/ielts/practice/assigned'), r.student_id, null, r.school_id, null, r.due_at - interval '24 hours');
   end if;
  end loop;

 elsif p_event = 'practice_feedback' then
  for r in
   select v.id, v.school_id, v.student_id, v.attempt_type, v.attempt_id, v.reviewed_by from public.ielts_productive_skill_reviews v
   where v.attempt_id = any(p_refs) and v.finalized
  loop
   if not private.ielts_email_allowed(r.school_id, r.reviewed_by) then raise exception using errcode = '42501', message = 'not_authorized'; end if;
   k := 'ielts-feedback-' || r.id;
   perform private.enqueue_transactional_email('ielts_feedback_ready', 'academic', 'student', 'ielts_feedback_ready', k,
    jsonb_build_object('review_id', r.id, 'attempt_type', r.attempt_type, 'attempt_id', r.attempt_id), r.student_id, null, r.school_id, null, now());
   keys := keys || k;
  end loop;
 else
  raise exception 'unknown_event';
 end if;

 if cardinality(keys) = 0 then raise exception 'nothing_to_notify'; end if;
 return jsonb_build_object('keys', to_jsonb(keys), 'queued', cardinality(keys));
end $$;
revoke all on function public.rpc_ielts_notify_students(text, text[], boolean) from public, anon;
grant execute on function public.rpc_ielts_notify_students(text, text[], boolean) to authenticated;

-- What happened to the emails a teacher just requested (no addresses, no message bodies).
create or replace function public.rpc_ielts_email_status(p_keys text[])
returns jsonb language sql stable security definer set search_path to '' as $$
 with rows_ as (
  select o.status, o.last_error from public.transactional_email_outbox o
  where o.idempotency_key = any(p_keys) and cardinality(p_keys) <= 500
    and o.school_id is not null and private.ielts_email_allowed(o.school_id, auth.uid())
 )
 select jsonb_build_object(
  'total', count(*),
  'waiting', count(*) filter (where status in ('pending', 'processing', 'delayed')),
  'sent', count(*) filter (where status = 'accepted'),
  'delivered', count(*) filter (where status = 'delivered'),
  'no_email', count(*) filter (where status = 'skipped' and last_error ilike '%recipient email%'),
  'turned_off', count(*) filter (where status = 'skipped' and last_error ilike '%disabled%'),
  'not_delivered', count(*) filter (where status in ('bounced', 'complained', 'suppressed', 'failed'))
 ) from rows_;
$$;
revoke all on function public.rpc_ielts_email_status(text[]) from public, anon;
grant execute on function public.rpc_ielts_email_status(text[]) to authenticated;

-- A due-date reminder is withdrawn once the student has handed the work in.
create or replace function private.ielts_cancel_due_reminder() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
 if tg_table_name = 'ielts_learning_allocations' and new.status is distinct from 'assigned' and new.status is distinct from old.status then
  update public.transactional_email_outbox set status = 'cancelled', updated_at = now()
   where idempotency_key = 'ielts-task-due:targeted:' || new.id and status = 'pending';
 elsif tg_table_name = 'ielts_practice_assignment_students' and new.status = 'completed' and new.status is distinct from old.status then
  update public.transactional_email_outbox set status = 'cancelled', updated_at = now()
   where idempotency_key = 'ielts-task-due:course:' || new.assignment_id || ':' || new.student_id and status = 'pending';
 end if;
 return new;
end $$;
revoke all on function private.ielts_cancel_due_reminder() from public, anon, authenticated;
create or replace trigger ielts_cancel_due_reminder after update of status on private.ielts_learning_allocations for each row execute function private.ielts_cancel_due_reminder();
create or replace trigger ielts_cancel_due_reminder after update of status on public.ielts_practice_assignment_students for each row execute function private.ielts_cancel_due_reminder();

-- Practice feedback emails are now the teacher's choice (tick box when finalizing), not automatic.
create or replace function private.trg_email_ielts_review_finalized() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
 -- Owner decision 2026-10-20: the teacher chooses whether to email feedback (public.rpc_ielts_notify_students,
 -- event practice_feedback, same template and idempotency key as before). Nothing is sent automatically.
 return new;
end $$;
