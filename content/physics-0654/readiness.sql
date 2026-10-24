-- Read-only deployment and allocation checks. No personal student data returned.
select 'physics_offerings' as check_name, jsonb_agg(to_jsonb(s)) result
from (
  select o.grade_level, o.status, count(*) offering_count
  from public.school_subject_offerings o
  join public.school_subjects ss on ss.id=o.school_subject_id
  join public.academic_subjects a on a.id=ss.academic_subject_id
  where a.code='physics'
  group by o.grade_level,o.status
) s
union all
select 'release',jsonb_agg(to_jsonb(r))
from public.registry_verified_question_import_releases r
where package_id='bh-physics-0654-2025-2027-v1'
union all
select 'question_state',jsonb_agg(to_jsonb(s)) from (
  select q.is_active,q.verification_status,q.analytics_eligible,q.eligible_grade_levels,
    count(*) question_count,
    count(*) filter(where q.current_content_hash=q.verified_content_hash and exists(
      select 1 from public.verified_question_registry_taxonomy t
      where t.question_id=q.id and t.question_content_hash=q.current_content_hash
      and t.review_status='approved' and not t.human_review_required)) current_mapped_count
  from public.questions q where verified_external_id like 'bh-physics-0654-2025-2027-%'
  group by q.is_active,q.verification_status,q.analytics_eligible,q.eligible_grade_levels
) s;

-- The named-user pilot must produce these through NORMAL assignment submission.
-- A service-role count is a ledger check, not proof of teacher/student UI access.
select count(*) registry_evidence_rows,
       count(*) filter(where e.is_independent_assessment) independently_assessed_rows
from public.student_learning_registry_item_evidence e
join public.questions q on q.id=e.question_id
where q.verified_external_id like 'bh-physics-0654-2025-2027-%';
