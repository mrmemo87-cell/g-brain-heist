-- ============================================================================
-- FIX ACHIEVEMENT ERRORS
-- ============================================================================
-- Error 1: GET activities?select=amount... 400 - activities table doesn't have 'amount' column
-- Error 2: POST rpc_check_achievements 400 - Function uses 'detail' column but table has 'data'
-- Error 3: null value in column "target" - user_achievements.target is NOT NULL but insert doesn't specify it
--
-- Root causes:
-- 1. The activities table uses 'data' column, not 'detail' or 'amount'
-- 2. The user_achievements table has progress/target columns that may have NOT NULL constraint
-- 3. The rpc_check_achievements function needs to be updated
-- ============================================================================

-- ============================================================================
-- FIX 1: Make user_achievements.target nullable (if it exists)
-- ============================================================================
-- The target column should be nullable since some achievements don't track progress

DO $$
BEGIN
  -- Check if target column exists and make it nullable
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_achievements' AND column_name = 'target'
  ) THEN
    ALTER TABLE user_achievements ALTER COLUMN target DROP NOT NULL;
    RAISE NOTICE 'Made user_achievements.target nullable';
  END IF;
  
  -- Also make progress nullable if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_achievements' AND column_name = 'progress'
  ) THEN
    ALTER TABLE user_achievements ALTER COLUMN progress DROP NOT NULL;
    RAISE NOTICE 'Made user_achievements.progress nullable';
  END IF;
END;
$$;

-- ============================================================================
-- FIX 2: Update rpc_check_achievements to handle nullable columns and correct schema
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_check_achievements(p_user_id UUID)
RETURNS TABLE(
  newly_earned JSONB
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_achievement RECORD;
  v_current_value INTEGER;
  v_newly_earned JSONB := '[]'::JSONB;
  v_achievement_json JSONB;
  v_user_xp INTEGER;
  v_user_coins INTEGER;
  v_user_level INTEGER;
  v_user_streak INTEGER;
  v_user_correct_answers INTEGER;
  v_user_clan_id UUID;
  v_username TEXT;
  v_pvp_wins INTEGER;
  v_quests_completed INTEGER;
  v_items_purchased INTEGER;
  v_has_progress_column BOOLEAN;
  v_has_target_column BOOLEAN;
BEGIN
  -- Check if progress/target columns exist
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_achievements' AND column_name = 'progress'
  ) INTO v_has_progress_column;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_achievements' AND column_name = 'target'
  ) INTO v_has_target_column;

  -- Get user profile - fetch only columns that definitely exist
  SELECT 
    COALESCE(xp, 0),
    COALESCE(coins, 0),
    COALESCE(level, 1),
    COALESCE(streak, 0),
    username
  INTO v_user_xp, v_user_coins, v_user_level, v_user_streak, v_username
  FROM users WHERE id = p_user_id;
  
  IF v_username IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  -- Try to get optional columns that may not exist
  BEGIN
    EXECUTE 'SELECT correct_answers FROM users WHERE id = $1' INTO v_user_correct_answers USING p_user_id;
  EXCEPTION WHEN undefined_column THEN
    v_user_correct_answers := 0;
  END;

  BEGIN
    EXECUTE 'SELECT clan_id FROM users WHERE id = $1' INTO v_user_clan_id USING p_user_id;
  EXCEPTION WHEN undefined_column THEN
    v_user_clan_id := NULL;
  END;

  -- Count PvP wins (check if activities table has the data)
  BEGIN
    SELECT COUNT(*) INTO v_pvp_wins 
    FROM activities 
    WHERE actor_id = p_user_id AND kind = 'pvp_win';
  EXCEPTION WHEN OTHERS THEN
    v_pvp_wins := 0;
  END;

  -- Count completed quests
  BEGIN
    SELECT COUNT(*) INTO v_quests_completed 
    FROM activities 
    WHERE actor_id = p_user_id AND kind = 'quest_complete';
  EXCEPTION WHEN OTHERS THEN
    v_quests_completed := 0;
  END;

  -- Count items purchased
  BEGIN
    SELECT COUNT(*) INTO v_items_purchased 
    FROM activities 
    WHERE actor_id = p_user_id AND kind = 'shop_purchase';
  EXCEPTION WHEN OTHERS THEN
    v_items_purchased := 0;
  END;

  -- Loop through all achievements
  FOR v_achievement IN 
    SELECT * FROM achievements 
    WHERE condition_type IS NOT NULL 
      AND condition_value IS NOT NULL
  LOOP
    -- Skip if already earned
    IF EXISTS (
      SELECT 1 FROM user_achievements 
      WHERE user_id = p_user_id 
        AND achievement_id = v_achievement.id
        AND (earned_at IS NOT NULL OR unlocked_at IS NOT NULL)
    ) THEN
      CONTINUE;
    END IF;

    -- Check condition
    v_current_value := 0;
    CASE v_achievement.condition_type
      WHEN 'pvp_wins_count', 'pvp_wins' THEN
        v_current_value := v_pvp_wins;
      WHEN 'total_xp' THEN
        v_current_value := v_user_xp;
      WHEN 'quests_completed' THEN
        v_current_value := v_quests_completed;
      WHEN 'coins_earned', 'total_coins_earned' THEN
        v_current_value := v_user_coins;
      WHEN 'items_purchased' THEN
        v_current_value := v_items_purchased;
      WHEN 'clan_member', 'clan_joined' THEN
        v_current_value := CASE WHEN v_user_clan_id IS NOT NULL THEN 1 ELSE 0 END;
      WHEN 'level' THEN
        v_current_value := v_user_level;
      WHEN 'login_count' THEN
        v_current_value := 1; -- If they're here, they've logged in
      WHEN 'streak' THEN
        v_current_value := v_user_streak;
      WHEN 'correct_answers' THEN
        v_current_value := v_user_correct_answers;
      ELSE
        v_current_value := 0;
    END CASE;

    -- Grant achievement if condition met
    IF v_current_value >= COALESCE(v_achievement.condition_value, 0) THEN
      -- Insert earned achievement (handle different schema versions)
      IF v_has_progress_column AND v_has_target_column THEN
        INSERT INTO user_achievements (user_id, achievement_id, progress, target, earned_at, unlocked_at)
        VALUES (p_user_id, v_achievement.id, v_current_value, v_achievement.condition_value, NOW(), NOW())
        ON CONFLICT (user_id, achievement_id) DO UPDATE SET
          earned_at = COALESCE(user_achievements.earned_at, NOW()),
          unlocked_at = COALESCE(user_achievements.unlocked_at, NOW()),
          progress = v_current_value;
      ELSE
        INSERT INTO user_achievements (user_id, achievement_id, earned_at)
        VALUES (p_user_id, v_achievement.id, NOW())
        ON CONFLICT (user_id, achievement_id) DO UPDATE SET
          earned_at = COALESCE(user_achievements.earned_at, NOW());
      END IF;

      -- Grant rewards
      UPDATE users
      SET 
        xp = xp + COALESCE(v_achievement.reward_xp, v_achievement.points, 0),
        coins = coins + COALESCE(v_achievement.reward_coins, v_achievement.points / 2, 0)
      WHERE id = p_user_id;

      -- Log activity (use 'data' column which exists in the schema)
      BEGIN
        INSERT INTO activities (kind, actor_id, actor_username, data)
        VALUES (
          'achievement_earned',
          p_user_id,
          v_username,
          jsonb_build_object(
            'achievement_id', v_achievement.id,
            'achievement_name', v_achievement.name,
            'reward_xp', COALESCE(v_achievement.reward_xp, v_achievement.points, 0),
            'reward_coins', COALESCE(v_achievement.reward_coins, v_achievement.points / 2, 0)
          )
        );
      EXCEPTION WHEN OTHERS THEN
        -- Ignore activity logging errors
        NULL;
      END;

      -- Add to newly earned list
      v_achievement_json := jsonb_build_object(
        'id', v_achievement.id,
        'name', v_achievement.name,
        'description', v_achievement.description,
        'icon', v_achievement.icon,
        'reward_xp', COALESCE(v_achievement.reward_xp, v_achievement.points, 0),
        'reward_coins', COALESCE(v_achievement.reward_coins, v_achievement.points / 2, 0)
      );
      v_newly_earned := v_newly_earned || v_achievement_json;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_newly_earned;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_check_achievements(UUID) TO authenticated;

