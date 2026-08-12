-- Make class removal safe, school-scoped, and reversible.
--
-- The portal calls this a removal because the class disappears from current
-- operations. The database keeps the record as an inactive class so historic
-- reports, documents, placements, and assessment evidence retain their source.

create or replace function public.school_admin_archive_class(
  p_school_id uuid,
  p_class_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_class public.classes%rowtype;
  v_student_count integer := 0;
  v_assignment_count integer := 0;
  v_other_class_count integer := 0;
begin
  if v_actor is null then
    return jsonb_build_object('success', false, 'error', 'Not authenticated', 'code', 'NOT_AUTHENTICATED');
  end if;

  if not public.can_administer_school(p_school_id) then
    return jsonb_build_object(
      'success', false,
      'error', 'Only an active school administrator can remove a class.',
      'code', 'SCHOOL_ADMIN_REQUIRED'
    );
  end if;

  select c.*
  into v_class
  from public.classes c
  where c.id = p_class_id
    and c.school_id = p_school_id
  for update;

  if v_class.id is null then
    return jsonb_build_object(
      'success', false,
      'error', 'This class is no longer available in this school.',
      'code', 'CLASS_NOT_FOUND'
    );
  end if;

  if v_class.is_active is false then
    return jsonb_build_object('success', true, 'action', 'already_removed');
  end if;

  select count(*)
  into v_student_count
  from public.class_students cs
  where cs.class_id = p_class_id;

  select count(*)
  into v_assignment_count
  from public.class_teacher_assignments cta
  where cta.school_id = p_school_id
    and cta.class_id = p_class_id
    and cta.active is distinct from false;

  if v_student_count > 0 or v_assignment_count > 0 then
    return jsonb_build_object(
      'success', false,
      'error', format(
        'Move %s student(s) and remove %s active teaching assignment(s) before removing this class.',
        v_student_count,
        v_assignment_count
      ),
      'code', 'CLASS_IN_USE',
      'student_count', v_student_count,
      'assignment_count', v_assignment_count
    );
  end if;

  if v_class.grade_level is not null then
    select count(*)
    into v_other_class_count
    from public.classes c
    where c.school_id = p_school_id
      and c.id <> p_class_id
      and c.grade_level is not distinct from v_class.grade_level
      and c.is_active is distinct from false;

    if v_other_class_count = 0 then
      return jsonb_build_object(
        'success', false,
        'error', format(
          'Grade %s must keep one active class. Add a replacement class before removing this one.',
          v_class.grade_level
        ),
        'code', 'LAST_ACTIVE_CLASS'
      );
    end if;
  end if;

  update public.classes
  set is_active = false
  where id = p_class_id
    and school_id = p_school_id;

  insert into public.school_governance_audit_log (
    school_id,
    actor_user_id,
    event_type,
    category,
    severity,
    summary,
    metadata
  ) values (
    p_school_id,
    v_actor,
    'school_class_removed',
    'academic',
    'notice',
    format('Class %s removed from current operations', coalesce(v_class.class_code, v_class.class_name)),
    jsonb_build_object(
      'class_id', v_class.id,
      'class_code', v_class.class_code,
      'class_name', v_class.class_name,
      'grade_level', v_class.grade_level,
      'removal_mode', 'archive'
    )
  );

  return jsonb_build_object('success', true, 'action', 'archived');
end;
$$;

revoke all on function public.school_admin_archive_class(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.school_admin_archive_class(uuid, uuid)
  to authenticated;

comment on function public.school_admin_archive_class(uuid, uuid) is
  'Safely removes an empty non-final class from current school operations while preserving historical references.';

notify pgrst, 'reload schema';
