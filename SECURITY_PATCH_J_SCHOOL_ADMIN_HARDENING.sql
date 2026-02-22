-- ============================================================
-- SECURITY PATCH J — School Admin Portal Hardening
-- ============================================================
-- Date   : 2026-02-22
-- Scope  : Convert 11 direct-table operations in schoolAdminService.ts
--          to SECURITY DEFINER RPCs with proper auth + school-admin gates.
--
-- Direct-table gaps found:
--   1. listSchoolClasses      → classes (SELECT)
--   2. saveSchoolClass         → classes (INSERT/UPDATE)
--   3. listTeacherAssignments  → class_teacher_assignments (SELECT)
--   4. deleteTeacherAssignment → class_teacher_assignments (DELETE)
--   5. listClassStudents       → class_students (SELECT)
--   6. listSchoolTeachers      → school_members + teachers (SELECT)
--   7. listSchoolSubjects      → school_subjects (SELECT)
--   8. createSchoolSubject     → school_subjects (INSERT)
--   9. updateSchoolSubject     → school_subjects (UPDATE)
--  10. deleteSchoolSubject     → school_subjects (UPDATE is_active=false)
--  11. archiveSchoolClass      → classes (UPDATE is_active=false)  [NEW]
--
-- All new RPCs follow the template from SECURITY_BASELINE.md §4.
-- ============================================================

