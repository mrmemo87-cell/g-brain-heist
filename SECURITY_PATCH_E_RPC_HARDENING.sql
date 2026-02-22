-- ============================================================
-- SECURITY PATCH E — Safe RPC Wrapper Hardening
-- ============================================================
-- Paste the ENTIRE file in one go in the Supabase SQL Editor.
-- If you see "Success" you are done.
--
-- FIX #1: brains_heist_delete_question + brains_heist_update_question
--   BUG:  Uses  teacher_id = auth.uid()  but teacher_id is actually
--         the teachers.id profile UUID, not the auth user UUID.
--   FIX:  Look up bh_teacher_profile_id() and match against that.
--         Also add auth.uid() IS NULL check and is_bh_teacher() gate.
--
-- FIX #3: add_student_to_class, remove_student_from_class,
--         move_student_between_classes, bulk_add_students_to_class,
--         bulk_remove_students_from_class
--   BUG:  SECURITY DEFINER with NO auth check, NO role gate.
--         Any authenticated user can add/remove/move any student.
--   FIX:  Require auth.uid() + is_school_admin_of(class.school_id)
--         or teacher assigned to the class.
--
-- FIX #5: rpc_admin_grant, rpc_admin_reset_user, rpc_admin_set_level
--   BUG:  Set 'app.admin_override' but trigger block_direct_xp_level_updates
--         only checks 'app.allow_xp_level_write'. The admin RPCs work
--         solely because of a separate superadmin bypass — the config
--         flag is dead code.
--   FIX:  Change all 3 to set 'app.allow_xp_level_write' (defense-in-depth).
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- HELPER: is_class_staff — returns TRUE if caller is a school
-- admin of the class's school, or a teacher assigned to the
-- class, or a global superadmin.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_class_staff(p_class_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT school_id INTO v_school_id
  FROM classes WHERE id = p_class_id;

  IF v_school_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- School admin or superadmin
  IF public.is_school_admin_of(v_school_id) THEN
    RETURN TRUE;
  END IF;

  -- Teacher assigned to this class
  RETURN EXISTS (
    SELECT 1 FROM class_teacher_assignments cta
    JOIN teachers t ON t.id = cta.teacher_id
    WHERE cta.class_id = p_class_id
      AND cta.active = true
      AND t.user_id = auth.uid()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_class_staff(UUID) TO authenticated;


-- ════════════════════════════════════════════════════════════
-- FIX #1a: brains_heist_update_question
-- ════════════════════════════════════════════════════════════
DO $outer$
DECLARE
  v_iargs text;
  v_fargs text;
  v_ret   text;
BEGIN
  SELECT pg_get_function_identity_arguments(p.oid),
         pg_get_function_arguments(p.oid),
         pg_get_function_result(p.oid)
    INTO v_iargs, v_fargs, v_ret
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'brains_heist_update_question'
  LIMIT 1;

  IF v_iargs IS NULL THEN
    RAISE NOTICE '[E-1a] brains_heist_update_question not found — skipping';
    RETURN;
  END IF;

  EXECUTE format('DROP FUNCTION public.brains_heist_update_question(%s)', v_iargs);

  EXECUTE format($cr$
    CREATE FUNCTION public.brains_heist_update_question(%s)
    RETURNS %s
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $fn$
    DECLARE
      v_teacher_profile_id uuid;
    BEGIN
      IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
      END IF;

      IF NOT public.is_bh_teacher() THEN
        RAISE EXCEPTION 'BH teacher/admin only';
      END IF;

      v_teacher_profile_id := public.bh_teacher_profile_id();
      IF v_teacher_profile_id IS NULL THEN
        RAISE EXCEPTION 'Teacher profile not found';
      END IF;

      UPDATE public.brains_heist_questions
      SET prompt        = coalesce(p_prompt, prompt),
          question_type = coalesce(p_question_type, question_type),
          difficulty    = coalesce(p_difficulty, difficulty),
          metadata      = coalesce(p_metadata, metadata),
          updated_at    = now()
      WHERE id = p_question_id
        AND teacher_id = v_teacher_profile_id;
    END;
    $fn$
  $cr$, v_fargs, v_ret);

  RAISE NOTICE '[E-1a] brains_heist_update_question patched';
END;
$outer$;


-- ════════════════════════════════════════════════════════════
-- FIX #1b: brains_heist_delete_question
-- ════════════════════════════════════════════════════════════
DO $outer$
DECLARE
  v_iargs text;
  v_fargs text;
  v_ret   text;
BEGIN
  SELECT pg_get_function_identity_arguments(p.oid),
         pg_get_function_arguments(p.oid),
         pg_get_function_result(p.oid)
    INTO v_iargs, v_fargs, v_ret
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'brains_heist_delete_question'
  LIMIT 1;

  IF v_iargs IS NULL THEN
    RAISE NOTICE '[E-1b] brains_heist_delete_question not found — skipping';
    RETURN;
  END IF;

  EXECUTE format('DROP FUNCTION public.brains_heist_delete_question(%s)', v_iargs);

  EXECUTE format($cr$
    CREATE FUNCTION public.brains_heist_delete_question(%s)
    RETURNS %s
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $fn$
    DECLARE
      v_teacher_profile_id uuid;
    BEGIN
      IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
      END IF;

      IF NOT public.is_bh_teacher() THEN
        RAISE EXCEPTION 'BH teacher/admin only';
      END IF;

      v_teacher_profile_id := public.bh_teacher_profile_id();
      IF v_teacher_profile_id IS NULL THEN
        RAISE EXCEPTION 'Teacher profile not found';
      END IF;

      DELETE FROM public.brains_heist_questions
      WHERE id = p_question_id
        AND teacher_id = v_teacher_profile_id;
    END;
    $fn$
  $cr$, v_fargs, v_ret);

  RAISE NOTICE '[E-1b] brains_heist_delete_question patched';
END;
$outer$;


-- ════════════════════════════════════════════════════════════
-- FIX #3a: add_student_to_class
-- ════════════════════════════════════════════════════════════
DO $outer$
DECLARE
  v_iargs text;
  v_fargs text;
  v_ret   text;
BEGIN
  SELECT pg_get_function_identity_arguments(p.oid),
         pg_get_function_arguments(p.oid),
         pg_get_function_result(p.oid)
    INTO v_iargs, v_fargs, v_ret
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'add_student_to_class'
  LIMIT 1;

  IF v_iargs IS NULL THEN
    RAISE NOTICE '[E-3a] add_student_to_class not found — skipping';
    RETURN;
  END IF;

  EXECUTE format('DROP FUNCTION public.add_student_to_class(%s)', v_iargs);

  EXECUTE format($cr$
    CREATE FUNCTION public.add_student_to_class(%s)
    RETURNS %s
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $fn$
    DECLARE
      v_class   RECORD;
      v_student RECORD;
      v_exists  BOOLEAN;
    BEGIN
      -- Auth gate
      IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
      END IF;

      -- Get class
      SELECT id, school_id, class_code INTO v_class
      FROM classes WHERE id = p_class_id;

      IF v_class IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Class not found');
      END IF;

      -- Permission gate: must be school admin or teacher assigned to this class
      IF NOT public.is_class_staff(p_class_id) THEN
        RAISE EXCEPTION 'Forbidden: not school admin or assigned teacher';
      END IF;

      -- Verify student exists and is in same school
      SELECT id, username, school_id INTO v_student
      FROM users
      WHERE id = p_student_id
        AND COALESCE(role, 'student') = 'student';

      IF v_student IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Student not found');
      END IF;

      IF v_student.school_id != v_class.school_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'Student is not in the same school as the class');
      END IF;

      -- Check if already enrolled
      SELECT EXISTS (
        SELECT 1 FROM class_students
        WHERE class_id = p_class_id AND student_id = p_student_id
      ) INTO v_exists;

      IF v_exists THEN
        RETURN jsonb_build_object('success', false, 'error', 'Student is already enrolled in this class');
      END IF;

      -- Add student to class
      INSERT INTO class_students (class_id, student_id)
      VALUES (p_class_id, p_student_id);

      -- Update batch
      UPDATE users SET batch = v_class.class_code WHERE id = p_student_id;

      RETURN jsonb_build_object(
        'success', true,
        'message', format('Student %%s added to class %%s', v_student.username, v_class.class_code)
      );
    END;
    $fn$
  $cr$, v_fargs, v_ret);

  EXECUTE format(
    'REVOKE ALL ON FUNCTION public.add_student_to_class(%s) FROM PUBLIC, anon',
    v_iargs
  );
  EXECUTE format(
    'GRANT EXECUTE ON FUNCTION public.add_student_to_class(%s) TO authenticated',
    v_iargs
  );

  RAISE NOTICE '[E-3a] add_student_to_class patched';
END;
$outer$;


-- ════════════════════════════════════════════════════════════
-- FIX #3b: remove_student_from_class
-- ════════════════════════════════════════════════════════════
DO $outer$
DECLARE
  v_iargs text;
  v_fargs text;
  v_ret   text;
BEGIN
  SELECT pg_get_function_identity_arguments(p.oid),
         pg_get_function_arguments(p.oid),
         pg_get_function_result(p.oid)
    INTO v_iargs, v_fargs, v_ret
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'remove_student_from_class'
  LIMIT 1;

  IF v_iargs IS NULL THEN
    RAISE NOTICE '[E-3b] remove_student_from_class not found — skipping';
    RETURN;
  END IF;

  EXECUTE format('DROP FUNCTION public.remove_student_from_class(%s)', v_iargs);

  EXECUTE format($cr$
    CREATE FUNCTION public.remove_student_from_class(%s)
    RETURNS %s
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $fn$
    DECLARE
      v_deleted INT;
    BEGIN
      IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
      END IF;

      IF NOT public.is_class_staff(p_class_id) THEN
        RAISE EXCEPTION 'Forbidden: not school admin or assigned teacher';
      END IF;

      DELETE FROM class_students
      WHERE class_id = p_class_id
        AND student_id = p_student_id;

      GET DIAGNOSTICS v_deleted = ROW_COUNT;

      IF v_deleted = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Student was not enrolled in this class');
      END IF;

      UPDATE users SET batch = NULL WHERE id = p_student_id;

      RETURN jsonb_build_object('success', true, 'message', 'Student removed from class');
    END;
    $fn$
  $cr$, v_fargs, v_ret);

  EXECUTE format(
    'REVOKE ALL ON FUNCTION public.remove_student_from_class(%s) FROM PUBLIC, anon',
    v_iargs
  );
  EXECUTE format(
    'GRANT EXECUTE ON FUNCTION public.remove_student_from_class(%s) TO authenticated',
    v_iargs
  );

  RAISE NOTICE '[E-3b] remove_student_from_class patched';
END;
$outer$;


-- ════════════════════════════════════════════════════════════
-- FIX #3c: move_student_between_classes
-- ════════════════════════════════════════════════════════════
DO $outer$
DECLARE
  v_iargs text;
  v_fargs text;
  v_ret   text;
BEGIN
  SELECT pg_get_function_identity_arguments(p.oid),
         pg_get_function_arguments(p.oid),
         pg_get_function_result(p.oid)
    INTO v_iargs, v_fargs, v_ret
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'move_student_between_classes'
  LIMIT 1;

  IF v_iargs IS NULL THEN
    RAISE NOTICE '[E-3c] move_student_between_classes not found — skipping';
    RETURN;
  END IF;

  EXECUTE format('DROP FUNCTION public.move_student_between_classes(%s)', v_iargs);

  EXECUTE format($cr$
    CREATE FUNCTION public.move_student_between_classes(%s)
    RETURNS %s
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $fn$
    DECLARE
      v_to_class     RECORD;
      v_student_name TEXT;
    BEGIN
      IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
      END IF;

      -- Get destination class
      SELECT id, class_code, school_id INTO v_to_class
      FROM classes WHERE id = p_to_class_id;

      IF v_to_class IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Destination class not found');
      END IF;

      -- Must be staff of the destination class's school
      IF NOT public.is_school_admin_of(v_to_class.school_id) THEN
        -- Also allow if teacher is assigned to BOTH classes
        IF p_from_class_id IS NOT NULL
           AND NOT public.is_class_staff(p_from_class_id) THEN
          RAISE EXCEPTION 'Forbidden: not school admin or assigned teacher';
        END IF;
        IF NOT public.is_class_staff(p_to_class_id) THEN
          RAISE EXCEPTION 'Forbidden: not school admin or assigned teacher';
        END IF;
      END IF;

      SELECT username INTO v_student_name FROM users WHERE id = p_student_id;

      -- Remove from old class
      IF p_from_class_id IS NOT NULL THEN
        DELETE FROM class_students
        WHERE class_id = p_from_class_id AND student_id = p_student_id;
      END IF;

      -- Already in destination?
      IF EXISTS (SELECT 1 FROM class_students WHERE class_id = p_to_class_id AND student_id = p_student_id) THEN
        UPDATE users SET batch = v_to_class.class_code WHERE id = p_student_id;
        RETURN jsonb_build_object('success', true, 'message', 'Student already in destination class');
      END IF;

      INSERT INTO class_students (class_id, student_id) VALUES (p_to_class_id, p_student_id);
      UPDATE users SET batch = v_to_class.class_code WHERE id = p_student_id;

      RETURN jsonb_build_object(
        'success', true,
        'message', format('Student %%s moved to class %%s', COALESCE(v_student_name, 'Unknown'), v_to_class.class_code)
      );
    END;
    $fn$
  $cr$, v_fargs, v_ret);

  EXECUTE format(
    'REVOKE ALL ON FUNCTION public.move_student_between_classes(%s) FROM PUBLIC, anon',
    v_iargs
  );
  EXECUTE format(
    'GRANT EXECUTE ON FUNCTION public.move_student_between_classes(%s) TO authenticated',
    v_iargs
  );

  RAISE NOTICE '[E-3c] move_student_between_classes patched';
END;
$outer$;


-- ════════════════════════════════════════════════════════════
-- FIX #3d: bulk_add_students_to_class
-- ════════════════════════════════════════════════════════════
DO $outer$
DECLARE
  v_iargs text;
  v_fargs text;
  v_ret   text;
BEGIN
  SELECT pg_get_function_identity_arguments(p.oid),
         pg_get_function_arguments(p.oid),
         pg_get_function_result(p.oid)
    INTO v_iargs, v_fargs, v_ret
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'bulk_add_students_to_class'
  LIMIT 1;

  IF v_iargs IS NULL THEN
    RAISE NOTICE '[E-3d] bulk_add_students_to_class not found — skipping';
    RETURN;
  END IF;

  EXECUTE format('DROP FUNCTION public.bulk_add_students_to_class(%s)', v_iargs);

  EXECUTE format($cr$
    CREATE FUNCTION public.bulk_add_students_to_class(%s)
    RETURNS %s
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $fn$
    DECLARE
      v_class      RECORD;
      v_added      INT := 0;
      v_skipped    INT := 0;
      v_student_id UUID;
    BEGIN
      IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
      END IF;

      SELECT id, class_code, school_id INTO v_class
      FROM classes WHERE id = p_class_id;

      IF v_class IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Class not found');
      END IF;

      IF NOT public.is_class_staff(p_class_id) THEN
        RAISE EXCEPTION 'Forbidden: not school admin or assigned teacher';
      END IF;

      FOREACH v_student_id IN ARRAY p_student_ids
      LOOP
        IF EXISTS (SELECT 1 FROM class_students WHERE class_id = p_class_id AND student_id = v_student_id) THEN
          v_skipped := v_skipped + 1;
          CONTINUE;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM users
          WHERE id = v_student_id
            AND school_id = v_class.school_id
            AND COALESCE(role, 'student') = 'student'
        ) THEN
          v_skipped := v_skipped + 1;
          CONTINUE;
        END IF;

        INSERT INTO class_students (class_id, student_id) VALUES (p_class_id, v_student_id);
        UPDATE users SET batch = v_class.class_code WHERE id = v_student_id;
        v_added := v_added + 1;
      END LOOP;

      RETURN jsonb_build_object(
        'success', true,
        'added', v_added,
        'skipped', v_skipped,
        'message', format('Added %%s students to class %%s (skipped %%s)', v_added, v_class.class_code, v_skipped)
      );
    END;
    $fn$
  $cr$, v_fargs, v_ret);

  EXECUTE format(
    'REVOKE ALL ON FUNCTION public.bulk_add_students_to_class(%s) FROM PUBLIC, anon',
    v_iargs
  );
  EXECUTE format(
    'GRANT EXECUTE ON FUNCTION public.bulk_add_students_to_class(%s) TO authenticated',
    v_iargs
  );

  RAISE NOTICE '[E-3d] bulk_add_students_to_class patched';