-- ============================================================================
-- FIX 3: Create activities table if it doesn't exist
-- ============================================================================
-- The activities table is used for tracking game events

CREATE TABLE IF NOT EXISTS activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kind TEXT NOT NULL,
    actor_id UUID REFERENCES users(id) ON DELETE CASCADE,
    actor_username TEXT NOT NULL DEFAULT '',
    target_id UUID REFERENCES users(id) ON DELETE SET NULL,
    target_username TEXT,
    data JSONB DEFAULT '{}',
    reactions JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activities_created_at ON activities(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activities_actor_id ON activities(actor_id);
CREATE INDEX IF NOT EXISTS idx_activities_kind ON activities(kind);

ALTER TABLE activities ENABLE ROW LEVEL SECURITY;

-- RLS policies for activities
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'activities' AND policyname = 'activities_select_all'
  ) THEN
    CREATE POLICY "activities_select_all" ON activities FOR SELECT USING (true);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'activities' AND policyname = 'activities_insert_own'
  ) THEN
    CREATE POLICY "activities_insert_own" ON activities FOR INSERT WITH CHECK (actor_id = auth.uid());
  END IF;
END;
$$;

-- ============================================================================
-- FIX 4: Add missing columns to user_achievements if needed
-- ============================================================================

DO $$
BEGIN
  -- Add progress column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_achievements' AND column_name = 'progress'
  ) THEN
    ALTER TABLE user_achievements ADD COLUMN progress INTEGER DEFAULT 0;
    RAISE NOTICE 'Added progress column to user_achievements';
  END IF;
  
  -- Add target column if missing (nullable)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_achievements' AND column_name = 'target'
  ) THEN
    ALTER TABLE user_achievements ADD COLUMN target INTEGER;
    RAISE NOTICE 'Added target column to user_achievements';
  END IF;
  
  -- Add unlocked_at column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_achievements' AND column_name = 'unlocked_at'
  ) THEN
    ALTER TABLE user_achievements ADD COLUMN unlocked_at TIMESTAMPTZ;
    RAISE NOTICE 'Added unlocked_at column to user_achievements';
  END IF;
END;
$$;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Check activities table
SELECT 'activities table' as check_item, 
       (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'activities') as exists;

-- Check user_achievements columns
SELECT column_name, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'user_achievements'
ORDER BY ordinal_position;

-- Test rpc_check_achievements exists
SELECT 'rpc_check_achievements' as function_name,
       pg_get_function_arguments(oid) as arguments
FROM pg_proc 
WHERE proname = 'rpc_check_achievements';

-- ============================================================================
-- SUMMARY
-- ============================================================================
-- ✓ Made user_achievements.target and progress nullable
-- ✓ Updated rpc_check_achievements to:
--   - Handle nullable columns
--   - Use 'data' column instead of 'detail' for activities
--   - Handle missing activities gracefully
--   - Support both old and new achievement schema
-- ✓ Ensured activities table exists with correct schema
-- ✓ Added missing columns to user_achievements
