-- ============================================================================
-- FIX: Add missing crest_url column to clans table
-- ============================================================================
-- This script fixes the 400 error: column clans.crest_url does not exist
-- Run this in Supabase SQL Editor
-- ============================================================================

-- Check if crest_url column exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'clans' 
    AND column_name = 'crest_url'
  ) THEN
    RAISE NOTICE '⚠️  Column clans.crest_url does not exist - adding it';
    ALTER TABLE clans ADD COLUMN crest_url TEXT;
    RAISE NOTICE '✓ Added crest_url column to clans table';
  ELSE
    RAISE NOTICE '✓ Column clans.crest_url already exists';
  END IF;
END $$;

-- Verify the column was added
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'clans'
ORDER BY ordinal_position;

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Fixed clans.crest_url column';
  RAISE NOTICE '';
  RAISE NOTICE '🔄 Hard refresh your browser!';
  RAISE NOTICE '   Press Ctrl+Shift+R (or Cmd+Shift+R)';
  RAISE NOTICE '========================================';
END $$;
