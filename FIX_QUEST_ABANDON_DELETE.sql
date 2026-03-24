-- ============================================================
-- FIX: Make abandon DELETE the run instead of changing status
-- ============================================================
-- The CHECK constraint blocks status='abandoned', so we just
-- delete the run and its nodes outright.  Run this in Supabase SQL Editor.
-- ============================================================

-- 1. Fix the CHECK constraint (belt-and-suspenders)
ALTER TABLE quest_runs DROP CONSTRAINT IF EXISTS quest_runs_status_check;
ALTER TABLE quest_runs ADD CONSTRAINT quest_runs_status_check
  CHECK (status IN ('active', 'completed', 'retreated', 'abandoned'));

-- 2. Clean up any currently stuck active runs
DELETE FROM quest_run_nodes WHERE run_id IN (SELECT id FROM quest_runs WHERE status = 'active');
DELETE FROM quest_runs WHERE status = 'active';

-- 3. Replace rpc_quest_abandon — now DELETES the run instead of updating status
CREATE OR REPLACE FUNCTION public.rpc_quest_abandon(
  p_run_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_run RECORD;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_run
  FROM quest_runs
  WHERE id = p_run_id AND user_id = v_user_id AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active quest run found';
  END IF;

  -- Delete child nodes first (FK), then the run itself
  DELETE FROM quest_run_nodes WHERE run_id = p_run_id;
  DELETE FROM quest_runs WHERE id = p_run_id;

  RETURN jsonb_build_object(
    'status', 'deleted',
    'run_id', p_run_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_quest_abandon(UUID) TO authenticated;
