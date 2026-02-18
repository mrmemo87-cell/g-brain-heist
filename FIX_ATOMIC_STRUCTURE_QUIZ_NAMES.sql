-- ============================================================================
-- FIX CORRUPTED ATOMIC STRUCTURE QUIZ NAMES IN quiz_scores
-- ============================================================================
-- The em dash (—) in "AS Chemistry — Atomic Structure" was corrupted to the
-- Unicode Replacement Character (U+FFFD, displayed as �) in several source
-- files.  This caused duplicate test entries and broken score lookups.
--
-- This migration normalises any quiz_scores rows that were saved with the
-- corrupted character so they match the canonical name used in answer keys
-- and the cambridge_tests catalog.
-- ============================================================================

-- Step 1: Preview affected rows (read-only, safe to run first)
-- SELECT id, quiz_name, student_name, submitted_at
-- FROM quiz_scores
-- WHERE quiz_name LIKE '%' || chr(65533) || '%'
-- ORDER BY submitted_at DESC;

-- Step 2: Fix quiz_name in quiz_scores
UPDATE quiz_scores
SET quiz_name = REPLACE(quiz_name, chr(65533), '—')
WHERE quiz_name LIKE '%' || chr(65533) || '%';

-- Step 3: Remove duplicate rows from cambridge_tests if any exist
-- with the corrupted character (the canonical rows use the correct em dash).
DELETE FROM cambridge_tests
WHERE id IN (
  SELECT id FROM cambridge_tests
  WHERE name LIKE '%' || chr(65533) || '%'
);

-- Step 4: Verify no corrupted names remain
-- SELECT COUNT(*) AS remaining_corrupted FROM quiz_scores
-- WHERE quiz_name LIKE '%' || chr(65533) || '%';
--
-- SELECT COUNT(*) AS remaining_corrupted FROM cambridge_tests
-- WHERE name LIKE '%' || chr(65533) || '%';
