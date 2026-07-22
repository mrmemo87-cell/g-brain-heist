-- Cambridge visibility authority correction
-- School admins enable tests school-wide; teachers release enabled tests to assigned classes.

ALTER TABLE public.cambridge_tests
  ADD COLUMN IF NOT EXISTS curriculum_subject text,
  ADD COLUMN IF NOT EXISTS curriculum_stage integer,
  ADD COLUMN IF NOT EXISTS mapped_grade_level integer;

UPDATE public.cambridge_tests
SET curriculum_subject = CASE
      WHEN subject ILIKE 'English stage %' THEN 'English'
      ELSE subject
    END,
    curriculum_stage = CASE
      WHEN subject ~* 'stage[[:space:]]+[0-9]+' THEN
        (regexp_match(subject, 'stage[[:space:]]+([0-9]+)', 'i'))[1]::integer
      ELSE curriculum_stage
    END,
    mapped_grade_level = CASE
      WHEN subject ~* 'stage[[:space:]]+[0-9]+' THEN
        GREATEST((regexp_match(subject, 'stage[[:space:]]+([0-9]+)', 'i'))[1]::integer - 1, 1)
      ELSE mapped_grade_level
    END
WHERE curriculum_subject IS NULL
   OR (curriculum_stage IS NULL AND subject ~* 'stage[[:space:]]+[0-9]+')
   OR (mapped_grade_level IS NULL AND subject ~* 'stage[[:space:]]+[0-9]+');

ALTER TABLE public.cambridge_tests
  ALTER COLUMN curriculum_subject SET DEFAULT '';

UPDATE public.cambridge_tests
SET curriculum_subject = subject
WHERE curriculum_subject IS NULL OR btrim(curriculum_subject) = '';

ALTER TABLE public.cambridge_tests
  ALTER COLUMN curriculum_subject SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cambridge_tests_curriculum_match
  ON public.cambridge_tests (lower(curriculum_subject), mapped_grade_level);

COMMENT ON COLUMN public.cambridge_tests.curriculum_subject IS
  'Canonical subject used for teacher assignment matching. Display subject remains in subject.';
COMMENT ON COLUMN public.cambridge_tests.curriculum_stage IS
  'Cambridge curriculum stage, when applicable.';
COMMENT ON COLUMN public.cambridge_tests.mapped_grade_level IS
  'School grade mapped to the Cambridge stage, e.g. Stage 9 -> Grade 8.';

CREATE TABLE IF NOT EXISTS public.teacher_cambridge_class_visibility (
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  test_id text NOT NULL REFERENCES public.cambridge_tests(id) ON DELETE CASCADE,
  teacher_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  is_visible boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (class_id, test_id)
);

CREATE INDEX IF NOT EXISTS idx_teacher_cambridge_class_visible
  ON public.teacher_cambridge_class_visibility (class_id, is_visible, test_id);
CREATE INDEX IF NOT EXISTS idx_teacher_cambridge_release_teacher
  ON public.teacher_cambridge_class_visibility (teacher_user_id, class_id);

ALTER TABLE public.teacher_cambridge_class_visibility ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.teacher_cambridge_class_visibility FROM anon, authenticated;

COMMENT ON TABLE public.teacher_cambridge_class_visibility IS
  'Class-scoped teacher releases. Students see a test only when school availability and a release for one of their classes are both true.';

-- Preserve existing teacher releases by copying each setting to every active,
-- matching class assignment owned by the recorded teacher.
INSERT INTO public.teacher_cambridge_class_visibility
  (class_id, test_id, teacher_user_id, is_visible, created_at, updated_at)
SELECT DISTINCT ON (cta.class_id, ctv.test_id)
       cta.class_id, ctv.test_id, cta.teacher_user_id, ctv.is_visible,
       COALESCE(ctv.created_at, now()), COALESCE(ctv.updated_at, now())
FROM public.cambridge_test_visibility ctv
JOIN public.cambridge_tests ct ON ct.id = ctv.test_id
JOIN public.class_teacher_assignments cta
  ON cta.teacher_user_id = ctv.teacher_user_id
 AND cta.school_id = ctv.school_id
 AND cta.active = true
JOIN public.classes c ON c.id = cta.class_id
WHERE lower(btrim(cta.subject)) = lower(btrim(ct.curriculum_subject))
  AND (
    ct.mapped_grade_level IS NULL
    OR NULLIF(regexp_replace(c.grade_level, '[^0-9]', '', 'g'), '')::integer = ct.mapped_grade_level
  )
ORDER BY cta.class_id, ctv.test_id, ctv.updated_at DESC NULLS LAST, ctv.created_at DESC NULLS LAST
ON CONFLICT (class_id, test_id) DO UPDATE
SET is_visible = EXCLUDED.is_visible,
    teacher_user_id = EXCLUDED.teacher_user_id,
    updated_at = GREATEST(
      public.teacher_cambridge_class_visibility.updated_at,
      EXCLUDED.updated_at
    );

