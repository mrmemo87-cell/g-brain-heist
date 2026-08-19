import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const migration = readFileSync('supabase/migrations/20260811110000_teacher_approved_intervention_pilot.sql', 'utf8');
const roadmap = readFileSync('docs/academic-intelligence-roadmap.md', 'utf8');
const service = readFileSync('services/studentInterventionService.ts', 'utf8');
const page = readFileSync('components/student-progress/TeacherInterventionIntelligencePage.tsx', 'utf8');
const pilotTables = [
    'student_learning_intervention_approvals',
    'student_learning_intervention_checkpoints',
    'student_learning_intervention_evidence_snapshots',
    'student_learning_intervention_outcome_reviews',
];
test('phase 7 extends the existing intervention workflow instead of duplicating it', () => {
    assert.match(migration, /alter table public\.student_learning_interventions/i);
    assert.doesNotMatch(migration, /create table public\.student_learning_interventions\s*\(/i);
    assert.match(roadmap, /upgrades the existing Student Support Plans workflow/i);
});
test('new pilot records are fail closed and service managed', () => {
    for (const table of pilotTables) {
        assert.match(migration, new RegExp(`create table public\\.${table}`, 'i'));
        assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
        assert.match(migration, new RegExp(`revoke all on table public\\.${table}`, 'i'));
        assert.match(migration, new RegExp(`grant select, insert, update, delete on table public\\.${table} to service_role`, 'i'));
    }
});
test('plan creation depends on confidence and progress validation', () => {
    assert.match(migration, /Current confidence baseline is unavailable/i);
    assert.match(migration, /Validated shadow comparison is required before intervention/i);
    assert.match(migration, /Completed teacher validation is required before intervention/i);
    assert.match(migration, /v_shadow\.teacher_review_required/i);
});
test('baseline freezes academic context confidence and exact evidence', () => {
    for (const field of [
        'academic_year_id', 'academic_subject_id', 'confidence_policy_id',
        'baseline_confidence_state_id', 'validation_shadow_result_id',
        'baseline_cutoff_at', 'baseline_snapshot_hash', 'baseline_confidence_score',
        'baseline_confidence_band', 'baseline_assessment_state',
        'baseline_qualifying_observations',
    ])
        assert.match(migration, new RegExp(field, 'i'));
    assert.match(migration, /evidence_role in \('baseline','follow_up'\)/i);
    assert.match(migration, /observation_snapshot_hash/i);
    assert.match(migration, /extensions\.digest[\s\S]+sha256/i);
});
test('drafts require measurable evidence targets', () => {
    assert.match(migration, /target_status in \('improving','resolved','emerging_strength','consistent_strength'\)/i);
    assert.match(migration, /target_min_followup_observations between 1 and 20/i);
    assert.match(migration, /target_min_successful_observations between 1 and target_min_followup_observations/i);
    assert.match(migration, /A measurable teacher goal is required/i);
    assert.match(migration, /A current or future review date is required/i);
});
test('explicit approval is mandatory and never starts a plan', () => {
    assert.match(migration, /rpc_teacher_review_learning_intervention_plan/i);
    assert.match(migration, /Only a pending planned intervention can be reviewed/i);
    assert.match(migration, /Teacher approval is required before starting this intervention/i);
    assert.match(migration, /'planAutomaticallyStarted', false/i);
    assert.match(page, /Review & approve plan/i);
});
test('follow-up uses only same-year post-baseline observations', () => {
    assert.match(migration, /o\.academic_year_id = v_i\.academic_year_id/i);
    assert.match(migration, /o\.observed_at > v_i\.baseline_cutoff_at and o\.observed_at <= p_as_of/i);
    assert.match(migration, /student_learning_observation_is_qualified/i);
    assert.match(migration, /o\.observation_type in \('developing','strength'\)/i);
});
test('checkpoint evaluation records every material comparison input', () => {
    for (const field of [
        'observation_count', 'qualifying_observation_count',
        'successful_observation_count', 'candidate_status', 'candidate_trend',
        'system_outcome', 'evidence_latest_at', 'evidence_snapshot_hash',
        'comparison_snapshot', 'evaluated_as_of',
    ])
        assert.match(migration, new RegExp(field, 'i'));
    assert.match(migration, /rpc_teacher_evaluate_learning_intervention/i);
});
test('system outcomes distinguish sufficiency progress decline and contradiction', () => {
    for (const outcome of [
        'insufficient_follow_up', 'improved', 'resolved',
        'no_change', 'declined', 'contradictory',
    ])
        assert.match(migration, new RegExp(`'${outcome}'`, 'i'));
    assert.match(migration, /v_qualified < v_i\.target_min_followup_observations/i);
    assert.match(migration, /v_successful < v_i\.target_min_successful_observations/i);
});
test('measurement cannot close an intervention automatically', () => {
    assert.match(migration, /'interventionAutomaticallyClosed', false/i);
    assert.match(migration, /teacherConfirmationRequired', true/i);
    assert.match(migration, /rpc_teacher_confirm_learning_intervention_outcome/i);
    assert.match(roadmap, /measured checkpoint never closes a plan automatically/i);
});
test('teacher confirmation supports accountable override or more evidence', () => {
    assert.match(migration, /decision in \('confirmed','overridden','continue_collecting'\)/i);
    assert.match(migration, /Confirmed outcome must match the measured system outcome/i);
    assert.match(migration, /detailed professional rationale is required to override/i);
    assert.match(migration, /follow_up_continued/i);
});
test('academic audit records become immutable after capture', () => {
    assert.match(migration, /intervention_evidence_record_is_append_only/i);
    assert.match(migration, /evaluated_intervention_checkpoint_is_immutable/i);
    for (const table of [
        'student_learning_intervention_approvals',
        'student_learning_intervention_evidence_snapshots',
        'student_learning_intervention_outcome_reviews',
        'student_learning_intervention_events',
    ])
        assert.match(migration, new RegExp(`before update or delete on public\\.${table}`, 'i'));
});
test('teacher scope uses canonical subject aliases and active assignments', () => {
    assert.match(migration, /class_teacher_assignments/i);
    assert.match(migration, /cta\.active is true/i);
    assert.match(migration, /academic_normalize_subject_key\(cta\.subject\)/i);
    assert.match(migration, /academic_resolve_subject_id\(p_subject, u\.school_id\)/i);
    assert.match(migration, /public\.is_school_owner\(u\.school_id\)/i);
});
test('pilot read contract removes cross-subject intervention widening', () => {
    assert.match(migration, /rpc_teacher_student_intervention_pilot/i);
    assert.match(migration, /student_learning_can_manage_intervention\(i\.student_id, i\.subject\)/i);
    assert.match(service, /rpc_teacher_student_intervention_workspace_v2/i);
    assert.match(migration, /automaticPrescriptionEnabled', false/i);
});
test('browser RPCs are explicit and privileged tables remain inaccessible', () => {
    for (const fn of [
        'rpc_teacher_create_learning_intervention_v2',
        'rpc_teacher_review_learning_intervention_plan',
        'rpc_teacher_evaluate_learning_intervention',
        'rpc_teacher_confirm_learning_intervention_outcome',
        'rpc_teacher_student_intervention_pilot',
    ]) {
        assert.match(migration, new RegExp(`revoke all on function public\\.${fn}`, 'i'));
        assert.match(migration, new RegExp(`grant execute on function public\\.${fn}[\\s\\S]+?to authenticated, service_role`, 'i'));
    }
    assert.doesNotMatch(migration, /auth\.role\(\)/i);
});
test('teacher UI captures targets and presents measured follow-up', () => {
    assert.match(page, /Measurable student goal/i);
    assert.match(page, /Qualifying follow-ups/i);
    assert.match(page, /Successful follow-ups/i);
    assert.match(page, /evidence baseline will be frozen and hashed/i);
    assert.match(page, /Evaluate follow-up & record outcome/i);
    assert.match(service, /rpc_teacher_create_learning_intervention_v3/i);
    assert.match(service, /rpc_teacher_evaluate_learning_intervention/i);
});
test('phase 7 rollout keeps activity separate from academic outcome', () => {
    assert.match(roadmap, /## Phase 7 contract/i);
    assert.match(roadmap, /### Phase 7 rollout gate/i);
    assert.match(roadmap, /activity volume is not an academic outcome/i);
    assert.match(roadmap, /Candidate decision, totals, comparison,[\s\S]+must be identical/i);
    assert.match(roadmap, /Do not present intervention[\s\S]+effectiveness school-wide/i);
});