-- ============================================================
-- 1. school_admin_list_classes
-- ============================================================
CREATE OR REPLACE FUNCTION public.school_admin_list_classes(p_school_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- ================================================================
  -- RPC: school_admin_list_classes
  -- Purpose : List all classes for a school
  -- Auth    : auth.uid() IS NULL → reject
  -- Role    : school_admin (or superadmin)
  -- Scope   : same school_id
  -- Returns : JSONB array of class objects
  -- Added   : 2026-02-22
  -- Patch   : J
  -- ================================================================
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_school_admin_of(p_school_id) THEN
    RAISE EXCEPTION 'Forbidden: not a school admin of this school';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'school_id', c.school_id,
        'class_code', c.class_code,
        'class_name', c.class_name,
        'grade_level', c.grade_level,
        'is_active', c.is_active
      ) ORDER BY c.grade_level ASC NULLS LAST, c.class_name ASC
    )
    FROM public.classes c
    WHERE c.school_id = p_school_id
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.school_admin_list_classes(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.school_admin_list_classes(UUID) TO authenticated;

-- ============================================================
-- 2. school_admin_save_class (create or update)
-- ============================================================
CREATE OR REPLACE FUNCTION public.school_admin_save_class(
  p_school_id UUID,
  p_class_id UUID DEFAULT NULL,
  p_class_code TEXT DEFAULT NULL,
  p_class_name TEXT DEFAULT NULL,
  p_grade_level INT DEFAULT NULL,
  p_is_active BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  -- ================================================================
  -- RPC: school_admin_save_class
  -- Purpose : Create or update a class within a school
  -- Auth    : auth.uid() IS NULL → reject
  -- Role    : school_admin (or superadmin)
  -- Scope   : same school_id
  -- Returns : JSONB { success, id?, error? }
  -- Added   : 2026-02-22
  -- Patch   : J
  -- ================================================================
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_school_admin_of(p_school_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Forbidden: not a school admin');
  END IF;

  IF p_class_name IS NULL OR trim(p_class_name) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Class name is required');
  END IF;

  IF p_class_id IS NOT NULL THEN
    -- UPDATE existing class (verify it belongs to this school)
    UPDATE public.classes
    SET class_code  = COALESCE(p_class_code, class_code),
        class_name  = p_class_name,
        grade_level = p_grade_level,
        is_active   = p_is_active
    WHERE id = p_class_id
      AND school_id = p_school_id;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'Class not found in this school');
    END IF;

    RETURN jsonb_build_object('success', true, 'id', p_class_id);
  ELSE
    -- INSERT new class
    INSERT INTO public.classes (school_id, class_code, class_name, grade_level, is_active)
    VALUES (p_school_id, p_class_code, p_class_name, p_grade_level, p_is_active)
    RETURNING id INTO v_id;

    RETURN jsonb_build_object('success', true, 'id', v_id);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.school_admin_save_class(UUID,UUID,TEXT,TEXT,INT,BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.school_admin_save_class(UUID,UUID,TEXT,TEXT,INT,BOOLEAN) TO authenticated;

-- ============================================================
-- 3. school_admin_archive_class (new — soft delete)
-- ============================================================
CREATE OR REPLACE FUNCTION public.school_admin_archive_class(
  p_school_id UUID,
  p_class_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- ================================================================
  -- RPC: school_admin_archive_class
  -- Purpose : Soft-delete a class by setting is_active = false
  -- Auth    : auth.uid() IS NULL → reject
  -- Role    : school_admin (or superadmin)
  -- Scope   : same school_id
  -- Returns : JSONB { success, error? }
  -- Added   : 2026-02-22
  -- Patch   : J
  -- ================================================================
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_school_admin_of(p_school_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Forbidden: not a school admin');
  END IF;

  UPDATE public.classes
  SET is_active = false
  WHERE id = p_class_id
    AND school_id = p_school_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Class not found in this school');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.school_admin_archive_class(UUID,UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.school_admin_archive_class(UUID,UUID) TO authenticated;

-- ============================================================
-- 4. school_admin_list_teacher_assignments
-- ============================================================
CREATE OR REPLACE FUNCTION public.school_admin_list_teacher_assignments(p_school_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- ================================================================
  -- RPC: school_admin_list_teacher_assignments
  -- Purpose : List all teacher-class-subject assignments for a school
  -- Auth    : auth.uid() IS NULL → reject
  -- Role    : school_admin (or superadmin)
  -- Scope   : same school_id
  -- Returns : JSONB array of assignment objects
  -- Added   : 2026-02-22
  -- Patch   : J
  -- ================================================================
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_school_admin_of(p_school_id) THEN
    RAISE EXCEPTION 'Forbidden: not a school admin of this school';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', a.id,
        'school_id', a.school_id,
        'class_id', a.class_id,
        'teacher_user_id', a.teacher_user_id,
        'subject', a.subject,
        'active', a.active
      ) ORDER BY a.class_id, a.subject
    )
    FROM public.class_teacher_assignments a
    WHERE a.school_id = p_school_id
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.school_admin_list_teacher_assignments(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.school_admin_list_teacher_assignments(UUID) TO authenticated;

-- ============================================================
-- 5. school_admin_delete_teacher_assignment
-- ============================================================
CREATE OR REPLACE FUNCTION public.school_admin_delete_teacher_assignment(
  p_school_id UUID,
  p_assignment_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- ================================================================
  -- RPC: school_admin_delete_teacher_assignment
  -- Purpose : Remove a teacher-class-subject assignment
  -- Auth    : auth.uid() IS NULL → reject
  -- Role    : school_admin (or superadmin)
  -- Scope   : same school_id (verified via join)
  -- Returns : JSONB { success, error? }
  -- Added   : 2026-02-22
  -- Patch   : J
  -- ================================================================
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_school_admin_of(p_school_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Forbidden: not a school admin');
  END IF;

  DELETE FROM public.class_teacher_assignments
  WHERE id = p_assignment_id
    AND school_id = p_school_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Assignment not found in this school');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.school_admin_delete_teacher_assignment(UUID,UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.school_admin_delete_teacher_assignment(UUID,UUID) TO authenticated;

-- ============================================================
-- 6. school_admin_list_class_students
-- ============================================================
CREATE OR REPLACE FUNCTION public.school_admin_list_class_students(
  p_school_id UUID,
  p_class_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- ================================================================
  -- RPC: school_admin_list_class_students
  -- Purpose : List student-class assignments for given class IDs
  -- Auth    : auth.uid() IS NULL → reject
  -- Role    : school_admin (or superadmin)
  -- Scope   : same school_id (classes verified via join)
  -- Returns : JSONB array of { class_id, student_id }
  -- Added   : 2026-02-22
  -- Patch   : J
  -- ================================================================
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_school_admin_of(p_school_id) THEN
    RAISE EXCEPTION 'Forbidden: not a school admin of this school';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'class_id', cs.class_id,
        'student_id', cs.student_id
      )
    )
    FROM public.class_students cs
    JOIN public.classes c ON c.id = cs.class_id
    WHERE c.school_id = p_school_id
      AND cs.class_id = ANY(p_class_ids)
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.school_admin_list_class_students(UUID,UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.school_admin_list_class_students(UUID,UUID[]) TO authenticated;

-- ============================================================
-- 7. school_admin_list_teachers
-- ============================================================
CREATE OR REPLACE FUNCTION public.school_admin_list_teachers(p_school_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  -- ================================================================
  -- RPC: school_admin_list_teachers
  -- Purpose : List teachers in a school with their specializations
  -- Auth    : auth.uid() IS NULL → reject
  -- Role    : school_admin (or superadmin)
  -- Scope   : same school_id
  -- Returns : JSONB array of teacher objects
  -- Added   : 2026-02-22
  -- Patch   : J
  -- ================================================================
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_school_admin_of(p_school_id) THEN
    RAISE EXCEPTION 'Forbidden: not a school admin of this school';
  END IF;

  -- Two sources of teachers:
  --   1. school_members with role teacher/school_admin
  --   2. users assigned to classes via class_teacher_assignments
  -- UNIONed to catch teachers who were assigned but never added to school_members.
  WITH teacher_ids AS (
    -- Source 1: formal school members with teacher/admin role
    SELECT sm.user_id
    FROM public.school_members sm
    WHERE sm.school_id = p_school_id
      AND sm.status = 'active'
      AND sm.role_in_school IN ('teacher', 'school_admin')
    UNION
    -- Source 2: anyone assigned to teach a class in this school
    SELECT DISTINCT a.teacher_user_id
    FROM public.class_teacher_assignments a
    WHERE a.school_id = p_school_id
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'user_id', ti.user_id,
      'username', u.username,
      'email', u.email,
      'role_in_school', COALESCE(sm.role_in_school, 'teacher'),
      'subject_specializations', COALESCE(to_jsonb(t.subject_specializations), '[]'::jsonb),
      'verified', COALESCE(t.verified, false)
    ) ORDER BY u.username ASC
  ), '[]'::jsonb)
  INTO v_result
  FROM teacher_ids ti
  JOIN public.users u ON u.id = ti.user_id
  LEFT JOIN public.school_members sm
    ON sm.user_id = ti.user_id
   AND sm.school_id = p_school_id
   AND sm.status = 'active'
  LEFT JOIN public.teachers t ON t.user_id = ti.user_id;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.school_admin_list_teachers(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.school_admin_list_teachers(UUID) TO authenticated;

-- ============================================================
-- 8. school_admin_list_subjects
-- ============================================================
CREATE OR REPLACE FUNCTION public.school_admin_list_subjects(p_school_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- ================================================================
  -- RPC: school_admin_list_subjects
  -- Purpose : List all active subjects for a school
  -- Auth    : auth.uid() IS NULL → reject
  -- Role    : school_admin (or superadmin)
  -- Scope   : same school_id
  -- Returns : JSONB array of subject objects
  -- Added   : 2026-02-22
  -- Patch   : J
  -- ================================================================
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_school_admin_of(p_school_id) THEN
    RAISE EXCEPTION 'Forbidden: not a school admin of this school';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'school_id', s.school_id,
        'name', s.name,
        'code', s.code,
        'is_active', s.is_active,
        'created_at', s.created_at,
        'created_by', s.created_by
      ) ORDER BY s.name ASC
    )
    FROM public.school_subjects s
    WHERE s.school_id = p_school_id
      AND s.is_active = true
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.school_admin_list_subjects(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.school_admin_list_subjects(UUID) TO authenticated;

-- ============================================================
-- 9. school_admin_create_subject
-- ============================================================
CREATE OR REPLACE FUNCTION public.school_admin_create_subject(
  p_school_id UUID,
  p_name TEXT,
  p_code TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subject RECORD;
BEGIN
  -- ================================================================
  -- RPC: school_admin_create_subject
  -- Purpose : Create a new subject for a school
  -- Auth    : auth.uid() IS NULL → reject
  -- Role    : school_admin (or superadmin)
  -- Scope   : same school_id
  -- Returns : JSONB { success, subject?, error? }
  -- Added   : 2026-02-22
  -- Patch   : J
  -- ================================================================
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_school_admin_of(p_school_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Forbidden: not a school admin');
  END IF;

  IF p_name IS NULL OR trim(p_name) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Subject name is required');
  END IF;

  -- Check for duplicate name in same school
  IF EXISTS (
    SELECT 1 FROM public.school_subjects
    WHERE school_id = p_school_id
      AND lower(trim(name)) = lower(trim(p_name))
      AND is_active = true
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'A subject with this name already exists');
  END IF;

  INSERT INTO public.school_subjects (school_id, name, code, is_active, created_by)
  VALUES (p_school_id, trim(p_name), NULLIF(trim(COALESCE(p_code, '')), ''), true, auth.uid())
  RETURNING * INTO v_subject;

  RETURN jsonb_build_object(
    'success', true,
    'subject', jsonb_build_object(
      'id', v_subject.id,
      'school_id', v_subject.school_id,
      'name', v_subject.name,
      'code', v_subject.code,
      'is_active', v_subject.is_active,
      'created_at', v_subject.created_at,
      'created_by', v_subject.created_by
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.school_admin_create_subject(UUID,TEXT,TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.school_admin_create_subject(UUID,TEXT,TEXT) TO authenticated;

-- ============================================================
-- 10. school_admin_update_subject
-- ============================================================
CREATE OR REPLACE FUNCTION public.school_admin_update_subject(
  p_school_id UUID,
  p_subject_id UUID,
  p_name TEXT DEFAULT NULL,
  p_code TEXT DEFAULT NULL,
  p_is_active BOOLEAN DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- ================================================================
  -- RPC: school_admin_update_subject
  -- Purpose : Update a subject's name, code, or active status
  -- Auth    : auth.uid() IS NULL → reject
  -- Role    : school_admin (or superadmin)
  -- Scope   : same school_id (verified via WHERE)
  -- Returns : JSONB { success, error? }
  -- Added   : 2026-02-22
  -- Patch   : J
  -- ================================================================
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_school_admin_of(p_school_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Forbidden: not a school admin');
  END IF;

  UPDATE public.school_subjects
  SET name      = COALESCE(p_name, name),
      code      = COALESCE(p_code, code),
      is_active = COALESCE(p_is_active, is_active)
  WHERE id = p_subject_id
    AND school_id = p_school_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Subject not found in this school');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.school_admin_update_subject(UUID,UUID,TEXT,TEXT,BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.school_admin_update_subject(UUID,UUID,TEXT,TEXT,BOOLEAN) TO authenticated;

-- ============================================================
-- 11. school_admin_delete_subject (soft delete)
-- ============================================================
CREATE OR REPLACE FUNCTION public.school_admin_delete_subject(
  p_school_id UUID,
  p_subject_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- ================================================================
  -- RPC: school_admin_delete_subject
  -- Purpose : Soft-delete a subject (set is_active = false)
  -- Auth    : auth.uid() IS NULL → reject
  -- Role    : school_admin (or superadmin)
  -- Scope   : same school_id (verified via WHERE)
  -- Returns : JSONB { success, error? }
  -- Added   : 2026-02-22
  -- Patch   : J
  -- ================================================================
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_school_admin_of(p_school_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Forbidden: not a school admin');
  END IF;

  UPDATE public.school_subjects
  SET is_active = false
  WHERE id = p_subject_id
    AND school_id = p_school_id
    AND is_active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Subject not found or already deleted');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.school_admin_delete_subject(UUID,UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.school_admin_delete_subject(UUID,UUID) TO authenticated;

-- ============================================================
-- VERIFICATION — run after deploying to confirm all 11 RPCs exist
-- ============================================================
DO $$
DECLARE
  v_missing TEXT[] := '{}';
  v_funcs  TEXT[] := ARRAY[
    'school_admin_list_classes',
    'school_admin_save_class',
    'school_admin_archive_class',
    'school_admin_list_teacher_assignments',
    'school_admin_delete_teacher_assignment',
    'school_admin_list_class_students',
    'school_admin_list_teachers',
    'school_admin_list_subjects',
    'school_admin_create_subject',
    'school_admin_update_subject',
    'school_admin_delete_subject'
  ];
  v_name TEXT;
BEGIN
  FOREACH v_name IN ARRAY v_funcs LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = v_name
    ) THEN
      v_missing := array_append(v_missing, v_name);
    END IF;
  END LOOP;

  IF array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION 'PATCH J VERIFICATION FAILED — missing functions: %', array_to_string(v_missing, ', ');
  ELSE
    RAISE NOTICE 'PATCH J VERIFICATION PASSED — all 11 RPCs exist';
  END IF;
END;
$$;
