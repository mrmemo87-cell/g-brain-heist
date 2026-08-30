-- RETIRED: do not infer or recreate school membership from academic-year enrolment rows.
--
-- school_members is the authoritative school-membership boundary. A student may have
-- historical or prepared rollover enrolments after a school administrator removes them,
-- so rebuilding membership from student_academic_enrolments can resurrect deleted users.
--
-- The production data change from the original version of this migration was rolled back
-- operationally. Keep this migration as an explicit no-op so fresh environments cannot
-- repeat that repair strategy.
select 1;