CREATE OR REPLACE FUNCTION public.get_teacher_cambridge_test_catalog()
RETURNS TABLE(
  class_id uuid,
  class_code text,
  class_name text,
  grade_level integer,
  test_id text,
  test_name text,
  description text,
  duration text,
  total_questions integer,
  difficulty text,
  category text,
  subject text,
  curriculum_subject text,
  curriculum_stage integer,
  test_url text,
  requires_marking boolean,
  school_available boolean,
  teacher_released boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_school_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT u.school_id INTO v_school_id
  FROM public.users u
  WHERE u.id = v_user_id
    AND u.role IN ('teacher', 'school_admin', 'admin');

  IF v_school_id IS NULL THEN
    RAISE EXCEPTION 'Teacher school membership required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.class_code,
    c.class_name,
    NULLIF(regexp_replace(c.grade_level, '[^0-9]', '', 'g'), '')::integer,
    ct.id,
    ct.name,
    ct.description,
    ct.duration,
    ct.total_questions,
    ct.difficulty,
    ct.category,
    ct.subject,
    ct.curriculum_subject,
    ct.curriculum_stage,
    ct.test_url,
    ct.requires_marking,
    COALESCE(sctv.is_visible, true),
    COALESCE(tccv.is_visible, false)
  FROM public.class_teacher_assignments cta
  JOIN public.classes c
    ON c.id = cta.class_id
   AND c.school_id = cta.school_id
   AND c.is_active = true
  JOIN public.cambridge_tests ct
    ON lower(btrim(ct.curriculum_subject)) = lower(btrim(cta.subject))
   AND (
     ct.mapped_grade_level IS NULL
     OR NULLIF(regexp_replace(c.grade_level, '[^0-9]', '', 'g'), '')::integer = ct.mapped_grade_level
   )
  LEFT JOIN public.school_cambridge_test_visibility sctv
    ON sctv.school_id = cta.school_id
   AND sctv.test_id = ct.id
  LEFT JOIN public.teacher_cambridge_class_visibility tccv
    ON tccv.class_id = cta.class_id
   AND tccv.test_id = ct.id
  WHERE cta.teacher_user_id = v_user_id
    AND cta.school_id = v_school_id
    AND cta.active = true
  ORDER BY c.class_code, ct.curriculum_subject, ct.curriculum_stage NULLS LAST, ct.name;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_teacher_cambridge_class_visibility(
  p_class_id uuid,
  p_test_id text,
  p_is_visible boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_school_id uuid;
  v_school_available boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT cta.school_id INTO v_school_id
  FROM public.class_teacher_assignments cta
  JOIN public.classes c
    ON c.id = cta.class_id
   AND c.school_id = cta.school_id
   AND c.is_active = true
  JOIN public.cambridge_tests ct
    ON ct.id = p_test_id
   AND lower(btrim(ct.curriculum_subject)) = lower(btrim(cta.subject))
   AND (
     ct.mapped_grade_level IS NULL
     OR NULLIF(regexp_replace(c.grade_level, '[^0-9]', '', 'g'), '')::integer = ct.mapped_grade_level
   )
  WHERE cta.class_id = p_class_id
    AND cta.teacher_user_id = v_user_id
    AND cta.active = true
  LIMIT 1;

  IF v_school_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'You can only release matching tests to classes assigned to you'
    );
  END IF;

  SELECT COALESCE(sctv.is_visible, true) INTO v_school_available
  FROM (SELECT 1) seed
  LEFT JOIN public.school_cambridge_test_visibility sctv
    ON sctv.school_id = v_school_id
   AND sctv.test_id = p_test_id;

  IF p_is_visible AND NOT COALESCE(v_school_available, true) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'This test is disabled by your school administrator'
    );
  END IF;

  INSERT INTO public.teacher_cambridge_class_visibility
    (class_id, test_id, teacher_user_id, is_visible, updated_at)
  VALUES (p_class_id, p_test_id, v_user_id, p_is_visible, now())
  ON CONFLICT (class_id, test_id) DO UPDATE
  SET is_visible = EXCLUDED.is_visible,
      teacher_user_id = EXCLUDED.teacher_user_id,
      updated_at = now();

  RETURN jsonb_build_object(
    'success', true,
    'class_id', p_class_id,
    'test_id', p_test_id,
    'is_visible', p_is_visible
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.bulk_set_teacher_cambridge_class_visibility(
  p_class_id uuid,
  p_test_ids text[],
  p_is_visible boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_count integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  WITH eligible AS (
    SELECT ct.id
    FROM public.class_teacher_assignments cta
    JOIN public.classes c
      ON c.id = cta.class_id
     AND c.school_id = cta.school_id
     AND c.is_active = true
    JOIN public.cambridge_tests ct
      ON ct.id = ANY(p_test_ids)
     AND lower(btrim(ct.curriculum_subject)) = lower(btrim(cta.subject))
     AND (
       ct.mapped_grade_level IS NULL
       OR NULLIF(regexp_replace(c.grade_level, '[^0-9]', '', 'g'), '')::integer = ct.mapped_grade_level
     )
    LEFT JOIN public.school_cambridge_test_visibility sctv
      ON sctv.school_id = cta.school_id
     AND sctv.test_id = ct.id
    WHERE cta.class_id = p_class_id
      AND cta.teacher_user_id = v_user_id
      AND cta.active = true
      AND (NOT p_is_visible OR COALESCE(sctv.is_visible, true))
  ), upserted AS (
    INSERT INTO public.teacher_cambridge_class_visibility
      (class_id, test_id, teacher_user_id, is_visible, updated_at)
    SELECT p_class_id, e.id, v_user_id, p_is_visible, now()
    FROM eligible e
    ON CONFLICT (class_id, test_id) DO UPDATE
    SET is_visible = EXCLUDED.is_visible,
        teacher_user_id = EXCLUDED.teacher_user_id,
        updated_at = now()
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM upserted;

  IF v_count = 0 AND COALESCE(array_length(p_test_ids, 1), 0) > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No eligible tests were updated. Check your class assignment and school availability.'
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'updated_count', v_count, 'is_visible', p_is_visible);
END;
$$;

-- Keep the public signature temporarily for old clients, but never trust its inputs.
CREATE OR REPLACE FUNCTION public.get_visible_cambridge_tests_for_student(
  p_student_grade integer,
  p_school_id uuid
)
RETURNS TABLE(test_id text, subject text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id uuid := auth.uid();
  v_school_id uuid;
BEGIN
  IF v_student_id IS NULL THEN
    RETURN;
  END IF;

  SELECT u.school_id INTO v_school_id
  FROM public.users u
  WHERE u.id = v_student_id
    AND u.role = 'student';

  IF v_school_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT DISTINCT ct.id, ct.subject
  FROM public.class_students cs
  JOIN public.classes c
    ON c.id = cs.class_id
   AND c.school_id = v_school_id
   AND c.is_active = true
  JOIN public.teacher_cambridge_class_visibility tccv
    ON tccv.class_id = cs.class_id
   AND tccv.is_visible = true
  JOIN public.cambridge_tests ct
    ON ct.id = tccv.test_id
   AND (
     ct.mapped_grade_level IS NULL
     OR NULLIF(regexp_replace(c.grade_level, '[^0-9]', '', 'g'), '')::integer = ct.mapped_grade_level
   )
  LEFT JOIN public.school_cambridge_test_visibility sctv
    ON sctv.school_id = v_school_id
   AND sctv.test_id = ct.id
  WHERE cs.student_id = v_student_id
    AND COALESCE(sctv.is_visible, true);
END;
$$;

CREATE OR REPLACE FUNCTION public.is_cambridge_test_visible_to_student(
  p_test_id text,
  p_student_grade integer,
  p_school_id uuid,
  p_subject text
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.get_visible_cambridge_tests_for_student(NULL, NULL) visible
    WHERE visible.test_id = p_test_id
  );
$$;

-- Legacy teacher RPCs stay callable for old deployed clients, but now fail closed
-- with a clear upgrade message instead of changing school-wide grade settings.
CREATE OR REPLACE FUNCTION public.toggle_cambridge_test_visibility(
  p_test_id text,
  p_subject text,
  p_grade_level integer,
  p_is_visible boolean
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'success', false,
    'error', 'Refresh the teacher portal to release this test to a specific class'
  );
$$;

CREATE OR REPLACE FUNCTION public.bulk_set_cambridge_test_visibility(
  p_test_ids text[],
  p_subject text,
  p_grade_level integer,
  p_is_visible boolean
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'success', false,
    'error', 'Refresh the teacher portal to release tests to a specific class'
  );
$$;

REVOKE ALL ON FUNCTION public.get_teacher_cambridge_test_catalog() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_teacher_cambridge_class_visibility(uuid, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bulk_set_teacher_cambridge_class_visibility(uuid, text[], boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_visible_cambridge_tests_for_student(integer, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_cambridge_test_visible_to_student(text, integer, uuid, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_teacher_cambridge_test_catalog() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_teacher_cambridge_class_visibility(uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_set_teacher_cambridge_class_visibility(uuid, text[], boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_visible_cambridge_tests_for_student(integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_cambridge_test_visible_to_student(text, integer, uuid, text) TO authenticated;
