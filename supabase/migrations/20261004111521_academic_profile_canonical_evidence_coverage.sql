-- Academic profiles match governed subject identities, not classroom display labels.
-- Does not rename assignments, groups, historical observations or skill keys.
create or replace function private.academic_profile_subject_name(p_label text, p_school_id uuid)
returns text language sql stable set search_path = ''
as $function$
  select coalesce(
    (select min(s.name)
     from public.school_subjects ss
     join public.academic_subjects s on s.id=ss.academic_subject_id and s.is_active
     where ss.school_id=p_school_id
       and public.academic_normalize_subject_key(ss.name)=public.academic_normalize_subject_key(p_label)
     having count(distinct s.id)=1),
    (select s.name from public.academic_subjects s
     where s.id=public.academic_resolve_subject_id(p_label,p_school_id) and s.is_active),
    nullif(trim(p_label),''),
    'General'
  );
$function$;
revoke all on function private.academic_profile_subject_name(text,uuid) from public,anon,authenticated,service_role;

create or replace function private.academic_profile_subject_key(p_label text, p_school_id uuid)
returns text language sql stable set search_path = ''
as $function$
  select lower(trim(private.academic_profile_subject_name(p_label,p_school_id)));
$function$;
revoke all on function private.academic_profile_subject_key(text,uuid) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.rpc_student_academic_profile(p_student_id uuid DEFAULT NULL::uuid, p_subject text DEFAULT NULL::text, p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_caller uuid := (select auth.uid());
  v_student_id uuid := coalesce(p_student_id, (select auth.uid()));
  v_school_id uuid;
  v_is_self boolean := false;
  v_is_school_admin boolean := false;
  v_is_school_head boolean := false;
  v_is_teacher boolean := false;
  v_allowed_subjects text[] := array[]::text[];
  v_result jsonb;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if v_student_id is null then raise exception 'Student is required'; end if;

  select u.school_id into v_school_id
  from public.users u
  where u.id = v_student_id;

  if v_school_id is null then
    raise exception 'Student is not attached to a school';
  end if;

  v_is_self := v_caller = v_student_id;
  v_is_school_head := public.is_school_owner(v_school_id);

  select exists (
    select 1
    from public.school_members sm
    where sm.school_id = v_school_id
      and sm.user_id = v_caller
      and sm.status = 'active'
      and sm.role_in_school = 'school_admin'
  ) into v_is_school_admin;

  select coalesce(array_agg(distinct allowed.subject),array[]::text[])
  into v_allowed_subjects
  from (
    select private.academic_profile_subject_key(r.school_subject_name, v_school_id) as subject
    from private.teacher_current_teaching_roster(v_caller,v_school_id) r
    where r.student_id=v_student_id

    union

    select private.academic_profile_subject_key(r.academic_subject_name, v_school_id) as subject
    from private.teacher_current_teaching_roster(v_caller,v_school_id) r
    where r.student_id=v_student_id
      and nullif(trim(r.academic_subject_name),'') is not null

    union

    select private.academic_profile_subject_key(h.school_subject_name, v_school_id) as subject
    from private.teacher_historical_teaching_roster(
      v_caller,
      v_school_id,
      (
        select y.id
        from public.school_academic_years y
        where y.school_id=v_school_id
          and (p_date_from is null or y.ends_on::timestamptz >= p_date_from)
          and (p_date_to is null or y.starts_on::timestamptz <= p_date_to)
        order by y.starts_on desc
        limit 1
      )
    ) h
    where h.student_id=v_student_id
      and (p_date_from is not null or p_date_to is not null)

    union

    select private.academic_profile_subject_key(h.academic_subject_name, v_school_id) as subject
    from private.teacher_historical_teaching_roster(
      v_caller,
      v_school_id,
      (
        select y.id
        from public.school_academic_years y
        where y.school_id=v_school_id
          and (p_date_from is null or y.ends_on::timestamptz >= p_date_from)
          and (p_date_to is null or y.starts_on::timestamptz <= p_date_to)
        order by y.starts_on desc
        limit 1
      )
    ) h
    where h.student_id=v_student_id
      and nullif(trim(h.academic_subject_name),'') is not null
      and (p_date_from is not null or p_date_to is not null)

    union

    select private.academic_profile_subject_key(cta.subject, v_school_id) as subject
    from public.class_students cs
    join public.class_teacher_assignments cta
      on cta.class_id=cs.class_id
     and cta.school_id=v_school_id
     and cta.teacher_user_id=v_caller
     and cta.active is true
    where cs.student_id=v_student_id
      and not exists(
        select 1 from private.teacher_current_teaching_groups(v_caller,v_school_id)
      )
  ) allowed
  where nullif(trim(allowed.subject),'') is not null;

  v_is_teacher := cardinality(v_allowed_subjects) > 0;

  if not (v_is_self or v_is_school_admin or v_is_school_head or v_is_teacher) then
    raise exception 'Not authorized';
  end if;

  if p_subject is not null
     and v_is_teacher
     and not (v_is_self or v_is_school_admin or v_is_school_head)
     and not private.academic_profile_subject_key(p_subject, v_school_id) = any(v_allowed_subjects) then
    raise exception 'Not authorized for requested subject';
  end if;

  with student_row as (
    select u.id, u.full_name, u.username, u.grade, u.batch, u.school_id
    from public.users u
    where u.id = v_student_id
  ),
  scoped_assignments as (
    select
      r.assignment_id,
      r.student_id,
      r.verified_question_count,
      r.correct,
      r.incorrect,
      r.accuracy,
      r.score,
      r.time_taken_seconds,
      r.completed_at,
      private.academic_profile_subject_name(coalesce(
        nullif(trim(a.subject_name), ''),
        nullif(trim(a.subject), ''),
        nullif(trim(a.subject_id), ''),
        'General'
      ), v_school_id) as subject,
      coalesce(
        nullif(trim(a.topic_name), ''),
        nullif(trim(a.title), ''),
        'General'
      ) as topic,
      coalesce(
        nullif(trim(a.title), ''),
        nullif(trim(a.topic_name), ''),
        'Assignment'
      ) as title,
      a.batch,
      a.assigned_at,
      a.due_at
    from private.student_verified_assignment_summaries r
    join public.assignments a on a.id = r.assignment_id
    where r.student_id = v_student_id
      and (p_date_from is null or r.completed_at >= p_date_from)
      and (p_date_to is null or r.completed_at <= p_date_to)
      and (
        p_subject is null
        or private.academic_profile_subject_key(coalesce(
          a.subject_name, a.subject, a.subject_id, 'General'
        ), v_school_id) = private.academic_profile_subject_key(p_subject, v_school_id)
      )
      and (
        v_is_self or v_is_school_admin or v_is_school_head
        or private.academic_profile_subject_key(coalesce(
          a.subject_name, a.subject, a.subject_id, 'General'
        ), v_school_id) = any(v_allowed_subjects)
      )
  ),
  scoped_focus as (
    select s.*
    from public.student_learning_focus_states s
    where s.student_id = v_student_id
      and (p_subject is null or private.academic_profile_subject_key(s.subject, v_school_id) = private.academic_profile_subject_key(p_subject, v_school_id))
      and (
        v_is_self or v_is_school_admin or v_is_school_head
        or private.academic_profile_subject_key(s.subject, v_school_id) = any(v_allowed_subjects)
      )
      and (p_date_from is null or s.last_observed_at >= p_date_from)
      and (p_date_to is null or s.first_observed_at <= p_date_to)
      and exists (
        select 1
        from public.student_learning_observations qualified
        where qualified.student_id = s.student_id
          and qualified.skill_key = s.skill_key
          and public.student_learning_observation_is_qualified(
            qualified.source_type,
            qualified.contributes_to_focus_state,
            qualified.evidence
          )
      )
  ),
  scoped_timeline as (
    select o.*
    from public.student_learning_observations o
    where o.student_id = v_student_id
      and (p_subject is null or private.academic_profile_subject_key(o.subject, v_school_id) = private.academic_profile_subject_key(p_subject, v_school_id))
      and (
        v_is_self or v_is_school_admin or v_is_school_head
        or private.academic_profile_subject_key(o.subject, v_school_id) = any(v_allowed_subjects)
      )
      and (p_date_from is null or o.observed_at >= p_date_from)
      and (p_date_to is null or o.observed_at <= p_date_to)
      and public.student_learning_observation_is_qualified(
        o.source_type,
        o.contributes_to_focus_state,
        o.evidence
      )
  ),
  subjects as (
    select subject from scoped_assignments
    union
    select private.academic_profile_subject_name(subject, v_school_id) from scoped_focus
    union
    select private.academic_profile_subject_name(subject, v_school_id) from scoped_timeline
  ),
  subject_summary as (
    select
      sub.subject,
      (
        select round(avg(a.accuracy)::numeric, 1)
        from scoped_assignments a
        where lower(a.subject) = lower(sub.subject)
      ) as assignment_average,
      (
        select count(*)
        from scoped_assignments a
        where lower(a.subject) = lower(sub.subject)
      )::integer as completed_assignments,
      (
        select count(*)
        from scoped_focus f
        where private.academic_profile_subject_key(f.subject, v_school_id) = lower(sub.subject)
          and f.current_status = 'persistent'
      )::integer as persistent_focus_count,
      (
        select count(*)
        from scoped_focus f
        where private.academic_profile_subject_key(f.subject, v_school_id) = lower(sub.subject)
          and f.current_status = 'improving'
      )::integer as improving_count,
      (
        select count(*)
        from scoped_focus f
        where private.academic_profile_subject_key(f.subject, v_school_id) = lower(sub.subject)
          and f.current_status = 'resolved'
      )::integer as resolved_count,
      (
        select count(*)
        from scoped_focus f
        where private.academic_profile_subject_key(f.subject, v_school_id) = lower(sub.subject)
          and f.current_status in ('emerging_strength', 'consistent_strength')
      )::integer as strength_count,
      (
        select max(t.observed_at)
        from scoped_timeline t
        where private.academic_profile_subject_key(t.subject, v_school_id) = lower(sub.subject)
      ) as latest_evidence_at
    from subjects sub
  )
  select jsonb_build_object(
    'student', jsonb_build_object(
      'id', sr.id,
      'name', coalesce(nullif(trim(sr.full_name), ''), sr.username),
      'username', sr.username,
      'grade', sr.grade,
      'class_name', sr.batch,
      'school_id', sr.school_id
    ),
    'scope', jsonb_build_object(
      'subject', p_subject,
      'date_from', p_date_from,
      'date_to', p_date_to,
      'viewer', case
        when v_is_self then 'student'
        when v_is_school_head then 'school_head'
        when v_is_school_admin then 'school_admin'
        else 'teacher'
      end,
      'allowed_subjects', case
        when v_is_teacher
          and not (v_is_self or v_is_school_admin or v_is_school_head)
          then to_jsonb(v_allowed_subjects)
        else '[]'::jsonb
      end,
      'subject_aliases', (select coalesce(jsonb_object_agg(lower(trim(ss.name)), private.academic_profile_subject_name(ss.name, v_school_id)), '{}'::jsonb) from public.school_subjects ss where ss.school_id = v_school_id),
      'writing_pending_reviews', case when (p_subject is null or private.academic_profile_subject_key(p_subject, v_school_id) = private.academic_profile_subject_key('English', v_school_id))
        and (v_is_self or v_is_school_admin or v_is_school_head or private.academic_profile_subject_key('English', v_school_id) = any(v_allowed_subjects)) then (
        select count(*) from public.bh_writing_assessments wa
        where wa.student_id = v_student_id and wa.school_id = v_school_id
          and (p_date_from is null or wa.created_at >= p_date_from)
          and (p_date_to is null or wa.created_at <= p_date_to)
          and not exists (select 1 from public.bh_writing_assessment_reviews wr where wr.assessment_id = wa.id and wr.review_status = 'final')
      ) else 0 end,
      'assignment_evidence_authority', 'verified_curriculum_or_registry',
      'writing_evidence_authority', 'teacher_final_review_only',
      'targeted_practice_contributes_to_attainment', false
    ),
    'summary', jsonb_build_object(
      'subjects_tracked', (select count(*) from subjects),
      'completed_assignments', (select count(*) from scoped_assignments),
      'verified_questions_assessed', coalesce((
        select sum(verified_question_count) from scoped_assignments
      ), 0),
      'assignment_average', (
        select round(avg(accuracy)::numeric, 1) from scoped_assignments
      ),
      'persistent_focus_count', (
        select count(*) from scoped_focus where current_status = 'persistent'
      ),
      'recurring_focus_count', (
        select count(*)
        from scoped_focus
        where current_status in ('new_focus', 'recurring')
      ),
      'improving_count', (
        select count(*) from scoped_focus where current_status = 'improving'
      ),
      'resolved_count', (
        select count(*) from scoped_focus where current_status = 'resolved'
      ),
      'strength_count', (
        select count(*)
        from scoped_focus
        where current_status in ('emerging_strength', 'consistent_strength')
      )
    ),
    'subjects', coalesce((
      select jsonb_agg(jsonb_build_object(
        'subject', ss.subject,
        'assignment_average', ss.assignment_average,
        'completed_assignments', ss.completed_assignments,
        'persistent_focus_count', ss.persistent_focus_count,
        'improving_count', ss.improving_count,
        'resolved_count', ss.resolved_count,
        'strength_count', ss.strength_count,
        'latest_evidence_at', ss.latest_evidence_at
      ) order by ss.subject)
      from subject_summary ss
    ), '[]'::jsonb),
    'assignments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'assignment_id', a.assignment_id,
        'title', a.title,
        'subject', a.subject,
        'topic', a.topic,
        'class_name', a.batch,
        'assigned_at', a.assigned_at,
        'due_at', a.due_at,
        'completed_at', a.completed_at,
        'score', a.score,
        'accuracy', a.accuracy,
        'correct', a.correct,
        'incorrect', a.incorrect,
        'verified_question_count', a.verified_question_count,
        'time_taken_seconds', a.time_taken_seconds,
        'evidence_authority', 'brains_heist_verified_question'
      ) order by a.completed_at desc, a.assignment_id)
      from scoped_assignments a
    ), '[]'::jsonb),
    'focus_areas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'subject', private.academic_profile_subject_name(f.subject, v_school_id),
        'topic', f.topic,
        'skill', f.skill,
        'subskill', f.subskill,
        'skill_key', f.skill_key,
        'status', f.current_status,
        'trend', f.trend,
        'priority', f.priority,
        'first_observed_at', f.first_observed_at,
        'last_observed_at', f.last_observed_at,
        'focus_occurrences', f.focus_occurrences,
        'developing_occurrences', f.developing_occurrences,
        'strength_occurrences', f.strength_occurrences,
        'latest_evidence_percentage', f.latest_evidence_percentage,
        'evidence_items', f.evidence_items,
        'evidence_occurrences', f.evidence_occurrences
      ) order by
        case f.priority when 'high' then 1 when 'medium' then 2 else 3 end,
        f.last_observed_at desc,
        f.subject,
        f.skill)
      from scoped_focus f
    ), '[]'::jsonb),
    'timeline', coalesce((
      select jsonb_agg(x.payload order by x.observed_at desc, x.id desc)
      from (
        select o.id, o.observed_at, jsonb_build_object(
          'id', o.id,
          'subject', private.academic_profile_subject_name(o.subject, v_school_id),
          'topic', o.topic,
          'skill', o.skill,
          'subskill', o.subskill,
          'observation_type', o.observation_type,
          'source_type', o.source_type,
          'source_id', o.source_id,
          'observed_at', o.observed_at,
          'evidence_percentage', o.evidence_percentage,
          'evidence_count', o.evidence_count,
          'evidence_quality', o.evidence_quality,
          'contributes_to_focus_state', o.contributes_to_focus_state,
          'evidence', o.evidence
        ) as payload
        from scoped_timeline o
        order by o.observed_at desc, o.created_at desc, o.id desc
        limit 300
      ) x
    ), '[]'::jsonb)
  ) into v_result
  from student_row sr;

  return coalesce(v_result, '{}'::jsonb);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.rpc_student_academic_profile_for_year_pre_context_20260919(p_student_id uuid, p_subject text, p_academic_year_id uuid, p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_student_id uuid := coalesce(p_student_id, auth.uid());
  v_school_id uuid;
  v_year public.school_academic_years%rowtype;
  v_enrol public.student_academic_enrolments%rowtype;
  v_live_class public.classes%rowtype;
  v_operational_year_id uuid;
  v_operational_start timestamptz;
  v_from timestamptz;
  v_to timestamptz;
  v_result jsonb;
  v_focus jsonb := '[]'::jsonb;
  v_subjects jsonb := '[]'::jsonb;
  v_catalog jsonb := '{}'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select u.school_id into v_school_id
  from public.users u
  where u.id = v_student_id;

  select * into v_year
  from public.school_academic_years y
  where y.id = p_academic_year_id
    and y.school_id = v_school_id;

  if not found then
    raise exception 'Academic year not available for student';
  end if;

  v_operational_year_id := public.academic_resolve_operational_year_id(v_school_id, now());

  if v_year.id = v_operational_year_id then
    select min(e.created_at)
      into v_operational_start
    from public.school_year_rollover_events e
    where e.school_id = v_school_id
      and e.event_type = 'committed'
      and e.event_data->>'targetYearId' = v_year.id::text;

    v_operational_start := coalesce(v_operational_start, v_year.starts_on::timestamptz);

    v_from := greatest(
      v_operational_start,
      coalesce(p_date_from, v_operational_start)
    );
  else
    v_from := greatest(
      v_year.starts_on::timestamptz,
      coalesce(p_date_from, v_year.starts_on::timestamptz)
    );
  end if;

  v_to := least(
    ((v_year.ends_on + 1)::date)::timestamptz - interval '1 millisecond',
    coalesce(
      p_date_to,
      ((v_year.ends_on + 1)::date)::timestamptz - interval '1 millisecond'
    )
  );

  v_result := public.rpc_student_academic_profile(
    v_student_id,
    p_subject,
    v_from,
    v_to
  );

  if v_year.id = v_operational_year_id then
    select c.* into v_live_class
    from public.class_students cs
    join public.classes c
      on c.id = cs.class_id
     and c.school_id = v_school_id
     and coalesce(c.is_active, true)
    join public.school_members sm
      on sm.school_id = v_school_id
     and sm.user_id = cs.student_id
     and sm.status in ('active', 'suspended')
     and sm.role_in_school = 'student'
    where cs.student_id = v_student_id
    order by cs.joined_at desc nulls last, c.created_at desc, c.id
    limit 1;

    if v_live_class.id is not null then
      v_result := jsonb_set(
        v_result,
        '{student}',
        coalesce(v_result->'student', '{}'::jsonb) || jsonb_build_object(
          'grade', v_live_class.grade_level,
          'class_name', coalesce(
            nullif(trim(v_live_class.class_code), ''),
            nullif(trim(v_live_class.class_name), ''),
            '—'
          )
        ),
        true
      );
    end if;
  else
    select e.* into v_enrol
    from public.student_academic_enrolments e
    where e.student_id = v_student_id
      and e.school_id = v_school_id
      and e.academic_year_id = p_academic_year_id
    order by case e.context_quality when 'confirmed' then 0 else 1 end,
             e.updated_at desc,
             e.id
    limit 1;

    if v_enrol.id is not null then
      v_result := jsonb_set(
        v_result,
        '{student}',
        coalesce(v_result->'student', '{}'::jsonb) || jsonb_build_object(
          'grade', v_enrol.grade_level,
          'class_name', coalesce(
            (
              select coalesce(
                nullif(trim(c.class_code), ''),
                nullif(trim(c.class_name), '')
              )
              from public.classes c
              where c.id = v_enrol.class_id
            ),
            v_enrol.class_code
          )
        ),
        true
      );
    end if;
  end if;

  v_result := jsonb_set(
    v_result,
    '{scope}',
    coalesce(v_result->'scope', '{}'::jsonb) || jsonb_build_object(
      'academic_year_id', v_year.id,
      'academic_year_name', v_year.name,
      'academic_year_status', v_year.status,
      'archived', v_year.id <> v_operational_year_id,
      'operational_start_at', case when v_year.id = v_operational_year_id then v_operational_start else null end
    ),
    true
  );

  select coalesce(jsonb_agg(item), '[]'::jsonb)
  into v_focus
  from jsonb_array_elements(coalesce(v_result->'focus_areas', '[]'::jsonb)) item
  where exists (
    select 1
    from public.student_learning_focus_states f
    where f.student_id = v_student_id
      and f.skill_key = item->>'skill_key'
      and f.academic_year_id = p_academic_year_id
  );

  v_result := jsonb_set(v_result, '{focus_areas}', v_focus, true);

  select coalesce(
    jsonb_agg(
      item || jsonb_build_object(
        'persistent_focus_count', (
          select count(*)
          from jsonb_array_elements(v_focus) f
          where lower(f->>'subject') = lower(item->>'subject')
            and f->>'status' = 'persistent'
        ),
        'improving_count', (
          select count(*)
          from jsonb_array_elements(v_focus) f
          where lower(f->>'subject') = lower(item->>'subject')
            and f->>'status' = 'improving'
        ),
        'resolved_count', (
          select count(*)
          from jsonb_array_elements(v_focus) f
          where lower(f->>'subject') = lower(item->>'subject')
            and f->>'status' = 'resolved'
        ),
        'strength_count', (
          select count(*)
          from jsonb_array_elements(v_focus) f
          where lower(f->>'subject') = lower(item->>'subject')
            and f->>'status' in ('emerging_strength', 'consistent_strength')
        )
      )
    ),
    '[]'::jsonb
  )
  into v_subjects
  from jsonb_array_elements(coalesce(v_result->'subjects', '[]'::jsonb)) item
  where coalesce((item->>'completed_assignments')::integer, 0) > 0
     or exists (
       select 1
       from jsonb_array_elements(v_focus) f
       where lower(f->>'subject') = lower(item->>'subject')
     );

  v_catalog := public.rpc_student_academic_subjects_for_year(
    v_student_id,
    p_academic_year_id
  );

  select coalesce(jsonb_agg(merged.item order by merged.item->>'subject'), '[]'::jsonb)
  into v_subjects
  from (
    select existing.item
    from jsonb_array_elements(v_subjects) existing(item)

    union all

    select distinct jsonb_build_object(
      'subject', private.academic_profile_subject_name(catalog_item->>'name', v_school_id),
      'assignment_average', null,
      'completed_assignments', 0,
      'persistent_focus_count', 0,
      'improving_count', 0,
      'resolved_count', 0,
      'strength_count', 0,
      'latest_evidence_at', null
    )
    from jsonb_array_elements(coalesce(v_catalog->'subjects', '[]'::jsonb)) catalog_item
    where (p_subject is null
      or private.academic_profile_subject_key(catalog_item->>'name', v_school_id) =
         private.academic_profile_subject_key(p_subject, v_school_id))
      and not exists (
        select 1
        from jsonb_array_elements(v_subjects) existing
        where private.academic_profile_subject_key(existing->>'subject', v_school_id) =
              private.academic_profile_subject_key(catalog_item->>'name', v_school_id)
      )
  ) merged;

  v_result := jsonb_set(v_result, '{subjects}', v_subjects, true);
  v_result := jsonb_set(
    v_result,
    '{summary}',
    coalesce(v_result->'summary', '{}'::jsonb) || jsonb_build_object(
      'subjects_tracked', jsonb_array_length(v_subjects),
      'persistent_focus_count', (
        select count(*)
        from jsonb_array_elements(v_focus) f
        where f->>'status' = 'persistent'
      ),
      'recurring_focus_count', (
        select count(*)
        from jsonb_array_elements(v_focus) f
        where f->>'status' in ('new_focus', 'recurring')
      ),
      'improving_count', (
        select count(*)
        from jsonb_array_elements(v_focus) f
        where f->>'status' = 'improving'
      ),
      'resolved_count', (
        select count(*)
        from jsonb_array_elements(v_focus) f
        where f->>'status' = 'resolved'
      ),
      'strength_count', (
        select count(*)
        from jsonb_array_elements(v_focus) f
        where f->>'status' in ('emerging_strength', 'consistent_strength')
      )
    ),
    true
  );

  return v_result;
end;
$function$
;


-- Include hash-bound registry item evidence in the same official outcome denominator.
create or replace view private.student_verified_assignment_summaries
with (security_invoker = true)
as
select
  result.assignment_id,
  result.student_id,
  count(distinct answer.id)::integer as verified_question_count,
  count(distinct answer.id) filter (where answer.is_correct)::integer as correct,
  count(distinct answer.id) filter (where not answer.is_correct)::integer as incorrect,
  round(
    100 * count(distinct answer.id) filter (where answer.is_correct)::numeric
      / nullif(count(distinct answer.id), 0)::numeric,
    2
  ) as accuracy,
  round(
    100 * count(distinct answer.id) filter (where answer.is_correct)::numeric
      / nullif(count(distinct answer.id), 0)::numeric,
    2
  ) as score,
  result.time_taken_seconds,
  result.completed_at
from public.student_assignment_results result
join public.assignments assignment
  on assignment.id = result.assignment_id
join public.users student
  on student.id = result.student_id
left join public.classes assignment_class
  on assignment_class.id = assignment.class_id
join public.student_assignment_answers answer
  on answer.assignment_id = result.assignment_id
 and answer.student_id = result.student_id
join public.assignment_questions aq
  on aq.assignment_id = answer.assignment_id
 and aq.question_id = answer.question_id
 and aq.pool_scope_snapshot in ('global', 'school')
 and aq.verification_status_snapshot = 'verified'
 and aq.analytics_eligible_snapshot
join public.questions q
  on q.id = answer.question_id
 and q.pool_scope = aq.pool_scope_snapshot
 and q.owner_school_id is not distinct from aq.owner_school_id_snapshot
 and q.verification_status = 'verified'
 and q.analytics_eligible
 and q.is_active
 and q.current_content_hash = q.verified_content_hash
 and aq.question_content_hash = q.verified_content_hash
 and (
   (q.pool_scope = 'global'
     and q.content_origin = 'brain_heist'
     and q.owner_school_id is null
     and q.is_public)
   or (q.pool_scope = 'school'
     and q.content_origin = 'teacher'
     and q.owner_school_id = assignment.school_id
     and not q.is_public)
 )
cross join lateral (
  select nullif(regexp_replace(
    coalesce(
      nullif(trim(assignment.grade_level_snapshot), ''),
      nullif(trim(assignment_class.grade_level), ''),
      nullif(trim(student.grade::text), ''),
      ''
    ),
    '\D', '', 'g'
  ), '') as grade_level
) effective
where result.completed_at is not null
  and answer.grading_status = 'graded'
  and answer.is_correct is not null
  and effective.grade_level is not null
  and effective.grade_level::smallint = any(q.eligible_grade_levels)
  and (
    private.verified_question_has_curriculum_mapping(
      q.id,
      assignment.school_id,
      assignment.academic_year_id,
      effective.grade_level,
      assignment.academic_subject_id
    )
    or exists (
      select 1
      from public.student_learning_item_evidence historical_item
      where historical_item.assignment_id = result.assignment_id
        and historical_item.student_id = result.student_id
        and historical_item.answer_id = answer.id
        and historical_item.question_id = answer.question_id
        and historical_item.question_content_hash = aq.question_content_hash
        and historical_item.grade_level = effective.grade_level
        and historical_item.academic_year_id = assignment.academic_year_id
        and historical_item.academic_subject_id = assignment.academic_subject_id
        and historical_item.is_independent_assessment
        and historical_item.evidence_authority in (
          'brains_heist_verified_question',
          'school_verified_question'
        )
    )
    or exists (
      select 1
      from public.student_learning_registry_item_evidence registry_item
      where registry_item.assignment_id = result.assignment_id
        and registry_item.student_id = result.student_id
        and registry_item.school_id = assignment.school_id
        and registry_item.answer_id = answer.id
        and registry_item.question_id = answer.question_id
        and registry_item.question_content_hash = aq.question_content_hash
        and registry_item.grade_level = effective.grade_level
        and registry_item.academic_year_id = assignment.academic_year_id
        and registry_item.academic_subject_id = assignment.academic_subject_id
        and registry_item.is_independent_assessment
        and registry_item.evidence_authority in (
          'brains_heist_verified_registry_question', 'school_verified_registry_question'
        )
    )
  )
  and not exists (
    select 1
    from public.student_learning_intervention_practice_assignments practice
    where practice.assignment_id = result.assignment_id
      and practice.student_id = result.student_id
  )
group by
  result.assignment_id,
  result.student_id,
  result.time_taken_seconds,
  result.completed_at
having count(distinct answer.id) > 0;

revoke all on private.student_verified_assignment_summaries
  from public, anon, authenticated, service_role;

comment on view private.student_verified_assignment_summaries is
  'Fail-closed official assignment totals from current verified curriculum authority or append-only historical item evidence captured while the assignment evidence was qualified. Mapping supersession alone does not erase a completed academic outcome; retired or changed question content remains excluded, and targeted practice never contributes.';

-- Preserve the existing API boundary; the year implementation remains internal.
revoke all on function public.rpc_student_academic_profile(uuid,text,timestamptz,timestamptz) from public,anon;
grant execute on function public.rpc_student_academic_profile(uuid,text,timestamptz,timestamptz) to authenticated,service_role;
revoke all on function public.rpc_student_academic_profile_for_year_pre_context_20260919(uuid,text,uuid,timestamptz,timestamptz) from public,anon,authenticated,service_role;
