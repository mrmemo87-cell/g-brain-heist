import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const scopeMigration = readFileSync('supabase/migrations/20260919230000_isolate_current_student_academic_context.sql', 'utf8');
const interventionMigration = readFileSync('supabase/migrations/20260919231500_optimize_current_intervention_intelligence.sql', 'utf8');
const archivedProfileMigration = readFileSync('supabase/migrations/20260919232500_fix_archived_academic_profile_context.sql', 'utf8');
const writingRosterMigration = readFileSync('supabase/migrations/20260919234000_fix_writing_monitor_current_roster_grade.sql', 'utf8');
const writingReportMigration = readFileSync('supabase/migrations/20260919235500_fix_writing_current_context_reports.sql', 'utf8');
const historicalWritingMigration = readFileSync('supabase/migrations/20260920000500_label_historical_writing_context.sql', 'utf8');
test('current academic profile starts at the current placement boundary', () => {
    assert.match(scopeMigration, /student_current_academic_context/i);
    assert.match(scopeMigration, /school_student_placement_history/i);
    assert.match(scopeMigration, /current_placement_only/i);
    assert.match(scopeMigration, /historical_placement_evidence_excluded/i);
    assert.match(archivedProfileMigration, /v_context_start_at timestamptz := null/i);
    assert.match(archivedProfileMigration, /current_placement_only.*p_academic_year_id = v_operational_year_id/is);
});
test('intervention question lookup is scoped before expensive recommendation work', () => {
    const candidateIndex = interventionMigration.indexOf('current_focus_candidates as');
    const questionLookupIndex = interventionMigration.indexOf('verified_questions_for_learning_focus');
    assert.ok(candidateIndex >= 0, 'current focus candidate scope must exist');
    assert.ok(questionLookupIndex > candidateIndex, 'question lookup must happen after current-context filtering');
    assert.match(interventionMigration, /qualified\.academic_year_id = v_year_id/i);
    assert.match(interventionMigration, /qualified\.observed_at >= coalesce\(v_context\.context_start_at/i);
    assert.match(interventionMigration, /historicalPlacementSignalsExcluded/i);
});
test('writing monitor uses authoritative current roster grade instead of stale profile json', () => {
    assert.match(writingRosterMigration, /rpc_bh_writing_teacher_monitoring_pre_context_20260919\(\s*p_month, null, p_genre/is);
    assert.match(writingRosterMigration, /ctx\.grade_level::integer = p_grade/i);
    assert.match(writingRosterMigration, /roster_grade_authority.*current_academic_placement/is);
    assert.match(writingRosterMigration, /historical_submission_count/i);
    assert.match(writingRosterMigration, /historical_context_excluded_from_status/i);
});
test('writing profile grade sync repairs both structured and nested legacy grade', () => {
    assert.match(writingReportMigration, /sync_writing_profile_grade_for_student/i);
    assert.match(writingReportMigration, /profile = jsonb_set\(coalesce\(p\.profile/i);
    assert.match(writingReportMigration, /bh_writing_authoritative_student_grade/i);
});
test('current writing report cannot reuse historical scores or weaknesses', () => {
    assert.match(writingReportMigration, /period_current_context_submission_count/i);
    assert.match(writingReportMigration, /assessment_authority', 'no_current_context_evidence/i);
    assert.match(writingReportMigration, /priority_weak_areas}', '.*\[\].*jsonb/is);
    assert.match(writingReportMigration, /current-placement writing sample before planning targeted writing support/i);
    assert.match(writingReportMigration, /a\.academic_year_id = v_year_id/i);
});
test('historical writing remains visible without inventing a historical class', () => {
    assert.match(historicalWritingMigration, /historical_period/i);
    assert.match(historicalWritingMigration, /grade_class_not_recorded/i);
    assert.match(historicalWritingMigration, /current placement is not applied retrospectively/i);
});
