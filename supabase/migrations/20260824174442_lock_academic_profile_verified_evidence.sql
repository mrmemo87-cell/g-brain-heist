-- The official Academic Profile is an attainment surface, not a copy of raw
-- classroom result totals. Recompute each result from answer rows that still
-- resolve to the immutable Brains Heist Verified snapshot and current verified
-- hash. Targeted intervention practice remains visible in its own workspace
-- but cannot inflate or depress official attainment.

create or replace view private.student_verified_assignment_summaries
with (security_invoker = true)
as
select
  r.assignment_id,
  r.student_id,
  count(distinct saa.id)::integer as verified_question_count,
  count(distinct saa.id) filter (where saa.is_correct)::integer as correct,
  count(distinct saa.id) filter (where not saa.is_correct)::integer as incorrect,
  round(
    100 * count(distinct saa.id) filter (where saa.is_correct)::numeric
      / nullif(count(distinct saa.id), 0)::numeric,
    2
  ) as accuracy,
  round(
    100 * count(distinct saa.id) filter (where saa.is_correct)::numeric
      / nullif(count(distinct saa.id), 0)::numeric,
    2
  ) as score,
  r.time_taken_seconds,
  r.completed_at
from public.student_assignment_results r
join public.assignments assignment
  on assignment.id = r.assignment_id
join public.users student
  on student.id = r.student_id
left join public.classes assignment_class
  on assignment_class.id = assignment.class_id
join public.student_assignment_answers saa
  on saa.assignment_id = r.assignment_id
 and saa.student_id = r.student_id
join public.assignment_questions aq
  on aq.assignment_id = saa.assignment_id
 and aq.question_id = saa.question_id
 and aq.content_origin_snapshot = 'brain_heist'
 and aq.verification_status_snapshot = 'verified'
 and aq.analytics_eligible_snapshot
join public.questions q
  on q.id = saa.question_id
 and q.content_origin = 'brain_heist'
 and q.verification_status = 'verified'
 and q.analytics_eligible
 and q.is_public
 and q.is_active
 and q.current_content_hash = q.verified_content_hash
 and aq.question_content_hash = q.verified_content_hash
where r.completed_at is not null
  and exists (
    select 1
    from unnest(q.eligible_grade_levels) eligible_grade
    where eligible_grade::text = nullif(regexp_replace(
      coalesce(
        nullif(trim(assignment.grade_level_snapshot), ''),
        nullif(trim(assignment_class.grade_level), ''),
        nullif(trim(student.grade::text), ''),
        ''
      ),
      '\D',
      '',
      'g'
    ), '')
  )
  and not exists (
    select 1
    from public.student_learning_intervention_practice_assignments practice
    where practice.assignment_id = r.assignment_id
      and practice.student_id = r.student_id
  )
group by
  r.assignment_id,
  r.student_id,
  r.time_taken_seconds,
  r.completed_at
having count(distinct saa.id) > 0;

revoke all on private.student_verified_assignment_summaries
  from public, anon, authenticated, service_role;

comment on view private.student_verified_assignment_summaries is
  'Fail-closed official assignment totals recomputed only from current, hash-bound Brains Heist Verified answer snapshots; targeted practice is excluded.';

-- Create the assignment and its non-independent-practice provenance in one
-- database transaction. If any authorization, audience, question, or
-- provenance check fails, the assignment creation rolls back with it.
create or replace function public.rpc_create_intervention_practice_assignment(
  p_teacher_id uuid,
  p_subject_id text,
  p_subject_name text,
  p_topic_name text,
  p_question_ids uuid[],
  p_assigned_at timestamptz,
  p_due_at timestamptz,
  p_title text,
  p_instructions text,
  p_difficulty text,
  p_student_id uuid,
  p_skill_key text,
  p_diagnostic_targets jsonb,
  p_client_timezone text default 'UTC',
  p_description text default null,
  p_publish_status text default 'published',
  p_close_submissions_after_due boolean default false,
  p_notify_students_by_email boolean default false
)
returns public.assignments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assignment public.assignments;
begin
  if p_student_id is null or nullif(trim(p_skill_key), '') is null then
    raise exception using errcode = '22023',
      message = 'Student and governed focus skill are required';
  end if;
  if coalesce(array_length(p_question_ids, 1), 0) = 0 then
    raise exception using errcode = '22023',
      message = 'Choose at least one practice question';
  end if;

  select * into v_assignment
  from public.rpc_create_assignment(
    p_teacher_id,
    p_subject_id,
    p_subject_name,
    p_topic_name,
    null::text,
    p_question_ids,
    p_assigned_at,
    p_due_at,
    p_title,
    p_instructions,
    p_difficulty,
    'classwork'::text,
    coalesce(nullif(trim(p_client_timezone), ''), 'UTC'),
    'custom'::text,
    array[p_student_id]::uuid[],
    p_description,
    p_publish_status,
    p_close_submissions_after_due,
    p_notify_students_by_email
  );

  perform public.rpc_teacher_register_intervention_practice(
    v_assignment.id,
    p_student_id,
    p_skill_key,
    coalesce(p_diagnostic_targets, '[]'::jsonb),
    null::uuid
  );

  return v_assignment;
end;
$$;
revoke all on function public.rpc_create_intervention_practice_assignment(
  uuid, text, text, text, uuid[], timestamptz, timestamptz, text, text,
  text, uuid, text, jsonb, text, text, text, boolean, boolean
) from public, anon;
grant execute on function public.rpc_create_intervention_practice_assignment(
  uuid, text, text, text, uuid[], timestamptz, timestamptz, text, text,
  text, uuid, text, jsonb, text, text, text, boolean, boolean
) to authenticated, service_role;

comment on function public.rpc_create_intervention_practice_assignment(
  uuid, text, text, text, uuid[], timestamptz, timestamptz, text, text,
  text, uuid, text, jsonb, text, text, text, boolean, boolean
) is
  'Atomically creates one-student classwork and registers it as non-independent intervention practice.';

