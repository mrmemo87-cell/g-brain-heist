-- ============================================================
-- ADMISSION HUB — Phase 1: Schema Migration
-- ============================================================
-- Run in Supabase SQL Editor
-- All tables prefixed adm_ to isolate from gameplay domain
-- Candidates are external (no Brains Heist account required)
-- Placement bands: A–E (Cambridge style)
-- ============================================================

-- ============================================================
-- 1. QUESTION POOLS
-- ============================================================
-- Logical groupings of questions by subject/stage/grade
CREATE TABLE IF NOT EXISTS adm_question_pools (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID REFERENCES schools(id) ON DELETE CASCADE,  -- NULL = global/platform pool
    subject TEXT NOT NULL CHECK (subject IN ('english', 'math')),
    stage SMALLINT CHECK (stage BETWEEN 1 AND 12),
    grade_level SMALLINT CHECK (grade_level BETWEEN 1 AND 13),
    name TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_adm_qpool_school ON adm_question_pools(school_id);
CREATE INDEX IF NOT EXISTS idx_adm_qpool_subject_stage ON adm_question_pools(subject, stage);
CREATE INDEX IF NOT EXISTS idx_adm_qpool_active ON adm_question_pools(is_active) WHERE is_active = true;

-- ============================================================
-- 2. QUESTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS adm_questions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pool_id UUID NOT NULL REFERENCES adm_question_pools(id) ON DELETE CASCADE,
    question_type TEXT NOT NULL CHECK (question_type IN (
        'mcq', 'gap_fill', 'error_correction', 'sentence_transformation',
        'word_formation', 'open_cloze', 'reading_comprehension', 'short_answer', 'structured'
    )),
    stem TEXT NOT NULL,
    stem_image_url TEXT,
    passage TEXT,                        -- for reading comprehension questions
    options JSONB,                       -- ["opt1","opt2","opt3","opt4"] for MCQ
    correct_answer JSONB NOT NULL,       -- string or array for multi-part answers
    correct_index SMALLINT,              -- for MCQ: 0-based index
    keyword TEXT,                        -- for sentence transformation
    base_word TEXT,                      -- for word formation
    marks SMALLINT NOT NULL DEFAULT 1,
    difficulty TEXT NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
    cognitive_level TEXT DEFAULT 'application' CHECK (cognitive_level IN ('knowledge', 'application', 'reasoning')),
    topic TEXT,                          -- grammar/vocab topic tag
    skill_tag TEXT CHECK (skill_tag IN ('grammar', 'vocabulary', 'reading', 'writing', 'listening', 'math_number', 'math_algebra', 'math_geometry', 'math_statistics')),
    explanation TEXT,
    language TEXT DEFAULT 'en',
    version SMALLINT DEFAULT 1,
    status TEXT DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_adm_q_pool ON adm_questions(pool_id);
CREATE INDEX IF NOT EXISTS idx_adm_q_type ON adm_questions(question_type);
CREATE INDEX IF NOT EXISTS idx_adm_q_difficulty ON adm_questions(difficulty);
CREATE INDEX IF NOT EXISTS idx_adm_q_status ON adm_questions(status) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_adm_q_topic ON adm_questions(topic);
CREATE INDEX IF NOT EXISTS idx_adm_q_pool_status ON adm_questions(pool_id, status, difficulty);

-- ============================================================
-- 3. SCHOOL GRADE ↔ STAGE MAPPING
-- ============================================================
CREATE TABLE IF NOT EXISTS adm_school_grade_stage_map (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    grade_level SMALLINT NOT NULL CHECK (grade_level BETWEEN 1 AND 13),
    cambridge_stage SMALLINT NOT NULL CHECK (cambridge_stage BETWEEN 1 AND 12),
    subject TEXT,  -- NULL = applies to all subjects for this grade
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(school_id, grade_level, subject)
);

CREATE INDEX IF NOT EXISTS idx_adm_gsmap_school ON adm_school_grade_stage_map(school_id);

-- ============================================================
-- 4. BLUEPRINTS (test templates)
-- ============================================================
CREATE TABLE IF NOT EXISTS adm_blueprints (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID REFERENCES schools(id) ON DELETE CASCADE,  -- NULL = platform-level blueprint
    name TEXT NOT NULL,
    subject TEXT NOT NULL CHECK (subject IN ('english', 'math')),
    target_grade SMALLINT,
    target_stage SMALLINT,
    total_marks SMALLINT NOT NULL DEFAULT 50,
    duration_minutes SMALLINT NOT NULL DEFAULT 60,
    -- Distribution: how many questions of each type/difficulty
    question_distribution JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- Example: {"mcq": {"easy": 5, "medium": 8, "hard": 2}, "gap_fill": {"medium": 5}}
    pass_percentage SMALLINT DEFAULT 50,
    delivery_mode TEXT DEFAULT 'exam' CHECK (delivery_mode IN ('practice', 'exam')),
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_adm_bp_school ON adm_blueprints(school_id);
CREATE INDEX IF NOT EXISTS idx_adm_bp_subject ON adm_blueprints(subject, target_stage);

-- ============================================================
-- 5. TEST FORMS (generated from blueprints)
-- ============================================================
CREATE TABLE IF NOT EXISTS adm_test_forms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    blueprint_id UUID NOT NULL REFERENCES adm_blueprints(id) ON DELETE CASCADE,
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    form_code TEXT NOT NULL,  -- human-readable code e.g. "ENG9-2026-A"
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'closed')),
    published_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(school_id, form_code)
);

