-- Fix same-link retakes and tighten repeated page-exit auto-submit threshold.

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
  v_active_attempt adm_attempts%ROWTYPE;
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

  SELECT * INTO v_active_attempt
  FROM adm_attempts
  WHERE candidate_id = v_attempt.candidate_id
    AND form_id = v_attempt.form_id
    AND status = 'in_progress'
    AND id <> v_attempt.id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_active_attempt.id IS NULL THEN
    UPDATE adm_attempts
    SET status = 'expired'
    WHERE id = p_attempt_id AND status = 'in_progress';
  END IF;

  UPDATE adm_candidates SET status = 'registered' WHERE id = v_attempt.candidate_id AND status <> 'placed';

  INSERT INTO adm_audit_log (school_id, action, target_type, target_id, details)
  VALUES (v_attempt.school_id, 'attempt_reset_for_retake', 'attempt', p_attempt_id,
          jsonb_build_object('reason', COALESCE(p_reason, 'Admin allowed retake'), 'kept_history', true, 'same_link_creates_fresh_attempt', true, 'active_attempt_id', v_active_attempt.id));

  RETURN jsonb_build_object('success', true, 'active_attempt_id', v_active_attempt.id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_adm_reset_attempt_for_retake(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_adm_start_attempt(p_token TEXT, p_form_code TEXT)
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
    v_final_attempt adm_attempts%ROWTYPE;
    v_counted_page_leaves INT := 0;
    v_expires_at TIMESTAMPTZ;
    v_retake_allowed BOOLEAN := false;
BEGIN
    SELECT * INTO v_candidate FROM adm_candidates WHERE token = p_token;
    IF v_candidate.id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Invalid access token'); END IF;
    IF v_candidate.status = 'placed' THEN RETURN jsonb_build_object('success', false, 'error', 'This candidate has already been placed'); END IF;
    SELECT * INTO v_form FROM adm_test_forms WHERE form_code = p_form_code AND school_id = v_candidate.school_id;
    IF v_form.id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Test form not found'); END IF;
    IF v_form.status != 'published' THEN RETURN jsonb_build_object('success', false, 'error', 'This test is not currently available'); END IF;
    SELECT * INTO v_blueprint FROM adm_blueprints WHERE id = v_form.blueprint_id;
    SELECT * INTO v_existing_attempt FROM adm_attempts WHERE candidate_id = v_candidate.id AND form_id = v_form.id AND status = 'in_progress' ORDER BY created_at DESC LIMIT 1;
    SELECT * INTO v_final_attempt FROM adm_attempts WHERE candidate_id = v_candidate.id AND form_id = v_form.id AND status IN ('submitted','scored','expired') ORDER BY submitted_at DESC NULLS LAST, created_at DESC LIMIT 1;
    SELECT EXISTS (SELECT 1 FROM adm_audit_log WHERE action = 'attempt_reset_for_retake' AND target_type = 'attempt' AND target_id = v_final_attempt.id AND created_at > COALESCE(v_final_attempt.submitted_at, v_final_attempt.created_at)) INTO v_retake_allowed;
    IF v_existing_attempt.id IS NOT NULL AND NOW() > v_existing_attempt.expires_at THEN UPDATE adm_attempts SET status = 'expired' WHERE id = v_existing_attempt.id; RETURN jsonb_build_object('success', false, 'error', 'Your test session has expired'); END IF;
    IF v_existing_attempt.id IS NULL AND v_final_attempt.id IS NOT NULL AND NOT v_retake_allowed THEN
      SELECT jsonb_agg(jsonb_build_object('id', q.id, 'question_type', q.question_type, 'stem', q.stem, 'stem_image_url', q.stem_image_url, 'passage', q.passage, 'reading_passage_id', q.reading_passage_id, 'diagnostic_skill', q.diagnostic_skill, 'options', q.options, 'keyword', q.keyword, 'base_word', q.base_word, 'marks', COALESCE(fq.marks_override, q.marks), 'question_order', fq.question_order) ORDER BY fq.question_order) INTO v_questions FROM adm_test_form_questions fq JOIN adm_questions q ON q.id = fq.question_id WHERE fq.form_id = v_form.id;
      SELECT COALESCE(jsonb_object_agg(question_id::text, response), '{}'::jsonb) INTO v_saved_answers FROM adm_answers WHERE attempt_id = v_final_attempt.id;
      RETURN jsonb_build_object('success', true, 'completed', true, 'attempt_id', v_final_attempt.id, 'attempt_status', v_final_attempt.status, 'submitted_at', v_final_attempt.submitted_at, 'candidate_name', v_candidate.full_name, 'subject', v_blueprint.subject, 'grade', COALESCE(v_blueprint.target_grade, v_blueprint.target_stage), 'form_title', CONCAT('Grade ', COALESCE(v_blueprint.target_grade, v_blueprint.target_stage), ' Admission Test'), 'questions', COALESCE(v_questions, '[]'::jsonb), 'saved_answers', COALESCE(v_saved_answers, '{}'::jsonb));
    END IF;
    IF v_existing_attempt.id IS NULL THEN
      v_expires_at := NOW() + (v_blueprint.duration_minutes || ' minutes')::INTERVAL; v_attempt_id := gen_random_uuid();
      INSERT INTO adm_attempts (id, candidate_id, form_id, school_id, expires_at, max_score, status) VALUES (v_attempt_id, v_candidate.id, v_form.id, v_candidate.school_id, v_expires_at, v_blueprint.total_marks, 'in_progress');
      UPDATE adm_candidates SET status = 'testing' WHERE id = v_candidate.id;
      INSERT INTO adm_audit_log (school_id, action, target_type, target_id, details) VALUES (v_candidate.school_id, 'attempt_started', 'attempt', v_attempt_id, jsonb_build_object('candidate', v_candidate.full_name, 'form_code', p_form_code, 'retake_of_attempt_id', CASE WHEN v_retake_allowed THEN v_final_attempt.id ELSE NULL END));
    ELSE v_attempt_id := v_existing_attempt.id; v_expires_at := v_existing_attempt.expires_at; END IF;
    SELECT jsonb_agg(jsonb_build_object('id', q.id, 'question_type', q.question_type, 'stem', q.stem, 'stem_image_url', q.stem_image_url, 'passage', q.passage, 'reading_passage_id', q.reading_passage_id, 'diagnostic_skill', q.diagnostic_skill, 'options', q.options, 'keyword', q.keyword, 'base_word', q.base_word, 'marks', COALESCE(fq.marks_override, q.marks), 'question_order', fq.question_order) ORDER BY fq.question_order) INTO v_questions FROM adm_test_form_questions fq JOIN adm_questions q ON q.id = fq.question_id WHERE fq.form_id = v_form.id;
    SELECT COALESCE(jsonb_object_agg(question_id::text, response), '{}'::jsonb) INTO v_saved_answers FROM adm_answers WHERE attempt_id = v_attempt_id;
    SELECT count(*)::int INTO v_counted_page_leaves FROM adm_candidate_test_events WHERE attempt_id = v_attempt_id AND event_type = 'tab_visible' AND COALESCE((event_payload->>'hidden_for_ms')::int, 0) >= 2000;
    RETURN jsonb_build_object('success', true, 'attempt_id', v_attempt_id, 'resumed', v_existing_attempt.id IS NOT NULL, 'expires_at', v_expires_at, 'duration_minutes', v_blueprint.duration_minutes, 'delivery_mode', v_blueprint.delivery_mode, 'subject', v_blueprint.subject, 'grade', COALESCE(v_blueprint.target_grade, v_blueprint.target_stage), 'form_title', CONCAT('Grade ', COALESCE(v_blueprint.target_grade, v_blueprint.target_stage), ' Admission Test'), 'candidate_name', v_candidate.full_name, 'questions', COALESCE(v_questions, '[]'::jsonb), 'saved_answers', COALESCE(v_saved_answers, '{}'::jsonb), 'attempt_status', 'in_progress', 'counted_page_leaves', v_counted_page_leaves, 'page_leave_auto_submit_threshold', 3);
END;
$$;
GRANT EXECUTE ON FUNCTION public.rpc_adm_start_attempt(TEXT, TEXT) TO anon, authenticated;
