import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20261004214000_english_dynamic_diagnostics_and_option_balance.sql',
  'utf8',
);
const service = readFileSync('services/englishDiagnosticLauncherService.ts', 'utf8');
const launcher = readFileSync('components/teacher/EnglishDiagnosticLauncher.tsx', 'utf8');
const page = readFileSync('components/teacher/TeacherCurriculumIntelligencePage.tsx', 'utf8');

test('future assignment snapshots balance MCQ positions without rewriting canonical questions', () => {
  assert.match(migration, /create or replace function private\.balance_assignment_question_options\(\)/);
  assert.match(
    migration,
    /create trigger trg_zzz_assignment_question_option_balance\s+before insert on public\.assignment_questions/,
  );
  assert.match(migration, /new\.question_snapshot := jsonb_set\([\s\S]*'\{options\}'/);
  assert.match(migration, /v_block := \(greatest\(coalesce\(new\.order_index,1\),1\) - 1\) \/ v_option_count/);
  assert.match(migration, /offset v_slot\s+limit 1/);
  assert.doesNotMatch(migration, /update public\.questions\s+set/i);
  assert.doesNotMatch(migration, /update public\.assignment_questions\s+set/i);
});

test('diagnostic publication enforces balanced answer keys and rejects long positional runs', () => {
  assert.match(migration, /create or replace function private\.assert_assignment_mcq_answer_balance/);
  assert.match(migration, /diagnostic_answer_positions_not_balanced/);
  assert.match(migration, /diagnostic_answer_position_run_too_long/);
  assert.match(
    migration,
    /perform private\.assert_assignment_mcq_answer_balance\(v_assignment\.id\)/,
  );
});

test('English diagnostics are dynamic fresh forms with three governed evidence depths', () => {
  for (const key of [
    'english-core-quick-20',
    'english-core-diagnostic-30',
    'english-core-deep-40',
  ]) {
    assert.match(migration, new RegExp(key));
  }
  assert.match(migration, /selection_mode='dynamic'/);
  assert.match(migration, /array\[6,7,8,9\]::smallint\[\]/);
  assert.match(migration, /'difficultyTargets',jsonb_build_object\('easy',4,'medium',12,'hard',4\)/);
  assert.match(migration, /'difficultyTargets',jsonb_build_object\('easy',6,'medium',18,'hard',6\)/);
  assert.match(migration, /'difficultyTargets',jsonb_build_object\('easy',8,'medium',24,'hard',8\)/);
  assert.match(migration, /'recentLookbackDays',90/);
});

test('dynamic selector uses only current governed four-option verified questions and avoids recent repeats', () => {
  assert.match(migration, /private\.select_dynamic_registry_diagnostic_questions/);
  assert.match(migration, /q\.question_type='multiple_choice'/);
  assert.match(migration, /jsonb_array_length\(q\.options\)=4/);
  assert.match(migration, /q\.pool_scope='global'/);
  assert.match(migration, /q\.content_origin='brain_heist'/);
  assert.match(migration, /q\.verification_status='verified'/);
  assert.match(migration, /q\.current_content_hash=q\.verified_content_hash/);
  assert.match(migration, /private\.verified_question_has_curriculum_mapping/);
  assert.match(migration, /previous_assignment\.subject_group_id=p_group_id/);
  assert.match(migration, /recently_used/);
  assert.match(migration, /skill_round/);
});

test('English launcher is teacher-scoped and does not overclaim English coverage', () => {
  assert.match(migration, /create or replace function public\.rpc_teacher_english_diagnostic_launcher/);
  assert.match(migration, /private\.teacher_current_teaching_groups\(v_actor,p_school_id\)/);
  assert.match(migration, /lower\(coalesce\(v_group\.academic_subject_code,''\)\) <> 'english'/);
  assert.match(migration, /'speakingDirectlyAssessed',false/);
  assert.match(migration, /'listeningDirectlyAssessed',false/);
  assert.match(migration, /'extendedWritingDirectlyAssessed',false/);
  assert.match(
    migration,
    /revoke all on function public\.rpc_teacher_english_diagnostic_launcher\(uuid,uuid\)[\s\S]*from public,anon,authenticated,service_role/,
  );
  assert.match(
    migration,
    /grant execute on function public\.rpc_teacher_english_diagnostic_launcher\(uuid,uuid\)[\s\S]*to authenticated,service_role/,
  );
});

test('English teacher UI exposes fresh balanced diagnostics from Curriculum Intelligence', () => {
  assert.match(service, /rpc_teacher_english_diagnostic_launcher/);
  assert.match(service, /rpc_teacher_create_registry_diagnostic/);
  assert.match(launcher, /Create English Diagnostic/);
  assert.match(launcher, /Fresh form · balanced answers/);
  assert.match(launcher, /Balanced A\/B\/C\/D automatically/);
  assert.match(launcher, /Recent questions from this teaching group are deprioritized for 90 days/);
  assert.match(launcher, /Speaking, listening and extended writing/);

  assert.match(page, /EnglishDiagnosticLauncher/);
  assert.match(page, /canLaunchEnglishDiagnostic/);
  assert.match(page, /\/\(english\|esl\)\/i\.test\(selectedGroup\.subjectLabel\)/);
  assert.match(page, /snapshot\.registry\.code === 'bh-english-core-v1'/);
  assert.match(page, /Create English Diagnostic/);
});

test('existing Economics diagnostics also pass through the shared balanced snapshot path', () => {
  assert.match(migration, /if v_preset\.selection_mode='dynamic' then/);
  assert.match(migration, /else[\s\S]*registry_diagnostic_preset_items/);
  assert.match(migration, /lower\(v_group\.academic_subject_code\)='economics'/);
  assert.match(migration, /perform private\.assert_assignment_mcq_answer_balance\(v_assignment\.id\)/);
});
