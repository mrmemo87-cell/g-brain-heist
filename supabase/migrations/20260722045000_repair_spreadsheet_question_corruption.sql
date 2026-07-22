-- Repair spreadsheet-coerced fraction answers and prevent silent recurrence.

CREATE TABLE IF NOT EXISTS public.question_data_repair_audit (
  repair_key text NOT NULL,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  original_options jsonb,
  original_correct_answer text,
  repaired_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (repair_key, question_id)
);

ALTER TABLE public.question_data_repair_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.question_data_repair_audit FROM anon, authenticated;

INSERT INTO public.question_data_repair_audit
  (repair_key, question_id, original_options, original_correct_answer)
SELECT
  '20260722_spreadsheet_fraction_dates',
  q.id,
  q.options,
  q.correct_answer
FROM public.questions q
WHERE lower(q.subject) = 'maths'
  AND (
    q.options::text ~ '(20[0-9]{2}[⁄/][0-9]{1,2}[⁄/][0-9]{1,2}|[0-9]{1,2}月[0-9]{1,2}日)'
    OR q.correct_answer ~ '(20[0-9]{2}[⁄/][0-9]{1,2}[⁄/][0-9]{1,2}|[0-9]{1,2}月[0-9]{1,2}日)'
  )
ON CONFLICT (repair_key, question_id) DO NOTHING;

WITH repaired AS (
  SELECT
    q.id,
    jsonb_agg(
      to_jsonb(
        CASE
          WHEN item.value ~ '^20[0-9]{2}[⁄/]([0-9]{1,2})[⁄/]([0-9]{1,2})$'
            THEN regexp_replace(item.value, '^20[0-9]{2}[⁄/]([0-9]{1,2})[⁄/]([0-9]{1,2})$', E'\\1/\\2')
          WHEN item.value ~ '^([0-9]{1,2})月([0-9]{1,2})日$'
            THEN regexp_replace(item.value, '^([0-9]{1,2})月([0-9]{1,2})日$', E'\\1/\\2')
          ELSE item.value
        END
      )
      ORDER BY item.ordinality
    ) AS options
  FROM public.questions q
  CROSS JOIN LATERAL jsonb_array_elements_text(q.options) WITH ORDINALITY AS item(value, ordinality)
  WHERE lower(q.subject) = 'maths'
    AND q.options::text ~ '(20[0-9]{2}[⁄/][0-9]{1,2}[⁄/][0-9]{1,2}|[0-9]{1,2}月[0-9]{1,2}日)'
  GROUP BY q.id
)
UPDATE public.questions q
SET
  options = repaired.options,
  correct_answer = CASE
    WHEN q.correct_answer ~ '^20[0-9]{2}[⁄/]([0-9]{1,2})[⁄/]([0-9]{1,2})$'
      THEN regexp_replace(q.correct_answer, '^20[0-9]{2}[⁄/]([0-9]{1,2})[⁄/]([0-9]{1,2})$', E'\\1/\\2')
    WHEN q.correct_answer ~ '^([0-9]{1,2})月([0-9]{1,2})日$'
      THEN regexp_replace(q.correct_answer, '^([0-9]{1,2})月([0-9]{1,2})日$', E'\\1/\\2')
    ELSE q.correct_answer
  END,
  updated_at = now()
FROM repaired
WHERE q.id = repaired.id;

INSERT INTO public.question_data_repair_audit
  (repair_key, question_id, original_options, original_correct_answer)
SELECT
  '20260722_spreadsheet_formula_boolean',
  q.id,
  q.options,
  q.correct_answer
FROM public.questions q
WHERE q.id = '00baeda2-794a-4fe5-9849-069b70932f88'
ON CONFLICT (repair_key, question_id) DO NOTHING;

UPDATE public.questions
SET
  options = '["-8 > -3", "-3 < -8", "8 < -3", "-8 < -3"]'::jsonb,
  correct_answer = '-8 < -3',
  updated_at = now()
WHERE id = '00baeda2-794a-4fe5-9849-069b70932f88'
  AND question_text = 'Which statement is true?'
  AND explanation = 'On the number line, -8 is to the left of -3.';

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

  SELECT count(*), count(DISTINCT lower(btrim(value)))
  INTO v_option_count, v_unique_count
  FROM jsonb_array_elements_text(NEW.options);

  IF v_option_count < 2 THEN
    RAISE EXCEPTION 'Multiple-choice questions require at least two options';
  END IF;

  IF v_option_count <> v_unique_count THEN
    RAISE EXCEPTION 'Multiple-choice options must be unique. A spreadsheet may have evaluated formulas into duplicate TRUE/FALSE values.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(NEW.options) option_value
    WHERE option_value = NEW.correct_answer
  ) THEN
    RAISE EXCEPTION 'The correct answer must exactly match one of the options';
  END IF;

  IF lower(NEW.subject) = 'maths' THEN
    FOR v_option IN SELECT value FROM jsonb_array_elements_text(NEW.options)
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

DROP TRIGGER IF EXISTS trg_validate_question_import_quality ON public.questions;
CREATE TRIGGER trg_validate_question_import_quality
BEFORE INSERT OR UPDATE OF options, correct_answer, question_type, subject
ON public.questions
FOR EACH ROW
EXECUTE FUNCTION public.validate_question_import_quality();
