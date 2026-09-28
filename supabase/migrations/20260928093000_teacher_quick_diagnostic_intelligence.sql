-- Teacher-facing diagnostic intelligence for governed Evidence Focus reporting.
-- Uses immutable assignment-question taxonomy snapshots and completed submissions only.

create or replace function public.rpc_teacher_assignment_diagnostic_intelligence(
  p_assignment_id uuid,
  p_teacher_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_teacher_user_id uuid;
  v_assignment public.assignments;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  select t.user_id
    into v_teacher_user_id
  from public.teachers t
  where t.id = p_teacher_id;

  if v_teacher_user_id is null or v_teacher_user_id is distinct from v_actor then
    raise exception using errcode = '42501', message = 'NOT_AUTHORIZED';
  end if;

  select a.*
    into v_assignment
  from public.assignments a
  where a.id = p_assignment_id
    and a.teacher_id = p_teacher_id;

  if not found then
    raise exception using errcode = '42501', message = 'NOT_AUTHORIZED';
  end if;

  return (
    with focus_questions as (
      select
        aq.question_id,
        aq.order_index,
        dt.evidence_focus_code,
        dt.evidence_focus_name,
        dt.atomic_subskill_code as skill_key,
        dt.atomic_subskill_name as subskill_name,
        dt.primary_skill_code,
        dt.primary_skill_name
      from public.assignment_questions aq
      join public.verified_question_diagnostic_taxonomy dt
        on dt.id = aq.diagnostic_taxonomy_id
       and dt.taxonomy_hash = aq.diagnostic_taxonomy_hash
       and dt.question_content_hash = aq.question_content_hash
      where aq.assignment_id = p_assignment_id
        and aq.analytics_eligible_snapshot
        and aq.verification_status_snapshot = 'verified'
        and aq.pool_scope_snapshot in ('global', 'school')
        and dt.review_status = 'approved'
        and not dt.human_review_required
        and nullif(trim(dt.evidence_focus_code), '') is not null
        and nullif(trim(dt.evidence_focus_name), '') is not null
    ),
    focus_catalog as (
      select
        evidence_focus_code,
        max(evidence_focus_name) as evidence_focus_name,
        max(skill_key) as skill_key,
        max(subskill_name) as subskill_name,
        max(primary_skill_code) as primary_skill_code,
        max(primary_skill_name) as primary_skill_name,
        min(order_index) as first_order_index,
        count(distinct question_id)::integer as question_count
      from focus_questions
      group by evidence_focus_code
    ),
    completed_answers as (
      select
        saa.student_id,
        saa.question_id,
        saa.is_correct,
        saa.time_taken_ms
      from public.student_assignment_answers saa
      join public.student_assignment_results sr
        on sr.assignment_id = saa.assignment_id
       and sr.student_id = saa.student_id
      where saa.assignment_id = p_assignment_id
        and saa.is_correct is not null
    ),
    class_focus as (
      select
        fc.evidence_focus_code,
        fc.evidence_focus_name,
        fc.skill_key,
        fc.subskill_name,
        fc.primary_skill_code,
        fc.primary_skill_name,
        fc.first_order_index,
        fc.question_count,
        count(ca.question_id)::integer as attempts,
        count(ca.question_id) filter (where ca.is_correct)::integer as correct_count,
        count(ca.question_id) filter (where not ca.is_correct)::integer as incorrect_count,
        count(distinct ca.student_id)::integer as students_answered,
        case
          when count(ca.question_id) > 0
          then round((count(ca.question_id) filter (where ca.is_correct))::numeric * 100 / count(ca.question_id))::integer
          else null
        end as accuracy_percent,
        case
          when count(ca.question_id) > 0
          then round(avg(coalesce(ca.time_taken_ms, 0)) / 1000.0, 1)
          else null
        end as avg_time_seconds
      from focus_catalog fc
      left join focus_questions fq
        on fq.evidence_focus_code = fc.evidence_focus_code
      left join completed_answers ca
        on ca.question_id = fq.question_id
      group by
        fc.evidence_focus_code, fc.evidence_focus_name, fc.skill_key, fc.subskill_name,
        fc.primary_skill_code, fc.primary_skill_name, fc.first_order_index, fc.question_count
    ),
    audience as (
      select
        sa.student_id,
        coalesce(nullif(trim(u.full_name), ''), nullif(trim(u.username), ''), 'Student')::text as student_name,
        sa.batch::text as batch,
        sr.completed_at,
        sr.accuracy as assignment_accuracy
      from public.student_assignments sa
      join public.users u on u.id = sa.student_id
      left join public.student_assignment_results sr
        on sr.assignment_id = sa.assignment_id
       and sr.student_id = sa.student_id
      where sa.assignment_id = p_assignment_id
        and not exists (
          select 1
          from public.legacy_quarantined_assignment_students q
          where q.assignment_id = sa.assignment_id
            and q.student_id = sa.student_id
        )
    ),
    student_focus as (
      select
        a.student_id,
        fc.evidence_focus_code,
        fc.evidence_focus_name,
        fc.skill_key,
        fc.subskill_name,
        fc.primary_skill_name,
        fc.first_order_index,
        fc.question_count,
        count(ca.question_id)::integer as answered_questions,
        count(ca.question_id) filter (where ca.is_correct)::integer as correct_count,
        count(ca.question_id) filter (where not ca.is_correct)::integer as incorrect_count,
        case
          when count(ca.question_id) > 0
          then round((count(ca.question_id) filter (where ca.is_correct))::numeric * 100 / count(ca.question_id))::integer
          else null
        end as accuracy_percent
      from audience a
      cross join focus_catalog fc
      left join focus_questions fq
        on fq.evidence_focus_code = fc.evidence_focus_code
      left join completed_answers ca
        on ca.student_id = a.student_id
       and ca.question_id = fq.question_id
      group by
        a.student_id, fc.evidence_focus_code, fc.evidence_focus_name, fc.skill_key,
        fc.subskill_name, fc.primary_skill_name, fc.first_order_index, fc.question_count
    ),
    student_payload as (
      select
        a.student_id,
        a.student_name,
        a.batch,
        a.completed_at,
        a.assignment_accuracy,
        count(sf.evidence_focus_code) filter (where sf.answered_questions > 0)::integer as focus_signals_answered,
        count(sf.evidence_focus_code) filter (where sf.incorrect_count > 0)::integer as needs_check_count,
        count(sf.evidence_focus_code) filter (
          where sf.answered_questions > 0 and sf.incorrect_count = 0
        )::integer as correct_signal_count,
        coalesce(
          jsonb_agg(
            jsonb_build_object(
              'evidenceFocusCode', sf.evidence_focus_code,
              'evidenceFocusName', sf.evidence_focus_name,
              'skillKey', sf.skill_key,
              'subskillName', sf.subskill_name,
              'primarySkillName', sf.primary_skill_name,
              'orderIndex', sf.first_order_index,
              'questionCount', sf.question_count,
              'answeredQuestions', sf.answered_questions,
              'correctCount', sf.correct_count,
              'incorrectCount', sf.incorrect_count,
              'accuracyPercent', sf.accuracy_percent,
              'signal',
                case
                  when a.completed_at is null then 'not_completed'
                  when sf.answered_questions = 0 then 'not_answered'
                  when sf.incorrect_count > 0 then 'needs_check'
                  else 'correct'
                end
            )
            order by sf.first_order_index, sf.evidence_focus_name
          ),
          '[]'::jsonb
        ) as focuses
      from audience a
      left join student_focus sf on sf.student_id = a.student_id
      group by a.student_id, a.student_name, a.batch, a.completed_at, a.assignment_accuracy
    )
    select jsonb_build_object(
      'success', true,
      'assignment', jsonb_build_object(
        'id', v_assignment.id,
        'title', coalesce(v_assignment.title, v_assignment.topic_name),
        'topicName', v_assignment.topic_name,
        'subjectName', v_assignment.subject_name,
        'studentCount', (select count(*) from audience),
        'completedStudents', (select count(*) from audience where completed_at is not null),
        'questionCount', (select count(*) from public.assignment_questions aq where aq.assignment_id = p_assignment_id),
        'focusQuestionCount', (select count(*) from focus_questions),
        'focusCount', (select count(*) from focus_catalog)
      ),
      'focuses', coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'evidenceFocusCode', cf.evidence_focus_code,
              'evidenceFocusName', cf.evidence_focus_name,
              'skillKey', cf.skill_key,
              'subskillName', cf.subskill_name,
              'primarySkillCode', cf.primary_skill_code,
              'primarySkillName', cf.primary_skill_name,
              'orderIndex', cf.first_order_index,
              'questionCount', cf.question_count,
              'attempts', cf.attempts,
              'correctCount', cf.correct_count,
              'incorrectCount', cf.incorrect_count,
              'studentsAnswered', cf.students_answered,
              'accuracyPercent', cf.accuracy_percent,
              'avgTimeSeconds', cf.avg_time_seconds
            )
            order by cf.first_order_index, cf.evidence_focus_name
          )
          from class_focus cf
        ),
        '[]'::jsonb
      ),
      'students', coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'studentId', sp.student_id,
              'studentName', sp.student_name,
              'batch', sp.batch,
              'completedAt', sp.completed_at,
              'assignmentAccuracy', sp.assignment_accuracy,
              'focusSignalsAnswered', sp.focus_signals_answered,
              'needsCheckCount', sp.needs_check_count,
              'correctSignalCount', sp.correct_signal_count,
              'focuses', sp.focuses
            )
            order by lower(sp.student_name), sp.student_id
          )
          from student_payload sp
        ),
        '[]'::jsonb
      ),
      'disclosure', jsonb_build_object(
        'screeningOnly', true,
        'message', 'A single diagnostic item is a screening signal, not proof of mastery. Use later independent assessed evidence to confirm improvement or mastery.'
      )
    )
  );
end;
$$;

revoke all on function public.rpc_teacher_assignment_diagnostic_intelligence(uuid, uuid)
from public, anon, authenticated, service_role;
grant execute on function public.rpc_teacher_assignment_diagnostic_intelligence(uuid, uuid)
to authenticated;

comment on function public.rpc_teacher_assignment_diagnostic_intelligence(uuid, uuid) is
  'Teacher-owned assignment diagnostic intelligence using immutable assignment question taxonomy snapshots. Class summaries use completed submissions only; one-item focus results are screening signals, not mastery decisions.';