END;
$outer$;


-- ════════════════════════════════════════════════════════════
-- FIX #3e: bulk_remove_students_from_class
-- ════════════════════════════════════════════════════════════
DO $outer$
DECLARE
  v_iargs text;
  v_fargs text;
  v_ret   text;
BEGIN
  SELECT pg_get_function_identity_arguments(p.oid),
         pg_get_function_arguments(p.oid),
         pg_get_function_result(p.oid)
    INTO v_iargs, v_fargs, v_ret
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'bulk_remove_students_from_class'
  LIMIT 1;

  IF v_iargs IS NULL THEN
    RAISE NOTICE '[E-3e] bulk_remove_students_from_class not found — skipping';
    RETURN;
  END IF;

  EXECUTE format('DROP FUNCTION public.bulk_remove_students_from_class(%s)', v_iargs);

  EXECUTE format($cr$
    CREATE FUNCTION public.bulk_remove_students_from_class(%s)
    RETURNS %s
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $fn$
    DECLARE
      v_removed INT;
    BEGIN
      IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
      END IF;

      IF NOT public.is_class_staff(p_class_id) THEN
        RAISE EXCEPTION 'Forbidden: not school admin or assigned teacher';
      END IF;

      DELETE FROM class_students
      WHERE class_id = p_class_id
        AND student_id = ANY(p_student_ids);

      GET DIAGNOSTICS v_removed = ROW_COUNT;

      UPDATE users SET batch = NULL WHERE id = ANY(p_student_ids);

      RETURN jsonb_build_object(
        'success', true,
        'removed', v_removed,
        'message', format('Removed %%s students from class', v_removed)
      );
    END;
    $fn$
  $cr$, v_fargs, v_ret);

  EXECUTE format(
    'REVOKE ALL ON FUNCTION public.bulk_remove_students_from_class(%s) FROM PUBLIC, anon',
    v_iargs
  );
  EXECUTE format(
    'GRANT EXECUTE ON FUNCTION public.bulk_remove_students_from_class(%s) TO authenticated',
    v_iargs
  );

  RAISE NOTICE '[E-3e] bulk_remove_students_from_class patched';
