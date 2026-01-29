-- ============================================
-- FIX: Update level calculation to use hard curve
-- ============================================
-- This migration updates the level formula from linear (xp/100+1) to quadratic curve
-- New formula: Level = floor((1 + sqrt(1 + xp/12.5)) / 2)
-- XP required for level N = 50 * N * (N - 1)
-- 
-- Level requirements:
-- Level 1: 0 XP
-- Level 2: 100 XP
-- Level 3: 300 XP
-- Level 4: 600 XP
-- Level 5: 1000 XP
-- Level 10: 4500 XP
-- Level 20: 19000 XP
-- Level 50: 122500 XP

-- Create a function to calculate level from XP using the hard curve
CREATE OR REPLACE FUNCTION calculate_level_from_xp(p_xp INTEGER)
RETURNS INTEGER AS $$
BEGIN
    IF p_xp <= 0 THEN
        RETURN 1;
    END IF;
    -- Formula: floor((1 + sqrt(1 + xp/12.5)) / 2)
    RETURN GREATEST(1, FLOOR((1 + SQRT(1 + p_xp / 12.5)) / 2)::INTEGER);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Check current level mismatches before updating
SELECT 'CURRENT LEVEL/XP MISMATCHES (before fix)' as check_type;
SELECT 
    username, 
    xp, 
    level as current_level,
    calculate_level_from_xp(xp) as calculated_level,
    calculate_level_from_xp(xp) - level as level_difference
FROM users
WHERE level != calculate_level_from_xp(xp)
ORDER BY ABS(calculate_level_from_xp(xp) - level) DESC
LIMIT 20;

-- Update all users to have correct level based on XP
UPDATE users
SET level = calculate_level_from_xp(xp)
WHERE level != calculate_level_from_xp(xp);

-- Verify fix
SELECT 'VERIFICATION (after fix)' as check_type;
SELECT COUNT(*) as users_with_correct_level 
FROM users 
WHERE level = calculate_level_from_xp(xp);

-- Update any triggers that calculate level
-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_sync_user_level ON users;

-- Create trigger function using new formula
CREATE OR REPLACE FUNCTION sync_user_level()
RETURNS TRIGGER AS $$
BEGIN
    -- Recalculate level based on XP using hard curve
    NEW.level := calculate_level_from_xp(NEW.xp);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to sync level on XP changes
CREATE TRIGGER trigger_sync_user_level
    BEFORE INSERT OR UPDATE OF xp ON users
    FOR EACH ROW
    EXECUTE FUNCTION sync_user_level();

SELECT 'Level hard curve migration complete!' as status;
