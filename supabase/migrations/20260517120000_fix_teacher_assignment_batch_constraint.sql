-- Fix teacher assignment creation for the full school class range.
--
-- Root cause: the legacy assignments.batch check constraint only allowed
-- 8A/8B/8C/All, while the current user/class model supports grades 6-12
-- with A/B/C sections (for example 11A and 11B). Teachers assigned to newer
-- classes could select valid classes in the UI, but INSERTs into assignments
-- failed with assignments_batch_check before any student rows were created.

DO $$
BEGIN
  IF to_regclass('public.assignments') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE public.assignments
    ADD COLUMN IF NOT EXISTS assignment_mode text DEFAULT 'batch';

  ALTER TABLE public.assignments
    ALTER COLUMN batch DROP NOT NULL;

  ALTER TABLE public.assignments
    DROP CONSTRAINT IF EXISTS assignments_assignment_mode_check;

  ALTER TABLE public.assignments
    ADD CONSTRAINT assignments_assignment_mode_check
    CHECK (assignment_mode IN ('batch', 'custom'));

  ALTER TABLE public.assignments
    DROP CONSTRAINT IF EXISTS assignments_batch_check;

  ALTER TABLE public.assignments
    ADD CONSTRAINT assignments_batch_check
    CHECK (
      (
        COALESCE(assignment_mode, 'batch') = 'batch'
        AND batch IS NOT NULL
        AND (
          batch = 'All'
          OR batch = 'N/A'
          OR batch ~ '^((6|7|8|9|10|11|12)[ABC])$'
        )
      )
      OR
      (
        COALESCE(assignment_mode, 'batch') = 'custom'
        AND batch IS NULL
      )
    );
END $$;