END;
$outer$;


-- ════════════════════════════════════════════════════════════
-- FIX #3f: get_class_statistics (also has no auth check)
-- ════════════════════════════════════════════════════════════
DO $outer$
DECLARE
  v_iargs text;
  v_fargs text;
  v_ret   text;
BEGIN
  SELECT pg_get_function_identity_arguments(p.oid),
         pg_get_function_arguments(p.oid),
         pg_get_function_result(p.oid)
    INTO v_iargs, v_fargs, v_ret
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_class_statistics'
  LIMIT 1;

  IF v_iargs IS NOT NULL THEN
    EXECUTE format(
      'REVOKE ALL ON FUNCTION public.get_class_statistics(%s) FROM PUBLIC, anon',
      v_iargs
    );
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION public.get_class_statistics(%s) TO authenticated',
      v_iargs
    );
    RAISE NOTICE '[E-3f] get_class_statistics permissions locked';
  ELSE
    RAISE NOTICE '[E-3f] get_class_statistics not found — skipping';
  END IF;
END;
$outer$;


-- ============================================================
-- VERIFICATION — paste separately after Success
-- ============================================================
--
-- 1. brains_heist functions now use teacher profile id (expect 'bh_teacher_profile_id' in body):
--    SELECT proname,
--           prosrc ILIKE '%bh_teacher_profile_id%' AS uses_profile_id,
--           prosrc ILIKE '%Not authenticated%' AS has_auth_check
--    FROM pg_proc p
--    JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public'
--      AND proname IN ('brains_heist_update_question', 'brains_heist_delete_question');
--    -- Expect: uses_profile_id = true, has_auth_check = true for both
--
-- 2. Class roster functions now have auth checks (expect all true):
--    SELECT proname,
--           prosrc ILIKE '%Not authenticated%' AS has_auth_check,
--           prosrc ILIKE '%is_class_staff%' OR prosrc ILIKE '%is_school_admin_of%' AS has_role_gate
--    FROM pg_proc p
--    JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public'
--      AND proname IN (
--        'add_student_to_class',
--        'remove_student_from_class',
--        'move_student_between_classes',
--        'bulk_add_students_to_class',
--        'bulk_remove_students_from_class'
--      );
--    -- Expect: has_auth_check = true, has_role_gate = true for all 5
--
-- 3. is_class_staff helper exists:
--    SELECT proname FROM pg_proc p
--    JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public' AND p.proname = 'is_class_staff';
--
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- FIX #5: Unify config flags — admin RPCs use 'app.admin_override'
--   but the trigger only checks 'app.allow_xp_level_write'.
--   The admin RPCs work today solely because of the superadmin
--   bypass in the trigger — the config flag is dead code.
--
--   FIX: Change all 3 admin RPCs to set 'app.allow_xp_level_write'
--        so they work via both mechanisms (defense-in-depth).
-- ════════════════════════════════════════════════════════════