create or replace function public.rpc_student_academic_profile(
  p_student_id uuid default null,
  p_subject text default null,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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

  select coalesce(
    array_agg(distinct lower(trim(cta.subject)))
      filter (where nullif(trim(cta.subject), '') is not null),
    array[]::text[]
  )
  into v_allowed_subjects
  from public.class_students cs
  join public.class_teacher_assignments cta
    on cta.class_id = cs.class_id
   and cta.school_id = v_school_id
   and cta.teacher_user_id = v_caller
   and cta.active is true
  where cs.student_id = v_student_id;

  v_is_teacher := cardinality(v_allowed_subjects) > 0;

  if not (v_is_self or v_is_school_admin or v_is_school_head or v_is_teacher) then
    raise exception 'Not authorized';
  end if;

  if p_subject is not null
     and v_is_teacher
     and not (v_is_self or v_is_school_admin or v_is_school_head)
     and not lower(trim(p_subject)) = any(v_allowed_subjects) then
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
      coalesce(
        nullif(trim(a.subject_name), ''),
        nullif(trim(a.subject), ''),
        nullif(trim(a.subject_id), ''),
        'General'
      ) as subject,
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
        or lower(trim(coalesce(
          a.subject_name, a.subject, a.subject_id, 'General'
        ))) = lower(trim(p_subject))
      )
      and (
        v_is_self or v_is_school_admin or v_is_school_head
        or lower(trim(coalesce(
          a.subject_name, a.subject, a.subject_id, 'General'
        ))) = any(v_allowed_subjects)
      )
  ),
  scoped_focus as (
    select s.*
    from public.student_learning_focus_states s
    where s.student_id = v_student_id
      and (p_subject is null or lower(trim(s.subject)) = lower(trim(p_subject)))
      and (
        v_is_self or v_is_school_admin or v_is_school_head
        or lower(trim(s.subject)) = any(v_allowed_subjects)
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
      and (p_subject is null or lower(trim(o.subject)) = lower(trim(p_subject)))
      and (
        v_is_self or v_is_school_admin or v_is_school_head
        or lower(trim(o.subject)) = any(v_allowed_subjects)
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
    select subject from scoped_focus
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
        where lower(f.subject) = lower(sub.subject)
          and f.current_status = 'persistent'
      )::integer as persistent_focus_count,
      (
        select count(*)
        from scoped_focus f
        where lower(f.subject) = lower(sub.subject)
          and f.current_status = 'improving'
      )::integer as improving_count,
      (
        select count(*)
        from scoped_focus f
        where lower(f.subject) = lower(sub.subject)
          and f.current_status = 'resolved'
      )::integer as resolved_count,
      (
        select count(*)
        from scoped_focus f
        where lower(f.subject) = lower(sub.subject)
          and f.current_status in ('emerging_strength', 'consistent_strength')
      )::integer as strength_count,
      (
        select max(t.observed_at)
        from scoped_timeline t
        where lower(t.subject) = lower(sub.subject)
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
      'assignment_evidence_authority', 'brains_heist_verified_only',
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
        'subject', f.subject,
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
          'subject', o.subject,
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
$$;

revoke all on function public.rpc_student_academic_profile(
  uuid, text, timestamptz, timestamptz
) from public, anon;
grant execute on function public.rpc_student_academic_profile(
  uuid, text, timestamptz, timestamptz
) to authenticated, service_role;

comment on function public.rpc_student_academic_profile(
  uuid, text, timestamptz, timestamptz
) is
  'Official student profile: assignment totals are recomputed from Brains Heist Verified items; timeline evidence is authority-qualified; automated Writing Hub analysis and targeted practice are excluded.';

-- Recommendation counts must use the same content authority as the practice
-- workspace. Teacher-authored questions remain available for deliberate
-- classroom use, but never determine whether official targeted practice is
-- available for a governed focus area.
create or replace function private.verified_questions_for_learning_focus(
  p_student_id uuid,
  p_subject text,
  p_skill_key text,
  p_topic text,
  p_skill text,
  p_subskill text
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with candidates as (
    select
      q.id as question_id,
      case
        when p_skill_key like 'diagnostic:%' and exists (
          select 1
          from public.verified_question_diagnostic_taxonomy t
          where t.question_id = q.id
            and t.question_content_hash = q.verified_content_hash
            and t.review_status = 'approved'
            and not t.human_review_required
            and t.scope_code = split_part(p_skill_key, ':', 2)
            and t.primary_skill_code = split_part(p_skill_key, ':', 3)
            and t.atomic_subskill_code = split_part(p_skill_key, ':', 4)
            and not exists (
              select 1
              from public.verified_question_diagnostic_taxonomy successor
              where successor.supersedes_taxonomy_id = t.id
                and successor.review_status = 'approved'
                and not successor.human_review_required
            )
        ) then 1
        when p_skill_key like 'diagnostic:%' and exists (
          select 1
          from public.verified_question_diagnostic_taxonomy t
          where t.question_id = q.id
            and t.question_content_hash = q.verified_content_hash
            and t.review_status = 'approved'
            and not t.human_review_required
            and t.scope_code = split_part(p_skill_key, ':', 2)
            and t.primary_skill_code = split_part(p_skill_key, ':', 3)
            and not exists (
              select 1
              from public.verified_question_diagnostic_taxonomy successor
              where successor.supersedes_taxonomy_id = t.id
                and successor.review_status = 'approved'
                and not successor.human_review_required
            )
        ) then 2
        when p_skill_key like 'objective:%' and exists (
          select 1
          from public.curriculum_assessment_items i
          join public.curriculum_item_objective_mappings m
            on m.assessment_item_id = i.id
           and m.status = 'approved'
           and m.mapping_role = 'primary'
           and m.superseded_at is null
           and m.item_content_hash = i.content_hash
          join public.curriculum_scopes s on s.id = m.curriculum_scope_id
          join public.curriculum_objectives o
            on o.id = m.curriculum_objective_id
           and o.is_assessable
          join public.curriculum_framework_versions fv
            on fv.id = m.framework_version_id
           and fv.status in ('published', 'retired')
           and fv.content_hash = m.curriculum_version_content_hash
          where i.source_type = 'question_bank'
            and i.source_record_id = q.id::text
            and i.source_item_key = 'question'
            and i.is_active
            and i.content_hash = q.verified_content_hash
            and (
              concat_ws(':', 'objective', m.curriculum_objective_id::text) =
                p_skill_key
              or concat_ws(':', 'objective', s.code, o.code) = p_skill_key
            )
        ) then 1
        when p_skill_key not like 'diagnostic:%'
          and p_skill_key not like 'objective:%'
          and lower(trim(coalesce(q.subject, q.subject_id, ''))) =
            lower(trim(coalesce(p_subject, '')))
          and (
            lower(trim(coalesce(q.topic_name, q.topic, ''))) =
              lower(trim(coalesce(p_topic, p_skill, '')))
            or lower(trim(coalesce(q.topic_name, q.topic, ''))) =
              lower(trim(coalesce(p_skill, '')))
            or exists (
              select 1
              from unnest(coalesce(q.tags, array[]::text[])) tag
              where lower(tag) = lower('skill:' || coalesce(p_skill, ''))
                 or lower(tag) = lower(
                   'subskill:' || coalesce(p_subskill, '')
                 )
            )
          ) then 1
        else null
      end as match_tier
    from public.questions q
    join public.users student on student.id = p_student_id
    where q.content_origin = 'brain_heist'
      and q.verification_status = 'verified'
      and q.analytics_eligible
      and q.is_public
      and q.is_active
      and q.current_content_hash = q.verified_content_hash
      and exists (
        select 1
        from unnest(q.eligible_grade_levels) eligible_grade
        where eligible_grade::text = nullif(regexp_replace(
          coalesce(student.grade::text, ''), '\D', '', 'g'
        ), '')
      )
  ),
  matched as (
    select question_id, match_tier
    from candidates
    where match_tier is not null
  ),
  recommended as (
    select question_id, match_tier
    from matched
    order by match_tier, question_id
    limit 6
  )
  select jsonb_build_object(
    'available_question_count', (select count(*) from matched),
    'available_exact_question_count', (
      select count(*) from matched where match_tier = 1
    ),
    'available_related_question_count', (
      select count(*) from matched where match_tier = 2
    ),
    'exact_question_ids', coalesce((
      select jsonb_agg(question_id order by question_id)
      from matched where match_tier = 1
    ), '[]'::jsonb),
    'related_question_ids', coalesce((
      select jsonb_agg(question_id order by question_id)
      from matched where match_tier = 2
    ), '[]'::jsonb),
    'recommended_question_ids', coalesce((
      select jsonb_agg(question_id order by match_tier, question_id)
      from recommended
    ), '[]'::jsonb)
  );
$$;
revoke all on function private.verified_questions_for_learning_focus(
  uuid, text, text, text, text, text
) from public, anon, authenticated, service_role;

create or replace function private.count_verified_questions_for_learning_focus(
  p_student_id uuid,
  p_subject text,
  p_skill_key text,
  p_topic text,
  p_skill text,
  p_subskill text
)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    private.verified_questions_for_learning_focus(
      p_student_id, p_subject, p_skill_key, p_topic, p_skill, p_subskill
    )->>'available_question_count'
  )::integer, 0);
$$;
revoke all on function private.count_verified_questions_for_learning_focus(
  uuid, text, text, text, text, text
) from public, anon, authenticated, service_role;

create or replace function public.rpc_teacher_student_intervention_intelligence(
  p_student_id uuid,
  p_subject text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_school_id uuid;
  v_result jsonb;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;

  select school_id into v_school_id
  from public.users
  where id = p_student_id;
  if v_school_id is null then
    raise exception 'Student is not attached to a school';
  end if;

  if p_subject is not null then
    if not public.student_learning_can_manage_intervention(
      p_student_id, p_subject
    ) then
      raise exception 'Not authorised for this student and subject';
    end if;
  elsif not exists (
    select 1
    from public.school_members sm
    where sm.school_id = v_school_id
      and sm.user_id = v_caller
      and sm.status = 'active'
      and sm.role_in_school = 'school_admin'
  ) and not exists (
    select 1
    from public.class_students cs
    join public.class_teacher_assignments cta
      on cta.class_id = cs.class_id
     and cta.school_id = v_school_id
     and cta.teacher_user_id = v_caller
     and cta.active is true
    where cs.student_id = p_student_id
  ) then
    raise exception 'Not authorised for this student';
  end if;

  with allowed_subjects as (
    select distinct lower(trim(cta.subject)) as subject
    from public.class_students cs
    join public.class_teacher_assignments cta
      on cta.class_id = cs.class_id
     and cta.school_id = v_school_id
     and cta.teacher_user_id = v_caller
     and cta.active is true
    where cs.student_id = p_student_id
  ),
  focus as (
    select
      f.*,
      greatest(0, current_date - f.last_observed_at::date)::integer
        as days_since_evidence,
      coalesce((question_set.payload->>'available_question_count')::integer, 0)
        as available_questions,
      coalesce((
        question_set.payload->>'available_exact_question_count'
      )::integer, 0) as available_exact_questions,
      coalesce((
        question_set.payload->>'available_related_question_count'
      )::integer, 0) as available_related_questions,
      coalesce(
        question_set.payload->'recommended_question_ids', '[]'::jsonb
      ) as recommended_question_ids,
      coalesce(
        question_set.payload->'exact_question_ids', '[]'::jsonb
      ) as exact_question_ids,
      coalesce(
        question_set.payload->'related_question_ids', '[]'::jsonb
      ) as related_question_ids
    from public.student_learning_focus_states f
    cross join lateral (
      select private.verified_questions_for_learning_focus(
        p_student_id,
        f.subject,
        f.skill_key,
        f.topic,
        f.skill,
        f.subskill
      ) as payload
    ) question_set
    where f.school_id = v_school_id
      and f.student_id = p_student_id
      and f.current_status in (
        'new_focus', 'recurring', 'persistent', 'improving'
      )
      and (p_subject is null or lower(trim(f.subject)) = lower(trim(p_subject)))
      and (
        exists (
          select 1
          from public.school_members sm
          where sm.school_id = v_school_id
            and sm.user_id = v_caller
            and sm.status = 'active'
            and sm.role_in_school = 'school_admin'
        )
        or lower(trim(f.subject)) in (select subject from allowed_subjects)
      )
      and exists (
        select 1
        from public.student_learning_observations qualified
        where qualified.student_id = f.student_id
          and qualified.skill_key = f.skill_key
          and public.student_learning_observation_is_qualified(
            qualified.source_type,
            qualified.contributes_to_focus_state,
            qualified.evidence
          )
      )
  ),
  recommendations as (
    select
      f.*,
      case
        when f.days_since_evidence >= 60 then 'reassessment'
        when lower(f.subject) = 'english'
          and lower(coalesce(f.topic, '')) like 'writing%'
          then 'writing_practice'
        when f.skill_key like 'diagnostic:%'
          and f.available_exact_questions >= 1
          then 'targeted_question_practice'
        when f.available_questions >= 5 then 'targeted_question_practice'
        else 'teacher_support'
      end as recommended_type,
      case
        when f.days_since_evidence >= 60 then format(
          '%s was previously identified as %s, but the latest qualifying evidence is %s days old. Reassess before assuming the difficulty is still current.',
          f.skill, replace(f.current_status, '_', ' '), f.days_since_evidence
        )
        when f.current_status = 'persistent' then format(
          '%s remains a persistent focus area across %s qualifying evidence items. The latest evidence was recorded on %s.',
          f.skill, f.evidence_items,
          to_char(f.last_observed_at, 'DD Mon YYYY')
        )
        when f.current_status = 'recurring' then format(
          '%s has recurred across %s qualifying evidence items and should be reinforced before it becomes persistent.',
          f.skill, f.evidence_items
        )
        when f.current_status = 'improving' then format(
          '%s is improving. Reinforce the successful approach and continue monitoring before closing the focus area.',
          f.skill
        )
        else format(
          '%s is a newly detected focus area. Use targeted practice and gather more evidence before labelling it persistent.',
          f.skill
        )
      end as rationale,
      case
        when f.days_since_evidence >= 60 then format(
          'Collect fresh evidence for %s and confirm whether targeted support is still required.',
          f.skill
        )
        when f.current_status = 'persistent' then format(
          'Move %s from persistent to improving through repeated successful evidence.',
          f.skill
        )
        when f.current_status = 'recurring' then format(
          'Achieve consistent successful evidence in %s across the next assessed tasks.',
          f.skill
        )
        else format(
          'Strengthen %s while monitoring the next assessed tasks.', f.skill
        )
      end as suggested_goal
    from focus f
  )
  select jsonb_build_object(
    'student', jsonb_build_object(
      'id', u.id,
      'name', coalesce(nullif(trim(u.full_name), ''), u.username),
      'grade', u.grade,
      'class_name', u.batch,
      'school_id', u.school_id
    ),
    'question_authority', 'brains_heist_verified_only',
    'recommendations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'subject', r.subject,
        'topic', r.topic,
        'skill', r.skill,
        'skill_key', r.skill_key,
        'status', r.current_status,
        'trend', r.trend,
        'priority', r.priority,
        'evidence_items', r.evidence_items,
        'focus_occurrences', r.focus_occurrences,
        'last_observed_at', r.last_observed_at,
        'days_since_evidence', r.days_since_evidence,
        'available_questions', r.available_questions,
        'available_exact_questions', r.available_exact_questions,
        'available_related_questions', r.available_related_questions,
        'recommended_question_ids', r.recommended_question_ids,
        'exact_question_ids', r.exact_question_ids,
        'related_question_ids', r.related_question_ids,
        'recommended_type', r.recommended_type,
        'rationale', r.rationale,
        'suggested_goal', r.suggested_goal,
        'has_open_intervention', exists (
          select 1
          from public.student_learning_interventions i
          where i.student_id = p_student_id
            and i.skill_key = r.skill_key
            and i.status in ('planned', 'active')
            and public.student_learning_can_manage_intervention(
              i.student_id, i.subject
            )
        )
      ) order by
        case r.priority when 'high' then 1 when 'medium' then 2 else 3 end,
        r.days_since_evidence desc,
        r.skill)
      from recommendations r
    ), '[]'::jsonb),
    'interventions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id,
        'subject', i.subject,
        'skill', i.skill,
        'skill_key', i.skill_key,
        'topic', i.topic,
        'intervention_type', i.intervention_type,
        'status', i.status,
        'rationale', i.rationale,
        'goal', i.goal,
        'baseline_status', i.baseline_status,
        'baseline_evidence_items', i.baseline_evidence_items,
        'baseline_last_observed_at', i.baseline_last_observed_at,
        'target_date', i.target_date,
        'created_at', i.created_at,
        'started_at', i.started_at,
        'completed_at', i.completed_at,
        'outcome_status', i.outcome_status,
        'outcome_note', i.outcome_note
      ) order by
        case i.status when 'active' then 1 when 'planned' then 2 else 3 end,
        i.created_at desc)
      from public.student_learning_interventions i
      where i.school_id = v_school_id
        and i.student_id = p_student_id
        and (p_subject is null or lower(i.subject) = lower(p_subject))
        and public.student_learning_can_manage_intervention(
          i.student_id, i.subject
        )
    ), '[]'::jsonb)
  ) into v_result
  from public.users u
  where u.id = p_student_id;

  return coalesce(v_result, '{}'::jsonb);
