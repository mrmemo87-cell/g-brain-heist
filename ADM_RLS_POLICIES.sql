-- ============================================================
-- ADMISSION HUB — Phase 2: RLS Policies
-- ============================================================
-- Run AFTER ADM_SCHEMA_MIGRATION.sql
-- Strategy:
--   school_admin → full CRUD on own school's data
--   teacher → SELECT on own school's data
--   candidates → no direct DB access (use RPCs with SECURITY DEFINER)
--   superadmin → full access via existing superadmin patterns
-- ============================================================

-- Helper: check if current user is school_admin for a given school_id
-- (Reuses existing school_members table)

-- ============================================================
-- adm_question_pools
-- ============================================================
DROP POLICY IF EXISTS "adm_qpool_school_admin_all" ON adm_question_pools;
DROP POLICY IF EXISTS "adm_qpool_teacher_select" ON adm_question_pools;
DROP POLICY IF EXISTS "adm_qpool_global_select" ON adm_question_pools;

-- School admins can manage their school's pools
CREATE POLICY "adm_qpool_school_admin_all"
    ON adm_question_pools FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM school_members sm
            WHERE sm.school_id = adm_question_pools.school_id
              AND sm.user_id = auth.uid()
              AND sm.role_in_school = 'school_admin'
              AND sm.status = 'active'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM school_members sm
            WHERE sm.school_id = adm_question_pools.school_id
              AND sm.user_id = auth.uid()
              AND sm.role_in_school = 'school_admin'
              AND sm.status = 'active'
        )
    );

-- Teachers can view their school's pools
CREATE POLICY "adm_qpool_teacher_select"
    ON adm_question_pools FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM school_members sm
            WHERE sm.school_id = adm_question_pools.school_id
              AND sm.user_id = auth.uid()
              AND sm.role_in_school IN ('teacher', 'school_admin')
              AND sm.status = 'active'
        )
    );

-- Anyone authenticated can see global (platform) pools
CREATE POLICY "adm_qpool_global_select"
    ON adm_question_pools FOR SELECT
    USING (school_id IS NULL AND is_active = true);

-- ============================================================
-- adm_questions
-- ============================================================
DROP POLICY IF EXISTS "adm_q_school_admin_all" ON adm_questions;
DROP POLICY IF EXISTS "adm_q_teacher_select" ON adm_questions;
DROP POLICY IF EXISTS "adm_q_global_select" ON adm_questions;

-- School admins: full access to questions in their school's pools
CREATE POLICY "adm_q_school_admin_all"
    ON adm_questions FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM adm_question_pools qp
            JOIN school_members sm ON sm.school_id = qp.school_id
            WHERE qp.id = adm_questions.pool_id
              AND sm.user_id = auth.uid()
              AND sm.role_in_school = 'school_admin'
              AND sm.status = 'active'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM adm_question_pools qp
            JOIN school_members sm ON sm.school_id = qp.school_id
            WHERE qp.id = adm_questions.pool_id
              AND sm.user_id = auth.uid()
              AND sm.role_in_school = 'school_admin'
              AND sm.status = 'active'
        )
    );

-- Teachers: read published questions in their school's pools
CREATE POLICY "adm_q_teacher_select"
    ON adm_questions FOR SELECT
    USING (
        status = 'published' AND
        EXISTS (
            SELECT 1 FROM adm_question_pools qp
            JOIN school_members sm ON sm.school_id = qp.school_id
            WHERE qp.id = adm_questions.pool_id
              AND sm.user_id = auth.uid()
              AND sm.role_in_school IN ('teacher', 'school_admin')
              AND sm.status = 'active'
        )
    );

-- Global pool: published questions visible to authenticated users
CREATE POLICY "adm_q_global_select"
    ON adm_questions FOR SELECT
    USING (
        status = 'published' AND
        EXISTS (
            SELECT 1 FROM adm_question_pools qp
            WHERE qp.id = adm_questions.pool_id
              AND qp.school_id IS NULL
              AND qp.is_active = true
        )
    );

-- ============================================================
-- adm_school_grade_stage_map
-- ============================================================
DROP POLICY IF EXISTS "adm_gsmap_school_admin_all" ON adm_school_grade_stage_map;
DROP POLICY IF EXISTS "adm_gsmap_teacher_select" ON adm_school_grade_stage_map;

CREATE POLICY "adm_gsmap_school_admin_all"
    ON adm_school_grade_stage_map FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM school_members sm
            WHERE sm.school_id = adm_school_grade_stage_map.school_id
              AND sm.user_id = auth.uid()
              AND sm.role_in_school = 'school_admin'
              AND sm.status = 'active'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM school_members sm
            WHERE sm.school_id = adm_school_grade_stage_map.school_id
              AND sm.user_id = auth.uid()
              AND sm.role_in_school = 'school_admin'
              AND sm.status = 'active'
        )
    );

CREATE POLICY "adm_gsmap_teacher_select"
    ON adm_school_grade_stage_map FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM school_members sm
            WHERE sm.school_id = adm_school_grade_stage_map.school_id
              AND sm.user_id = auth.uid()
              AND sm.role_in_school IN ('teacher', 'school_admin')
              AND sm.status = 'active'
        )
    );

