-- ════════════════════════════════════════════════════════════════════════════
-- TEACHER QUEST CREATOR — Schema & Policy Migration
-- Run this AFTER QUEST_MODE_V2_MIGRATION.sql
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Add created_by column so we know who owns each mission
ALTER TABLE quest_missions
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

-- 2. Update SELECT policy: still show all active missions, PLUS any mission
--    the authenticated user created (so teachers can preview drafts)
DROP POLICY IF EXISTS quest_missions_select ON quest_missions;
CREATE POLICY quest_missions_select ON quest_missions
  FOR SELECT TO authenticated
  USING (is_active = true OR created_by = auth.uid());

-- 3. Teacher INSERT policy (teachers can insert their own missions)
CREATE POLICY quest_missions_teacher_insert ON quest_missions
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid() AND
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'teacher')
  );

-- 4. Teacher UPDATE policy (teachers can edit only their own missions)
CREATE POLICY quest_missions_teacher_update ON quest_missions
  FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid() AND
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'teacher')
  )
  WITH CHECK (
    created_by = auth.uid()
  );

-- 5. Teacher DELETE policy (teachers can delete only their own missions)
CREATE POLICY quest_missions_teacher_delete ON quest_missions
  FOR DELETE TO authenticated
  USING (
    created_by = auth.uid() AND
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'teacher')
  );


-- ════════════════════════════════════════════════════════════════════════════
-- 6. RPC: rpc_teacher_create_quest_mission
--    Teachers call this to create a new quest mission from their question bank.
--    Auto-builds the route: START → question nodes → reward → final_chest
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION rpc_teacher_create_quest_mission(
  p_title       TEXT,
  p_subject     TEXT,
  p_question_ids UUID[],
  p_difficulty  TEXT    DEFAULT 'medium',
  p_description TEXT    DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_mission_id   UUID;
  v_route        JSONB := '[]'::jsonb;
  v_qid          UUID;
  v_idx          INTEGER := 0;
  v_code         TEXT;
  v_total        INTEGER;
BEGIN
  -- Only teachers may create missions
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'teacher') THEN
    RAISE EXCEPTION 'Forbidden: only teachers can create quest missions';
  END IF;

  v_total := array_length(p_question_ids, 1);

  IF v_total IS NULL OR v_total = 0 THEN
    RAISE EXCEPTION 'At least one question is required';
  END IF;

  IF v_total > 20 THEN
    RAISE EXCEPTION 'A quest may contain at most 20 question nodes';
  END IF;

  -- START node
  v_route := v_route || jsonb_build_array(
    jsonb_build_object('index', 0, 'type', 'start', 'label', 'Mission Start')
  );

  v_idx := 1;
  FOREACH v_qid IN ARRAY p_question_ids LOOP
    -- Validate the question belongs to this teacher
    IF NOT EXISTS (
      SELECT 1 FROM questions
      WHERE id = v_qid
        AND (teacher_id = auth.uid() OR is_public = true)
    ) THEN
      RAISE EXCEPTION 'Question % is not accessible to this teacher', v_qid;
    END IF;

    v_route := v_route || jsonb_build_array(
      jsonb_build_object(
        'index',       v_idx,
        'type',        CASE WHEN v_idx = v_total THEN 'elite_question' ELSE 'question' END,
        'label',       'Station ' || v_idx,
        'difficulty',  p_difficulty,
        'question_id', v_qid
      )
    );
    v_idx := v_idx + 1;
  END LOOP;

  -- REWARD node
  v_route := v_route || jsonb_build_array(
    jsonb_build_object('index', v_idx, 'type', 'reward', 'label', 'Supply Cache')
  );
  v_idx := v_idx + 1;

  -- FINAL CHEST node
  v_route := v_route || jsonb_build_array(
    jsonb_build_object('index', v_idx, 'type', 'final_chest', 'label', 'Mission Vault')
  );

  -- Generate a unique slug-style code
  v_code := 'teacher_' ||
    lower(regexp_replace(p_title, '[^a-zA-Z0-9]+', '_', 'g')) ||
    '_' || floor(random() * 9000 + 1000)::text;

  INSERT INTO quest_missions (
    subject, code, title, description,
    mission_type, difficulty, route_template,
    energy_cost, sort_order, is_active, created_by
  )
  VALUES (
    p_subject, v_code, p_title,
    COALESCE(p_description, 'Teacher-created quest mission'),
    'standard', p_difficulty, v_route,
    0, 999, false, auth.uid()
  )
  RETURNING id INTO v_mission_id;

  RETURN v_mission_id;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_teacher_create_quest_mission TO authenticated;


-- ════════════════════════════════════════════════════════════════════════════
-- 7. Update rpc_quest_get_missions to also return teacher's own missions
--    (The existing function uses is_active = true; we extend it to also return
--    drafts owned by the caller so teachers can preview their own quests.)
-- ════════════════════════════════════════════════════════════════════════════
-- NOTE: If rpc_quest_get_missions already relies on RLS, the updated SELECT
-- policy from step 2 above is sufficient — no RPC change needed.
-- Only run the block below if rpc_quest_get_missions uses SECURITY DEFINER
-- and bypasses RLS with an explicit WHERE is_active = true filter.

-- (No change needed if RLS covers it. Verify in your Supabase dashboard.)