-- FIX #5a: rpc_admin_grant
DO $outer$
DECLARE
  v_iargs text;
  v_fargs text;
  v_ret   text;
BEGIN
  SELECT pg_get_function_identity_arguments(p.oid),
         pg_get_function_arguments(p.oid),
         pg_get_function_result(p.oid)
    INTO v_iargs, v_fargs, v_ret
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'rpc_admin_grant'
  LIMIT 1;

  IF v_iargs IS NULL THEN
    RAISE NOTICE '[E-5a] rpc_admin_grant not found — skipping';
    RETURN;
  END IF;

  EXECUTE format('DROP FUNCTION public.rpc_admin_grant(%s)', v_iargs);

  EXECUTE format($cr$
    CREATE FUNCTION public.rpc_admin_grant(%s)
    RETURNS %s
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $fn$
    BEGIN
      IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
      END IF;

      IF NOT EXISTS (SELECT 1 FROM public.superadmins s WHERE s.user_id = auth.uid()) THEN
        RAISE EXCEPTION 'Forbidden';
      END IF;

      -- unified flag: same key the trigger checks
      PERFORM set_config('app.allow_xp_level_write', '1', true);

      UPDATE public.users u
      SET xp    = coalesce(u.xp, 0)    + coalesce(p_xp_delta, 0),
          coins = coalesce(u.coins, 0) + coalesce(p_coins_delta, 0)
      WHERE u.id = p_user_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'User not found';
      END IF;
    END;
    $fn$
  $cr$, v_fargs, v_ret);

  RAISE NOTICE '[E-5a] rpc_admin_grant patched';
