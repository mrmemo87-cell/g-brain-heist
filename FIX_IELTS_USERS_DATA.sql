-- ============================================================
-- FIX IELTS USERS DATA
-- ============================================================
-- This script:
-- 1. Adds missing columns to ielts_users table
-- 2. Creates a view to get email from auth.users
-- 3. Syncs users from auth.users
-- ============================================================

-- ============================================================
-- STEP 1: ADD MISSING COLUMNS TO IELTS_USERS
-- ============================================================

-- Add phone column
ALTER TABLE ielts_users ADD COLUMN IF NOT EXISTS phone TEXT;

-- Add tier column (free, premium, etc.)
ALTER TABLE ielts_users ADD COLUMN IF NOT EXISTS tier TEXT DEFAULT 'free';

-- Add target_band column (user's target IELTS band score)
ALTER TABLE ielts_users ADD COLUMN IF NOT EXISTS target_band NUMERIC(2,1);

-- Add test_date column (when user plans to take IELTS)
ALTER TABLE ielts_users ADD COLUMN IF NOT EXISTS test_date DATE;

-- ============================================================
-- STEP 2: CREATE ADMIN VIEW FOR IELTS USERS WITH AUTH EMAIL
-- ============================================================

-- Create a view that joins ielts_users with auth.users to get email
CREATE OR REPLACE VIEW ielts_users_admin AS
SELECT 
  iu.id,
  iu.username,
  iu.full_name,
  COALESCE(iu.email, au.email) AS email,
  iu.phone,
  iu.tier,
  iu.target_band,
  iu.test_date,
  iu.created_at,
  iu.updated_at
FROM ielts_users iu
LEFT JOIN auth.users au ON iu.id = au.id;

-- Grant access to authenticated users
GRANT SELECT ON ielts_users_admin TO authenticated;

-- ============================================================
-- STEP 3: SYNC EMAILS FROM AUTH.USERS TO IELTS_USERS
-- ============================================================

-- Update ielts_users email from auth.users where missing
UPDATE ielts_users iu
SET email = au.email
FROM auth.users au
WHERE iu.id = au.id
  AND (iu.email IS NULL OR iu.email = '');

-- ============================================================
-- STEP 4: FUNCTION TO AUTO-POPULATE IELTS_USERS ON SIGNUP
-- ============================================================

-- Create or replace function to handle new auth user signup
CREATE OR REPLACE FUNCTION handle_new_ielts_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if user already exists in ielts_users
  IF NOT EXISTS (SELECT 1 FROM ielts_users WHERE id = NEW.id) THEN
    INSERT INTO ielts_users (id, username, full_name, email, tier)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'username', SPLIT_PART(NEW.email, '@', 1)),
      COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
      NEW.email,
      'free'
    )
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      updated_at = now();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if any
DROP TRIGGER IF EXISTS on_auth_user_created_ielts ON auth.users;

-- Note: Trigger on auth.users requires superuser access
-- If you have superuser access, uncomment the following:
-- CREATE TRIGGER on_auth_user_created_ielts
--   AFTER INSERT ON auth.users
--   FOR EACH ROW EXECUTE FUNCTION handle_new_ielts_user();

-- ============================================================
-- STEP 5: CREATE HELPER FUNCTION FOR MANUAL USER SYNC
-- ============================================================

-- Function to sync all auth users to ielts_users (run manually if needed)
-- Uses unique username by appending random suffix if duplicate exists
CREATE OR REPLACE FUNCTION sync_auth_users_to_ielts()
RETURNS INTEGER AS $$
DECLARE
  auth_user RECORD;
  sync_count INTEGER := 0;
  new_username TEXT;
BEGIN
  FOR auth_user IN 
    SELECT au.id, au.email, au.raw_user_meta_data
    FROM auth.users au
    WHERE NOT EXISTS (SELECT 1 FROM ielts_users iu WHERE iu.id = au.id)
  LOOP
    -- Generate base username
    new_username := COALESCE(
      auth_user.raw_user_meta_data->>'username', 
      SPLIT_PART(auth_user.email, '@', 1)
    );
    
    -- If username exists, append random suffix
    IF EXISTS (SELECT 1 FROM ielts_users WHERE username = new_username) THEN
      new_username := new_username || '_' || SUBSTRING(auth_user.id::text, 1, 6);
    END IF;
    
    -- Insert the user
    INSERT INTO ielts_users (id, username, full_name, email, tier)
    VALUES (
      auth_user.id,
      new_username,
      COALESCE(auth_user.raw_user_meta_data->>'full_name', auth_user.raw_user_meta_data->>'name', ''),
      auth_user.email,
      'free'
    )
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      updated_at = now();
    
    sync_count := sync_count + 1;
  END LOOP;
  
  RETURN sync_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Run the sync immediately
SELECT sync_auth_users_to_ielts() AS users_synced;

-- ============================================================
-- VERIFICATION
-- ============================================================

SELECT '✅ IELTS Users Data Fix Complete' AS status;

-- Show current user data
SELECT id, username, full_name, email, phone, tier, created_at
FROM ielts_users
ORDER BY created_at DESC
LIMIT 10;
