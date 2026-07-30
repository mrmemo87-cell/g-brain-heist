-- Teacher-authored options may be stored as {"text", "image_url"} objects so
-- that an option can include an image. Validate their displayed text just as we
-- validate legacy string options.

CREATE OR REPLACE FUNCTION public.validate_question_import_quality()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_option text;
  v_option_count integer;
  v_unique_count integer;
BEGIN
  IF NEW.question_type <> 'multiple_choice' THEN
    RETURN NEW;
  END IF;

  IF NEW.options IS NULL OR jsonb_typeof(NEW.options) <> 'array' THEN
    RAISE EXCEPTION 'Multiple-choice questions require an options array';
  END IF;

  WITH option_texts AS (
    SELECT CASE jsonb_typeof(option_value)
      WHEN 'string' THEN option_value #>> '{}'
      WHEN 'object' THEN option_value ->> 'text'
      ELSE NULL
    END AS option_text
    FROM jsonb_array_elements(NEW.options) AS option_value
  )
  SELECT
    count(*),
    count(DISTINCT lower(btrim(option_text)))
  INTO v_option_count, v_unique_count
  FROM option_texts
  WHERE option_text IS NOT NULL AND btrim(option_text) <> '';

  IF v_option_count < 2 THEN
    RAISE EXCEPTION 'Multiple-choice questions require at least two options';
  END IF;

  IF v_option_count <> v_unique_count THEN
    RAISE EXCEPTION 'Multiple-choice options must be unique. A spreadsheet may have evaluated formulas into duplicate TRUE/FALSE values.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(NEW.options) AS option_value
    WHERE CASE jsonb_typeof(option_value)
      WHEN 'string' THEN option_value #>> '{}'
      WHEN 'object' THEN option_value ->> 'text'
      ELSE NULL
    END = NEW.correct_answer
  ) THEN
    RAISE EXCEPTION 'The correct answer must exactly match one of the options';
  END IF;

  IF lower(NEW.subject) = 'maths' THEN
    FOR v_option IN
      SELECT CASE jsonb_typeof(option_value)
        WHEN 'string' THEN option_value #>> '{}'
        WHEN 'object' THEN option_value ->> 'text'
        ELSE NULL
      END
      FROM jsonb_array_elements(NEW.options) AS option_value
    LOOP
      IF v_option ~ '^20[0-9]{2}[⁄/][0-9]{1,2}[⁄/][0-9]{1,2}$'
         OR v_option ~ '^[0-9]{1,2}月[0-9]{1,2}日$' THEN
        RAISE EXCEPTION 'A Maths option looks like a spreadsheet-converted date (%). Format fraction cells as Text before exporting CSV.', v_option;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;
