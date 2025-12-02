-- ============================================
-- FRESH START: Clear All Announcements & Assignments
-- ============================================
-- Run this in Supabase SQL Editor to wipe old data

-- ============================================
-- 1. Clear all announcements
-- ============================================
DO $$
BEGIN
  IF to_regclass('public.announcements') IS NOT NULL THEN
    DELETE FROM announcements WHERE id IS NOT NULL;
    RAISE NOTICE 'Announcements cleared';
  END IF;
END $$;

-- ============================================
-- 2. Clear all assignments and related data
-- ============================================
DO $$
BEGIN
  -- Clear assignment submissions first (foreign key dependency)
  IF to_regclass('public.assignment_submissions') IS NOT NULL THEN
    DELETE FROM assignment_submissions WHERE id IS NOT NULL;
    RAISE NOTICE 'Assignment submissions cleared';
  END IF;

  -- Clear individual student assignments
  IF to_regclass('public.student_assignments') IS NOT NULL THEN
    DELETE FROM student_assignments WHERE id IS NOT NULL;
    RAISE NOTICE 'Student assignments cleared';
  END IF;

  -- Clear the main assignments table
  IF to_regclass('public.assignments') IS NOT NULL THEN
    DELETE FROM assignments WHERE id IS NOT NULL;
    RAISE NOTICE 'Assignments cleared';
  END IF;

  -- Clear assignment progress tracking
  IF to_regclass('public.assignment_progress') IS NOT NULL THEN
    DELETE FROM assignment_progress WHERE id IS NOT NULL;
    RAISE NOTICE 'Assignment progress cleared';
  END IF;

  -- Clear mandatory assignment tracking
  IF to_regclass('public.mandatory_assignments') IS NOT NULL THEN
    DELETE FROM mandatory_assignments WHERE id IS NOT NULL;
    RAISE NOTICE 'Mandatory assignments cleared';
  END IF;
END $$;

-- ============================================
-- Verification
-- ============================================
SELECT '✅ Fresh start complete!' AS status;
