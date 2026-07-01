-- Soft candidate test integrity/activity events for Admission Hub.

CREATE TABLE IF NOT EXISTS public.adm_candidate_test_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES public.adm_candidates(id) ON DELETE CASCADE,
  attempt_id uuid NOT NULL REFERENCES public.adm_attempts(id) ON DELETE CASCADE,
  form_id uuid NOT NULL REFERENCES public.adm_test_forms(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('page_opened','page_reopened','page_reload','tab_hidden','tab_visible','possible_multi_session','submit_clicked','submit_time_expired','submitted')),
  event_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_adm_candidate_test_events_attempt ON public.adm_candidate_test_events(attempt_id, created_at);
CREATE INDEX IF NOT EXISTS idx_adm_candidate_test_events_school ON public.adm_candidate_test_events(school_id, created_at DESC);
ALTER TABLE public.adm_candidate_test_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "adm_candidate_events_school_staff_select" ON public.adm_candidate_test_events;
CREATE POLICY "adm_candidate_events_school_staff_select"
  ON public.adm_candidate_test_events FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.school_members sm
    WHERE sm.school_id = adm_candidate_test_events.school_id
      AND sm.user_id = auth.uid()
      AND sm.role_in_school IN ('school_admin', 'teacher')
      AND sm.status = 'active'
  ));