CREATE INDEX IF NOT EXISTS idx_adm_form_school ON adm_test_forms(school_id);
CREATE INDEX IF NOT EXISTS idx_adm_form_status ON adm_test_forms(status);
CREATE INDEX IF NOT EXISTS idx_adm_form_blueprint ON adm_test_forms(blueprint_id);

-- ============================================================
-- 6. TEST FORM QUESTIONS (which questions on which form)
-- ============================================================
CREATE TABLE IF NOT EXISTS adm_test_form_questions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    form_id UUID NOT NULL REFERENCES adm_test_forms(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES adm_questions(id) ON DELETE CASCADE,
    question_order SMALLINT NOT NULL,
    marks_override SMALLINT,  -- NULL = use question default
    UNIQUE(form_id, question_id),
    UNIQUE(form_id, question_order)
);

CREATE INDEX IF NOT EXISTS idx_adm_fq_form ON adm_test_form_questions(form_id);

-- ============================================================
-- 7. CANDIDATES (external applicants — no game account)
-- ============================================================
CREATE TABLE IF NOT EXISTS adm_candidates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    email TEXT,
    parent_phone TEXT,
    applied_grade SMALLINT CHECK (applied_grade BETWEEN 1 AND 13),
    token TEXT NOT NULL UNIQUE,  -- unique test access token
    status TEXT DEFAULT 'registered' CHECK (status IN ('registered', 'testing', 'completed', 'placed')),
    notes TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_adm_cand_school ON adm_candidates(school_id);
CREATE INDEX IF NOT EXISTS idx_adm_cand_token ON adm_candidates(token);
CREATE INDEX IF NOT EXISTS idx_adm_cand_status ON adm_candidates(status);

-- ============================================================
-- 8. ATTEMPTS
-- ============================================================
CREATE TABLE IF NOT EXISTS adm_attempts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    candidate_id UUID NOT NULL REFERENCES adm_candidates(id) ON DELETE CASCADE,
    form_id UUID NOT NULL REFERENCES adm_test_forms(id) ON DELETE CASCADE,
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    submitted_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,  -- server-enforced deadline
    total_score SMALLINT,
    max_score SMALLINT,
    percentage NUMERIC(5,2),
    status TEXT DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'submitted', 'scored', 'expired')),
    ip_address INET,
    user_agent TEXT,
    anti_cheat_flags JSONB DEFAULT '[]'::jsonb,  -- tab switches, copy attempts, etc.
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_adm_att_candidate ON adm_attempts(candidate_id);
CREATE INDEX IF NOT EXISTS idx_adm_att_form ON adm_attempts(form_id);
CREATE INDEX IF NOT EXISTS idx_adm_att_school ON adm_attempts(school_id);
CREATE INDEX IF NOT EXISTS idx_adm_att_status ON adm_attempts(status);

