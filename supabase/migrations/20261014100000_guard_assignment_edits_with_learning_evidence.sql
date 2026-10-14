-- Fix teacher assignment edits hitting student_learning_item_evidence_answer_id_fkey.
-- Preserve the original security checks, snapshots, and append-only evidence policy.
-- Preflight errors are raised before any previous cleanup work can occur.
CREATE OR REPLACE FUNCTION public.rpc_update_teacher_assignment(p_assignment_id uuid, p_subject_id text, p_subject_name text, p_topic_name text, p_batch text, p_question_ids uuid[], p_assigned_at timestamp with time zone, p_due_at timestamp with time zone, p_title text, p_description text, p_instructions text, p_difficulty text, p_assignment_mode text, p_student_ids uuid[], p_publish_status text, p_close_submissions_after_due boolean, p_notify_students_by_email boolean)
 RETURNS assignments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor uuid := auth.uid(); v_assignment public.assignments; v_teacher_user_id uuid; v_teacher_school_id uuid;
  v_class_id uuid; v_class_code text; v_mode text := coalesce(nullif(trim(p_assignment_mode), ''), 'batch');
  v_old_students uuid[]; v_new_students uuid[]; v_removed_students uuid[]; v_old_questions uuid[]; v_removed_questions uuid[];
  v_content_changed boolean; v_focus record; v_audience_count integer := 0; v_requested_count integer := 0;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  select a.* into v_assignment from public.assignments a where a.id = p_assignment_id;
  if v_assignment.id is null then raise exception 'Assignment not found or you are not its creator'; end if;
  select t.user_id into v_teacher_user_id from public.teachers t where t.id = v_assignment.teacher_id;
  if v_teacher_user_id <> v_actor then raise exception 'Assignment not found or you are not its creator'; end if;
  select sm.school_id into v_teacher_school_id from public.school_members sm
  where sm.user_id = v_teacher_user_id and sm.status = 'active'
  order by sm.joined_at desc nulls last, sm.id limit 1;
  if v_teacher_school_id is null then raise exception 'Teacher has no active school membership'; end if;
  if v_mode not in ('batch', 'custom') then raise exception 'Invalid assignment mode'; end if;
  if coalesce(array_length(p_question_ids, 1), 0) = 0 then raise exception 'Assignment must include at least one question'; end if;
  if p_publish_status not in ('draft', 'scheduled', 'published') then raise exception 'Invalid publish status'; end if;
  if p_publish_status = 'scheduled' and (p_assigned_at is null or p_assigned_at <= now()) then raise exception 'Scheduled publication must be in the future'; end if;

  if v_mode = 'batch' then
    if nullif(trim(p_batch), '') is null then raise exception 'A class is required for a class assignment'; end if;
    if upper(trim(p_batch)) <> 'ALL' then
      select c.id, c.class_code into v_class_id, v_class_code
      from public.class_teacher_assignments cta
      join public.classes c on c.id = cta.class_id and c.school_id = cta.school_id
      where cta.teacher_user_id = v_teacher_user_id and cta.school_id = v_teacher_school_id
        and cta.active = true and coalesce(c.is_active, true)
        and private.teacher_assignment_subject_key(cta.subject) = private.teacher_assignment_subject_key(p_subject_name)
        and upper(regexp_replace(trim(c.class_code), '\s+', '', 'g')) = upper(regexp_replace(trim(p_batch), '\s+', '', 'g'))
      order by c.id limit 1;
      if v_class_id is null then raise exception 'Teacher is not allocated to class % for %', trim(p_batch), p_subject_name; end if;
    elsif not exists (
      select 1 from public.class_teacher_assignments cta
      join public.classes c on c.id = cta.class_id and c.school_id = cta.school_id
      where cta.teacher_user_id = v_teacher_user_id and cta.school_id = v_teacher_school_id
        and cta.active = true and coalesce(c.is_active, true)
        and private.teacher_assignment_subject_key(cta.subject) = private.teacher_assignment_subject_key(p_subject_name)
    ) then
      raise exception 'Teacher has no active class allocation for %', p_subject_name;
    else
      v_class_code := 'All';
    end if;
  end if;

  select coalesce(array_agg(audience.student_id), '{}'::uuid[]), count(*)::integer
    into v_new_students, v_audience_count
  from private.teacher_assignment_authorized_students(
    v_teacher_user_id, v_teacher_school_id, p_subject_name, v_class_id,
    case when v_mode = 'custom' then coalesce(p_student_ids, '{}'::uuid[]) else null end
  ) audience;
  if v_mode = 'custom' then
    select count(distinct selected.id)::integer into v_requested_count
    from unnest(coalesce(p_student_ids, '{}'::uuid[])) as selected(id);
    if v_requested_count = 0 then raise exception 'At least one student is required for a custom assignment'; end if;
    if v_audience_count <> v_requested_count then raise exception 'One or more selected students are no longer in a class allocated to you for %', p_subject_name; end if;
  elsif p_publish_status <> 'draft' and v_audience_count = 0 then
    raise exception 'CLASS_HAS_NO_REGISTERED_STUDENTS: %. Ask the school admin to register students in this class, or save the assignment as a draft', coalesce(v_class_code, trim(p_batch));
  end if;

  select coalesce(array_agg(student_id), '{}'::uuid[]) into v_old_students from public.student_assignments where assignment_id = p_assignment_id;
  select coalesce(array_agg(question_id order by order_index), '{}'::uuid[]) into v_old_questions from public.assignment_questions where assignment_id = p_assignment_id;
  select coalesce(array_agg(x), '{}'::uuid[]) into v_removed_students from unnest(v_old_students) x where not (x = any(v_new_students));
  select coalesce(array_agg(x), '{}'::uuid[]) into v_removed_questions from unnest(v_old_questions) x where not (x = any(p_question_ids));
  -- Reordering the same questions is not a content change.
  v_content_changed := (
    select coalesce(array_agg(question_id order by question_id), '{}'::uuid[])
    from unnest(v_old_questions) as previous(question_id)
  ) is distinct from (
    select coalesce(array_agg(question_id order by question_id), '{}'::uuid[])
    from unnest(p_question_ids) as selected(question_id)
  );

  -- Governed Academic Profile ledgers are append-only. Do not delete their
  -- source answers, or any in-progress/assessed answers, during an edit.
  if coalesce(array_length(v_removed_students, 1), 0) > 0 and (
    exists (select 1 from public.student_assignment_answers aa
            where aa.assignment_id = p_assignment_id and aa.student_id = any(v_removed_students))
    or exists (select 1 from public.student_assignment_results ar
               where ar.assignment_id = p_assignment_id and ar.student_id = any(v_removed_students))
    or exists (select 1 from public.student_learning_item_evidence ie
               where ie.assignment_id = p_assignment_id and ie.student_id = any(v_removed_students))
    or exists (select 1 from public.student_learning_registry_item_evidence re
               where re.assignment_id = p_assignment_id and re.student_id = any(v_removed_students))
  ) then
    raise exception using errcode='P0001',
      message='Cannot remove students with submitted work from this assignment. Their assessed evidence is protected. Create a new assignment for the revised audience.';
  end if;

  if v_content_changed and (
    exists (select 1 from public.student_assignment_answers aa
            where aa.assignment_id = p_assignment_id)
    or exists (select 1 from public.student_assignment_results ar
               where ar.assignment_id = p_assignment_id)
    or exists (select 1 from public.student_learning_item_evidence ie
               where ie.assignment_id = p_assignment_id)
    or exists (select 1 from public.student_learning_registry_item_evidence re
               where re.assignment_id = p_assignment_id)
  ) then
    raise exception using errcode='P0001',
      message='Cannot change questions after students have submitted work. Their assessed evidence is protected. Create a new assignment for revised questions.';
  end if;

  -- A reorder retains immutable question snapshots and original submissions.
  if not v_content_changed and v_old_questions is distinct from p_question_ids then
    update public.assignment_questions aq
       set order_index = ordering.position::integer
      from unnest(p_question_ids) with ordinality as ordering(question_id, position)
     where aq.assignment_id = p_assignment_id
       and aq.question_id = ordering.question_id;
  end if;

  if coalesce(array_length(v_removed_students, 1), 0) > 0 then
    for v_focus in select distinct student_id, skill_key from public.student_learning_observations where source_type = 'assignment' and source_id = p_assignment_id and student_id = any(v_removed_students) loop
      delete from public.student_learning_observations where source_type = 'assignment' and source_id = p_assignment_id and student_id = v_focus.student_id and skill_key = v_focus.skill_key;
      perform public.student_learning_refresh_focus_state(v_focus.student_id, v_focus.skill_key);
    end loop;
    delete from public.student_assignment_analyses where assignment_id = p_assignment_id and student_id = any(v_removed_students);
    delete from public.student_assignment_answers where assignment_id = p_assignment_id and student_id = any(v_removed_students);
    delete from public.student_assignment_results where assignment_id = p_assignment_id and student_id = any(v_removed_students);
    delete from public.student_assignments where assignment_id = p_assignment_id and student_id = any(v_removed_students);
    delete from public.assignment_students where assignment_id = p_assignment_id and student_id = any(v_removed_students);
  end if;

  if v_content_changed then
    for v_focus in select distinct student_id, skill_key from public.student_learning_observations where source_type = 'assignment' and source_id = p_assignment_id loop
      delete from public.student_learning_observations where source_type = 'assignment' and source_id = p_assignment_id and student_id = v_focus.student_id and skill_key = v_focus.skill_key;
      perform public.student_learning_refresh_focus_state(v_focus.student_id, v_focus.skill_key);
    end loop;
    delete from public.student_assignment_analyses where assignment_id = p_assignment_id;
    delete from public.student_assignment_answers where assignment_id = p_assignment_id;
    delete from public.student_assignment_results where assignment_id = p_assignment_id;
    update public.student_assignments set status = 'pending', completed_at = null where assignment_id = p_assignment_id;
    delete from public.assignment_questions where assignment_id = p_assignment_id;
    insert into public.assignment_questions(assignment_id, question_id, order_index)
    select p_assignment_id, qid, ordinality::integer from unnest(p_question_ids) with ordinality as selected(qid, ordinality);
  end if;

  insert into public.student_assignments(assignment_id, student_id, batch, status, assigned_at, due_at)
  select p_assignment_id, audience.student_id, audience.class_code, 'pending', p_assigned_at, p_due_at
  from private.teacher_assignment_authorized_students(
    v_teacher_user_id, v_teacher_school_id, p_subject_name, v_class_id,
    case when v_mode = 'custom' then p_student_ids else null end
  ) audience
  where not exists (select 1 from public.student_assignments sa where sa.assignment_id = p_assignment_id and sa.student_id = audience.student_id);
  insert into public.assignment_students(assignment_id, student_id)
  select p_assignment_id, x from unnest(v_new_students) x on conflict do nothing;
  update public.student_assignments sa set batch = audience.class_code, assigned_at = p_assigned_at, due_at = p_due_at
  from private.teacher_assignment_authorized_students(
    v_teacher_user_id, v_teacher_school_id, p_subject_name, v_class_id,
    case when v_mode = 'custom' then p_student_ids else null end
  ) audience where sa.assignment_id = p_assignment_id and sa.student_id = audience.student_id;

  update public.assignments set
    subject_id = p_subject_id, subject_name = p_subject_name, subject = p_subject_name,
    topic_name = p_topic_name, batch = case when v_mode = 'custom' then null else coalesce(v_class_code, trim(p_batch)) end,
    class_id = v_class_id, school_id = v_teacher_school_id, difficulty = p_difficulty,
    title = p_title, description = p_description, instructions = p_instructions,
    assigned_at = p_assigned_at, due_at = p_due_at, assignment_mode = v_mode,
    publish_status = p_publish_status, close_submissions_after_due = coalesce(p_close_submissions_after_due, false),
    notify_students_by_email = coalesce(p_notify_students_by_email, false),
    published_at = case when p_publish_status = 'published' then coalesce(published_at, now()) else null end,
    updated_at = now()
  where id = p_assignment_id returning * into v_assignment;

  delete from public.assignment_email_notifications where assignment_id = p_assignment_id;
  if v_assignment.notify_students_by_email and v_assignment.publish_status <> 'draft' then
    insert into public.assignment_email_notifications(assignment_id, student_id, available_at)
    select p_assignment_id, sa.student_id, v_assignment.assigned_at
    from public.student_assignments sa where sa.assignment_id = p_assignment_id;
  end if;
  insert into public.assignment_change_audit(assignment_id, actor_user_id, action, affected_student_ids, affected_question_ids)
  values (p_assignment_id, v_actor, 'update', v_removed_students, v_removed_questions);
  return v_assignment;
end;
$function$

