-- ============================================================================
-- FIX: Clan Buff Templates 500 Internal Server Error
-- ============================================================================
-- This script fixes the 500 error when querying clan_buff_templates
-- Run this in Supabase SQL Editor
-- ============================================================================

-- Check if table exists and its structure
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'clan_buff_templates'
  ) THEN
    RAISE NOTICE '⚠️  Table clan_buff_templates does not exist - creating it';
  ELSE
    RAISE NOTICE '✓ Table clan_buff_templates exists';
  END IF;
END $$;

-- Create table if it doesn't exist
CREATE TABLE IF NOT EXISTS clan_buff_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    cost INTEGER NOT NULL CHECK (cost > 0),
    duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
    effect JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS but allow all authenticated users to read
ALTER TABLE clan_buff_templates ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies
DROP POLICY IF EXISTS "clan_buff_templates_select" ON clan_buff_templates;
DROP POLICY IF EXISTS "clan_buff_templates_read" ON clan_buff_templates;
DROP POLICY IF EXISTS "Anyone can view buff templates" ON clan_buff_templates;

-- Create a simple, permissive policy for reading templates
CREATE POLICY "Anyone can view buff templates" 
ON clan_buff_templates
FOR SELECT
TO authenticated
USING (true);

-- Grant explicit permissions
GRANT SELECT ON clan_buff_templates TO authenticated;
GRANT SELECT ON clan_buff_templates TO anon;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_clan_buff_templates_code ON clan_buff_templates(code);

-- Seed default buff templates if table is empty
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM clan_buff_templates LIMIT 1) THEN
    INSERT INTO clan_buff_templates (code, name, description, cost, duration_minutes, effect)
    VALUES
      ('xp_surge', 'XP Surge', '+10% XP for all members for 24h.', 5000, 1440, '{"xp_multiplier": 1.1}'::jsonb),
      ('attack_boost', 'Attack Boost', '+15% attack power for 12h.', 3000, 720, '{"attack_multiplier": 1.15}'::jsonb),
      ('defense_wall', 'Defense Wall', '+15% defense power for 12h.', 3000, 720, '{"defense_multiplier": 1.15}'::jsonb),
      ('shield_dome', 'Shield Dome', '+20% shield bonus for 8h.', 4000, 480, '{"shield_bonus_percent": 20}'::jsonb),
      ('energy_rush', 'Energy Rush', '+2 max AP for 6h.', 2500, 360, '{"ap_bonus": 2}'::jsonb);
    
    RAISE NOTICE '✓ Inserted default buff templates';
  ELSE
    RAISE NOTICE '✓ Buff templates already exist';
  END IF;
END $$;

-- Also fix clan_buffs table if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'clan_buffs'
  ) THEN
    -- Enable RLS
    ALTER TABLE clan_buffs ENABLE ROW LEVEL SECURITY;
    
    -- Drop old policies
    EXECUTE 'DROP POLICY IF EXISTS "clan_buffs_select" ON clan_buffs';
    EXECUTE 'DROP POLICY IF EXISTS "clan_buffs_read" ON clan_buffs';
    EXECUTE 'DROP POLICY IF EXISTS "Members view clan buffs" ON clan_buffs';
    
    -- Create policy
    EXECUTE $policy$
      CREATE POLICY "Members view clan buffs" 
      ON clan_buffs
      FOR SELECT
      TO authenticated
      USING (
        clan_id IN (
          SELECT cm.clan_id FROM clan_members cm WHERE cm.user_id = auth.uid()
        )
      )
    $policy$;
    
    RAISE NOTICE '✓ Fixed clan_buffs RLS policies';
  END IF;
END $$;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Check table structure
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'clan_buff_templates'
ORDER BY ordinal_position;

-- Check RLS policies
SELECT 
  policyname,
  cmd,
  permissive,
  roles
FROM pg_policies 
WHERE tablename = 'clan_buff_templates';

-- Check data
SELECT 
  code,
  name,
  cost,
  duration_minutes
FROM clan_buff_templates
ORDER BY cost;

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Fixed clan_buff_templates 500 error';
  RAISE NOTICE '✅ Created permissive RLS policy';
  RAISE NOTICE '✅ Seeded default buff templates';
  RAISE NOTICE '';
  RAISE NOTICE '🔄 IMPORTANT: Hard refresh your browser!';
  RAISE NOTICE '   Press Ctrl+Shift+R (or Cmd+Shift+R)';
  RAISE NOTICE '========================================';
END $$;
