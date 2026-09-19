-- Keep the active teacher assignment workspace aligned with the teacher's
-- current class/subject allocations. Historical assignments remain untouched
-- in public.assignments and related result tables; they simply stop surfacing
-- as current operational work after a teacher/class allocation changes.

create or replace function public.rpc_get_assignments_for_teacher(p_teacher_id uuid)
returns table(
  id uuid,
  teacher_id uuid,
  subject_id text,
  subject_name text,
  topic_name text,
  batch text,
  difficulty text,
  title text,
  instructions text,
  assigned_at timestamptz,
  due_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  question_count integer,
  completed_count integer,
  student_count integer,
  assignment_mode text,
  description text,
  publish_status text,
  close_submissions_after_due boolean,
  notify_students_by_email boolean,
  published_at timestamptz,
  question_ids uuid[],
  student_ids uuid[]
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_teacher_user_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select t.user_id
  into v_teacher_user_id
  from public.teachers t
  where t.id = p_teacher_id
    and t.user_id = auth.uid();

  if v_teacher_user_id is null then
    raise exception 'Not authorized';
  end if;

  return query
  select
    a.id,
    a.teacher_id,
    a.subject_id,
    a.subject_name,
    a.topic_name,
    a.batch,
    a.difficulty,
    a.title,
    a.instructions,
    a.assigned_at,
    a.due_at,
    a.created_at,
    a.updated_at,
    (select count(*)::int from public.assignment_questions aq where aq.assignment_id = a.id),
    (select count(*)::int from public.student_assignments sa where sa.assignment_id = a.id and sa.status = 'completed'),
    (select count(*)::int from public.student_assignments sa where sa.assignment_id = a.id),
    coalesce(a.assignment_mode, 'batch'),
    a.description,
    a.publish_status,
    a.close_submissions_after_due,
    a.notify_students_by_email,
    a.published_at,
    (select coalesce(array_agg(aq.question_id order by aq.order_index), '{}'::uuid[]) from public.assignment_questions aq where aq.assignment_id = a.id),
    (select coalesce(array_agg(sa.student_id), '{}'::uuid[]) from public.student_assignments sa where sa.assignment_id = a.id)
  from public.assignments a
  join public.school_academic_years y
    on y.id = a.academic_year_id
   and y.school_id = a.school_id
   and y.status = 'current'
  where a.teacher_id = p_teacher_id
    and (
      -- Normal class assignments are current only while that exact class remains
      -- actively allocated to this teacher for the assignment subject.
      (
        coalesce(a.assignment_mode, 'batch') = 'batch'
        and a.class_id is not null
        and exists (
          select 1
          from public.class_teacher_assignments cta
          join public.classes c
            on c.id = cta.class_id
           and c.school_id = cta.school_id
           and coalesce(c.is_active, true)
          where cta.teacher_user_id = v_teacher_user_id
            and cta.school_id = a.school_id
            and cta.class_id = a.class_id
            and cta.active = true
            and private.teacher_assignment_subject_key(cta.subject)
                = private.teacher_assignment_subject_key(a.subject_name)
        )
      )
      or
      -- Individual, legacy classless, and "All" assignments remain active only
      -- if at least one original recipient is still in a currently allocated
      -- class for the same subject. This prevents stale rollover audiences from
      -- appearing as current work without deleting their history.
      (
        (
          coalesce(a.assignment_mode, 'batch') = 'custom'
          or a.class_id is null
          or upper(trim(coalesce(a.batch, ''))) = 'ALL'
        )
        and exists (
          select 1
          from public.student_assignments sa
          join public.class_students cs on cs.student_id = sa.student_id
          join public.class_teacher_assignments cta
            on cta.class_id = cs.class_id
           and cta.teacher_user_id = v_teacher_user_id
           and cta.school_id = a.school_id
           and cta.active = true
          join public.classes c
            on c.id = cta.class_id
           and c.school_id = cta.school_id
           and coalesce(c.is_active, true)
          where sa.assignment_id = a.id
            and private.teacher_assignment_subject_key(cta.subject)
                = private.teacher_assignment_subject_key(a.subject_name)
        )
      )
    )
  order by a.assigned_at desc;
end;
$$;

revoke all on function public.rpc_get_assignments_for_teacher(uuid) from public, anon;
grant execute on function public.rpc_get_assignments_for_teacher(uuid) to authenticated;