-- ============================================================
-- adm_blueprints
-- ============================================================
DROP POLICY IF EXISTS "adm_bp_school_admin_all" ON adm_blueprints;
DROP POLICY IF EXISTS "adm_bp_teacher_select" ON adm_blueprints;

CREATE POLICY "adm_bp_school_admin_all"
    ON adm_blueprints FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM school_members sm
            WHERE sm.school_id = adm_blueprints.school_id
              AND sm.user_id = auth.uid()
              AND sm.role_in_school = 'school_admin'
              AND sm.status = 'active'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM school_members sm
            WHERE sm.school_id = adm_blueprints.school_id
              AND sm.user_id = auth.uid()
              AND sm.role_in_school = 'school_admin'
              AND sm.status = 'active'
        )
    );

CREATE POLICY "adm_bp_teacher_select"
    ON adm_blueprints FOR SELECT
    USING (
        is_active = true AND
        EXISTS (
            SELECT 1 FROM school_members sm
            WHERE sm.school_id = adm_blueprints.school_id
              AND sm.user_id = auth.uid()
              AND sm.role_in_school IN ('teacher', 'school_admin')
              AND sm.status = 'active'
        )
    );

-- ============================================================
-- adm_test_forms
-- ============================================================
DROP POLICY IF EXISTS "adm_form_school_admin_all" ON adm_test_forms;
DROP POLICY IF EXISTS "adm_form_teacher_select" ON adm_test_forms;

CREATE POLICY "adm_form_school_admin_all"
    ON adm_test_forms FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM school_members sm
            WHERE sm.school_id = adm_test_forms.school_id
              AND sm.user_id = auth.uid()
              AND sm.role_in_school = 'school_admin'
              AND sm.status = 'active'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM school_members sm
            WHERE sm.school_id = adm_test_forms.school_id
              AND sm.user_id = auth.uid()
              AND sm.role_in_school = 'school_admin'
              AND sm.status = 'active'
        )
    );

CREATE POLICY "adm_form_teacher_select"
    ON adm_test_forms FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM school_members sm
            WHERE sm.school_id = adm_test_forms.school_id
              AND sm.user_id = auth.uid()
              AND sm.role_in_school IN ('teacher', 'school_admin')
              AND sm.status = 'active'
        )
    );

-- ============================================================
-- adm_test_form_questions
-- ============================================================
DROP POLICY IF EXISTS "adm_fq_school_admin_all" ON adm_test_form_questions;
DROP POLICY IF EXISTS "adm_fq_teacher_select" ON adm_test_form_questions;

CREATE POLICY "adm_fq_school_admin_all"
    ON adm_test_form_questions FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM adm_test_forms tf
            JOIN school_members sm ON sm.school_id = tf.school_id
            WHERE tf.id = adm_test_form_questions.form_id
              AND sm.user_id = auth.uid()
              AND sm.role_in_school = 'school_admin'
              AND sm.status = 'active'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM adm_test_forms tf
            JOIN school_members sm ON sm.school_id = tf.school_id
            WHERE tf.id = adm_test_form_questions.form_id
              AND sm.user_id = auth.uid()
              AND sm.role_in_school = 'school_admin'
              AND sm.status = 'active'
        )
    );

CREATE POLICY "adm_fq_teacher_select"
    ON adm_test_form_questions FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM adm_test_forms tf
            JOIN school_members sm ON sm.school_id = tf.school_id
            WHERE tf.id = adm_test_form_questions.form_id
              AND sm.user_id = auth.uid()
              AND sm.role_in_school IN ('teacher', 'school_admin')
              AND sm.status = 'active'
        )
    );

-- ============================================================
-- adm_candidates
-- ============================================================
DROP POLICY IF EXISTS "adm_cand_school_admin_all" ON adm_candidates;
DROP POLICY IF EXISTS "adm_cand_teacher_select" ON adm_candidates;

CREATE POLICY "adm_cand_school_admin_all"
    ON adm_candidates FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM school_members sm
            WHERE sm.school_id = adm_candidates.school_id
              AND sm.user_id = auth.uid()
              AND sm.role_in_school = 'school_admin'
              AND sm.status = 'active'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM school_members sm
            WHERE sm.school_id = adm_candidates.school_id
              AND sm.user_id = auth.uid()
              AND sm.role_in_school = 'school_admin'
              AND sm.status = 'active'
        )
    );

CREATE POLICY "adm_cand_teacher_select"
    ON adm_candidates FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM school_members sm
            WHERE sm.school_id = adm_candidates.school_id
              AND sm.user_id = auth.uid()
              AND sm.role_in_school IN ('teacher', 'school_admin')
              AND sm.status = 'active'
        )
    );

-- ============================================================
-- adm_attempts  (candidates access via SECURITY DEFINER RPCs only)
-- ============================================================
DROP POLICY IF EXISTS "adm_att_school_admin_all" ON adm_attempts;
DROP POLICY IF EXISTS "adm_att_teacher_select" ON adm_attempts;

