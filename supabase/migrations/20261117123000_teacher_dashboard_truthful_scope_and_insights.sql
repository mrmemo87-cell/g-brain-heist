-- Teacher dashboard: truthful assignment scope and actionable insights.
--
-- Problems observed on a live teacher dashboard (2026-11-17):
--   1. Assignments attached to a teaching group that was later archived and
--      replaced inside the same subject offering silently disappeared from the
--      teacher's list and from every dashboard metric.
--   2. One-student targeted practice (custom, no teaching group) disappeared
--      whenever its subject (e.g. ESL) differed from the homeroom allocation
--      subject (e.g. English), even though the teacher teaches that student in
--      an active teaching group for exactly that subject.
--   3. The dashboard summary counted the members of a logical assignment
--      bundle separately, so its totals disagreed with the Assignments page.
--   4. The summary returned only the eight newest follow-up rows, so the
--      dashboard could not say which students or assignments need attention.
--
-- This migration is additive for clients: existing JSON keys keep their
-- meaning, and new keys are optional for older frontends.

-- ---------------------------------------------------------------------------
-- 1. Continuity group: the active teaching group that now owns an assignment
--    whose original group is archived, or that never had a group.
-- ---------------------------------------------------------------------------
create or replace function private.teacher_assignment_continuity_group_id(
  p_assignment_id uuid,
  p_teacher_user_id uuid
)
returns uuid
language sql stable security definer set search_path=''
as $function$
  select g2.id
  from public.assignments a
  left join public.school_subject_groups g0
    on g0.id=a.subject_group_id and g0.school_id=a.school_id
  join public.school_subject_group_teachers gt
    on gt.teacher_user_id=p_teacher_user_id
   and gt.school_id=a.school_id
   and gt.active
  join public.school_subject_groups g2
    on g2.id=gt.group_id
   and g2.school_id=gt.school_id
   and g2.status='active'
  join public.school_subject_offerings o2
    on o2.id=g2.school_subject_offering_id
   and o2.school_id=g2.school_id
   and o2.status='active'
   and o2.academic_year_id=a.academic_year_id
  join public.school_subjects s2
    on s2.id=o2.school_subject_id
  cross join lateral (
    select count(distinct sa.student_id)::int as shared_students
    from public.student_assignments sa
    where sa.assignment_id=a.id
      and (
        exists(
          select 1
          from public.school_subject_group_students gs
          where gs.group_id=g2.id
            and gs.student_id=sa.student_id
            and gs.status='active'
        )
        or (
          g2.registration_class_id is not null
          and exists(
            select 1
            from public.class_students cs
            where cs.class_id=g2.registration_class_id
              and cs.student_id=sa.student_id
          )
        )
      )
  ) overlap
  where a.id=p_assignment_id
    and overlap.shared_students>0
    and not exists(
      select 1
      from private.assignment_logical_group_members lm
      where lm.assignment_id=a.id
    )
    and (
      (
        -- Archived group replaced by an active group in the same offering,
        -- and this teacher was allocated to the archived group.
        a.subject_group_id is not null
        and g0.id is not null
        and g0.status<>'active'
        and g0.school_subject_offering_id=g2.school_subject_offering_id
        and exists(
          select 1
          from public.school_subject_group_teachers gt0
          where gt0.group_id=g0.id
            and gt0.school_id=a.school_id
            and gt0.teacher_user_id=p_teacher_user_id
        )
      )
      or (
        -- Group-less custom work (e.g. targeted practice) for students the
        -- teacher currently teaches in a group for the same subject.
        a.subject_group_id is null
        and (
          coalesce(a.assignment_mode,'batch')='custom'
          or a.class_id is null
        )
        and private.teacher_assignment_subject_key(s2.name)
          =private.teacher_assignment_subject_key(a.subject_name)
      )
    )
  order by overlap.shared_students desc,g2.name,g2.id
  limit 1;
$function$;

revoke all on function private.teacher_assignment_continuity_group_id(uuid,uuid)
  from public,anon,authenticated;

