-- Brains Heist | investor traction evidence | READ ONLY
-- Run using an authorized internal Supabase SQL Editor session.
-- No writes, functions, views, materializations, personal identifiers or public grants.
-- All weeks are Monday-start ISO weeks in UTC.

-- 1. Last 28 days: online activity (paper separately), teacher authors,
-- repeat-week users, quest activity and onboarding.
WITH eligible_students AS (
  SELECT id FROM public.users
  WHERE role = 'student'
    AND lower(coalesce(username,'')) !~ '^(test|demo|qa|sample|seed|fake|sandbox)([0-9]|[_ .-]|$)'
), eligible_teachers AS (
  SELECT id FROM public.users
  WHERE role = 'teacher'
    AND lower(coalesce(username,'')) !~ '^(test|demo|qa|sample|seed|fake|sandbox)([0-9]|[_ .-]|$)'
), good_schools AS (
  SELECT id FROM public.schools WHERE name !~* '(test|demo|sample|sandbox)'
), online AS (
  SELECT r.student_id, r.completed_at, a.school_id
  FROM public.student_assignment_results r
  JOIN public.assignments a ON a.id = r.assignment_id
  JOIN good_schools g ON g.id = a.school_id
  JOIN eligible_students e ON e.id = r.student_id
  WHERE r.completion_source = 'online' AND r.completed_at IS NOT NULL
), paper AS (
  SELECT r.student_id, r.completed_at
  FROM public.student_assignment_results r
  JOIN public.assignments a ON a.id = r.assignment_id
  JOIN good_schools g ON g.id = a.school_id
  JOIN eligible_students e ON e.id = r.student_id
  WHERE r.completion_source = 'paper' AND r.completed_at IS NOT NULL
), teacher_created AS (
  SELECT t.user_id, a.created_at
  FROM public.assignments a
  JOIN public.teachers t ON t.id = a.teacher_id
  JOIN eligible_teachers e ON e.id = t.user_id
  JOIN good_schools g ON g.id = a.school_id
), quest_completed AS (
  SELECT q.user_id, q.completed_at
  FROM public.quest_runs q
  JOIN eligible_students e ON e.id = q.user_id
  WHERE q.status = 'completed' AND q.completed_at IS NOT NULL
), recent_student_weeks AS (
  SELECT student_id, count(distinct date_trunc('week', completed_at AT TIME ZONE 'UTC')::date) week_count
  FROM online
  WHERE completed_at >= now() - interval '28 days'
  GROUP BY student_id
)
SELECT
  (now() AT TIME ZONE 'UTC')::date AS as_of_utc,
  (SELECT count(distinct student_id) FROM online WHERE completed_at >= now() - interval '28 days') AS online_students_28d,
  (SELECT count(*) FROM online WHERE completed_at >= now() - interval '28 days') AS online_completions_28d,
  (SELECT count(*) FROM paper WHERE completed_at >= now() - interval '28 days') AS paper_imported_completions_28d,
  (SELECT count(*) FROM recent_student_weeks WHERE week_count >= 2) AS online_students_2plus_weeks_28d,
  (SELECT count(*) FROM recent_student_weeks WHERE week_count >= 3) AS online_students_3plus_weeks_28d,
  (SELECT count(*) FROM teacher_created WHERE created_at >= now() - interval '28 days') AS assignments_created_28d,
  (SELECT count(distinct user_id) FROM teacher_created WHERE created_at >= now() - interval '28 days') AS assignment_creating_teachers_28d,
  (SELECT count(distinct school_id) FROM online WHERE completed_at >= now() - interval '28 days') AS online_active_schools_28d,
  (SELECT count(*) FROM quest_completed WHERE completed_at >= now() - interval '28 days') AS completed_quests_28d,
  (SELECT count(distinct user_id) FROM quest_completed WHERE completed_at >= now() - interval '28 days') AS quest_players_28d,
  (SELECT count(*) FROM public.user_onboarding WHERE first_value_completed_at IS NOT NULL) AS onboarding_first_value_alltime;

