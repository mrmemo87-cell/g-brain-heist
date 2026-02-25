-- ============================================================
-- Targeted Announcements Migration
-- ============================================================
-- Adds audience targeting to the announcements system so
-- superadmins can send to: all users, a specific school,
-- all school admins, school admins at one school, a grade
-- (all or per-school), a specific class, or all teachers.
--
-- Run once. All statements are idempotent (IF NOT EXISTS / OR REPLACE).
-- ============================================================

-- Step 1: Ensure prerequisite columns exist
-- ============================================================

ALTER TABLE announcements
  ADD COLUMN IF NOT EXISTS title TEXT;

ALTER TABLE announcements
  ADD COLUMN IF NOT EXISTS content TEXT;

ALTER TABLE announcements
  ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal';

ALTER TABLE announcements
  ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE;

ALTER TABLE announcements
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

ALTER TABLE announcements
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Step 2: Add targeting columns to announcements
-- ============================================================

ALTER TABLE announcements
  ADD COLUMN IF NOT EXISTS target_audience TEXT DEFAULT 'all';

ALTER TABLE announcements
  ADD COLUMN IF NOT EXISTS target_school_id UUID REFERENCES schools(id) ON DELETE SET NULL;

ALTER TABLE announcements
  ADD COLUMN IF NOT EXISTS target_grade SMALLINT;

ALTER TABLE announcements
  ADD COLUMN IF NOT EXISTS target_class_id UUID;

-- Index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_announcements_target_audience
  ON announcements(target_audience);

CREATE INDEX IF NOT EXISTS idx_announcements_target_school_id
  ON announcements(target_school_id)
  WHERE target_school_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_announcements_target_grade
  ON announcements(target_grade)
  WHERE target_grade IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_announcements_target_class_id
  ON announcements(target_class_id)
  WHERE target_class_id IS NOT NULL;

-- Step 3: Replace rpc_announcement_post with targeting support
-- ============================================================