END;
$outer$;


-- FIX #5b: rpc_admin_reset_user
DO $outer$
DECLARE
  v_iargs text;
  v_fargs text;
  v_ret   text;
BEGIN
  SELECT pg_get_function_identity_arguments(p.oid),
         pg_get_function_arguments(p.oid),
         pg_get_function_result(p.oid)
    INTO v_iargs, v_fargs, v_ret
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'rpc_admin_reset_user'
  LIMIT 1;

  IF v_iargs IS NULL THEN
    RAISE NOTICE '[E-5b] rpc_admin_reset_user not found — skipping';
    RETURN;
  END IF;

  EXECUTE format('DROP FUNCTION public.rpc_admin_reset_user(%s)', v_iargs);

  EXECUTE format($cr$
    CREATE FUNCTION public.rpc_admin_reset_user(%s)
    RETURNS %s
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $fn$
    BEGIN
      IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
      END IF;

      IF NOT EXISTS (SELECT 1 FROM public.superadmins s WHERE s.user_id = auth.uid()) THEN
        RAISE EXCEPTION 'Forbidden';
      END IF;

      PERFORM set_config('app.allow_xp_level_write', '1', true);

      UPDATE public.users u
      SET xp = 0,
          coins = 0,
          gemstones = 0,
          streak = 0,
          level = 1,
          ap_now = u.ap_max
      WHERE u.id = p_user_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'User not found';
      END IF;

      DELETE FROM public.brains_heist_student_attempts WHERE student_id = p_user_id;
      DELETE FROM public.brains_heist_topic_stats WHERE student_id = p_user_id;
      DELETE FROM public.brains_heist_task_group_stats WHERE student_id = p_user_id;
      DELETE FROM public.brains_heist_progress_map WHERE student_id = p_user_id;
    END;
    $fn$
  $cr$, v_fargs, v_ret);

  RAISE NOTICE '[E-5b] rpc_admin_reset_user patched';