-- 2. Weekly online student activity and teacher-generated assignments.
WITH eligible_students AS (
  SELECT id FROM public.users WHERE role='student'
    AND lower(coalesce(username,'')) !~ '^(test|demo|qa|sample|seed|fake|sandbox)([0-9]|[_ .-]|$)'
), eligible_teachers AS (
  SELECT id FROM public.users WHERE role='teacher'
    AND lower(coalesce(username,'')) !~ '^(test|demo|qa|sample|seed|fake|sandbox)([0-9]|[_ .-]|$)'
), online AS (
  SELECT r.student_id, date_trunc('week',r.completed_at AT TIME ZONE 'UTC')::date wk
  FROM public.student_assignment_results r
  JOIN public.assignments a ON a.id=r.assignment_id
  JOIN public.schools s ON s.id=a.school_id AND s.name !~* '(test|demo|sample|sandbox)'
  JOIN eligible_students e ON e.id=r.student_id
  WHERE r.completion_source='online' AND r.completed_at IS NOT NULL
), teachers AS (
  SELECT t.user_id,date_trunc('week',a.created_at AT TIME ZONE 'UTC')::date wk
  FROM public.assignments a JOIN public.teachers t ON t.id=a.teacher_id
  JOIN eligible_teachers e ON e.id=t.user_id
  JOIN public.schools s ON s.id=a.school_id AND s.name !~* '(test|demo|sample|sandbox)'
), weeks AS (
  SELECT generate_series(
    date_trunc('week',(now() AT TIME ZONE 'UTC'))::date - interval '11 weeks',
    date_trunc('week',(now() AT TIME ZONE 'UTC'))::date,
    interval '1 week'
  )::date wk
)
SELECT w.wk,
 (SELECT count(*) FROM online o WHERE o.wk=w.wk) online_completions,
 (SELECT count(distinct o.student_id) FROM online o WHERE o.wk=w.wk) online_students,
 (SELECT count(*) FROM teachers t WHERE t.wk=w.wk) assignments_created,
 (SELECT count(distinct t.user_id) FROM teachers t WHERE t.wk=w.wk) creating_teachers,
 (SELECT count(distinct curr.student_id) FROM online curr WHERE curr.wk=w.wk
   AND EXISTS(SELECT 1 FROM online prev WHERE prev.student_id=curr.student_id AND prev.wk=w.wk-7)
 ) returning_from_prior_week,
 (w.wk=date_trunc('week',(now() AT TIME ZONE 'UTC'))::date) as is_partial_week
FROM weeks w ORDER BY w.wk;

-- 3. First-online-completion cohorts. Mature only after the ENTIRE W1/W4 target week ends.
WITH eligible_students AS (
  SELECT id FROM public.users WHERE role='student'
    AND lower(coalesce(username,'')) !~ '^(test|demo|qa|sample|seed|fake|sandbox)([0-9]|[_ .-]|$)'
), activity AS (
  SELECT r.student_id, date_trunc('week',r.completed_at AT TIME ZONE 'UTC')::date wk
  FROM public.student_assignment_results r
  JOIN public.assignments a ON a.id=r.assignment_id
  JOIN public.schools s ON s.id=a.school_id AND s.name !~* '(test|demo|sample|sandbox)'
  JOIN eligible_students e ON e.id=r.student_id
  WHERE r.completion_source='online' AND r.completed_at IS NOT NULL
  GROUP BY r.student_id,date_trunc('week',r.completed_at AT TIME ZONE 'UTC')::date
), first_week AS (
  SELECT student_id,min(wk) cohort_week FROM activity GROUP BY student_id
), cohorts AS (
  SELECT f.cohort_week,
    count(*) cohort_size,
    count(*) FILTER (WHERE EXISTS(SELECT 1 FROM activity a WHERE a.student_id=f.student_id AND a.wk=f.cohort_week+7)) returned_w1,
    count(*) FILTER (WHERE EXISTS(SELECT 1 FROM activity a WHERE a.student_id=f.student_id AND a.wk=f.cohort_week+28)) returned_w4
  FROM first_week f GROUP BY f.cohort_week
)
SELECT c.*,
  c.cohort_week <= date_trunc('week',(now() AT TIME ZONE 'UTC'))::date-14 AS w1_mature,
  CASE WHEN c.cohort_week <= date_trunc('week',(now() AT TIME ZONE 'UTC'))::date-14
    THEN round(100.0*c.returned_w1/nullif(c.cohort_size,0),1) END AS w1_pct_mature_only,
  c.cohort_week <= date_trunc('week',(now() AT TIME ZONE 'UTC'))::date-35 AS w4_mature,
  CASE WHEN c.cohort_week <= date_trunc('week',(now() AT TIME ZONE 'UTC'))::date-35
    THEN round(100.0*c.returned_w4/nullif(c.cohort_size,0),1) END AS w4_pct_mature_only
FROM cohorts c ORDER BY c.cohort_week;

-- 4. Provenance / potential flags, counts only. Review exclusions with pilot operator.
SELECT
  (SELECT count(*) FROM public.users WHERE role IN ('student','teacher')
   AND lower(coalesce(username,'')) ~ '^(test|demo|qa|sample|seed|fake|sandbox)([0-9]|[_ .-]|$)') AS flagged_student_teacher_accounts,
  (SELECT count(*) FROM public.schools WHERE name ~* '(test|demo|sample|sandbox)') AS flagged_school_records,
  (SELECT count(*) FROM public.school_billing_payment_attempts WHERE status='paid') AS paid_status_records_needing_receipt_validation,
  (SELECT count(*) FROM public.student_learning_interventions) AS intervention_records_alltime;
