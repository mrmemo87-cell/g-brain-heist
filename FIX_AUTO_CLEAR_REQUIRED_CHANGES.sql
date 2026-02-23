-- ============================================================
-- AUTO-CLEAR required_changes when student updates profile
-- ============================================================
-- When a student changes their username or avatar_url, this
-- trigger automatically clears the corresponding flag from
-- required_changes. Once all flags are cleared, the entire
-- required_changes column is set to NULL and profile_locked
-- is set to FALSE, restoring the student's access.
-- ============================================================

CREATE OR REPLACE FUNCTION auto_clear_required_changes()
RETURNS TRIGGER AS $$
DECLARE
  rc jsonb;
  username_needed boolean;
  avatar_needed boolean;
BEGIN
  -- Only process if required_changes is set
  rc := NEW.required_changes;
  IF rc IS NULL THEN
    RETURN NEW;
  END IF;

  username_needed := COALESCE((rc->>'username')::boolean, false);
  avatar_needed   := COALESCE((rc->>'avatar')::boolean, false);

  -- If username was required and has now changed, clear that flag
  IF username_needed AND (OLD.username IS DISTINCT FROM NEW.username) THEN
    rc := rc - 'username';
  END IF;

  -- If avatar was required and has now changed, clear that flag
  IF avatar_needed AND (OLD.avatar_url IS DISTINCT FROM NEW.avatar_url) THEN
    rc := rc - 'avatar';
  END IF;

  -- Check if all required changes are now done
  -- (only 'reason' key might remain, which isn't actionable)
  IF NOT COALESCE((rc->>'username')::boolean, false)
     AND NOT COALESCE((rc->>'avatar')::boolean, false) THEN
    -- All done — fully clear
    NEW.required_changes := NULL;
    NEW.profile_locked   := FALSE;
  ELSE
    NEW.required_changes := rc;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if any
DROP TRIGGER IF EXISTS trg_auto_clear_required_changes ON public.users;

-- Create trigger BEFORE UPDATE so it modifies the row in-flight
CREATE TRIGGER trg_auto_clear_required_changes
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  WHEN (OLD.required_changes IS NOT NULL)
  EXECUTE FUNCTION auto_clear_required_changes();

-- ============================================================
-- Verification
-- ============================================================
DO $$
BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE trigger_name = 'trg_auto_clear_required_changes'
      AND event_object_table = 'users'
  ), 'FAIL: trg_auto_clear_required_changes trigger not found';
  RAISE NOTICE '✅ auto_clear_required_changes trigger installed';
END;
$$;
