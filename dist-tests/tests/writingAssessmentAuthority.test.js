import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assessWritingExam, WRITING_EVALUATOR_VERSION, WRITING_EARLIER_EVALUATOR_VERSION, WRITING_PREVIOUS_EVALUATOR_VERSION, WRITING_LEGACY_EVALUATOR_VERSION, WRITING_RUBRIC_VERSION, } from '../src/lib/brains_heist/writingAssessment.js';
import { buildWritingTextFingerprint, isAcademicProfileWritingAssessment, normalizeAuthoritativeWritingAssessment, } from '../src/lib/brains_heist/writingAssessmentAuthority.js';
const response = 'Dear Principal, our reading club helped students share ideas and gain confidence. I recommend keeping it next term.';
const evidenceQuote = 'our reading club helped students share ideas';
const evidenceStart = response.indexOf(evidenceQuote);
const buildPayload = () => {
    const criterion = (score) => ({
        score,
        confidence: 0.9,
        descriptor_id: `band_${score}`,
        justification: 'This exact evidence supports the awarded rubric band.',
        evidence: [{ quote: evidenceQuote, start_char: evidenceStart, end_char: evidenceStart + evidenceQuote.length }],
    });
    const fingerprint = buildWritingTextFingerprint(response);
    return {
        assessment: {
            assessment_id: '5e251fcf-7fe9-40b3-aec2-52a80ee958dd',
            assessment_status: 'verified',
            rubric_version: WRITING_RUBRIC_VERSION,
            evaluator_version: WRITING_EVALUATOR_VERSION,
            evaluator_model: 'frozen-evaluator-test',
            text_fingerprint: fingerprint,
            prompt_definition: {
                prompt_id: 'prompt-1',
                prompt_definition_hash: 'prompt_test_hash',
                grade: 9,
                genre: 'email',
                target_word_count: 120,
                audience: 'the school principal',
                purpose: 'recommend whether the reading club should continue',
                register: 'formal',
                difficulty_level: 'core',
            },
            criteria: {
                content: criterion(4),
                communicative_achievement: criterion(4),
                organisation: criterion(3),
                language: criterion(4),
            },
            total_score: 15,
            detected_content_points: ['explain the benefit', 'make a recommendation'],
            missed_content_points: [],
            shadow_heuristic_total: 12,
            adjudication_reason: 'primary_evidence_and_confidence_passed',
        },
        feedback: {
            task_understanding: 'You were asked to make a clear recommendation to your principal.',
            submission_read: 'You explained a benefit and recommended continuing the club.',
            alignment: 'on_task',
            what_is_working: ['You gave a direct recommendation.'],
            what_is_missing: [],
            grammar_fixes: [],
            punctuation_fixes: [],
            natural_phrase_upgrades: [],
            style_tone_feedback: [],
            next_move: 'Next, add one concrete example from the club.',
            example_revision_start: '',
            strengths: ['Clear purpose'],
            strength_evidence: [{
                    strength_tag: 'strong_content_coverage',
                    evidence: evidenceQuote,
                    explanation: 'This exact detail explains a concrete benefit of the club.',
                    start_char: evidenceStart,
                    end_char: evidenceStart + evidenceQuote.length,
                }],
            weaknesses: ['Development could be fuller'],
            weakness_tags: ['partial_content_coverage'],
            next_steps: ['Add one concrete supporting example.'],
            monthly_report_summary: 'You communicated the task clearly and should now develop your evidence.',
            anchor_version: 'bh-writing-anchors-v2',
            text_fingerprint: fingerprint,
            highlights: [],
            repair_steps: [],
        },
    };
};
const context = {
    grade: 9,
    genre: 'email',
    targetWordCount: 120,
    promptId: 'prompt-1',
    studentResponse: response,
};
test('verified assessment authority accepts only complete grounded rubric evidence', () => {
    const result = normalizeAuthoritativeWritingAssessment(buildPayload(), context);
    assert.equal(result.ok, true);
    if (!result.ok)
        return;
    assert.equal(result.data.assessment.total_score, 15);
    assert.equal(result.data.assessment.academic_profile_ready, true);
    assert.equal(isAcademicProfileWritingAssessment(result.data.assessment), true);
});
test('assessment provenance normalizes a numeric grade stored as text', () => {
    const textGradeContext = { ...context, grade: '9' };
    const result = normalizeAuthoritativeWritingAssessment(buildPayload(), textGradeContext);
    assert.equal(result.ok, true);
    if (result.ok)
        assert.equal(result.data.assessment.prompt_definition?.grade, 9);
});
test('assessment authority fails closed when a criterion quote is not grounded', () => {
    const payload = buildPayload();
    payload.assessment.criteria.language.evidence[0].start_char += 1;
    const result = normalizeAuthoritativeWritingAssessment(payload, context);
    assert.equal(result.ok, false);
    if (!result.ok)
        assert.match(result.error, /language evidence/i);
});
test('assessment authority fails closed on a wrong draft fingerprint or provisional status', () => {
    const wrongDraft = buildPayload();
    wrongDraft.assessment.text_fingerprint = 'fp_wrong';
    assert.equal(normalizeAuthoritativeWritingAssessment(wrongDraft, context).ok, false);
    const provisional = buildPayload();
    provisional.assessment.assessment_status = 'needs_review';
    const provisionalResult = normalizeAuthoritativeWritingAssessment(provisional, context);
    assert.equal(provisionalResult.ok, true);
    if (provisionalResult.ok) {
        assert.equal(provisionalResult.data.assessment.academic_profile_ready, false);
        assert.equal(isAcademicProfileWritingAssessment(provisionalResult.data.assessment), false);
    }
});
test('assessment authority rejects invented or misanchored strength evidence', () => {
    const invented = buildPayload();
    invented.feedback.strength_evidence[0].evidence = 'an invented strength';
    assert.equal(normalizeAuthoritativeWritingAssessment(invented, context).ok, false);
    const shifted = buildPayload();
    shifted.feedback.strength_evidence[0].start_char += 1;
    shifted.feedback.strength_evidence[0].end_char += 1;
    assert.equal(normalizeAuthoritativeWritingAssessment(shifted, context).ok, false);
});
test('assessment authority accepts the audited v2 rollback and current v3 evaluator versions only', () => {
    const earlier = buildPayload();
    earlier.assessment.evaluator_version = WRITING_EARLIER_EVALUATOR_VERSION;
    assert.equal(normalizeAuthoritativeWritingAssessment(earlier, context).ok, true);
    const previous = buildPayload();
    previous.assessment.evaluator_version = WRITING_PREVIOUS_EVALUATOR_VERSION;
    assert.equal(normalizeAuthoritativeWritingAssessment(previous, context).ok, true);
    const legacy = buildPayload();
    legacy.assessment.evaluator_version = WRITING_LEGACY_EVALUATOR_VERSION;
    assert.equal(normalizeAuthoritativeWritingAssessment(legacy, context).ok, true);
    const unknown = buildPayload();
    unknown.assessment.evaluator_version = 'bh-writing-assessment-untrusted';
    assert.equal(normalizeAuthoritativeWritingAssessment(unknown, context).ok, false);
});
test('legacy heuristic output is never academic-profile-ready', () => {
    const legacy = assessWritingExam({
        promptText: 'Write an email. Explain the event, its benefit, and one recommendation.',
        grade: 9,
        genre: 'email',
        targetWordCount: 120,
        studentResponse: 'Dear Principal event benefit recommendation regards',
    });
    assert.equal(isAcademicProfileWritingAssessment(legacy), false);
});
test('production source uses one strict assessment result for score and cinematic feedback', () => {
    const hub = readFileSync('src/pages/writing/WritingHub.tsx', 'utf8');
    const activeLoop = hub.slice(hub.indexOf('const WritingHubSimpleLoop'));
    const edge = readFileSync('supabase/functions/bh_writing_ai/index.ts', 'utf8');
    const integration = readFileSync('src/lib/brains_heist/writingIntegrationService.ts', 'utf8');
    const migration = readFileSync('supabase/migrations/20260812190000_writing_assessment_authority_v2.sql', 'utf8');
    assert.match(activeLoop, /mode: 'assessment_v2'/);
    assert.match(activeLoop, /authoritative_assessment: authority\.assessment/);
    assert.match(activeLoop, /authoritative_feedback: authority\.feedback/);
    assert.doesNotMatch(activeLoop.slice(activeLoop.indexOf('const submitAttempt'), activeLoop.indexOf('const playSavedCinematicFeedback')), /mode: 'feedback'/);
    assert.doesNotMatch(activeLoop, /const targetWordCount = 110/);
    assert.match(edge, /type: "json_schema"/);
    assert.match(edge, /strict: true/);
    assert.match(edge, /Assessment evidence failed strict validation/);
    assert.match(edge, /assessment_status = verified \? "verified" : "needs_review"/);
    assert.match(edge, /single Brains Heist writing assessment authority/);
    assert.match(edge, /Inspect the complete draft twice/);
    assert.match(edge, /diagnostic_coverage_complete/);
    assert.match(edge, /false_positive_free/);
    assert.match(edge, /languageAuditSchema/);
    assert.match(edge, /uncertain_items/);
    assert.match(edge, /missing_corrections/);
    assert.match(edge, /rejected_corrections/);
    assert.match(edge, /canonical_corrections/);
    assert.match(edge, /repairedCorrections/);
    assert.match(edge, /groundCanonicalCorrection/);
    assert.match(edge, /pendingLanguageAudits = assessmentMode && !SINGLE_AUTHORITY_PIPELINE/);
    assert.match(edge, /single_authority_self_audit_with_deterministic_grounding/);
    assert.match(edge, /singlePassGrounded/);
    assert.match(edge, /correctionMap/);
    assert.match(edge, /diagnostic_pass_count: diagnosticAudit\?\.pass_count \?\? 0/);
    assert.match(edge, /natural standard-English correction/);
    assert.match(edge, /accurate grammatical terminology/);
    assert.match(edge, /diagnostic_corrections_count/);
    assert.match(edge, /BH_WRITING_PIPELINE_VERSION/);
    assert.match(edge, /canonical-v3\.9/);
    assert.match(edge, /bh-writing-assessment-v3\.9/);
    assert.match(edge, /strength_evidence/);
    assert.match(edge, /Every strength_evidence value must also be an exact unique span/);
    assert.match(edge, /"primary-assessment"/);
    assert.match(edge, /writing_assessment_timeout/);
    assert.match(edge, /Do not spend two additional sequential/);
    assert.match(edge, /https:\/\/api\.openai\.com\/v1\/responses/);
    assert.match(edge, /request\.reasoning_effort \?\? WRITING_REASONING_EFFORT/);
    assert.match(edge, /WRITING_PRIMARY_REASONING_EFFORT/);
    assert.match(edge, /max_output_tokens: request\.max_output_tokens/);
    assert.match(edge, /text: \{[\s\S]*format: \{[\s\S]*type: "json_schema"/);
    assert.match(edge, /const isGpt5Family/);
    assert.doesNotMatch(edge, /openai@4\.52\.3/);
    assert.doesNotMatch(edge, /openai\.chat\.completions\.create/);
    assert.match(integration, /readWritingAiFunctionError/);
    assert.match(integration, /record\.context\.clone\(\)\.json\(\)/);
    assert.match(edge, /final_residual_audit_ms/);
    assert.match(edge, /release confirmation audit/i);
    assert.match(edge, /diagnostic_inventory_ready/);
    assert.match(edge, /Repair the remaining gaps in a student-facing correction inventory/);
    assert.match(edge, /accepted_inventory is already grounded and must be preserved/);
    assert.match(edge, /correctionsToFeedbackLists\(studentFacingCorrections\)/);
    assert.doesNotMatch(edge, /grammar_fixes: \[\]/);
    assert.match(edge, /legacy-v2/);
    assert.match(edge, /canonicalAdjudicatorSchema/);
    assert.match(edge, /The two audits are candidate proposals, never facts/);
    assert.match(edge, /applyCanonicalCorrections/);
    assert.match(edge, /residualAuditSchema/);
    assert.match(edge, /residual_clean/);
    assert.match(edge, /release verifier is the final adjudicator/i);
    assert.match(edge, /pipeline_timings_ms/);
    assert.match(edge, /request_metadata: \{ openai_request_id: openAiRequestId, usage, pipeline: pipelineDiagnostics \}/);
    assert.match(edge, /WRITING_ASSESSMENT_MODEL.*gpt-4o/);
    assert.match(edge, /const shouldVerify = enoughWriting/);
    assert.match(edge, /Boolean\(diagnosticAudit\)/);
    assert.match(edge, /diagnostic_coverage_incomplete/);
    assert.match(edge, /diagnostic_false_positive_risk/);
    assert.doesNotMatch(edge, /shouldVerify = confidenceAcceptable/);
    assert.match(hub, /The corrected version is:/);
    assert.doesNotMatch(hub, /reads correctly: "\$\{originalSentence\}"/);
    assert.match(hub, /personalizedRevisionMission/);
    assert.match(hub, /<strong>Focus memory:<\/strong>/);
    assert.match(hub, /<strong>Strength memory:<\/strong>/);
    assert.match(hub, /strength_evidence/);
    assert.match(edge, /grade: String\(payload\.grade\)/);
    assert.match(edge, /genre: payload\.genre/);
    const finale = activeLoop.slice(activeLoop.indexOf('className="cinematic-feedback__finale"'));
    assert.ok(finale.indexOf('className="cinematic-feedback__finale-copy"') < finale.indexOf('aria-label="Rubric scores"'), 'revision mission should appear before rubric scores in the cinematic finale');
    assert.match(migration, /bh_writing_assessments/);
    assert.match(migration, /bh_writing_assessment_reviews/);
    assert.match(migration, /bh_writing_canonical_assessments/);
    assert.match(migration, /security_invoker = true/);
    assert.match(migration, /academic_profile_ready/);
    assert.match(migration, /assessment_status.*verified/);
    assert.match(migration, /rpc_bh_writing_teacher_monitoring_legacy_v1/);
    assert.match(migration, /rpc_bh_writing_teacher_weakness_counts_legacy_v1/);
    assert.match(migration, /rpc_bh_writing_teacher_report_legacy_v1/);
    assert.match(migration, /to_char\(c\.canonical_at, 'YYYY-MM'\) = v_month/);
    assert.match(migration, /prompt_definition,genre/);
});