-- ---------------------------------------------------------------------------
-- 2. Assignments list: same scope as before plus the continuity branch.
-- ---------------------------------------------------------------------------
create or replace function public.rpc_get_assignments_for_teacher(p_teacher_id uuid)
returns table(
  id uuid,teacher_id uuid,subject_id text,subject_name text,topic_name text,batch text,
  difficulty text,title text,instructions text,assigned_at timestamptz,due_at timestamptz,
  created_at timestamptz,updated_at timestamptz,question_count integer,completed_count integer,
  student_count integer,assignment_mode text,description text,publish_status text,
  close_submissions_after_due boolean,notify_students_by_email boolean,published_at timestamptz,
  question_ids uuid[],student_ids uuid[]
)
language plpgsql stable security definer set search_path=''
as $function$
declare
  v_teacher_user_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select t.user_id into v_teacher_user_id
  from public.teachers t
  where t.id=p_teacher_id and t.user_id=auth.uid();
  if v_teacher_user_id is null then raise exception 'Not authorized'; end if;

  return query
  select
    a.id,
    a.teacher_id,
    case when lg.id is not null then lower(coalesce(lg.display_subject_name,a.subject_name)) else a.subject_id end,
    coalesce(lg.display_subject_name,a.subject_name),
    a.topic_name,
    case when lg.id is not null then null else a.batch end,
    a.difficulty,
    a.title,
    a.instructions,
    case when lg.id is not null then
      (select min(x.assigned_at) from public.assignments x where x.id=any(private.assignment_logical_member_ids(a.id)))
      else a.assigned_at end,
    a.due_at,
    case when lg.id is not null then
      (select min(x.created_at) from public.assignments x where x.id=any(private.assignment_logical_member_ids(a.id)))
      else a.created_at end,
    case when lg.id is not null then
      (select max(x.updated_at) from public.assignments x where x.id=any(private.assignment_logical_member_ids(a.id)))
      else a.updated_at end,
    (select count(*)::int from public.assignment_questions aq where aq.assignment_id=a.id),
    (select count(*)::int from public.student_assignments sa
      where sa.assignment_id=any(private.assignment_logical_member_ids(a.id)) and sa.status='completed'),
    (select count(distinct sa.student_id)::int from public.student_assignments sa
      where sa.assignment_id=any(private.assignment_logical_member_ids(a.id))),
    case when lg.id is not null then 'custom' else coalesce(a.assignment_mode,'batch') end,
    a.description,
    a.publish_status,
    a.close_submissions_after_due,
    a.notify_students_by_email,
    a.published_at,
    (select coalesce(array_agg(aq.question_id order by aq.order_index),'{}'::uuid[])
       from public.assignment_questions aq where aq.assignment_id=a.id),
    (select coalesce(array_agg(distinct sa.student_id),'{}'::uuid[])
       from public.student_assignments sa where sa.assignment_id=any(private.assignment_logical_member_ids(a.id)))
  from public.assignments a
  join public.school_academic_years y
    on y.id=a.academic_year_id and y.school_id=a.school_id and y.status='current'
  left join private.assignment_logical_groups lg
    on lg.canonical_assignment_id=a.id
  where a.teacher_id=p_teacher_id
    and not exists(
      select 1
      from private.assignment_logical_group_members lm
      join private.assignment_logical_groups lgg on lgg.id=lm.logical_group_id
      where lm.assignment_id=a.id and lgg.canonical_assignment_id<>a.id
    )
    and (
      (
        lg.id is not null
        and exists(
          select 1
          from public.school_subject_group_teachers gt
          join public.school_subject_groups g on g.id=gt.group_id and g.school_id=gt.school_id
          where gt.group_id=lg.target_subject_group_id
            and gt.teacher_user_id=v_teacher_user_id
            and gt.school_id=a.school_id
            and gt.active
            and g.status='active'
        )
      )
      or
      (
        lg.id is null
        and (
          (
            a.subject_group_id is not null
            and exists(
              select 1
              from public.school_subject_group_teachers gt
              join public.school_subject_groups g on g.id=gt.group_id and g.school_id=gt.school_id
              where gt.group_id=a.subject_group_id
                and gt.teacher_user_id=v_teacher_user_id
                and gt.school_id=a.school_id
                and gt.active
                and g.status='active'
            )
          )
          or
          (
            a.subject_group_id is null
            and (
              (
                coalesce(a.assignment_mode,'batch')='batch'
                and a.class_id is not null
                and exists(
                  select 1
                  from public.class_teacher_assignments cta
                  join public.classes c on c.id=cta.class_id and c.school_id=cta.school_id and coalesce(c.is_active,true)
                  where cta.teacher_user_id=v_teacher_user_id
                    and cta.school_id=a.school_id
                    and cta.class_id=a.class_id
                    and cta.active
                    and private.teacher_assignment_subject_key(cta.subject)=private.teacher_assignment_subject_key(a.subject_name)
                )
              )
              or
              (
                (
                  coalesce(a.assignment_mode,'batch')='custom'
                  or a.class_id is null
                  or upper(trim(coalesce(a.batch,'')))='ALL'
                )
                and exists(
                  select 1
                  from public.student_assignments sa
                  join public.class_students cs on cs.student_id=sa.student_id
                  join public.class_teacher_assignments cta
                    on cta.class_id=cs.class_id
                   and cta.teacher_user_id=v_teacher_user_id
                   and cta.school_id=a.school_id
                   and cta.active
                  join public.classes c
                    on c.id=cta.class_id and c.school_id=cta.school_id and coalesce(c.is_active,true)
                  where sa.assignment_id=a.id
                    and private.teacher_assignment_subject_key(cta.subject)=private.teacher_assignment_subject_key(a.subject_name)
                )
              )
            )
          )
          or private.teacher_assignment_continuity_group_id(a.id,v_teacher_user_id) is not null
        )
      )
    )
  order by 10 desc;