CREATE POLICY "adm_att_school_admin_all"
    ON adm_attempts FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM school_members sm
            WHERE sm.school_id = adm_attempts.school_id
              AND sm.user_id = auth.uid()
              AND sm.role_in_school = 'school_admin'
              AND sm.status = 'active'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM school_members sm
            WHERE sm.school_id = adm_attempts.school_id
              AND sm.user_id = auth.uid()
              AND sm.role_in_school = 'school_admin'
              AND sm.status = 'active'
        )
    );

CREATE POLICY "adm_att_teacher_select"
    ON adm_attempts FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM school_members sm
            WHERE sm.school_id = adm_attempts.school_id
              AND sm.user_id = auth.uid()
              AND sm.role_in_school IN ('teacher', 'school_admin')
              AND sm.status = 'active'
        )
    );

-- ============================================================
-- adm_answers
-- ============================================================
DROP POLICY IF EXISTS "adm_ans_school_admin_select" ON adm_answers;
DROP POLICY IF EXISTS "adm_ans_teacher_select" ON adm_answers;

CREATE POLICY "adm_ans_school_admin_select"
    ON adm_answers FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM adm_attempts att
            JOIN school_members sm ON sm.school_id = att.school_id
            WHERE att.id = adm_answers.attempt_id
              AND sm.user_id = auth.uid()
              AND sm.role_in_school = 'school_admin'
              AND sm.status = 'active'
        )
    );

CREATE POLICY "adm_ans_teacher_select"
    ON adm_answers FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM adm_attempts att
            JOIN school_members sm ON sm.school_id = att.school_id
            WHERE att.id = adm_answers.attempt_id
              AND sm.user_id = auth.uid()
              AND sm.role_in_school IN ('teacher', 'school_admin')
              AND sm.status = 'active'
        )
    );

-- ============================================================
-- adm_placement_results
-- ============================================================
DROP POLICY IF EXISTS "adm_place_school_admin_all" ON adm_placement_results;
DROP POLICY IF EXISTS "adm_place_teacher_select" ON adm_placement_results;

CREATE POLICY "adm_place_school_admin_all"
    ON adm_placement_results FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM school_members sm
            WHERE sm.school_id = adm_placement_results.school_id
              AND sm.user_id = auth.uid()
              AND sm.role_in_school = 'school_admin'
              AND sm.status = 'active'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM school_members sm
            WHERE sm.school_id = adm_placement_results.school_id
              AND sm.user_id = auth.uid()
              AND sm.role_in_school = 'school_admin'
              AND sm.status = 'active'
        )
    );

CREATE POLICY "adm_place_teacher_select"
    ON adm_placement_results FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM school_members sm
            WHERE sm.school_id = adm_placement_results.school_id
              AND sm.user_id = auth.uid()
              AND sm.role_in_school IN ('teacher', 'school_admin')
              AND sm.status = 'active'
        )
    );

-- ============================================================
-- adm_import_staging
-- ============================================================
DROP POLICY IF EXISTS "adm_import_school_admin_all" ON adm_import_staging;

CREATE POLICY "adm_import_school_admin_all"
    ON adm_import_staging FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM school_members sm
            WHERE sm.school_id = adm_import_staging.school_id
              AND sm.user_id = auth.uid()
              AND sm.role_in_school = 'school_admin'
              AND sm.status = 'active'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM school_members sm
            WHERE sm.school_id = adm_import_staging.school_id
              AND sm.user_id = auth.uid()
              AND sm.role_in_school = 'school_admin'
              AND sm.status = 'active'
        )
    );

-- ============================================================
-- adm_audit_log (read-only for school admins)
-- ============================================================
DROP POLICY IF EXISTS "adm_audit_school_admin_select" ON adm_audit_log;

CREATE POLICY "adm_audit_school_admin_select"
    ON adm_audit_log FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM school_members sm
            WHERE sm.school_id = adm_audit_log.school_id
              AND sm.user_id = auth.uid()
              AND sm.role_in_school = 'school_admin'
              AND sm.status = 'active'
        )
    );

-- ============================================================
-- SUPERADMIN: full access to all admission tables
-- (uses existing superadmins table)
-- ============================================================
DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOREACH tbl IN ARRAY ARRAY[
        'adm_question_pools', 'adm_questions', 'adm_school_grade_stage_map',
        'adm_blueprints', 'adm_test_forms', 'adm_test_form_questions',
        'adm_candidates', 'adm_attempts', 'adm_answers',
        'adm_placement_results', 'adm_import_staging', 'adm_audit_log'
    ] LOOP
        EXECUTE format(
            'DROP POLICY IF EXISTS "adm_superadmin_%s" ON %I',
            tbl, tbl
        );
        EXECUTE format(
            'CREATE POLICY "adm_superadmin_%s" ON %I FOR ALL
             USING (EXISTS (SELECT 1 FROM superadmins WHERE user_id = auth.uid()))
             WITH CHECK (EXISTS (SELECT 1 FROM superadmins WHERE user_id = auth.uid()))',
            tbl, tbl
        );
    END LOOP;
END;
$$;
