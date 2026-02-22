-- ============================================================
-- SECURITY PATCH WAVE 2 — Remaining SECURITY DEFINER fixes
-- ============================================================
-- Run this in Supabase SQL Editor in one go.
-- Fixes:
--   1. CRITICAL  create_teacher_profile   — any user can self-promote to teacher
--   2. CRITICAL  regenerate_user_ap       — anyone can regen AP for any user
--   3. CRITICAL  finalize_raid            — ZERO auth, anyone can end any raid
--   4. HIGH      submit_raid_answer       — client controls damage_delta
--   5. HIGH      get_public_profile       — leaks coins, gems, AP, attack/defense
--   6. MEDIUM    record_question_attempt  — missing auth null check & search_path
--   7. MEDIUM    rpc_get_users_with_neon  — missing search_path, anon access
--   8. MEDIUM    create_raid / join_raid  — missing auth null check
--   9. MEDIUM    get_raid_status          — missing auth null check
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. CRITICAL — create_teacher_profile
--    Vulnerability: ANY authenticated user can call this to set their
--    role = 'teacher' and insert a row in the teachers table.
--    Fix: Only allow users whom an admin has pre-approved (users.role
--    must already be 'teacher' or 'admin') OR already exist in an
--    invite/approval table.  Simplest safe approach: require that the
--    caller's current role is already 'teacher' (set by an admin) or
--    that they are an admin.  This means create_teacher_profile just
--    creates the teachers-table record — it no longer PROMOTES a user.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION create_teacher_profile(
  p_school_name TEXT DEFAULT NULL,
  p_subject_specializations TEXT[] DEFAULT NULL,
  p_bio TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_teacher_id UUID;
  v_caller_role TEXT;
BEGIN
  -- Auth guard
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Only allow if admin pre-set the user's role to 'teacher' or they are admin
  SELECT role INTO v_caller_role FROM users WHERE id = auth.uid();

  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;

  IF v_caller_role NOT IN ('teacher', 'admin') THEN
    RAISE EXCEPTION 'permission_denied: your account must be approved as a teacher by an admin first';
  END IF;

  -- Prevent duplicate profile
  IF EXISTS (SELECT 1 FROM teachers WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'User already has a teacher profile';
  END IF;

  -- Create teacher profile (do NOT change role — it was already set by admin)
  INSERT INTO teachers (user_id, school_name, subject_specializations, bio)
  VALUES (auth.uid(), p_school_name, p_subject_specializations, p_bio)
  RETURNING id INTO v_teacher_id;

  RETURN v_teacher_id;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 2. CRITICAL — regenerate_user_ap
--    Vulnerability: Accepts arbitrary user_id_param; any caller can
--    regen AP for someone else, or spam to inflate their own AP timing.
--    Fix: Ignore user_id_param from client; always use auth.uid().
--    Frontend already passes the caller's own ID, so behaviour is unchanged.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION regenerate_user_ap(user_id_param uuid)
RETURNS TABLE (
  new_ap int,
  ap_regenerated int,
  minutes_elapsed int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user record;
  v_minutes int;
  v_regen int;
  v_new_ap int;
  v_uid uuid;
BEGIN
  -- Auth guard
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Always use the caller's own ID regardless of what was sent
  v_uid := auth.uid();

  SELECT
    u.ap_now,
    u.ap_max,
    coalesce(u.last_ap_update, now()) AS last_ap_update
  INTO v_user
  FROM users u
  WHERE u.id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;

  v_minutes := greatest(0, extract(epoch from (now() - v_user.last_ap_update))::int / 60);
  v_regen := v_minutes / 10;

  IF v_regen > 0 AND v_user.ap_now < v_user.ap_max THEN
    v_new_ap := least(v_user.ap_now + v_regen, v_user.ap_max);

    UPDATE users
    SET ap_now = v_new_ap,
        last_ap_update = now(),
        updated_at = now()
    WHERE id = v_uid;

    RETURN QUERY SELECT v_new_ap, v_new_ap - v_user.ap_now, v_minutes;
  ELSE
    RETURN QUERY SELECT v_user.ap_now, 0, v_minutes;
  END IF;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 3. CRITICAL — finalize_raid  (ZERO auth — anyone can end any raid)
--    Fix: Only the raid creator or an admin can finalize.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION finalize_raid(p_raid_id UUID)
RETURNS TABLE(raid_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creator UUID;
BEGIN
  -- Auth guard
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Only the raid creator or an admin may finalize
  SELECT created_by INTO v_creator FROM raids WHERE id = p_raid_id;

  IF v_creator IS NULL THEN
    RAISE EXCEPTION 'raid_not_found';
  END IF;

  IF v_creator <> auth.uid() AND NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'permission_denied: only raid creator or admin can finalize';
  END IF;

  UPDATE raids
  SET status = 'completed',
      ends_at = NOW(),
      updated_at = NOW()
  WHERE id = p_raid_id;

  INSERT INTO raid_events (raid_id, event_type, payload)
  VALUES (p_raid_id, 'raid_finalized', jsonb_build_object('ended_at', NOW()));

  raid_id := p_raid_id;
  RETURN NEXT;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 4. HIGH — submit_raid_answer
--    Vulnerability: Client sends damage_delta inside payload JSON and
--    the DB trusts it blindly, writing it to raid_waves and
--    raid_participants.  A hacked client can send damage = 999999.
--    Fix: Cap damage_delta at 50 per answer submission and floor at 0.
--    Also add auth null check.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION submit_raid_answer(p_raid_id UUID, p_question_id TEXT, p_answer TEXT, p_time NUMERIC)
RETURNS TABLE(event_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    uid UUID := auth.uid();
    participant UUID;
    payload JSONB := COALESCE(p_answer::jsonb, jsonb_build_object('answer', p_answer));
    damage_delta INTEGER;
    penalty_seconds INTEGER := LEAST(COALESCE((payload->>'penaltySeconds')::INT, 0), 30);
    current_wave UUID;
BEGIN
    -- Auth guard
    IF uid IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;

    -- Server-side cap on damage: 0..50 per submission
    damage_delta := LEAST(GREATEST(COALESCE((payload->>'damage')::INT, 0), 0), 50);

    SELECT id INTO participant FROM raid_participants WHERE raid_id = p_raid_id AND user_id = uid;

    -- Must be a participant to submit answers
    IF participant IS NULL THEN
        RAISE EXCEPTION 'not_a_participant';
    END IF;

    INSERT INTO raid_events (raid_id, participant_id, event_type, payload)
    VALUES (
        p_raid_id,
        participant,
        'answer_submitted',
        jsonb_build_object(
            'question_id', p_question_id,
            'time_spent', p_time + penalty_seconds,
            'details', payload
        )
    ) RETURNING id INTO event_id;

    SELECT rw.id INTO current_wave
    FROM raid_waves rw
    WHERE rw.raid_id = p_raid_id AND rw.completed = FALSE
    ORDER BY rw.wave_number
    LIMIT 1;

    IF current_wave IS NOT NULL AND damage_delta > 0 THEN
        UPDATE raid_waves
        SET damage = LEAST(boss_hp, damage + damage_delta),
            completed = damage + damage_delta >= boss_hp
        WHERE id = current_wave;
    END IF;

    UPDATE raid_participants
    SET damage = damage + damage_delta,
        answers_submitted = answers_submitted + 1,
        last_active = NOW()
    WHERE id = participant;

    RETURN NEXT;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 5. HIGH — get_public_profile
--    Vulnerability: Returns coins, gemstones, ap_now, ap_max,
--    attack_power, defense_power — info opponents can exploit.
--    Fix: Return only cosmetic / leaderboard-safe fields.
--    Frontend still gets id, username, avatar_url, level, xp, streak,
--    pvp_score, bio, batch, grade, role, last_seen.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_public_profile(target_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    result JSON;
BEGIN
    -- Auth guard
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;

    SELECT json_build_object(
        'id', u.id,
        'username', u.username,
        'avatar_url', u.avatar_url,
        'level', u.level,
        'xp', u.xp,
        'streak', u.streak,
        'pvp_score', u.pvp_score,
        'bio', u.bio,
        'batch', u.batch,
        'grade', u.grade,
        'role', u.role,
        'last_seen', u.last_seen
    )
    INTO result
    FROM users u
    WHERE u.id = target_user_id;

    RETURN result;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 6. MEDIUM — record_question_attempt
--    Missing: search_path, auth null check
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION record_question_attempt(
  p_question_id UUID,
  p_answer_given TEXT,
  p_time_taken INTEGER DEFAULT NULL,
  p_quest_session_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_question RECORD;
  v_is_correct BOOLEAN;
  v_points_earned INTEGER := 0;
BEGIN
  -- Auth guard
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Get question details
  SELECT * INTO v_question FROM questions WHERE id = p_question_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Question not found';
  END IF;

  -- Check if answer is correct (case-insensitive comparison)
  v_is_correct := LOWER(TRIM(p_answer_given)) = LOWER(TRIM(v_question.correct_answer));

  -- Calculate points (cap at 100 to prevent tampered question rows)
  IF v_is_correct THEN
    v_points_earned := LEAST(v_question.points, 100);
  END IF;

  -- Record the attempt
  INSERT INTO question_attempts (
    student_id, question_id, quest_session_id,
    answer_given, is_correct, time_taken, points_earned
  ) VALUES (
    auth.uid(), p_question_id, p_quest_session_id,
    p_answer_given, v_is_correct, p_time_taken, v_points_earned
  );

  -- Update question stats
  UPDATE questions
  SET times_answered = times_answered + 1,
      times_correct = times_correct + (CASE WHEN v_is_correct THEN 1 ELSE 0 END)
  WHERE id = p_question_id;

  -- Return result
  RETURN jsonb_build_object(
    'is_correct', v_is_correct,
    'points_earned', v_points_earned,
    'correct_answer', v_question.correct_answer,
    'explanation', v_question.explanation
  );
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 7. MEDIUM — rpc_get_users_with_neon
--    Missing: search_path.  Also granted to anon (unnecessary).
--    Fix: Add search_path, revoke anon access.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_get_users_with_neon(p_user_ids UUID[])
RETURNS TABLE (user_id UUID) AS $$
BEGIN
  -- Auth guard
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  RETURN QUERY
  SELECT DISTINCT inv.user_id
  FROM inventory inv
  WHERE inv.user_id = ANY(p_user_ids)
    AND inv.state = 'active'
    AND inv.kind = 'cosmetic'
    AND inv.item_id = 'item_cosmetic_frame';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- Keep authenticated, revoke anon
REVOKE EXECUTE ON FUNCTION rpc_get_users_with_neon(UUID[]) FROM anon;
GRANT EXECUTE ON FUNCTION rpc_get_users_with_neon(UUID[]) TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 8. MEDIUM — create_raid / join_raid — add auth null checks
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION create_raid(p_boss_id TEXT, p_wave_info JSONB)
RETURNS TABLE(raid_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    new_raid_id UUID;
    creator UUID;
    wave JSONB;
BEGIN
    -- Auth guard
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;

    creator := auth.uid();

    INSERT INTO raids (boss_id, created_by, status, wave_config)
    VALUES (p_boss_id, creator, 'scheduled', p_wave_info)
    RETURNING id INTO new_raid_id;

    IF p_wave_info ? 'waves' THEN
        FOR wave IN SELECT * FROM jsonb_array_elements(p_wave_info->'waves') LOOP
            INSERT INTO raid_waves (raid_id, wave_number, difficulty, score_threshold, boss_hp, spike_questions)
            VALUES (
                new_raid_id,
                COALESCE((wave->>'waveNumber')::INT, 1),
                COALESCE(wave->>'difficulty', 'easy'),
                COALESCE((wave->>'scoreThreshold')::INT, 5),
                COALESCE((wave->>'bossHp')::INT, 300),
                COALESCE((wave->>'spikeQuestions')::INT, 2)
            );
        END LOOP;
    END IF;

    raid_id := new_raid_id;
    RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION join_raid(p_raid_id UUID)
RETURNS TABLE(participant_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    uid UUID;
BEGIN
    -- Auth guard
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;

    uid := auth.uid();

    INSERT INTO raid_participants (raid_id, user_id, username)
    VALUES (
        p_raid_id,
        uid,
        COALESCE(
            (SELECT username FROM users WHERE id = uid),
            'Anonymous Agent'
        )
    )
    ON CONFLICT (raid_id, user_id)
    DO UPDATE SET last_active = NOW()
    RETURNING id INTO participant_id;

    RETURN NEXT;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 9. MEDIUM — get_raid_status — add auth null check
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_raid_status(p_raid_id UUID)
RETURNS TABLE (
    id UUID,
    boss_id TEXT,
    status TEXT,
    wave_config JSONB,
    reward_pool JSONB,
    starts_at TIMESTAMPTZ,
    ends_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT r.id, r.boss_id, r.status, r.wave_config, r.reward_pool, r.starts_at, r.ends_at, r.created_at
    FROM raids r
    WHERE r.id = p_raid_id;
$$;

-- NOTE: get_raid_status is SQL-language, so we can't add IF auth.uid() IS NULL
-- inside it.  To protect it, revoke anon and rely on the GRANT:
REVOKE EXECUTE ON FUNCTION get_raid_status(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION get_raid_status(UUID) TO authenticated;


-- ============================================================
-- VERIFICATION — run this after the patch to confirm everything took effect
-- ============================================================
-- Paste the block below separately if you want to verify:
--
--   SELECT proname, prosecdef,
--          (SELECT string_agg(s, ', ') FROM unnest(proconfig) s) AS config
--   FROM   pg_proc
--   WHERE  proname IN (
--     'create_teacher_profile',
--     'regenerate_user_ap',
--     'finalize_raid',
--     'submit_raid_answer',
--     'get_public_profile',
--     'record_question_attempt',
--     'rpc_get_users_with_neon',
--     'create_raid',
--     'join_raid',
--     'get_raid_status'
--   )
--   AND    pronamespace = 'public'::regnamespace
--   ORDER BY proname;
--
-- Expected: every row shows prosecdef = true and
--           config contains 'search_path=public'
-- ============================================================