end;
$$;
revoke all on function public.rpc_teacher_student_intervention_intelligence(
  uuid, text
) from public, anon, authenticated;
grant execute on function public.rpc_teacher_student_intervention_intelligence(
  uuid, text
) to authenticated, service_role;

-- Guardian progress is an official family-facing attainment surface. Preserve
-- operational assignment counts, but source scored work and learning evidence
-- from the same verified/final-review authority used by the Academic Profile.
create or replace function public.rpc_guardian_child_progress(
  p_student_id uuid,
  p_days integer default 90
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_days integer := greatest(30, least(coalesce(p_days, 90), 365));
  v_start timestamptz := now() - make_interval(
    days => greatest(30, least(coalesce(p_days, 90), 365))
  );
  v_school_id uuid;
  v_result jsonb;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;

  select r.school_id
  into v_school_id
  from public.student_guardian_relationships r
  where r.guardian_user_id = v_caller
    and r.student_id = p_student_id
    and r.status = 'active';

  if v_school_id is null then
    raise exception 'You are not authorised to view this student';
  end if;

  with child as (
    select
      u.id,
      coalesce(nullif(trim(u.full_name), ''), u.username) as name,
      u.grade,
      coalesce(
        (
          select nullif(trim(c.class_code), '')
          from public.class_students cs
          join public.classes c on c.id = cs.class_id
          where cs.student_id = u.id
            and c.school_id = v_school_id
            and c.is_active is true
          order by c.created_at desc, c.id desc
          limit 1
        ),
        nullif(trim(u.batch), ''),
        '—'
      ) as class_name,
      u.avatar_url,
      s.name as school_name,
      s.logo_url
    from public.users u
    join public.schools s on s.id = v_school_id
    where u.id = p_student_id
      and u.school_id = v_school_id
  ),
  current_focus as (
    select f.*
    from public.student_learning_focus_states f
    where f.school_id = v_school_id
      and f.student_id = p_student_id
      and exists (
        select 1
        from public.student_learning_observations qualified
        where qualified.school_id = f.school_id
          and qualified.student_id = f.student_id
          and qualified.skill_key = f.skill_key
          and public.student_learning_observation_is_qualified(
            qualified.source_type,
            qualified.contributes_to_focus_state,
            qualified.evidence
          )
      )
  ),
  period_results as (
    select
      r.assignment_id,
      r.accuracy,
      r.correct,
      r.incorrect,
      r.score,
      r.completed_at,
      coalesce(
        nullif(trim(a.subject_name), ''),
        nullif(trim(a.subject), ''),
        nullif(trim(a.subject_id), ''),
        'General'
      ) as subject,
      coalesce(
        nullif(trim(a.title), ''),
        nullif(trim(a.topic_name), ''),
        'Assignment'
      ) as title,
      coalesce(nullif(trim(a.topic_name), ''), 'General') as topic
    from private.student_verified_assignment_summaries r
    join public.assignments a
      on a.id = r.assignment_id
     and a.school_id = v_school_id
    where r.student_id = p_student_id
      and r.completed_at >= v_start
  ),
  period_assignments as (
    select
      sa.assignment_id,
      sa.status,
      sa.due_at,
      coalesce(
        nullif(trim(a.subject_name), ''),
        nullif(trim(a.subject), ''),
        nullif(trim(a.subject_id), ''),
        'General'
      ) as subject
    from public.student_assignments sa
    join public.assignments a
      on a.id = sa.assignment_id
     and a.school_id = v_school_id
    where sa.student_id = p_student_id
      and sa.assigned_at >= v_start
  ),
  subjects as (
    select subject from period_results
    union
    select subject from current_focus
  ),
  subject_rows as (
    select
      s.subject,
      (
        select round(avg(r.accuracy)::numeric, 1)
        from period_results r
        where lower(r.subject) = lower(s.subject)
      ) as assignment_average,
      (
        select count(*) from period_results r
        where lower(r.subject) = lower(s.subject)
      )::integer as completed_assignments,
      (
        select count(*) from current_focus f
        where lower(f.subject) = lower(s.subject)
          and f.current_status = 'persistent'
      )::integer as persistent_focus_count,
      (
        select count(*) from current_focus f
        where lower(f.subject) = lower(s.subject)
          and f.current_status = 'improving'
      )::integer as improving_count,
      (
        select count(*) from current_focus f
        where lower(f.subject) = lower(s.subject)
          and f.current_status = 'resolved'
      )::integer as resolved_count,
      (
        select count(*) from current_focus f
        where lower(f.subject) = lower(s.subject)
          and f.current_status in ('emerging_strength', 'consistent_strength')
      )::integer as strength_count
    from subjects s
  ),
  safe_timeline as (
    select
      o.id,
      o.subject,
      o.topic,
      o.skill,
      o.subskill,
      o.observation_type,
      o.source_type,
      o.source_id,
      o.observed_at,
      o.evidence_percentage,
      o.evidence_quality
    from public.student_learning_observations o
    where o.school_id = v_school_id
      and o.student_id = p_student_id
      and o.observed_at >= v_start
      and o.source_type in (
        'assignment_result', 'writing_assessment_review'
      )
      and public.student_learning_observation_is_qualified(
        o.source_type,
        o.contributes_to_focus_state,
        o.evidence
      )
    order by o.observed_at desc, o.id desc
    limit 120
  )
  select jsonb_build_object(
    'child', jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'grade', c.grade,
      'class_name', c.class_name,
      'school_id', v_school_id,
      'school_name', c.school_name,
      'school_logo_url', c.logo_url,
      'avatar_url', c.avatar_url
    ),
    'period', jsonb_build_object(
      'days', v_days, 'start', v_start, 'end', now()
    ),
    'summary', jsonb_build_object(
      'assignment_average', (
        select round(avg(accuracy)::numeric, 1) from period_results
      ),
      'completed_assignments', (select count(*) from period_results),
      'assigned_assignments', (select count(*) from period_assignments),
      'overdue_assignments', (
        select count(*)
        from period_assignments
        where status <> 'completed'
          and due_at is not null
          and due_at < now()
      ),
      'persistent_focus_count', (
        select count(*) from current_focus where current_status = 'persistent'
      ),
      'recurring_focus_count', (
        select count(*)
        from current_focus
        where current_status in ('new_focus', 'recurring')
      ),
      'improving_count', (
        select count(*) from current_focus where current_status = 'improving'
      ),
      'resolved_count', (
        select count(*) from current_focus where current_status = 'resolved'
      ),
      'strength_count', (
        select count(*)
        from current_focus
        where current_status in ('emerging_strength', 'consistent_strength')
      )
    ),
    'subjects', coalesce((
      select jsonb_agg(to_jsonb(sr) order by sr.subject)
      from subject_rows sr
    ), '[]'::jsonb),
    'focus_areas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'subject', f.subject,
        'topic', f.topic,
        'skill', f.skill,
        'subskill', f.subskill,
        'skill_key', f.skill_key,
        'status', f.current_status,
        'trend', f.trend,
        'priority', f.priority,
        'first_observed_at', f.first_observed_at,
        'last_observed_at', f.last_observed_at,
        'evidence_items', f.evidence_items,
        'latest_evidence_percentage', f.latest_evidence_percentage
      ) order by
        case f.priority when 'high' then 1 when 'medium' then 2 else 3 end,
        f.last_observed_at desc)
      from current_focus f
      where f.current_status in ('new_focus', 'recurring', 'persistent')
    ), '[]'::jsonb),
    'improving', coalesce((
      select jsonb_agg(jsonb_build_object(
        'subject', f.subject,
        'skill', f.skill,
        'subskill', f.subskill,
        'last_observed_at', f.last_observed_at,
        'evidence_items', f.evidence_items
      ) order by f.last_observed_at desc)
      from current_focus f
      where f.current_status = 'improving'
    ), '[]'::jsonb),
    'resolved', coalesce((
      select jsonb_agg(jsonb_build_object(
        'subject', f.subject,
        'skill', f.skill,
        'subskill', f.subskill,
        'last_observed_at', f.last_observed_at,
        'evidence_items', f.evidence_items
      ) order by f.last_observed_at desc)
      from current_focus f
      where f.current_status = 'resolved'
    ), '[]'::jsonb),
    'strengths', coalesce((
      select jsonb_agg(jsonb_build_object(
        'subject', f.subject,
        'skill', f.skill,
        'subskill', f.subskill,
        'status', f.current_status,
        'last_observed_at', f.last_observed_at,
        'evidence_items', f.evidence_items
      ) order by f.last_observed_at desc)
      from current_focus f
      where f.current_status in ('emerging_strength', 'consistent_strength')
    ), '[]'::jsonb),
    'recent_assignments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'assignment_id', r.assignment_id,
        'title', r.title,
        'subject', r.subject,
        'topic', r.topic,
        'accuracy', r.accuracy,
        'correct', r.correct,
        'incorrect', r.incorrect,
        'completed_at', r.completed_at
      ) order by r.completed_at desc)
      from period_results r
    ), '[]'::jsonb),
    'timeline', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id,
        'subject', t.subject,
        'topic', t.topic,
        'skill', t.skill,
        'subskill', t.subskill,
        'observation_type', t.observation_type,
        'source_type', t.source_type,
        'source_id', t.source_id,
        'observed_at', t.observed_at,
        'evidence_percentage', t.evidence_percentage,
        'evidence_quality', t.evidence_quality
      ) order by t.observed_at desc, t.id desc)
      from safe_timeline t
    ), '[]'::jsonb)
  )
  into v_result
  from child c;

  return coalesce(v_result, '{}'::jsonb);
