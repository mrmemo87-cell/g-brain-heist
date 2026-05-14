-- ==========================================================================
-- ADD CAMBRIDGE TRAVEL & TOURISM AS A SCHOOL CLASS SUBJECT
-- ==========================================================================
-- The Travel & Tourism Cambridge test is assigned through the same
-- school_subjects -> class_teacher_assignments flow as Chemistry/Biology.
-- This migration makes the subject available to existing schools and keeps it
-- automatically available for newly-created schools.
--
-- Important: system-seeded subjects intentionally use created_by = NULL.
-- Some legacy schools.created_by values do not exist in the table referenced by
-- school_subjects.created_by, so copying schools.created_by can fail with
-- school_subjects_created_by_fkey. NULL is a valid FK value for this nullable
-- audit column and correctly represents a system-created subject.

-- Reusable helper used by this migration and safe to call manually after
-- importing a school or adding another system-managed class subject later.
-- It only adds/reactivates the class subject; visibility for actual tests still
-- remains controlled by the relevant teacher/school test visibility settings.
CREATE OR REPLACE FUNCTION public.ensure_school_subject(
  p_school_id UUID,
  p_name TEXT,
  p_code TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_school_id IS NULL THEN
    RAISE EXCEPTION 'School ID is required';
  END IF;

  IF p_name IS NULL OR trim(p_name) = '' THEN
    RAISE EXCEPTION 'Subject name is required';
  END IF;

  INSERT INTO public.school_subjects (school_id, name, code, is_active, created_by)
  VALUES (
    p_school_id,
    trim(p_name),
    NULLIF(trim(COALESCE(p_code, '')), ''),
    true,
    NULL
  )
  ON CONFLICT (school_id, name) DO UPDATE SET
    code = COALESCE(NULLIF(public.school_subjects.code, ''), EXCLUDED.code),
    is_active = true;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_school_subject(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- Backfill every existing school so admins can immediately assign teachers to
-- Travel & Tourism classes from the School Admin portal subject dropdown.
SELECT public.ensure_school_subject(s.id, 'Travel & Tourism', 'TRAVEL')
FROM public.schools s;

-- Travel & Tourism-specific wrapper kept for the trigger name and for callers
-- that want a no-argument subject-specific helper.
CREATE OR REPLACE FUNCTION public.ensure_travel_tourism_school_subject(p_school_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.ensure_school_subject(p_school_id, 'Travel & Tourism', 'TRAVEL');
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_travel_tourism_school_subject(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.ensure_travel_tourism_school_subject_on_school_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.ensure_travel_tourism_school_subject(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_travel_tourism_school_subject ON public.schools;
CREATE TRIGGER trg_ensure_travel_tourism_school_subject
AFTER INSERT ON public.schools
FOR EACH ROW
EXECUTE FUNCTION public.ensure_travel_tourism_school_subject_on_school_insert();

COMMENT ON FUNCTION public.ensure_school_subject(UUID, TEXT, TEXT) IS
  'Ensures a system-managed class subject exists for a school without copying legacy school creator IDs.';
COMMENT ON FUNCTION public.ensure_travel_tourism_school_subject(UUID) IS
  'Ensures the Cambridge Travel & Tourism class subject exists for a school so admins can assign teachers to it.';