CREATE OR REPLACE FUNCTION public.rpc_adm_log_attempt_event(
  p_token text,
  p_form_code text,
  p_attempt_id uuid,
  p_event_type text,
  p_event_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_candidate adm_candidates%ROWTYPE;
  v_attempt adm_attempts%ROWTYPE;
  v_form adm_test_forms%ROWTYPE;
BEGIN
  SELECT * INTO v_candidate FROM adm_candidates WHERE token = p_token;
  IF v_candidate.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid test link');
  END IF;

  SELECT * INTO v_form FROM adm_test_forms
  WHERE form_code = p_form_code AND school_id = v_candidate.school_id;
  IF v_form.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Test form not found');
  END IF;

  SELECT * INTO v_attempt FROM adm_attempts
  WHERE id = p_attempt_id
    AND candidate_id = v_candidate.id
    AND form_id = v_form.id
    AND school_id = v_candidate.school_id;
  IF v_attempt.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Attempt not found');
  END IF;

  INSERT INTO adm_candidate_test_events (school_id, candidate_id, attempt_id, form_id, event_type, event_payload)
  VALUES (v_candidate.school_id, v_candidate.id, v_attempt.id, v_form.id, p_event_type, COALESCE(p_event_payload, '{}'::jsonb));

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_adm_log_attempt_event(text, text, uuid, text, jsonb) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.rpc_adm_reset_attempt_for_retake(
  p_attempt_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt adm_attempts%ROWTYPE;
BEGIN
  SELECT * INTO v_attempt FROM adm_attempts WHERE id = p_attempt_id;
  IF v_attempt.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Attempt not found');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM school_members sm
    WHERE sm.school_id = v_attempt.school_id
      AND sm.user_id = auth.uid()
      AND sm.role_in_school = 'school_admin'
      AND sm.status = 'active'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied — not a school admin of this school');
  END IF;

  UPDATE adm_attempts
  SET status = 'expired'
  WHERE id = p_attempt_id AND status IN ('in_progress', 'submitted', 'scored');

  UPDATE adm_candidates SET status = 'registered' WHERE id = v_attempt.candidate_id AND status <> 'placed';

  INSERT INTO adm_audit_log (school_id, action, target_type, target_id, details)
  VALUES (v_attempt.school_id, 'attempt_reset_for_retake', 'attempt', p_attempt_id,
          jsonb_build_object('reason', COALESCE(p_reason, 'Admin allowed retake'), 'kept_history', true));

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_adm_reset_attempt_for_retake(uuid, text) TO authenticated;

-- Add resume answers and event summaries to candidate start/report RPCs.
CREATE OR REPLACE FUNCTION public.rpc_adm_start_attempt(
    p_token TEXT,
    p_form_code TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_candidate adm_candidates%ROWTYPE;
    v_form adm_test_forms%ROWTYPE;
    v_blueprint adm_blueprints%ROWTYPE;
    v_attempt_id UUID;
    v_existing_attempt adm_attempts%ROWTYPE;
    v_questions JSONB;
    v_saved_answers JSONB;
    v_expires_at TIMESTAMPTZ;
BEGIN
    SELECT * INTO v_candidate FROM adm_candidates WHERE token = p_token;
    IF v_candidate.id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Invalid access token'); END IF;
    IF v_candidate.status = 'placed' THEN RETURN jsonb_build_object('success', false, 'error', 'This candidate has already been placed'); END IF;

    SELECT * INTO v_form FROM adm_test_forms WHERE form_code = p_form_code AND school_id = v_candidate.school_id;
    IF v_form.id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Test form not found'); END IF;
    IF v_form.status != 'published' THEN RETURN jsonb_build_object('success', false, 'error', 'This test is not currently available'); END IF;
    SELECT * INTO v_blueprint FROM adm_blueprints WHERE id = v_form.blueprint_id;

    SELECT * INTO v_existing_attempt FROM adm_attempts
    WHERE candidate_id = v_candidate.id AND form_id = v_form.id AND status = 'in_progress'
    ORDER BY created_at DESC LIMIT 1;

    IF v_existing_attempt.id IS NOT NULL AND NOW() > v_existing_attempt.expires_at THEN
      UPDATE adm_attempts SET status = 'expired' WHERE id = v_existing_attempt.id;
      RETURN jsonb_build_object('success', false, 'error', 'Your test session has expired');
    END IF;

    IF v_existing_attempt.id IS NULL AND EXISTS (SELECT 1 FROM adm_attempts WHERE candidate_id = v_candidate.id AND form_id = v_form.id) THEN
      RETURN jsonb_build_object('success', false, 'error', 'This test has already been submitted or closed by the school. Please contact admissions if you need help.');
    END IF;

    IF v_existing_attempt.id IS NULL THEN
      v_expires_at := NOW() + (v_blueprint.duration_minutes || ' minutes')::INTERVAL;
      v_attempt_id := gen_random_uuid();
      INSERT INTO adm_attempts (id, candidate_id, form_id, school_id, expires_at, max_score, status)
      VALUES (v_attempt_id, v_candidate.id, v_form.id, v_candidate.school_id, v_expires_at, v_blueprint.total_marks, 'in_progress');
      UPDATE adm_candidates SET status = 'testing' WHERE id = v_candidate.id;
      INSERT INTO adm_audit_log (school_id, action, target_type, target_id, details)
      VALUES (v_candidate.school_id, 'attempt_started', 'attempt', v_attempt_id, jsonb_build_object('candidate', v_candidate.full_name, 'form_code', p_form_code));
    ELSE
      v_attempt_id := v_existing_attempt.id;
      v_expires_at := v_existing_attempt.expires_at;
    END IF;

    SELECT jsonb_agg(jsonb_build_object(
      'id', q.id, 'question_type', q.question_type, 'stem', q.stem, 'stem_image_url', q.stem_image_url,
      'passage', q.passage, 'reading_passage_id', q.reading_passage_id, 'diagnostic_skill', q.diagnostic_skill,
      'options', q.options, 'keyword', q.keyword, 'base_word', q.base_word,
      'marks', COALESCE(fq.marks_override, q.marks), 'question_order', fq.question_order
    ) ORDER BY fq.question_order) INTO v_questions
    FROM adm_test_form_questions fq JOIN adm_questions q ON q.id = fq.question_id WHERE fq.form_id = v_form.id;

    SELECT COALESCE(jsonb_object_agg(question_id::text, response), '{}'::jsonb) INTO v_saved_answers
    FROM adm_answers WHERE attempt_id = v_attempt_id;

    RETURN jsonb_build_object(
      'success', true, 'attempt_id', v_attempt_id, 'resumed', v_existing_attempt.id IS NOT NULL,
      'expires_at', v_expires_at, 'duration_minutes', v_blueprint.duration_minutes,
      'delivery_mode', v_blueprint.delivery_mode, 'subject', v_blueprint.subject,
      'grade', COALESCE(v_blueprint.target_grade, v_blueprint.target_stage),
      'form_title', CONCAT('Grade ', COALESCE(v_blueprint.target_grade, v_blueprint.target_stage), ' ', CASE WHEN lower(v_blueprint.subject) IN ('math','maths','mathematics') THEN 'Maths' WHEN lower(v_blueprint.subject) = 'science' THEN 'Science' ELSE 'English' END, ' Admission Test'),
      'candidate_name', v_candidate.full_name, 'questions', COALESCE(v_questions, '[]'::jsonb), 'saved_answers', COALESCE(v_saved_answers, '{}'::jsonb)
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_adm_get_attempt_activity(p_attempt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt adm_attempts%ROWTYPE;
  v_events jsonb;
  v_notes jsonb;
BEGIN
  SELECT * INTO v_attempt FROM adm_attempts WHERE id = p_attempt_id;
  IF v_attempt.id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Attempt not found'); END IF;
  IF NOT EXISTS (SELECT 1 FROM school_members sm WHERE sm.school_id = v_attempt.school_id AND sm.user_id = auth.uid() AND sm.role_in_school IN ('school_admin','teacher') AND sm.status = 'active') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied — not a member of this school');
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('event_type', event_type, 'event_payload', event_payload, 'created_at', created_at) ORDER BY created_at), '[]'::jsonb) INTO v_events FROM adm_candidate_test_events WHERE attempt_id = p_attempt_id;
  WITH counts AS (SELECT event_type, count(*) c FROM adm_candidate_test_events WHERE attempt_id = p_attempt_id GROUP BY event_type)
  SELECT COALESCE(jsonb_agg(note), '[]'::jsonb) INTO v_notes FROM (
    SELECT CASE
      WHEN event_type IN ('page_opened','page_reopened') THEN 'Page opened ' || c || ' time' || CASE WHEN c=1 THEN '' ELSE 's' END
      WHEN event_type = 'tab_hidden' THEN 'Candidate left the test page ' || c || ' time' || CASE WHEN c=1 THEN '' ELSE 's' END
      WHEN event_type = 'tab_visible' THEN 'Candidate returned to the test page ' || c || ' time' || CASE WHEN c=1 THEN '' ELSE 's' END
      WHEN event_type IN ('submit_clicked','submitted','submit_time_expired') THEN 'Test submitted normally'
      ELSE initcap(replace(event_type, '_', ' ')) || ': ' || c
    END AS note FROM counts
    UNION ALL
    SELECT 'Unusual activity: repeated tab switching' WHERE (SELECT COALESCE(sum(c),0) FROM counts WHERE event_type='tab_hidden') >= 3
  ) n;
  RETURN jsonb_build_object('success', true, 'events', v_events, 'notes', v_notes);
END;
$$;
GRANT EXECUTE ON FUNCTION public.rpc_adm_get_attempt_activity(uuid) TO authenticated;