end;
$function$;

revoke all on function public.rpc_get_assignments_for_teacher(uuid)
  from public,anon;
grant execute on function public.rpc_get_assignments_for_teacher(uuid)
  to authenticated,service_role;

-- ---------------------------------------------------------------------------
-- 3. Group context: report the group that owns the assignment today.
-- ---------------------------------------------------------------------------
create or replace function public.rpc_teacher_assignment_group_context(p_teacher_id uuid)
returns table(assignment_id uuid,school_id uuid,school_subject_id uuid,subject_group_id uuid,subject_group_name text)
language plpgsql stable security definer set search_path=''
as $function$
declare
  v_actor uuid:=auth.uid();
begin
  if v_actor is null or not exists(
    select 1 from public.teachers t where t.id=p_teacher_id and t.user_id=v_actor
  ) then
    raise exception using errcode='42501',message='teacher_assignment_access_denied';
  end if;

  return query
  select
    a.id,
    a.school_id,
    coalesce(target_o.school_subject_id,a.school_subject_id),
    coalesce(lg.target_subject_group_id,cg.id,a.subject_group_id),
    coalesce(lg.display_group_name,cg.name,a.subject_group_name_snapshot,g.name)::text
  from public.assignments a
  left join private.assignment_logical_groups lg on lg.canonical_assignment_id=a.id
  left join public.school_subject_groups target_g on target_g.id=lg.target_subject_group_id
  left join public.school_subject_offerings target_o on target_o.id=target_g.school_subject_offering_id
  left join public.school_subject_groups g on g.id=a.subject_group_id
  left join public.school_academic_years y
    on y.id=a.academic_year_id and y.school_id=a.school_id and y.status='current'
  left join public.school_subject_groups cg
    on cg.id=case
      when lg.id is null and y.id is not null and (g.id is null or g.status<>'active')
      then private.teacher_assignment_continuity_group_id(a.id,v_actor)
    end
  where a.teacher_id=p_teacher_id;
end;
$function$;

revoke all on function public.rpc_teacher_assignment_group_context(uuid)
  from public,anon;
grant execute on function public.rpc_teacher_assignment_group_context(uuid)
  to authenticated,service_role;