-- ============================================================
-- 9. ANSWERS (per question per attempt)
-- ============================================================
CREATE TABLE IF NOT EXISTS adm_answers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    attempt_id UUID NOT NULL REFERENCES adm_attempts(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES adm_questions(id) ON DELETE CASCADE,
    response JSONB,          -- candidate's answer
    is_correct BOOLEAN,
    marks_awarded SMALLINT DEFAULT 0,
    marks_possible SMALLINT NOT NULL DEFAULT 1,
    answered_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(attempt_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_adm_ans_attempt ON adm_answers(attempt_id);

-- ============================================================
-- 10. PLACEMENT RESULTS
-- ============================================================
CREATE TABLE IF NOT EXISTS adm_placement_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    attempt_id UUID NOT NULL REFERENCES adm_attempts(id) ON DELETE CASCADE,
    candidate_id UUID NOT NULL REFERENCES adm_candidates(id) ON DELETE CASCADE,
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    subject TEXT NOT NULL,
    band TEXT NOT NULL CHECK (band IN ('A', 'B', 'C', 'D', 'E')),
    recommended_grade SMALLINT,
    recommended_stage SMALLINT,
    strengths JSONB DEFAULT '[]'::jsonb,
    weaknesses JSONB DEFAULT '[]'::jsonb,
    notes TEXT,
    decided_by UUID REFERENCES users(id) ON DELETE SET NULL,
    decided_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_adm_place_candidate ON adm_placement_results(candidate_id);
CREATE INDEX IF NOT EXISTS idx_adm_place_school ON adm_placement_results(school_id);
CREATE INDEX IF NOT EXISTS idx_adm_place_band ON adm_placement_results(band);

-- ============================================================
-- 11. IMPORT STAGING (for CSV/JSON question imports)
-- ============================================================
CREATE TABLE IF NOT EXISTS adm_import_staging (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
    batch_ref TEXT NOT NULL,  -- e.g. "eng9-2026-02-11"
    row_number SMALLINT,
    raw_data JSONB NOT NULL,
    validation_errors JSONB DEFAULT '[]'::jsonb,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'valid', 'error', 'promoted')),
    promoted_question_id UUID REFERENCES adm_questions(id) ON DELETE SET NULL,
    uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_adm_import_batch ON adm_import_staging(batch_ref);
CREATE INDEX IF NOT EXISTS idx_adm_import_status ON adm_import_staging(status);

-- ============================================================
-- 12. AUDIT LOG (for key admission actions)
-- ============================================================
CREATE TABLE IF NOT EXISTS adm_audit_log (
    id BIGSERIAL PRIMARY KEY,
    school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,  -- 'form_published', 'score_released', 'placement_decided', etc.
    target_type TEXT,      -- 'form', 'candidate', 'attempt', 'question'
    target_id UUID,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_adm_audit_school ON adm_audit_log(school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_adm_audit_action ON adm_audit_log(action);

-- ============================================================
-- ENABLE RLS ON ALL ADMISSION TABLES
-- ============================================================
ALTER TABLE adm_question_pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE adm_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE adm_school_grade_stage_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE adm_blueprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE adm_test_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE adm_test_form_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE adm_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE adm_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE adm_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE adm_placement_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE adm_import_staging ENABLE ROW LEVEL SECURITY;
ALTER TABLE adm_audit_log ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- UPDATED_AT TRIGGERS (reuses existing update_updated_at())
-- ============================================================
CREATE TRIGGER adm_question_pools_updated_at BEFORE UPDATE ON adm_question_pools
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER adm_questions_updated_at BEFORE UPDATE ON adm_questions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER adm_blueprints_updated_at BEFORE UPDATE ON adm_blueprints
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER adm_test_forms_updated_at BEFORE UPDATE ON adm_test_forms
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER adm_candidates_updated_at BEFORE UPDATE ON adm_candidates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- ROLLBACK (run only if you need to undo everything)
-- ============================================================
-- DROP TABLE IF EXISTS adm_audit_log CASCADE;
-- DROP TABLE IF EXISTS adm_import_staging CASCADE;
-- DROP TABLE IF EXISTS adm_placement_results CASCADE;
-- DROP TABLE IF EXISTS adm_answers CASCADE;
-- DROP TABLE IF EXISTS adm_attempts CASCADE;
-- DROP TABLE IF EXISTS adm_candidates CASCADE;
-- DROP TABLE IF EXISTS adm_test_form_questions CASCADE;
-- DROP TABLE IF EXISTS adm_test_forms CASCADE;
-- DROP TABLE IF EXISTS adm_blueprints CASCADE;
-- DROP TABLE IF EXISTS adm_school_grade_stage_map CASCADE;
-- DROP TABLE IF EXISTS adm_questions CASCADE;
-- DROP TABLE IF EXISTS adm_question_pools CASCADE;