end;
$$;
revoke all on function public.rpc_guardian_child_progress(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.rpc_guardian_child_progress(uuid, integer)
  to authenticated, service_role;

comment on function public.rpc_guardian_child_progress(uuid, integer) is
  'Guardian progress uses verified assignment totals and authority-qualified observations; automated Writing Hub analysis and targeted practice are excluded from attainment.';

-- School Head learning intelligence must aggregate the same authoritative
-- evidence as the student and guardian views, rather than raw result rows or
-- automated Writing Hub observations.
create or replace function public.school_head_get_learning_intelligence(
  p_school_id uuid,
  p_days integer default 90
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days integer := greatest(7, least(coalesce(p_days, 90), 365));
  v_start timestamptz := now() - make_interval(
    days => greatest(7, least(coalesce(p_days, 90), 365))
  );
  v_result jsonb;
begin
  if (select auth.uid()) is null
     or not public.is_school_owner(p_school_id) then
    raise exception 'Forbidden: active School Head authority is required';
  end if;

  with active_students as (
    select distinct
      u.id,
      coalesce(nullif(trim(u.full_name), ''), u.username) as student_name,
      u.grade,
      u.batch
    from public.school_members sm
    join public.users u
      on u.id = sm.user_id
     and u.school_id = sm.school_id
    where sm.school_id = p_school_id
      and sm.status = 'active'
      and sm.role_in_school = 'student'
  ),
  student_class as (
    select distinct on (cs.student_id)
      cs.student_id,
      c.id as class_id,
      coalesce(
        nullif(trim(c.class_code), ''),
        nullif(trim(c.class_name), ''),
        'Unassigned'
      ) as class_name,
      c.grade_level
    from public.class_students cs
    join public.classes c
      on c.id = cs.class_id
     and c.school_id = p_school_id
     and c.is_active is true
    join active_students s on s.id = cs.student_id
    order by cs.student_id, c.created_at desc, c.id
  ),
  school_focus as (
    select f.*
    from public.student_learning_focus_states f
    join active_students s on s.id = f.student_id
    where f.school_id = p_school_id
      and exists (
        select 1
        from public.student_learning_observations qualified
        where qualified.school_id = f.school_id
          and qualified.student_id = f.student_id
          and qualified.skill_key = f.skill_key
          and public.student_learning_observation_is_qualified(
            qualified.source_type,
            qualified.contributes_to_focus_state,
            qualified.evidence
          )
      )
  ),
  recent_observations as (
    select o.*
    from public.student_learning_observations o
    join active_students s on s.id = o.student_id
    where o.school_id = p_school_id
      and o.observed_at >= v_start
      and public.student_learning_observation_is_qualified(
        o.source_type,
        o.contributes_to_focus_state,
        o.evidence
      )
  ),
  period_assignments as (
    select
      r.student_id,
      r.accuracy,
      r.completed_at,
      coalesce(
        nullif(trim(a.subject_name), ''),
        nullif(trim(a.subject), ''),
        nullif(trim(a.subject_id), ''),
        'General'
      ) as subject
    from private.student_verified_assignment_summaries r
    join public.assignments a
      on a.id = r.assignment_id
     and a.school_id = p_school_id
    join active_students s on s.id = r.student_id
    where r.completed_at >= v_start
  ),
  subject_names as (
    select subject from school_focus
    union
    select subject from period_assignments
  ),
  subject_rows as (
    select
      n.subject,
      (
        select count(distinct f.student_id)
        from school_focus f
        where lower(f.subject) = lower(n.subject)
      )::integer as students_tracked,
      (
        select round(avg(a.accuracy)::numeric, 1)
        from period_assignments a
        where lower(a.subject) = lower(n.subject)
      ) as assignment_average,
      (
        select count(*)
        from period_assignments a
        where lower(a.subject) = lower(n.subject)
      )::integer as completed_assignments,
      (
        select count(*)
        from school_focus f
        where lower(f.subject) = lower(n.subject)
          and f.current_status = 'persistent'
      )::integer as persistent_areas,
      (
        select count(distinct f.student_id)
        from school_focus f
        where lower(f.subject) = lower(n.subject)
          and f.current_status = 'persistent'
      )::integer as persistent_students,
      (
        select count(distinct f.student_id)
        from school_focus f
        where lower(f.subject) = lower(n.subject)
          and f.current_status = 'improving'
      )::integer as improving_students,
      (
        select count(distinct f.student_id)
        from school_focus f
        where lower(f.subject) = lower(n.subject)
          and f.current_status = 'resolved'
      )::integer as resolved_students,
      (
        select count(*)
        from school_focus f
        where lower(f.subject) = lower(n.subject)
          and f.current_status in (
            'emerging_strength', 'consistent_strength'
          )
      )::integer as strength_areas,
      (
        select max(f.last_observed_at)
        from school_focus f
        where lower(f.subject) = lower(n.subject)
      ) as latest_evidence_at
    from subject_names n
  ),
  class_rows as (
    select
      sc.class_id,
      sc.class_name,
      count(distinct sc.student_id)::integer as student_count,
      count(distinct f.student_id)::integer as tracked_students,
      (
        select round(avg(pa.accuracy)::numeric, 1)
        from period_assignments pa
        join student_class sx on sx.student_id = pa.student_id
        where sx.class_id = sc.class_id
      ) as assignment_average,
      count(distinct f.student_id) filter (
        where f.current_status = 'persistent'
      )::integer as persistent_students,
      count(distinct f.student_id) filter (
        where f.current_status = 'improving'
      )::integer as improving_students,
      count(distinct f.student_id) filter (
        where f.current_status = 'resolved'
      )::integer as resolved_students,
      count(*) filter (
        where f.current_status = 'persistent'
      )::integer as persistent_areas,
      count(*) filter (
        where f.priority = 'high'
      )::integer as high_priority_areas
    from student_class sc
    left join school_focus f on f.student_id = sc.student_id
    group by sc.class_id, sc.class_name
  ),
  priority_skills as (
    select
      f.subject,
      f.topic,
      f.skill,
      count(distinct f.student_id) filter (
        where f.current_status = 'persistent'
      )::integer as persistent_students,
      count(distinct f.student_id) filter (
        where f.current_status in ('new_focus', 'recurring')
      )::integer as recurring_students,
      count(distinct f.student_id) filter (
        where f.current_status = 'improving'
      )::integer as improving_students,
      min(f.first_observed_at) as first_observed_at,
      max(f.last_observed_at) as last_observed_at,
      round(avg(f.latest_evidence_percentage)::numeric, 1)
        as average_latest_evidence,
      count(distinct f.student_id) filter (
        where f.current_status = 'persistent'
          and f.last_observed_at < now() - interval '60 days'
      )::integer as stale_persistent_students
    from school_focus f
    where f.current_status in (
      'new_focus', 'recurring', 'persistent', 'improving'
    )
    group by f.subject, f.topic, f.skill
  ),
  student_support as (
    select
      s.id as student_id,
      s.student_name,
      coalesce(sc.class_name, s.batch, 'Unassigned') as class_name,
      s.grade,
      count(*) filter (
        where f.current_status = 'persistent'
      )::integer as persistent_count,
      count(*) filter (
        where f.current_status in ('new_focus', 'recurring')
      )::integer as recurring_count,
      count(*) filter (
        where f.current_status = 'improving'
      )::integer as improving_count,
      count(*) filter (
        where f.current_status = 'resolved'
      )::integer as resolved_count,
      count(*) filter (
        where f.current_status in (
          'emerging_strength', 'consistent_strength'
        )
      )::integer as strength_count,
      max(f.last_observed_at) as latest_evidence_at,
      min(f.first_observed_at) filter (
        where f.current_status = 'persistent'
      ) as earliest_persistent_at,
      array_remove(array_agg(distinct f.subject) filter (
        where f.current_status in ('persistent', 'recurring', 'new_focus')
      ), null) as focus_subjects
    from active_students s
    left join student_class sc on sc.student_id = s.id
    left join school_focus f on f.student_id = s.id
    group by
      s.id, s.student_name, s.grade, s.batch, sc.class_name
  ),
  strength_skills as (
    select
      f.subject,
      f.topic,
      f.skill,
      count(distinct f.student_id)::integer as students
    from school_focus f
    where f.current_status = 'consistent_strength'
    group by f.subject, f.topic, f.skill
  )
  select jsonb_build_object(
    'success', true,
    'school_id', p_school_id,
    'period', jsonb_build_object(
      'days', v_days, 'start', v_start, 'end', now()
    ),
    'summary', jsonb_build_object(
      'students', (select count(*) from active_students),
      'students_with_learning_memory', (
        select count(distinct student_id) from school_focus
      ),
      'students_with_persistent_focus', (
        select count(*) from student_support where persistent_count > 0
      ),
      'students_improving', (
        select count(*) from student_support where improving_count > 0
      ),
      'students_with_resolved_areas', (
        select count(*) from student_support where resolved_count > 0
      ),
      'students_with_consistent_strengths', (
        select count(*) from student_support where strength_count > 0
      ),
      'persistent_focus_areas', (
        select count(*) from school_focus where current_status = 'persistent'
      ),
      'stale_persistent_areas', (
        select count(*)
        from school_focus
        where current_status = 'persistent'
          and last_observed_at < now() - interval '60 days'
      ),
      'recent_evidence_items', (select count(*) from recent_observations),
      'period_assignment_average', (
        select round(avg(accuracy)::numeric, 1) from period_assignments
      ),
      'period_completed_assignments', (
        select count(*) from period_assignments
      )
    ),
    'subjects', coalesce((
      select jsonb_agg(jsonb_build_object(
        'subject', subject,
        'students_tracked', students_tracked,
        'assignment_average', assignment_average,
        'completed_assignments', completed_assignments,
        'persistent_areas', persistent_areas,
        'persistent_students', persistent_students,
        'improving_students', improving_students,
        'resolved_students', resolved_students,
        'strength_areas', strength_areas,
        'latest_evidence_at', latest_evidence_at
      ) order by persistent_students desc, subject)
      from subject_rows
    ), '[]'::jsonb),
    'classes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'class_id', class_id,
        'class_name', class_name,
        'student_count', student_count,
        'tracked_students', tracked_students,
        'assignment_average', assignment_average,
        'persistent_students', persistent_students,
        'improving_students', improving_students,
        'resolved_students', resolved_students,
        'persistent_areas', persistent_areas,
        'high_priority_areas', high_priority_areas
      ) order by persistent_students desc, class_name)
      from class_rows
    ), '[]'::jsonb),
    'priority_skills', coalesce((
      select jsonb_agg(jsonb_build_object(
        'subject', subject,
        'topic', topic,
        'skill', skill,
        'persistent_students', persistent_students,
        'recurring_students', recurring_students,
        'improving_students', improving_students,
        'first_observed_at', first_observed_at,
        'last_observed_at', last_observed_at,
        'average_latest_evidence', average_latest_evidence,
        'stale_persistent_students', stale_persistent_students
      ) order by
        persistent_students desc,
        recurring_students desc,
        subject,
        skill)
      from (
        select *
        from priority_skills
        order by persistent_students desc, recurring_students desc
        limit 30
      ) q
    ), '[]'::jsonb),
    'students_needing_support', coalesce((
      select jsonb_agg(jsonb_build_object(
        'student_id', student_id,
        'student_name', student_name,
        'class_name', class_name,
        'grade', grade,
        'persistent_count', persistent_count,
        'recurring_count', recurring_count,
        'improving_count', improving_count,
        'resolved_count', resolved_count,
        'strength_count', strength_count,
        'latest_evidence_at', latest_evidence_at,
        'earliest_persistent_at', earliest_persistent_at,
        'focus_subjects', to_jsonb(coalesce(
          focus_subjects, array[]::text[]
        ))
      ) order by persistent_count desc, recurring_count desc, student_name)
      from (
        select *
        from student_support
        where persistent_count > 0 or recurring_count > 0
        order by persistent_count desc, recurring_count desc
        limit 50
      ) q
    ), '[]'::jsonb),
    'school_strengths', coalesce((
      select jsonb_agg(jsonb_build_object(
        'subject', subject,
        'topic', topic,
        'skill', skill,
        'students', students
      ) order by students desc, subject, skill)
      from (
        select *
        from strength_skills
        order by students desc
        limit 20
      ) q
    ), '[]'::jsonb),
    'generated_at', now()
  )
  into v_result;

  return v_result;
