-- ============================================
-- ADD SCHOOL COLUMN TO USERS TABLE
-- Run this in Supabase SQL Editor
-- ============================================

-- Step 1: Add school column if it doesn't exist
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS school TEXT;

-- Step 2: Set all existing users to "Silk Road International School"
UPDATE public.users
SET school = 'Silk Road International School'
WHERE school IS NULL OR school = '';

-- Step 3: Set default for new users
ALTER TABLE public.users ALTER COLUMN school SET DEFAULT 'Silk Road International School';

-- Step 4: Create an RPC function to reset school, grade, and class
-- This allows admins to reset a user's academic info so they can re-select
CREATE OR REPLACE FUNCTION rpc_admin_reset_user_academics(p_user_id UUID)
RETURNS TABLE (
  user_id UUID,
  school TEXT,
  grade INT,
  batch TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_row users%ROWTYPE;
BEGIN
  -- Check admin permission
  IF v_actor IS NULL OR NOT is_current_user_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Update the user - set school, grade, batch to NULL to force re-selection
  UPDATE users
  SET 
    school = NULL,
    grade = NULL,
    batch = NULL,
    updated_at = NOW()
  WHERE id = p_user_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;

  -- Log the action
  BEGIN
    INSERT INTO rpc_event_log(function_name, log_level, message, user_id, context)
    VALUES ('rpc_admin_reset_user_academics', 'info', 'academics_reset', v_actor, 
            json_build_object('target', p_user_id));
  EXCEPTION WHEN OTHERS THEN
    NULL; -- Ignore logging errors
  END;

  RETURN QUERY SELECT v_row.id, v_row.school, v_row.grade::INT, v_row.batch;

EXCEPTION WHEN OTHERS THEN
  BEGIN
    INSERT INTO rpc_event_log(function_name, log_level, message, user_id, context)
    VALUES ('rpc_admin_reset_user_academics', 'error', SQLERRM, v_actor, 
            json_build_object('target', p_user_id));
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RAISE;
END;
$$;

-- Grant execute permission to authenticated users (RLS handles admin check)
GRANT EXECUTE ON FUNCTION rpc_admin_reset_user_academics(UUID) TO authenticated;

-- Verify the changes
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'users' AND column_name IN ('school', 'grade', 'batch');
