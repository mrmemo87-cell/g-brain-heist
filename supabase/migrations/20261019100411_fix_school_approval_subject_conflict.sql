-- Match the active, normalized subject-name index introduced by subject recreation.
CREATE OR REPLACE FUNCTION public.ensure_school_subject(
  p_school_id uuid, p_name text, p_code text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF p_school_id IS NULL THEN
    RAISE EXCEPTION 'School ID is required';
  END IF;
  IF p_name IS NULL OR trim(p_name) = '' THEN
    RAISE EXCEPTION 'Subject name is required';
  END IF;
  INSERT INTO public.school_subjects (school_id, name, code, is_active, created_by)
  VALUES (p_school_id, trim(p_name), NULLIF(trim(COALESCE(p_code, '')), ''), true, NULL)
  ON CONFLICT (school_id, (lower(trim(name)))) WHERE is_active
  DO UPDATE SET
    code = COALESCE(NULLIF(public.school_subjects.code, ''), EXCLUDED.code);
END;
$function$;
REVOKE ALL ON FUNCTION public.ensure_school_subject(uuid, text, text) FROM PUBLIC, anon, authenticated;