-- Drop all existing overloads cleanly
DO $$
DECLARE rec RECORD;
BEGIN
  FOR rec IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = 'rpc_announcement_post'
  LOOP
    EXECUTE format('DROP FUNCTION %s CASCADE;', rec.sig);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION rpc_announcement_post(
  p_text           TEXT,
  p_title          TEXT          DEFAULT NULL,
  p_priority       TEXT          DEFAULT 'normal',
  p_active         BOOLEAN       DEFAULT TRUE,
  p_expires_at     TIMESTAMPTZ   DEFAULT NULL,
  -- Targeting parameters
  p_target_audience  TEXT        DEFAULT 'all',
  p_target_school_id UUID       DEFAULT NULL,
  p_target_grade     SMALLINT   DEFAULT NULL,
  p_target_class_id  UUID       DEFAULT NULL
)
RETURNS TABLE (
  id          TEXT,
  text        TEXT,
  priority    TEXT,
  active      BOOLEAN,
  created_at  TIMESTAMPTZ,
  created_by  UUID,
  target_audience  TEXT,
  target_school_id UUID,
  target_grade     SMALLINT,
  target_class_id  UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_row  announcements%rowtype;
BEGIN
  IF v_actor IS NULL OR NOT is_current_user_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Validate audience value
  IF p_target_audience NOT IN (
    'all', 'school', 'school_admins', 'school_admins_school',
    'grade', 'grade_school', 'class', 'teachers'
  ) THEN
    RAISE EXCEPTION 'Invalid target_audience: %', p_target_audience;
  END IF;

  -- Validate required targeting fields
  IF p_target_audience IN ('school', 'school_admins_school', 'grade_school', 'class')
     AND p_target_school_id IS NULL THEN
    RAISE EXCEPTION 'target_school_id is required for audience "%"', p_target_audience;
  END IF;

  IF p_target_audience IN ('grade', 'grade_school') AND p_target_grade IS NULL THEN
    RAISE EXCEPTION 'target_grade is required for audience "%"', p_target_audience;
  END IF;

  IF p_target_audience = 'class' AND p_target_class_id IS NULL THEN
    RAISE EXCEPTION 'target_class_id is required for audience "class"';
  END IF;

  INSERT INTO announcements (
    title, content, text, priority, active, created_by, expires_at,
    target_audience, target_school_id, target_grade, target_class_id
  )
  VALUES (
    COALESCE(NULLIF(TRIM(p_title), ''), LEFT(p_text, 120)),
    p_text,
    p_text,
    COALESCE(p_priority, 'normal'),
    COALESCE(p_active, TRUE),
    v_actor,
    p_expires_at,
    p_target_audience,
    p_target_school_id,
    p_target_grade,
    p_target_class_id
  )
  RETURNING * INTO v_row;

  INSERT INTO rpc_event_log(function_name, log_level, message, user_id, context)
  VALUES (
    'rpc_announcement_post', 'info', 'broadcast', v_actor,
    jsonb_build_object(
      'announcement_id', v_row.id,
      'title', v_row.title,
      'target_audience', p_target_audience,
      'target_school_id', p_target_school_id,
      'target_grade', p_target_grade,
      'target_class_id', p_target_class_id
    )
  );

  RETURN QUERY SELECT
    v_row.id::text,
    v_row.text,
    v_row.priority,
    v_row.active,
    v_row.created_at,
    v_row.created_by,
    v_row.target_audience,
    v_row.target_school_id,
    v_row.target_grade,
    v_row.target_class_id;

EXCEPTION WHEN OTHERS THEN
  INSERT INTO rpc_event_log(function_name, log_level, message, user_id, context)
  VALUES ('rpc_announcement_post', 'error', SQLERRM, v_actor, jsonb_build_object());
  RAISE;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_announcement_post TO authenticated;


-- Step 4: Replace rpc_announcement_next with targeting filters
-- ============================================================

DROP FUNCTION IF EXISTS rpc_announcement_next();

CREATE OR REPLACE FUNCTION rpc_announcement_next()
RETURNS TABLE (
  id          TEXT,
  text        TEXT,
  priority    TEXT,
  active      BOOLEAN,
  created_at  TIMESTAMPTZ,
  created_by  UUID,
  seen_at     TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user         UUID := auth.uid();
  v_school_id    UUID;
  v_grade        SMALLINT;
  v_role         TEXT;
  v_role_in_school TEXT;
  v_class_id     UUID;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Fetch the calling user's profile attributes
  SELECT u.school_id, u.grade, u.role
  INTO v_school_id, v_grade, v_role
  FROM users u
  WHERE u.id = v_user;

  -- Fetch school role (school_admin / teacher / student)
  SELECT sm.role_in_school
  INTO v_role_in_school
  FROM school_members sm
  WHERE sm.user_id = v_user
    AND sm.status = 'active'
  LIMIT 1;

  -- Fetch primary class_id for the user (if enrolled)
  SELECT cs.class_id
  INTO v_class_id
  FROM class_students cs
  WHERE cs.student_id = v_user
  LIMIT 1;

  RETURN QUERY
  SELECT
    a.id::text,
    a.text::text,
    COALESCE(a.priority, 'normal')::text,
    COALESCE(a.active, TRUE)::boolean,
    a.created_at::timestamptz,
    a.created_by::uuid,
    ar.seen_at::timestamptz
  FROM announcements a
  LEFT JOIN announcement_receipts ar
    ON ar.announcement_id = a.id AND ar.user_id = v_user
  WHERE ar.id IS NULL                                                -- not yet seen
    AND COALESCE(a.active, TRUE) = TRUE                              -- active
    AND (a.expires_at IS NULL OR a.expires_at > NOW())               -- not expired
    AND (
      -- Audience targeting filter
      COALESCE(a.target_audience, 'all') = 'all'

      OR (a.target_audience = 'school'
          AND a.target_school_id IS NOT NULL
          AND a.target_school_id = v_school_id)

      OR (a.target_audience = 'school_admins'
          AND v_role_in_school = 'school_admin')

      OR (a.target_audience = 'school_admins_school'
          AND a.target_school_id IS NOT NULL
          AND a.target_school_id = v_school_id
          AND v_role_in_school = 'school_admin')

      OR (a.target_audience = 'grade'
          AND a.target_grade IS NOT NULL
          AND a.target_grade = v_grade)

      OR (a.target_audience = 'grade_school'
          AND a.target_school_id IS NOT NULL
          AND a.target_grade IS NOT NULL
          AND a.target_school_id = v_school_id
          AND a.target_grade = v_grade)

      OR (a.target_audience = 'class'
          AND a.target_class_id IS NOT NULL
          AND (
            a.target_class_id = v_class_id
            OR EXISTS (
              SELECT 1 FROM class_students cs2
              WHERE cs2.class_id = a.target_class_id
                AND cs2.student_id = v_user
            )
          ))

      OR (a.target_audience = 'teachers'
          AND (v_role = 'teacher' OR v_role_in_school = 'teacher'))
    )
  ORDER BY a.created_at DESC
  LIMIT 1;

EXCEPTION WHEN OTHERS THEN
  INSERT INTO rpc_event_log(function_name, log_level, message, user_id, context)
  VALUES ('rpc_announcement_next', 'error', SQLERRM, v_user, jsonb_build_object());
  RAISE;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_announcement_next TO authenticated;


-- Step 5: Update fetchAnnouncements admin query (add targeting cols)
-- ============================================================
-- No RPC needed — the admin portal reads the table directly.
-- The new columns are automatically available via .select('*').

-- Done!
-- ============================================================
-- Audience reference:
--   'all'                → every user (default, backward-compatible)
--   'school'             → all members of target_school_id
--   'school_admins'      → all school admins across all schools
--   'school_admins_school' → school admins of target_school_id only
--   'grade'              → all users with the specified grade (any school)
--   'grade_school'       → users with grade in target_school_id
--   'class'              → members of target_class_id
--   'teachers'           → all teachers (by role or school membership)
-- ============================================================