-- ---------------------------------------------------------------------------
-- 4. Dashboard summary: same scope as the list, logical bundles counted once,
--    plus per-assignment and per-student insight.
-- ---------------------------------------------------------------------------
create or replace function public.rpc_teacher_assignment_success_summary()
returns jsonb
language sql stable security definer set search_path=''
as $function$
  with current_teacher as (
    select t.id teacher_id,t.user_id teacher_user_id
    from public.teachers t
    where t.user_id=auth.uid()
    limit 1
  ),
  current_scope_assignments as (
    select
      a.id,
      coalesce((
        select lgg.canonical_assignment_id
        from private.assignment_logical_group_members lm
        join private.assignment_logical_groups lgg on lgg.id=lm.logical_group_id
        where lm.assignment_id=a.id
        limit 1
      ),a.id) logical_id
    from public.assignments a
    join current_teacher t on t.teacher_id=a.teacher_id
    join public.school_academic_years y
      on y.id=a.academic_year_id
     and y.school_id=a.school_id
     and y.status='current'
    where (
      a.subject_group_id is not null
      and exists(
        select 1
        from public.school_subject_group_teachers gt
        join public.school_subject_groups g
          on g.id=gt.group_id
         and g.school_id=gt.school_id
         and g.status='active'
        join public.school_subject_offerings o
          on o.id=g.school_subject_offering_id
         and o.school_id=g.school_id
         and o.status='active'
        where gt.group_id=a.subject_group_id
          and gt.teacher_user_id=t.teacher_user_id
          and gt.school_id=a.school_id
          and gt.active
          and o.academic_year_id=a.academic_year_id
      )
    )
    or (
      a.subject_group_id is null
      and (
        (
          coalesce(a.assignment_mode,'batch')='batch'
          and a.class_id is not null
          and exists(
            select 1
            from public.class_teacher_assignments cta
            join public.classes c
              on c.id=cta.class_id
             and c.school_id=cta.school_id
             and coalesce(c.is_active,true)
            where cta.teacher_user_id=t.teacher_user_id
              and cta.school_id=a.school_id
              and cta.class_id=a.class_id
              and cta.active
              and private.teacher_assignment_subject_key(cta.subject)
                =private.teacher_assignment_subject_key(a.subject_name)
          )
        )
        or (
          (
            coalesce(a.assignment_mode,'batch')='custom'
            or a.class_id is null
            or upper(trim(coalesce(a.batch,'')))='ALL'
          )
          and exists(
            select 1
            from public.student_assignments sa
            join public.class_students cs on cs.student_id=sa.student_id
            join public.class_teacher_assignments cta
              on cta.class_id=cs.class_id
             and cta.teacher_user_id=t.teacher_user_id
             and cta.school_id=a.school_id
             and cta.active
            join public.classes c
              on c.id=cta.class_id
             and c.school_id=cta.school_id
             and coalesce(c.is_active,true)
            where sa.assignment_id=a.id
              and private.teacher_assignment_subject_key(cta.subject)
                =private.teacher_assignment_subject_key(a.subject_name)
          )
        )
      )
    )
    or private.teacher_assignment_continuity_group_id(a.id,t.teacher_user_id) is not null
  ),
  student_rows as (
    -- One row per logical assignment and student, with the result if any.
    select
      csa.logical_id,
      sa.student_id,
      bool_or(sa.status='completed') completed,
      bool_or(sa.status in ('pending','in_progress')) open_status,
      bool_or(r.student_id is not null) has_result,
      coalesce(sum(coalesce(r.correct,0)),0)::int correct,
      coalesce(sum(coalesce(r.correct,0)+coalesce(r.incorrect,0)),0)::int answered,
      count(r.student_id)::int result_rows,
      min(r.accuracy) accuracy
    from current_scope_assignments csa
    join public.student_assignments sa on sa.assignment_id=csa.id
    left join public.student_assignment_results r
      on r.assignment_id=sa.assignment_id
     and r.student_id=sa.student_id
     and not exists(
       select 1
       from public.legacy_quarantined_assignment_students q
       where q.assignment_id=r.assignment_id and q.student_id=r.student_id
     )
    group by csa.logical_id,sa.student_id
  ),
  logical_assignments as (
    select
      l.logical_id,
      coalesce(a.title,a.topic_name,'Untitled assignment') title,
      a.publish_status,
      (select min(x.assigned_at) from public.assignments x
        join current_scope_assignments c2 on c2.id=x.id
        where c2.logical_id=l.logical_id) assigned_at,
      a.due_at
    from (select distinct logical_id from current_scope_assignments) l
    join public.assignments a on a.id=l.logical_id
  ),
  assignment_progress as (
    select
      la.logical_id,
      la.title,
      la.assigned_at,
      la.due_at,
      la.publish_status,
      count(sr.student_id)::int student_count,
      count(sr.student_id) filter(where sr.completed)::int completed_count,
      coalesce(sum(sr.result_rows),0)::int submission_count,
      coalesce(sum(sr.answered),0)::int answered_question_count,
      coalesce(sum(sr.correct),0)::int correct_answer_count
    from logical_assignments la
    left join student_rows sr on sr.logical_id=la.logical_id
    group by la.logical_id,la.title,la.assigned_at,la.due_at,la.publish_status
  ),
  assignment_totals as (
    select
      count(*)::int assignment_count,
      count(*) filter(where completed_count<student_count)::int active_assignment_count,
      count(*) filter(
        where completed_count<student_count and due_at is not null and due_at<now()
      )::int overdue_assignment_count
    from assignment_progress
  ),
  result_totals as (
    select
      coalesce(sum(submission_count),0)::int submission_count,
      coalesce(sum(answered_question_count),0)::int answered_question_count,
      coalesce(sum(correct_answer_count),0)::int correct_answer_count
    from assignment_progress
  ),
  followups as (
    select
      sr.student_id,
      sr.logical_id assignment_id,
      coalesce(nullif(trim(u.full_name),''),u.username,'Student') student_name,
      ap.title assignment_title,
      case when not sr.has_result then 'missing' else 'low_accuracy' end kind,
      sr.accuracy,
      ap.assigned_at
    from student_rows sr
    join assignment_progress ap on ap.logical_id=sr.logical_id
    join public.users u on u.id=sr.student_id
    where ap.publish_status in ('published','scheduled')
      and ap.assigned_at<=now()
      and not exists(
        select 1
        from public.legacy_quarantined_assignment_students q
        join current_scope_assignments c2 on c2.id=q.assignment_id
        where c2.logical_id=sr.logical_id and q.student_id=sr.student_id
      )
      and (
        (not sr.has_result and sr.open_status and not sr.completed)
        or sr.accuracy<65
      )
  ),
  assignment_followups as (
    select
      f.assignment_id,
      f.assignment_title,
      ap.assigned_at,
      ap.due_at,
      ap.student_count,
      ap.completed_count,
      count(*) filter(where f.kind='missing')::int missing_count,
      count(*) filter(where f.kind='low_accuracy')::int low_accuracy_count
    from followups f
    join assignment_progress ap on ap.logical_id=f.assignment_id
    group by f.assignment_id,f.assignment_title,ap.assigned_at,ap.due_at,ap.student_count,ap.completed_count
  ),
  student_totals as (
    select
      sr.student_id,
      count(*)::int assigned_count,
      count(*) filter(where sr.completed)::int completed_count,
      coalesce(sum(sr.answered),0)::int answered_question_count,
      coalesce(sum(sr.correct),0)::int correct_answer_count
    from student_rows sr
    join assignment_progress ap on ap.logical_id=sr.logical_id
    where ap.publish_status in ('published','scheduled') and ap.assigned_at<=now()
    group by sr.student_id
  ),
  student_followups as (
    select
      f.student_id,
      max(f.student_name) student_name,
      st.assigned_count,
      st.completed_count,
      count(*) filter(where f.kind='missing')::int missing_count,
      count(*) filter(where f.kind='low_accuracy')::int low_accuracy_count,
      st.answered_question_count,
      st.correct_answer_count,
      case when st.answered_question_count>0
        then round(st.correct_answer_count::numeric*100/st.answered_question_count)::int
      end accuracy
    from followups f
    join student_totals st on st.student_id=f.student_id
    group by f.student_id,st.assigned_count,st.completed_count,st.answered_question_count,st.correct_answer_count
  )
  select jsonb_build_object(
    'followup_count',(select count(*) from followups),
    'followups',(select coalesce(jsonb_agg(to_jsonb(f)),'[]'::jsonb) from (
      select student_id,assignment_id,student_name,assignment_title,kind,accuracy
      from followups order by assigned_at desc,assignment_id,student_id limit 8
    ) f),
    'assignment_followups',(select coalesce(jsonb_agg(to_jsonb(f)),'[]'::jsonb) from (
      select assignment_id,assignment_title,assigned_at,due_at,student_count,completed_count,
        missing_count,low_accuracy_count
      from assignment_followups
      order by missing_count desc,low_accuracy_count desc,assigned_at desc,assignment_id
      limit 12
    ) f),
    'student_followup_count',(select count(*) from student_followups),
    'student_followups',(select coalesce(jsonb_agg(to_jsonb(f)),'[]'::jsonb) from (
      select student_id,student_name,assigned_count,completed_count,missing_count,
        low_accuracy_count,answered_question_count,correct_answer_count,accuracy
      from student_followups
      order by missing_count desc,low_accuracy_count desc,accuracy asc nulls last,student_name,student_id
      limit 12
    ) f),
    'assignment_results',(select coalesce(jsonb_agg(to_jsonb(p)),'[]'::jsonb) from (
      select logical_id assignment_id,student_count,completed_count,submission_count,
        answered_question_count,correct_answer_count
      from assignment_progress
      order by assigned_at desc,logical_id
    ) p),
    'assignment_count',a.assignment_count,
    'active_assignment_count',a.active_assignment_count,
    'overdue_assignment_count',a.overdue_assignment_count,
    'submission_count',r.submission_count,
    'answered_question_count',r.answered_question_count,
    'correct_answer_count',r.correct_answer_count,
    'success_rate',case
      when r.answered_question_count>0
      then round(r.correct_answer_count::numeric*100/r.answered_question_count)::int
      else 0
    end
  )
  from assignment_totals a
  cross join result_totals r;
$function$;

revoke all on function public.rpc_teacher_assignment_success_summary()
  from public,anon;
grant execute on function public.rpc_teacher_assignment_success_summary()
  to authenticated,service_role;
