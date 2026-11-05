-- Read-only snapshot of production classroom indexes/helpers, 2026-10-07.
-- No production rows, credentials or external integrations.
CREATE OR REPLACE FUNCTION private.normalize_assignment_answer(p_value text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE STRICT
 SET search_path TO ''
AS $function$
 select lower(regexp_replace(regexp_replace(trim(translate(translate(p_value,'₀₁₂₃₄₅₆₇₈₉','0123456789'),'“”‘’–—','""''---')),'[.!?,;:]+$','','g'),'\s+',' ','g'))
$function$
;
CREATE OR REPLACE FUNCTION private.teacher_assignment_subject_key(p_subject text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case lower(regexp_replace(trim(coalesce(p_subject, '')), '\s+', ' ', 'g'))
    when 'math' then 'mathematics'
    when 'maths' then 'mathematics'
    when 'mathematics' then 'mathematics'
    when 'english language' then 'english'
    else lower(regexp_replace(trim(coalesce(p_subject, '')), '\s+', ' ', 'g'))
  end;
$function$
;
CREATE INDEX IF NOT EXISTS assignment_questions_owner_school_snapshot_idx ON public.assignment_questions USING btree (owner_school_id_snapshot, question_id) WHERE (owner_school_id_snapshot IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS assignment_questions_pkey ON public.assignment_questions USING btree (assignment_id, question_id);
CREATE INDEX IF NOT EXISTS idx_assignment_questions_assignment ON public.assignment_questions USING btree (assignment_id);
CREATE INDEX IF NOT EXISTS assignments_academic_context_idx ON public.assignments USING btree (school_id, academic_year_id, academic_term_id, academic_subject_id);
CREATE INDEX IF NOT EXISTS assignments_category_idx ON public.assignments USING btree (school_id, assignment_category, assigned_at DESC) WHERE (assignment_category IS NOT NULL);
CREATE INDEX IF NOT EXISTS assignments_class_idx ON public.assignments USING btree (class_id);
CREATE UNIQUE INDEX IF NOT EXISTS assignments_pkey ON public.assignments USING btree (id);
CREATE INDEX IF NOT EXISTS assignments_reporting_scope_idx ON public.assignments USING btree (school_id, academic_year_id, academic_term_id, class_id, assigned_at DESC);
CREATE INDEX IF NOT EXISTS assignments_school_group_idx ON public.assignments USING btree (school_id, subject_group_id, assigned_at DESC);
CREATE INDEX IF NOT EXISTS assignments_school_idx ON public.assignments USING btree (school_id);
CREATE INDEX IF NOT EXISTS assignments_school_subject_idx ON public.assignments USING btree (school_id, school_subject_id, assigned_at DESC) WHERE (school_subject_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS assignments_subject_group_idx ON public.assignments USING btree (subject_group_id);
CREATE UNIQUE INDEX IF NOT EXISTS class_students_one_current_class_per_student_idx ON public.class_students USING btree (student_id);
CREATE UNIQUE INDEX IF NOT EXISTS class_students_pkey ON public.class_students USING btree (class_id, student_id);
CREATE UNIQUE INDEX IF NOT EXISTS class_students_unique ON public.class_students USING btree (class_id, student_id);
CREATE INDEX IF NOT EXISTS idx_class_students_student_id ON public.class_students USING btree (student_id);
CREATE UNIQUE INDEX IF NOT EXISTS class_teacher_assignments_pkey ON public.class_teacher_assignments USING btree (id);
CREATE INDEX IF NOT EXISTS class_teacher_assignments_school_subject_idx ON public.class_teacher_assignments USING btree (school_id, school_subject_id, active, class_id) WHERE (school_subject_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS cta_class_idx ON public.class_teacher_assignments USING btree (class_id);
CREATE INDEX IF NOT EXISTS cta_school_idx ON public.class_teacher_assignments USING btree (school_id);
CREATE INDEX IF NOT EXISTS cta_teacher_idx ON public.class_teacher_assignments USING btree (teacher_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS cta_unique_class_teacher_subject ON public.class_teacher_assignments USING btree (class_id, teacher_user_id, subject);
CREATE UNIQUE INDEX IF NOT EXISTS classes_pkey ON public.classes USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS classes_school_classcode_uniq ON public.classes USING btree (school_id, class_code);
CREATE INDEX IF NOT EXISTS classes_school_idx ON public.classes USING btree (school_id);
CREATE INDEX IF NOT EXISTS idx_classes_teacher_id ON public.classes USING btree (teacher_id);
CREATE INDEX IF NOT EXISTS school_academic_years_dates_idx ON public.school_academic_years USING btree (school_id, starts_on, ends_on);
CREATE UNIQUE INDEX IF NOT EXISTS school_academic_years_id_school_id_key ON public.school_academic_years USING btree (id, school_id);
CREATE UNIQUE INDEX IF NOT EXISTS school_academic_years_one_current_uidx ON public.school_academic_years USING btree (school_id) WHERE (status = 'current'::text);
CREATE UNIQUE INDEX IF NOT EXISTS school_academic_years_pkey ON public.school_academic_years USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS school_academic_years_school_id_name_key ON public.school_academic_years USING btree (school_id, name);
CREATE INDEX IF NOT EXISTS idx_school_members_role ON public.school_members USING btree (role_in_school);
CREATE INDEX IF NOT EXISTS idx_school_members_school ON public.school_members USING btree (school_id);
CREATE INDEX IF NOT EXISTS idx_school_members_user ON public.school_members USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_school_members_user_active_joined ON public.school_members USING btree (user_id, joined_at, school_id, id) WHERE (status = 'active'::text);
CREATE UNIQUE INDEX IF NOT EXISTS school_members_one_active_per_user_idx ON public.school_members USING btree (user_id) WHERE (status = 'active'::text);
CREATE UNIQUE INDEX IF NOT EXISTS school_members_one_owner_per_school_idx ON public.school_members USING btree (school_id) WHERE is_owner;
CREATE UNIQUE INDEX IF NOT EXISTS school_members_pkey ON public.school_members USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS school_members_school_id_user_id_key ON public.school_members USING btree (school_id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_school_members_one_active_per_user ON public.school_members USING btree (user_id) WHERE (status = 'active'::text);
CREATE UNIQUE INDEX IF NOT EXISTS school_subject_group_teachers_group_id_teacher_user_id_key ON public.school_subject_group_teachers USING btree (group_id, teacher_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS school_subject_group_teachers_pkey ON public.school_subject_group_teachers USING btree (id);
CREATE INDEX IF NOT EXISTS subject_group_teachers_creator_idx ON public.school_subject_group_teachers USING btree (created_by);
CREATE INDEX IF NOT EXISTS subject_group_teachers_school_idx ON public.school_subject_group_teachers USING btree (school_id);
CREATE INDEX IF NOT EXISTS subject_group_teachers_teacher_idx ON public.school_subject_group_teachers USING btree (teacher_user_id, active);
CREATE UNIQUE INDEX IF NOT EXISTS school_subject_groups_id_school_id_key ON public.school_subject_groups USING btree (id, school_id);
CREATE UNIQUE INDEX IF NOT EXISTS school_subject_groups_pkey ON public.school_subject_groups USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS subject_groups_active_class_uq ON public.school_subject_groups USING btree (school_subject_offering_id, registration_class_id) WHERE ((status = 'active'::text) AND (group_type = 'class'::text));
CREATE UNIQUE INDEX IF NOT EXISTS subject_groups_active_grade_uq ON public.school_subject_groups USING btree (school_subject_offering_id) WHERE ((status = 'active'::text) AND (group_type = 'whole_grade'::text));
CREATE UNIQUE INDEX IF NOT EXISTS subject_groups_active_name_uq ON public.school_subject_groups USING btree (school_subject_offering_id, lower(TRIM(BOTH FROM name))) WHERE (status = 'active'::text);
CREATE INDEX IF NOT EXISTS subject_groups_class_idx ON public.school_subject_groups USING btree (registration_class_id);
CREATE INDEX IF NOT EXISTS subject_groups_creator_idx ON public.school_subject_groups USING btree (created_by);
CREATE INDEX IF NOT EXISTS subject_groups_offering_idx ON public.school_subject_groups USING btree (school_subject_offering_id);
CREATE INDEX IF NOT EXISTS subject_groups_school_status_idx ON public.school_subject_groups USING btree (school_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS school_subject_offerings_id_school_uq ON public.school_subject_offerings USING btree (id, school_id);
CREATE UNIQUE INDEX IF NOT EXISTS school_subject_offerings_pkey ON public.school_subject_offerings USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS school_subject_offerings_school_subject_id_academic_year_id_key ON public.school_subject_offerings USING btree (school_subject_id, academic_year_id, grade_level);
CREATE INDEX IF NOT EXISTS school_subject_offerings_school_year_grade_idx ON public.school_subject_offerings USING btree (school_id, academic_year_id, grade_level, status);
CREATE INDEX IF NOT EXISTS school_subject_offerings_subject_idx ON public.school_subject_offerings USING btree (school_subject_id, academic_year_id, status);
CREATE INDEX IF NOT EXISTS idx_student_answers_assignment ON public.student_assignment_answers USING btree (assignment_id);
CREATE INDEX IF NOT EXISTS idx_student_answers_question ON public.student_assignment_answers USING btree (question_id);
CREATE INDEX IF NOT EXISTS idx_student_answers_student ON public.student_assignment_answers USING btree (student_id);
CREATE UNIQUE INDEX IF NOT EXISTS student_assignment_answers_assignment_id_student_id_questio_key ON public.student_assignment_answers USING btree (assignment_id, student_id, question_id);
CREATE INDEX IF NOT EXISTS student_assignment_answers_assignment_question_idx ON public.student_assignment_answers USING btree (assignment_id, question_id);
CREATE INDEX IF NOT EXISTS student_assignment_answers_exposure_lookup ON public.student_assignment_answers USING btree (student_id, question_id, answered_at);
CREATE INDEX IF NOT EXISTS student_assignment_answers_pending_review_idx ON public.student_assignment_answers USING btree (student_id, assignment_id, answered_at) WHERE (grading_status = ANY (ARRAY['under_review'::text, 'reviewing'::text]));
CREATE UNIQUE INDEX IF NOT EXISTS student_assignment_answers_pkey ON public.student_assignment_answers USING btree (id);
CREATE INDEX IF NOT EXISTS idx_student_assignment_results_accuracy ON public.student_assignment_results USING btree (accuracy);
CREATE INDEX IF NOT EXISTS idx_student_assignment_results_assignment ON public.student_assignment_results USING btree (assignment_id);
CREATE INDEX IF NOT EXISTS idx_student_assignment_results_student ON public.student_assignment_results USING btree (student_id);
CREATE INDEX IF NOT EXISTS idx_student_results_assignment ON public.student_assignment_results USING btree (assignment_id);
CREATE UNIQUE INDEX IF NOT EXISTS student_assignment_results_pkey ON public.student_assignment_results USING btree (assignment_id, student_id);
CREATE INDEX IF NOT EXISTS idx_student_assignments_status ON public.student_assignments USING btree (status);
CREATE INDEX IF NOT EXISTS idx_student_assignments_student ON public.student_assignments USING btree (student_id);
CREATE INDEX IF NOT EXISTS student_assignments_assignment_student_idx ON public.student_assignments USING btree (assignment_id, student_id);
CREATE UNIQUE INDEX IF NOT EXISTS student_assignments_pkey ON public.student_assignments USING btree (id);
CREATE INDEX IF NOT EXISTS idx_teachers_user_id ON public.teachers USING btree (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS teachers_pkey ON public.teachers USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS teachers_user_id_key ON public.teachers USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_users_active_cosmetic_effect ON public.users USING btree (active_cosmetic_effect) WHERE (active_cosmetic_effect IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_users_active_cosmetic_frame ON public.users USING btree (active_cosmetic_frame) WHERE (active_cosmetic_frame IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_users_active_cosmetic_theme ON public.users USING btree (active_cosmetic_theme) WHERE (active_cosmetic_theme IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_users_banned_until ON public.users USING btree (banned_until) WHERE (banned_until IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_users_batch ON public.users USING btree (batch);
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users USING btree (email);
CREATE INDEX IF NOT EXISTS idx_users_grade ON public.users USING btree (grade);
CREATE INDEX IF NOT EXISTS idx_users_is_admin ON public.users USING btree (is_admin);
CREATE INDEX IF NOT EXISTS idx_users_last_seen ON public.users USING btree (last_seen);
CREATE INDEX IF NOT EXISTS idx_users_needs_setup ON public.users USING btree (needs_setup) WHERE (needs_setup = true);
CREATE INDEX IF NOT EXISTS idx_users_pvp_score ON public.users USING btree (pvp_score DESC);
CREATE INDEX IF NOT EXISTS idx_users_school ON public.users USING btree (school_id);
CREATE INDEX IF NOT EXISTS idx_users_username ON public.users USING btree (username);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON public.users USING btree (email);
CREATE UNIQUE INDEX IF NOT EXISTS users_pkey ON public.users USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS users_username_key ON public.users USING btree (username);