END;
$outer$;


-- FIX #5c: rpc_admin_set_level
DO $outer$
DECLARE
  v_iargs text;
  v_fargs text;
  v_ret   text;
BEGIN
  SELECT pg_get_function_identity_arguments(p.oid),
         pg_get_function_arguments(p.oid),
         pg_get_function_result(p.oid)
    INTO v_iargs, v_fargs, v_ret
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'rpc_admin_set_level'
  LIMIT 1;

  IF v_iargs IS NULL THEN
    RAISE NOTICE '[E-5c] rpc_admin_set_level not found — skipping';
    RETURN;
  END IF;

  EXECUTE format('DROP FUNCTION public.rpc_admin_set_level(%s)', v_iargs);

  EXECUTE format($cr$
    CREATE FUNCTION public.rpc_admin_set_level(%s)
    RETURNS %s
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $fn$
    BEGIN
      IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
      END IF;

      IF NOT EXISTS (SELECT 1 FROM public.superadmins s WHERE s.user_id = auth.uid()) THEN
        RAISE EXCEPTION 'Forbidden';
      END IF;

      PERFORM set_config('app.allow_xp_level_write', '1', true);

      UPDATE public.users u
      SET level = p_level
      WHERE u.id = p_user_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'User not found';
      END IF;
    END;
    $fn$
  $cr$, v_fargs, v_ret);

  RAISE NOTICE '[E-5c] rpc_admin_set_level patched';
END;
$outer$;


-- ============================================================
-- FIX #5 VERIFICATION — paste separately after Success
-- ============================================================
--
-- All 3 admin RPCs + submit_mcq now use the SAME config key (expect 0 rows with 'admin_override'):
--    SELECT proname,
--           prosrc ILIKE '%allow_xp_level_write%' AS uses_correct_flag,
--           prosrc ILIKE '%admin_override%' AS uses_old_flag
--    FROM pg_proc p
--    JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public'
--      AND proname IN (
--        'rpc_admin_grant',
--        'rpc_admin_reset_user',
--        'rpc_admin_set_level',
--        'rpc_submit_mcq_answer'
--      );
--    -- Expect: uses_correct_flag = true, uses_old_flag = false for all 4
--
-- ============================================================
