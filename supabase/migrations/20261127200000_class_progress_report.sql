-- Class Progress Report: a printable report on one teaching group's progress, written for school leadership.
-- Read-only. Returns everything the report needs for one subject group in one call:
--   * the school (name, logo, the school's expected level, default 70%),
--   * the group's current roster,
--   * the group's published assignments, plus those of archived groups of the same subject offering
--     whose assigned students are mostly on today's roster (so work given before a group was rebuilt is kept),
--   * each roster student's result on each of those assignments,
--   * correct/total answers per assignment and diagnostic skill tag (roster students only),
--   * the roster students' learning interventions for this subject.
-- Allowed for an active teacher of the group or an administrator of the group's school. Nothing is written.

create or replace function public.rpc_class_progress_report(p_group_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  g record;
  v_subject text;
  v_is_admin boolean;
  v_is_teacher boolean;
  v_result jsonb;
begin
  if v_uid is null or p_group_id is null
     or coalesce((select u.is_banned from public.users u where u.id = v_uid), true) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  select sg.id, sg.school_id, sg.name, sg.status, sg.school_subject_offering_id
    into g from public.school_subject_groups sg where sg.id = p_group_id;
  if g.id is null then raise exception using errcode = '42501', message = 'not_authorized'; end if;

  v_is_admin := public.is_school_admin_of(g.school_id);
  v_is_teacher := exists (
    select 1 from public.school_subject_group_teachers t
    join public.school_members sm on sm.school_id = t.school_id and sm.user_id = t.teacher_user_id
      and sm.status = 'active' and (sm.can_teach or sm.role_in_school = 'teacher')
    where t.group_id = g.id and t.school_id = g.school_id and t.teacher_user_id = v_uid and t.active);
  if not (coalesce(v_is_admin, false) or v_is_teacher) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  select s.name into v_subject
    from public.school_subject_offerings o
    left join public.school_subjects s on s.id = o.school_subject_id
   where o.id = g.school_subject_offering_id;

  with roster as (
    select distinct r.student_id, r.class_code from private.subject_group_roster(g.id) r
  ),
  students as (
    select ro.student_id id, coalesce(nullif(trim(u.full_name), ''), u.username, 'Student') name, ro.class_code
      from roster ro join public.users u on u.id = ro.student_id
     where coalesce(u.is_banned, false) = false
  ),
  candidate as (
    select a.id, a.subject_group_id
      from public.assignments a
     where a.school_id = g.school_id and coalesce(a.publish_status, 'published') = 'published'
       and (a.subject_group_id = g.id or a.subject_group_id in (
            select og.id from public.school_subject_groups og
             where og.school_id = g.school_id and og.id <> g.id and og.status = 'archived'
               and og.school_subject_offering_id is not distinct from g.school_subject_offering_id))
  ),
  kept as (
    select c.id from candidate c
     where c.subject_group_id = g.id
        or (select count(*) filter (where sa.student_id in (select id from students))::numeric
              / nullif(count(*), 0) from public.student_assignments sa where sa.assignment_id = c.id) >= 0.5
  ),
  asg as (
    select a.id, a.title, a.topic_name, a.assignment_category, a.delivery_mode, a.assigned_at, a.due_at,
           (a.subject_group_id <> g.id) from_archived_group
      from public.assignments a where a.id in (select id from kept)
  ),
  res as (
    select sa.assignment_id, sa.student_id, r.accuracy, r.completed_at, r.submitted_late
      from public.student_assignments sa
      join students st on st.id = sa.student_id
      left join public.student_assignment_results r on r.assignment_id = sa.assignment_id and r.student_id = sa.student_id
     where sa.assignment_id in (select id from asg)
  ),
  skills as (
    select ans.assignment_id, coalesce(t.primary_skill_name, '') skill,
           count(*) total, count(*) filter (where ans.is_correct) correct
      from public.student_assignment_answers ans
      join students st on st.id = ans.student_id
      left join public.assignment_questions aq on aq.assignment_id = ans.assignment_id and aq.question_id = ans.question_id
      left join public.verified_question_diagnostic_taxonomy t on t.id = aq.diagnostic_taxonomy_id
     where ans.assignment_id in (select id from asg) and ans.is_correct is not null
     group by 1, 2
  ),
  plans as (
    select i.id, i.student_id, i.status, i.skill, i.topic, i.teaching_action, i.goal, i.created_at, i.target_date
      from public.student_learning_interventions i
      join students st on st.id = i.student_id
     where i.school_id = g.school_id
       and coalesce(i.status, '') not in ('cancelled')
       and (v_subject is null or i.subject is null or lower(trim(i.subject)) = lower(trim(v_subject)))
  )
  select jsonb_build_object(
    'generated_at', now(),
    'school', (select jsonb_build_object(
        'id', s.id, 'name', s.name, 'logo_url', s.logo_url,
        'expected_level', least(95, greatest(40, coalesce(nullif(s.settings->>'progress_report_expected_level', '')::int, 70))),
        'expected_level_set', (s.settings ? 'progress_report_expected_level'))
      from public.schools s where s.id = g.school_id),
    'group', jsonb_build_object('id', g.id, 'name', g.name, 'subject', v_subject, 'archived', g.status = 'archived',
        'teachers', coalesce((select jsonb_agg(coalesce(nullif(trim(u.full_name), ''), u.username) order by 1)
          from public.school_subject_group_teachers t join public.users u on u.id = t.teacher_user_id
          where t.group_id = g.id and t.active), '[]'::jsonb)),
    'viewer', jsonb_build_object('is_school_admin', coalesce(v_is_admin, false), 'is_teacher', v_is_teacher),
    'students', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'class_code', class_code) order by name) from students), '[]'::jsonb),
    'assignments', coalesce((select jsonb_agg(jsonb_build_object(
        'id', a.id, 'title', a.title, 'topic', a.topic_name, 'category', a.assignment_category,
        'delivery_mode', a.delivery_mode, 'assigned_at', a.assigned_at, 'due_at', a.due_at,
        'from_archived_group', a.from_archived_group) order by a.assigned_at, a.id) from asg a), '[]'::jsonb),
    'results', coalesce((select jsonb_agg(jsonb_build_object(
        'assignment_id', r.assignment_id, 'student_id', r.student_id, 'accuracy', r.accuracy,
        'completed_at', r.completed_at, 'late', coalesce(r.submitted_late, false))) from res r), '[]'::jsonb),
    'skills', coalesce((select jsonb_agg(jsonb_build_object(
        'assignment_id', k.assignment_id, 'skill', nullif(k.skill, ''), 'total', k.total, 'correct', k.correct)) from skills k), '[]'::jsonb),
    'interventions', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id, 'student_id', p.student_id, 'status', p.status, 'skill', coalesce(p.skill, p.topic),
        'action', coalesce(p.teaching_action, p.goal), 'created_at', p.created_at, 'target_date', p.target_date)
        order by p.created_at) from plans p), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.rpc_class_progress_report(uuid) from public, anon;
grant execute on function public.rpc_class_progress_report(uuid) to authenticated;

-- The school's expected level for class progress reports (percentage, 40–95). School administrators only.
create or replace function public.rpc_school_admin_set_progress_expected_level(p_school_id uuid, p_level integer)
returns integer language plpgsql volatile security definer set search_path = '' as $$
begin
  if auth.uid() is null or p_school_id is null or not public.is_school_admin_of(p_school_id) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;
  if p_level is null or p_level < 40 or p_level > 95 then
    raise exception using errcode = '22023', message = 'expected_level_out_of_range';
  end if;
  update public.schools
     set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('progress_report_expected_level', p_level),
         updated_at = now()
   where id = p_school_id;
  return p_level;
end;
$$;

revoke all on function public.rpc_school_admin_set_progress_expected_level(uuid, integer) from public, anon;
grant execute on function public.rpc_school_admin_set_progress_expected_level(uuid, integer) to authenticated;