end;
$$;
revoke all on function public.school_head_get_learning_intelligence(
  uuid, integer
) from public, anon, authenticated;
grant execute on function public.school_head_get_learning_intelligence(
  uuid, integer
) to authenticated, service_role;

comment on function public.school_head_get_learning_intelligence(
  uuid, integer
) is
  'School Head learning intelligence aggregates verified assignment totals and authority-qualified observations only; automated Writing Hub analysis and targeted practice are excluded.';


-- Immutable academic reports are official student/family/school records. Only
-- authority-qualified observations may affect their evidence counts, learning
-- projections, source hashes, or source snapshots.
create or replace function public.rpc_generate_academic_report_snapshot(
  p_report_type text,
  p_academic_year_id uuid,
  p_academic_term_id uuid default null,
  p_student_id uuid default null,
  p_class_id uuid default null,
  p_grade_level text default null,
  p_academic_subject_id uuid default null,
  p_audience text default 'teacher',
  p_evidence_cutoff_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_year public.school_academic_years%rowtype;
  v_term public.school_academic_terms%rowtype;
  v_period_start date;
  v_period_end date;
  v_cutoff timestamptz;
  v_scope_key text;
  v_subjects jsonb := '[]'::jsonb;
  v_interventions jsonb := '[]'::jsonb;
  v_summary jsonb := '{}'::jsonb;
  v_source_hash text;
  v_payload jsonb;
  v_payload_hash text;
  v_existing public.academic_report_snapshots%rowtype;
  v_previous_id uuid;
  v_version integer;
  v_report_id uuid;
  v_reporter_role text;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if p_report_type not in ('student','class','grade','subject','school') then
    raise exception 'Invalid academic report type';
  end if;
  if p_audience not in ('student','family','teacher','school_head','internal') then
    raise exception 'Invalid report audience';
  end if;
  if p_audience in ('student','family') and p_report_type <> 'student' then
    raise exception 'Student and family reports must be scoped to one student';
  end if;
  select * into v_year from public.school_academic_years y where y.id = p_academic_year_id;
  if not found then raise exception 'Academic year not found'; end if;
  if p_academic_term_id is not null then
    select * into v_term from public.school_academic_terms t
    where t.id = p_academic_term_id and t.academic_year_id = v_year.id
      and t.school_id = v_year.school_id;
    if not found then raise exception 'Academic term does not belong to the selected year'; end if;
  end if;
  if (p_report_type = 'student') <> (p_student_id is not null)
    or (p_report_type = 'class') <> (p_class_id is not null)
    or (p_report_type = 'grade') <> (nullif(trim(coalesce(p_grade_level, '')), '') is not null)
    or (p_report_type = 'subject' and p_academic_subject_id is null) then
    raise exception 'Report target does not match report type';
  end if;
  if p_report_type in ('subject','school') and (p_student_id is not null or p_class_id is not null or p_grade_level is not null) then
    raise exception 'School and subject reports cannot include a student, class, or grade target';
  end if;
  if p_report_type = 'student' and not exists (
    select 1 from public.users u where u.id = p_student_id and u.school_id = v_year.school_id
  ) then raise exception 'Student is outside the selected school'; end if;
  if p_report_type = 'class' and not exists (
    select 1 from public.classes c where c.id = p_class_id and c.school_id = v_year.school_id
  ) then raise exception 'Class is outside the selected school'; end if;
  if not public.academic_reporting_can_generate(
    v_year.school_id, p_report_type, p_student_id, p_class_id, p_academic_subject_id
  ) then raise exception 'Not authorised to generate this academic report'; end if;

  if public.is_school_owner(v_year.school_id) then v_reporter_role := 'school_head';
  elsif exists (select 1 from public.school_members sm where sm.school_id = v_year.school_id
    and sm.user_id = v_caller and sm.status = 'active' and sm.role_in_school = 'school_admin')
    then v_reporter_role := 'school_admin';
  else v_reporter_role := 'teacher'; end if;
  if v_reporter_role = 'teacher' and p_audience in ('school_head','internal') then
    raise exception 'Teacher reports must use teacher, student, or family audience';
  end if;

  v_period_start := coalesce(v_term.starts_on, v_year.starts_on);
  v_period_end := coalesce(v_term.ends_on, v_year.ends_on);
  v_cutoff := coalesce(p_evidence_cutoff_at,
    least((v_period_end + 1)::timestamptz, transaction_timestamp()));
  if v_cutoff < v_period_start::timestamptz
    or v_cutoff > least((v_period_end + 1)::timestamptz, transaction_timestamp()) then
    raise exception 'Evidence cutoff must be inside the reporting period and not in the future';
  end if;
  v_scope_key := concat_ws(':', p_report_type, p_academic_year_id,
    coalesce(p_academic_term_id::text, 'annual'),
    coalesce(p_student_id::text, '-'), coalesce(p_class_id::text, '-'),
    coalesce(nullif(trim(p_grade_level), ''), '-'),
    coalesce(p_academic_subject_id::text, 'all'));
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('academic-report:' || v_year.school_id::text || ':' || v_scope_key || ':' || p_audience, 0)
  );

  with scope_students as materialized (
    select s.student_id from private.academic_report_scope_students(
      v_year.school_id, v_year.id, v_period_start, v_period_end,
      p_report_type, p_student_id, p_class_id, nullif(trim(p_grade_level), '')
    ) s
  ), scoped_observations as materialized (
    select o.*, true as is_qualified
    from public.student_learning_observations o
    join scope_students ss on ss.student_id = o.student_id
    where o.school_id = v_year.school_id and o.academic_year_id = v_year.id
      and o.observed_at >= v_period_start::timestamptz and o.observed_at < v_cutoff
      and (p_academic_term_id is null or o.academic_term_id = p_academic_term_id)
      and (p_academic_subject_id is null or o.academic_subject_id = p_academic_subject_id)
      and public.student_learning_can_manage_intervention(o.student_id, o.subject)
      and public.student_learning_observation_is_qualified(
        o.source_type, o.contributes_to_focus_state, o.evidence
      )
  ), scope_subjects as materialized (
    select distinct x.academic_subject_id
    from (
      select o.academic_subject_id from scoped_observations o where o.academic_subject_id is not null
      union
      select m.academic_subject_id
      from public.school_curriculum_scope_mappings m
      where m.school_id = v_year.school_id and m.academic_year_id = v_year.id
        and m.status in ('active','planned')
        and (p_academic_subject_id is null or m.academic_subject_id = p_academic_subject_id)
        and (v_reporter_role <> 'teacher' or exists (
          select 1
          from public.academic_subjects mapped_subject
          join scope_students mapped_student on true
          where mapped_subject.id = m.academic_subject_id
            and public.student_learning_can_manage_intervention(
              mapped_student.student_id, mapped_subject.name
            )
        ))
        and (p_report_type not in ('student','class','grade') or exists (
          select 1 from public.student_academic_enrolments e join scope_students ss on ss.student_id = e.student_id
          where e.academic_year_id = v_year.id and e.grade_level = m.grade_level
        ))
      union
      select p_academic_subject_id where p_academic_subject_id is not null
    ) x where x.academic_subject_id is not null
  ), subject_rows as (
    select ss.academic_subject_id, s.code, s.name,
      count(distinct o.student_id)::integer as students_with_evidence,
      count(o.id)::integer as observation_count,
      count(o.id) filter (where o.is_qualified)::integer as qualifying_count,
      coalesce(sum(o.evidence_count) filter (where o.is_qualified), 0)::integer as evidence_items,
      round(avg(o.evidence_percentage) filter (where o.is_qualified and o.evidence_percentage is not null), 2) as attainment_average,
      count(o.id) filter (where o.observation_type = 'focus' and o.is_qualified)::integer as focus_evidence,
      count(o.id) filter (where o.observation_type = 'developing' and o.is_qualified)::integer as developing_evidence,
      count(o.id) filter (where o.observation_type = 'strength' and o.is_qualified)::integer as strength_evidence,
      min(o.observed_at) as first_evidence_at, max(o.observed_at) as latest_evidence_at
    from scope_subjects ss
    join public.academic_subjects s on s.id = ss.academic_subject_id
    left join scoped_observations o on o.academic_subject_id = ss.academic_subject_id
    group by ss.academic_subject_id, s.code, s.name
  ), eligible_states as materialized (
    select f.*
    from public.student_learning_focus_states f
    join scope_students x on x.student_id = f.student_id
    where f.academic_year_id = v_year.id
      and f.last_observed_at < v_cutoff
      and exists (
        select 1 from scoped_observations o
        where o.student_id = f.student_id and o.skill_key = f.skill_key
      )
      and not exists (
        select 1 from public.student_learning_observations later
        where later.student_id = f.student_id and later.skill_key = f.skill_key
          and later.academic_year_id = v_year.id and later.observed_at >= v_cutoff
          and public.student_learning_observation_is_qualified(
            later.source_type,
            later.contributes_to_focus_state,
            later.evidence
          )
      )
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'academicSubjectId', q.academic_subject_id, 'code', q.code, 'subject', q.name,
    'studentsWithEvidence', q.students_with_evidence,
    'observationCount', q.observation_count,
    'qualifyingObservations', q.qualifying_count,
    'evidenceItems', q.evidence_items,
    'attainmentAverage', q.attainment_average,
    'expectedStandard', null,
    'expectationStatus', 'not_configured',
    'evidenceStatus', case when q.observation_count = 0 then 'not_assessed'
      when q.qualifying_count = 0 then 'low_data' else 'assessed' end,
    'focusEvidence', q.focus_evidence, 'developingEvidence', q.developing_evidence,
    'strengthEvidence', q.strength_evidence,
    'firstEvidenceAt', q.first_evidence_at, 'latestEvidenceAt', q.latest_evidence_at,
    'progressStates', jsonb_build_object(
      'newFocus', (select count(*) from eligible_states f where f.academic_subject_id = q.academic_subject_id and f.current_status = 'new_focus'),
      'recurring', (select count(*) from eligible_states f where f.academic_subject_id = q.academic_subject_id and f.current_status = 'recurring'),
      'persistent', (select count(*) from eligible_states f where f.academic_subject_id = q.academic_subject_id and f.current_status = 'persistent'),
      'improving', (select count(*) from eligible_states f where f.academic_subject_id = q.academic_subject_id and f.current_status = 'improving'),
      'resolved', (select count(*) from eligible_states f where f.academic_subject_id = q.academic_subject_id and f.current_status = 'resolved'),
      'emergingStrength', (select count(*) from eligible_states f where f.academic_subject_id = q.academic_subject_id and f.current_status = 'emerging_strength'),
      'consistentStrength', (select count(*) from eligible_states f where f.academic_subject_id = q.academic_subject_id and f.current_status = 'consistent_strength')
    ),
    'confidence', coalesce((select jsonb_build_object(
      'averageScore', round(avg(c.confidence_score), 2),
      'high', count(*) filter (where c.confidence_band = 'high'),
      'medium', count(*) filter (where c.confidence_band = 'medium'),
      'low', count(*) filter (where c.confidence_band = 'low'),
      'notAssessed', count(*) filter (where c.assessment_state = 'not_assessed'),
      'lowData', count(*) filter (where c.assessment_state = 'low_data'),
      'stale', count(*) filter (where c.assessment_state = 'stale'),
      'contradictory', count(*) filter (where c.assessment_state = 'contradictory'),
      'policyIds', coalesce(jsonb_agg(distinct c.policy_id), '[]'::jsonb),
      'asOf', max(c.as_of_at)
    ) from public.student_learning_confidence_states c join scope_students x on x.student_id = c.student_id
      where c.academic_year_id = v_year.id and c.academic_subject_id = q.academic_subject_id
        and c.as_of_at <= v_cutoff
        and exists (select 1 from scoped_observations o
          where o.student_id = c.student_id and o.skill_key = c.skill_key)
        and not exists (select 1 from public.student_learning_observations later
          where later.student_id = c.student_id and later.skill_key = c.skill_key
            and later.academic_year_id = v_year.id and later.observed_at >= v_cutoff
          and public.student_learning_observation_is_qualified(
            later.source_type,
            later.contributes_to_focus_state,
            later.evidence
          ))), jsonb_build_object(
          'averageScore', null, 'high', 0, 'medium', 0, 'low', 0,
          'notAssessed', 0, 'lowData', 0, 'stale', 0, 'contradictory', 0,
          'policyIds', '[]'::jsonb, 'asOf', null
    )),
    'coverage', coalesce((select jsonb_build_object(
      'students', count(*),
      'averageQualifiedPercent', round(avg(c.qualified_coverage_percent), 2),
      'unassessedObjectives', coalesce(sum(c.unassessed_objectives), 0),
      'lowDataObjectives', coalesce(sum(c.low_data_objectives), 0),
      'readiness', jsonb_build_object(
        'curriculumNotConfigured', count(*) filter (where c.reporting_readiness = 'curriculum_not_configured'),
        'noEvidence', count(*) filter (where c.reporting_readiness = 'no_evidence'),
        'lowCoverage', count(*) filter (where c.reporting_readiness = 'low_coverage'),
        'partialCoverage', count(*) filter (where c.reporting_readiness = 'partial_coverage'),
        'broadCoverage', count(*) filter (where c.reporting_readiness = 'broad_coverage')
      ), 'scope', 'academic_year_to_cutoff', 'asOf', max(c.as_of_at)
    ) from public.student_curriculum_coverage_states c join scope_students x on x.student_id = c.student_id
      where c.academic_year_id = v_year.id
        and c.academic_subject_id = q.academic_subject_id
        and c.as_of_at <= v_cutoff
        and exists (
          select 1
          from public.student_learning_observations coverage_observation
          where coverage_observation.school_id = v_year.school_id
            and coverage_observation.student_id = c.student_id
            and coverage_observation.academic_year_id = v_year.id
            and coverage_observation.academic_subject_id = c.academic_subject_id
            and coverage_observation.observed_at >= v_period_start::timestamptz
            and coverage_observation.observed_at < v_cutoff
            and (
              p_academic_term_id is null
              or coverage_observation.academic_term_id = p_academic_term_id
            )
            and public.student_learning_can_manage_intervention(
              coverage_observation.student_id, coverage_observation.subject
            )
            and public.student_learning_observation_is_qualified(
              coverage_observation.source_type,
              coverage_observation.contributes_to_focus_state,
              coverage_observation.evidence
            )
        )), jsonb_build_object(
          'students', 0, 'averageQualifiedPercent', null,
          'unassessedObjectives', 0, 'lowDataObjectives', 0,
          'readiness', jsonb_build_object('curriculumNotConfigured', 0, 'noEvidence', 0,
            'lowCoverage', 0, 'partialCoverage', 0, 'broadCoverage', 0),
          'scope', 'academic_year_to_cutoff', 'asOf', null
    )),
    'historicalProjectionUnavailable', (select count(distinct (o.student_id, o.skill_key))
      from scoped_observations o where o.academic_subject_id = q.academic_subject_id
        and exists (select 1 from public.student_learning_observations later
          where later.student_id = o.student_id and later.skill_key = o.skill_key
            and later.academic_year_id = v_year.id and later.observed_at >= v_cutoff
          and public.student_learning_observation_is_qualified(
            later.source_type,
            later.contributes_to_focus_state,
            later.evidence
          ))
    )
  ) order by q.name, q.academic_subject_id), '[]'::jsonb)
  into v_subjects from subject_rows q;

  with scope_students as materialized (
    select s.student_id from private.academic_report_scope_students(
      v_year.school_id, v_year.id, v_period_start, v_period_end,
      p_report_type, p_student_id, p_class_id, nullif(trim(p_grade_level), '')
    ) s
  ), scoped_observations as materialized (
    select o.*, true as is_qualified
    from public.student_learning_observations o join scope_students ss on ss.student_id = o.student_id
    where o.school_id = v_year.school_id and o.academic_year_id = v_year.id
      and o.observed_at >= v_period_start::timestamptz and o.observed_at < v_cutoff
      and (p_academic_term_id is null or o.academic_term_id = p_academic_term_id)
      and (p_academic_subject_id is null or o.academic_subject_id = p_academic_subject_id)
      and public.student_learning_can_manage_intervention(o.student_id, o.subject)
      and public.student_learning_observation_is_qualified(
        o.source_type, o.contributes_to_focus_state, o.evidence
      )
  )
  select jsonb_build_object(
    'studentsInScope', (select count(*) from scope_students),
    'studentsWithEvidence', count(distinct o.student_id),
    'studentsWithoutEvidence', greatest((select count(*) from scope_students) - count(distinct o.student_id), 0),
    'subjectsInReport', jsonb_array_length(v_subjects),
    'observationCount', count(o.id),
    'qualifyingObservations', count(o.id) filter (where o.is_qualified),
    'evidenceItems', coalesce(sum(o.evidence_count) filter (where o.is_qualified), 0),
    'attainmentAverage', round(avg(o.evidence_percentage) filter (
      where o.is_qualified and o.evidence_percentage is not null
    ), 2),
    'sourceTypes', jsonb_build_object(
      'assignment', count(*) filter (where o.source_type = 'assignment_result'),
      'writing', count(*) filter (where o.source_type = 'writing_assessment_review'),
      'teacher', count(*) filter (where o.source_type = 'teacher_observation'),
      'import', count(*) filter (where o.source_type = 'import'),
      'cambridge', count(*) filter (where o.source_type = 'cambridge_attempt')
    )
  ) into v_summary from scoped_observations o;

  with scope_students as materialized (
    select s.student_id from private.academic_report_scope_students(
      v_year.school_id, v_year.id, v_period_start, v_period_end,
      p_report_type, p_student_id, p_class_id, nullif(trim(p_grade_level), '')
    ) s
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', i.id, 'studentId', i.student_id, 'subject', i.subject,
    'skill', i.skill, 'interventionType', i.intervention_type,
    'status', i.status, 'approvalStatus', i.approval_status,
    'targetStatus', i.target_status, 'createdAt', i.created_at,
    'targetDate', i.target_date, 'completedAt', i.completed_at,
    'outcomeStatus', i.outcome_status, 'systemOutcomeStatus', i.system_outcome_status,
    'baselineSnapshotHash', i.baseline_snapshot_hash,
    'qualifyingFollowUp', i.follow_up_qualifying_observations,
    'successfulFollowUp', i.follow_up_successful_observations
  ) order by i.created_at, i.id), '[]'::jsonb)
  into v_interventions
  from public.student_learning_interventions i join scope_students ss on ss.student_id = i.student_id
  where i.school_id = v_year.school_id and i.academic_year_id = v_year.id
    and i.created_at < v_cutoff
    and coalesce(i.completed_at, i.cancelled_at, v_cutoff) >= v_period_start::timestamptz
    and (p_academic_subject_id is null or i.academic_subject_id = p_academic_subject_id)
    and public.student_learning_can_manage_intervention(i.student_id, i.subject);

  with scope_students as materialized (
    select s.student_id from private.academic_report_scope_students(
      v_year.school_id, v_year.id, v_period_start, v_period_end,
      p_report_type, p_student_id, p_class_id, nullif(trim(p_grade_level), '')
    ) s
  ), source_rows as (
    select 'observation:' || o.id::text || ':' || o.observed_at::text || ':' || o.created_at::text
      || ':' || o.observation_type || ':' || o.source_type || ':' || o.source_key
      || ':' || o.evidence_count::text || ':' || coalesce(o.evidence_percentage::text, '')
      || ':' || o.evidence_quality || ':' || o.contributes_to_focus_state::text as fingerprint
    from public.student_learning_observations o join scope_students ss on ss.student_id = o.student_id
    where o.school_id = v_year.school_id and o.academic_year_id = v_year.id
      and o.observed_at >= v_period_start::timestamptz and o.observed_at < v_cutoff
      and (p_academic_term_id is null or o.academic_term_id = p_academic_term_id)
      and (p_academic_subject_id is null or o.academic_subject_id = p_academic_subject_id)
      and public.student_learning_can_manage_intervention(o.student_id, o.subject)
      and public.student_learning_observation_is_qualified(
        o.source_type, o.contributes_to_focus_state, o.evidence
      )
    union all
    select 'confidence:' || c.id::text || ':' || c.as_of_at::text || ':' || c.computed_at::text
      || ':' || c.confidence_score::text || ':' || c.assessment_state || ':' || c.gate_results::text
    from public.student_learning_confidence_states c join scope_students ss on ss.student_id = c.student_id
    where c.academic_year_id = v_year.id and c.as_of_at <= v_cutoff
      and (p_academic_subject_id is null or c.academic_subject_id = p_academic_subject_id)
      and exists (select 1 from public.student_learning_observations o
        where o.student_id = c.student_id and o.skill_key = c.skill_key
          and o.academic_year_id = v_year.id
          and o.observed_at >= v_period_start::timestamptz and o.observed_at < v_cutoff
          and (p_academic_term_id is null or o.academic_term_id = p_academic_term_id)
          and o.school_id = v_year.school_id
          and o.academic_subject_id is not distinct from c.academic_subject_id
          and public.student_learning_can_manage_intervention(
            o.student_id, o.subject
          )
          and public.student_learning_observation_is_qualified(
            o.source_type, o.contributes_to_focus_state, o.evidence
          ))
      and not exists (select 1 from public.student_learning_observations later
        where later.student_id = c.student_id and later.skill_key = c.skill_key
          and later.academic_year_id = v_year.id and later.observed_at >= v_cutoff
          and public.student_learning_observation_is_qualified(
            later.source_type,
            later.contributes_to_focus_state,
            later.evidence
          ))
    union all
    select 'coverage:' || c.id::text || ':' || c.as_of_at::text || ':' || c.computed_at::text
      || ':' || c.reporting_readiness || ':' || c.qualified_coverage_percent::text
    from public.student_curriculum_coverage_states c join scope_students ss on ss.student_id = c.student_id
    where c.academic_year_id = v_year.id and c.as_of_at <= v_cutoff
      and (p_academic_subject_id is null or c.academic_subject_id = p_academic_subject_id)
      and exists (
        select 1
        from public.student_learning_observations coverage_observation
        where coverage_observation.school_id = v_year.school_id
          and coverage_observation.student_id = c.student_id
          and coverage_observation.academic_year_id = v_year.id
          and coverage_observation.academic_subject_id = c.academic_subject_id
          and coverage_observation.observed_at >= v_period_start::timestamptz
          and coverage_observation.observed_at < v_cutoff
          and (
            p_academic_term_id is null
            or coverage_observation.academic_term_id = p_academic_term_id
          )
          and public.student_learning_can_manage_intervention(
            coverage_observation.student_id, coverage_observation.subject
          )
          and public.student_learning_observation_is_qualified(
            coverage_observation.source_type,
            coverage_observation.contributes_to_focus_state,
            coverage_observation.evidence
          )
      )
    union all
    select 'intervention:' || i.id::text || ':' || i.updated_at::text || ':' || i.status
      || ':' || i.approval_status || ':' || coalesce(i.outcome_status, '')
      || ':' || coalesce(i.system_outcome_status, '') || ':' || i.baseline_snapshot_hash
    from public.student_learning_interventions i join scope_students ss on ss.student_id = i.student_id
    where i.school_id = v_year.school_id and i.academic_year_id = v_year.id and i.created_at < v_cutoff
      and (p_academic_subject_id is null or i.academic_subject_id = p_academic_subject_id)
      and public.student_learning_can_manage_intervention(i.student_id, i.subject)
  )
  select encode(extensions.digest(convert_to(
    v_scope_key || ':' || p_audience || ':' || coalesce(string_agg(fingerprint, ',' order by fingerprint), ''),
    'UTF8'), 'sha256'), 'hex') into v_source_hash from source_rows;

  v_payload := jsonb_build_object(
    'schemaVersion', 'academic-report-v1',
    'reportType', p_report_type, 'audience', p_audience,
    'reportingPeriod', jsonb_build_object(
      'kind', case when p_academic_term_id is null then 'annual' else 'term' end,
      'academicYearId', v_year.id, 'academicYearName', v_year.name,
      'academicTermId', v_term.id, 'academicTermName', v_term.name,
      'startsOn', v_period_start, 'endsOn', v_period_end, 'evidenceCutoffAt', v_cutoff
    ),
    'scope', jsonb_build_object(
      'schoolId', v_year.school_id, 'studentId', p_student_id,
      'classId', p_class_id, 'gradeLevel', nullif(trim(p_grade_level), ''),
      'academicSubjectId', p_academic_subject_id
    ),
    'summary', v_summary, 'subjects', v_subjects, 'interventions', v_interventions,
    'disclosures', jsonb_build_object(
      'confidenceIsNotAttainment', true,
      'coverageIsNotMastery', true,
      'coverageScope', 'academic_year_to_cutoff',
      'unassessedObjectivesAreNotWeaknesses', true,
      'missingWorkIsNotZero', true,
      'expectedStandardNotInferredWhenUnconfigured', true,
      'historicalProjectionWithheldAfterLaterEvidence', true,
      'activityVolumeIsNotAnInterventionOutcome', true,
      'privateTeacherNotesExcluded', true,
      'rawEvidenceJsonExcluded', true,
      'sourceObservationsMutated', false,
      'focusStatesMutated', false,
      'reportAutomaticallyFinalized', false
    )
  );
  v_payload_hash := encode(extensions.digest(convert_to(v_payload::text, 'UTF8'), 'sha256'), 'hex');

  select * into v_existing from public.academic_report_snapshots r
  where r.school_id = v_year.school_id and r.scope_key = v_scope_key
    and r.audience = p_audience and r.source_snapshot_hash = v_source_hash
    and r.payload_hash = v_payload_hash
  order by r.report_version desc limit 1;
  if found then
    insert into public.academic_report_events(report_id, actor_user_id, event_type, event_data)
    values (v_existing.id, v_caller, 'reused', jsonb_build_object('payloadHash', v_existing.payload_hash));
    return jsonb_build_object(
      'success', true, 'reportId', v_existing.id, 'status', v_existing.status,
      'version', v_existing.report_version, 'payloadHash', v_existing.payload_hash,
      'sourceSnapshotHash', v_existing.source_snapshot_hash, 'reused', true,
      'reportAutomaticallyFinalized', false
    );
  end if;

  select r.id, r.report_version into v_previous_id, v_version
  from public.academic_report_snapshots r
  where r.school_id = v_year.school_id and r.scope_key = v_scope_key and r.audience = p_audience
  order by r.report_version desc limit 1;
  v_version := coalesce(v_version, 0) + 1;
  insert into public.academic_report_snapshots(
    school_id, report_type, audience, status, report_version, supersedes_report_id,
    academic_year_id, academic_term_id, student_id, class_id, grade_level,
    academic_subject_id, scope_key, period_start, period_end, evidence_cutoff_at,
    source_snapshot_hash, payload_hash, report_payload, generated_by
  ) values (
    v_year.school_id, p_report_type, p_audience, 'draft', v_version, v_previous_id,
    v_year.id, p_academic_term_id, p_student_id, p_class_id,
    nullif(trim(p_grade_level), ''), p_academic_subject_id, v_scope_key,
    v_period_start, v_period_end, v_cutoff, v_source_hash, v_payload_hash,
    v_payload, v_caller
  ) returning id into v_report_id;

  with scope_students as materialized (
    select s.student_id from private.academic_report_scope_students(
      v_year.school_id, v_year.id, v_period_start, v_period_end,
      p_report_type, p_student_id, p_class_id, nullif(trim(p_grade_level), '')
    ) s
  )
  insert into public.academic_report_source_snapshots(
    report_id, source_type, source_id, source_snapshot_hash
  )
  select v_report_id, src.source_type, src.source_id,
    encode(extensions.digest(convert_to(src.snapshot::text, 'UTF8'), 'sha256'), 'hex')
  from (
    select 'observation'::text as source_type, o.id as source_id,
      jsonb_build_object('id', o.id, 'observedAt', o.observed_at, 'createdAt', o.created_at,
        'observationType', o.observation_type, 'sourceType', o.source_type,
        'sourceKey', o.source_key, 'evidenceCount', o.evidence_count,
        'evidencePercentage', o.evidence_percentage, 'evidenceQuality', o.evidence_quality,
        'contributes', o.contributes_to_focus_state, 'academicYearId', o.academic_year_id,
        'academicTermId', o.academic_term_id, 'academicSubjectId', o.academic_subject_id) as snapshot
    from public.student_learning_observations o join scope_students ss on ss.student_id = o.student_id
    where o.school_id = v_year.school_id and o.academic_year_id = v_year.id
      and o.observed_at >= v_period_start::timestamptz and o.observed_at < v_cutoff
      and (p_academic_term_id is null or o.academic_term_id = p_academic_term_id)
      and (p_academic_subject_id is null or o.academic_subject_id = p_academic_subject_id)
      and public.student_learning_can_manage_intervention(o.student_id, o.subject)
      and public.student_learning_observation_is_qualified(
        o.source_type, o.contributes_to_focus_state, o.evidence
      )
    union all
    select 'confidence_projection', c.id,
      jsonb_build_object('id', c.id, 'policyId', c.policy_id, 'asOf', c.as_of_at,
        'computedAt', c.computed_at, 'confidenceScore', c.confidence_score,
        'confidenceBand', c.confidence_band, 'assessmentState', c.assessment_state,
        'gateResults', c.gate_results)
    from public.student_learning_confidence_states c join scope_students ss on ss.student_id = c.student_id
    where c.academic_year_id = v_year.id and c.as_of_at <= v_cutoff
      and (p_academic_subject_id is null or c.academic_subject_id = p_academic_subject_id)
      and exists (select 1 from public.student_learning_observations o
        where o.student_id = c.student_id and o.skill_key = c.skill_key
          and o.academic_year_id = v_year.id
          and o.observed_at >= v_period_start::timestamptz and o.observed_at < v_cutoff
          and (p_academic_term_id is null or o.academic_term_id = p_academic_term_id)
          and o.school_id = v_year.school_id
          and o.academic_subject_id is not distinct from c.academic_subject_id
          and public.student_learning_can_manage_intervention(
            o.student_id, o.subject
          )
          and public.student_learning_observation_is_qualified(
            o.source_type, o.contributes_to_focus_state, o.evidence
          ))
      and not exists (select 1 from public.student_learning_observations later
        where later.student_id = c.student_id and later.skill_key = c.skill_key
          and later.academic_year_id = v_year.id and later.observed_at >= v_cutoff
          and public.student_learning_observation_is_qualified(
            later.source_type,
            later.contributes_to_focus_state,
            later.evidence
          ))
    union all
    select 'coverage_projection', c.id,
      jsonb_build_object('id', c.id, 'asOf', c.as_of_at, 'computedAt', c.computed_at,
        'readiness', c.reporting_readiness, 'qualifiedCoverage', c.qualified_coverage_percent,
        'unassessedObjectives', c.unassessed_objectives, 'disclosure', c.disclosure)
    from public.student_curriculum_coverage_states c join scope_students ss on ss.student_id = c.student_id
    where c.academic_year_id = v_year.id and c.as_of_at <= v_cutoff
      and (p_academic_subject_id is null or c.academic_subject_id = p_academic_subject_id)
      and exists (
        select 1
        from public.student_learning_observations coverage_observation
        where coverage_observation.school_id = v_year.school_id
          and coverage_observation.student_id = c.student_id
          and coverage_observation.academic_year_id = v_year.id
          and coverage_observation.academic_subject_id = c.academic_subject_id
          and coverage_observation.observed_at >= v_period_start::timestamptz
          and coverage_observation.observed_at < v_cutoff
          and (
            p_academic_term_id is null
            or coverage_observation.academic_term_id = p_academic_term_id
          )
          and public.student_learning_can_manage_intervention(
            coverage_observation.student_id, coverage_observation.subject
          )
          and public.student_learning_observation_is_qualified(
            coverage_observation.source_type,
            coverage_observation.contributes_to_focus_state,
            coverage_observation.evidence
          )
      )
    union all
    select 'intervention', i.id,
      jsonb_build_object('id', i.id, 'updatedAt', i.updated_at, 'status', i.status,
        'approvalStatus', i.approval_status, 'outcomeStatus', i.outcome_status,
        'systemOutcomeStatus', i.system_outcome_status,
        'baselineSnapshotHash', i.baseline_snapshot_hash)
    from public.student_learning_interventions i join scope_students ss on ss.student_id = i.student_id
    where i.school_id = v_year.school_id and i.academic_year_id = v_year.id and i.created_at < v_cutoff
      and (p_academic_subject_id is null or i.academic_subject_id = p_academic_subject_id)
      and public.student_learning_can_manage_intervention(i.student_id, i.subject)
  ) src;
  insert into public.academic_report_events(report_id, actor_user_id, event_type, event_data)
  values (v_report_id, v_caller, 'generated', jsonb_build_object(
    'version', v_version, 'payloadHash', v_payload_hash, 'sourceSnapshotHash', v_source_hash
  ));
  return jsonb_build_object(
    'success', true, 'reportId', v_report_id, 'status', 'draft',
    'version', v_version, 'payloadHash', v_payload_hash,
    'sourceSnapshotHash', v_source_hash, 'reused', false,
    'reportAutomaticallyFinalized', false
  );
end;
$$;
revoke all on function public.rpc_generate_academic_report_snapshot(
  text,uuid,uuid,uuid,uuid,text,uuid,text,timestamptz
) from public, anon;
grant execute on function public.rpc_generate_academic_report_snapshot(
  text,uuid,uuid,uuid,uuid,text,uuid,text,timestamptz
) to authenticated, service_role;

comment on function public.rpc_generate_academic_report_snapshot(
  text, uuid, uuid, uuid, uuid, text, uuid, text, timestamptz
) is
  'Generates immutable draft academic reports from authority-qualified observations only; automated Writing Hub analysis is excluded until a final teacher review.';
