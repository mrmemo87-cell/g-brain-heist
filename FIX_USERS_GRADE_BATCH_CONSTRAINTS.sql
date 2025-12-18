-- Fix signup failure: users_batch_check / users_grade_check
--
-- Symptom: "new row for relation \"users\" violates check constraint \"users_batch_check\"" during profile_bootstrap.
-- Cause: live DB constraint often still only allows older batches (e.g. 8A-9C) or rejects formatted values.
--
-- Safe to run in Supabase SQL Editor as database owner.
-- Idempotent.

BEGIN;

-- Drop constraints so we can normalize existing data first
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_batch_check;
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_grade_check;

-- Normalize batch values into canonical form (e.g. "Class A (12A)" -> "12A")
UPDATE public.users
SET batch = upper(trim(batch))
WHERE batch IS NOT NULL;

UPDATE public.users
SET batch = regexp_replace(batch, '^.*\(([0-9]{1,2}[ABC])\).*$','\1')
WHERE batch IS NOT NULL
  AND batch ~ '\\([0-9]{1,2}[ABC]\\)';

-- Convert empty-string batch to NULL
UPDATE public.users
SET batch = NULL
WHERE batch = '';

-- Any remaining non-canonical batch becomes N/A (prevents constraint add failure)
UPDATE public.users
SET batch = 'N/A'
WHERE batch IS NOT NULL
  AND batch <> 'N/A'
  AND batch !~ '^((6|7|8|9|10|11|12)[ABC])$';

-- Normalize grade values
UPDATE public.users
SET grade = NULL
WHERE grade IS NOT NULL
  AND (grade < 6 OR grade > 12);

-- Re-add constraints (accept 6-12 and N/A)
ALTER TABLE public.users
  ADD CONSTRAINT users_grade_check
  CHECK (grade IS NULL OR (grade >= 6 AND grade <= 12));

ALTER TABLE public.users
  ADD CONSTRAINT users_batch_check
  CHECK (
    batch IS NULL
    OR batch = 'N/A'
    OR batch ~ '^((6|7|8|9|10|11|12)[ABC])$'
  );

COMMIT;
