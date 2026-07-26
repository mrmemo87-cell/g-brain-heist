import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const readProjectFile = (relativePath: string): string =>
  readFileSync(relativePath, 'utf8');

test('student Writing Hub exposes the complete four-step journey and cinematic feedback', () => {
  const source = readProjectFile('src/pages/writing/WritingHub.tsx');
  const activeSimpleLoop = source.slice(source.indexOf('const WritingHubSimpleLoop'));
  assert.match(activeSimpleLoop, /\['Prompt', 'Write', 'Feedback', 'Revise'\]/);
  assert.match(activeSimpleLoop, /Play Cinematic Feedback/);
  assert.match(activeSimpleLoop, /Cinematic Feedback/);
  assert.match(activeSimpleLoop, /Green shows what is working\. Red shows your clearest next improvement\./);
  assert.match(activeSimpleLoop, /renderAnnotatedText\(submittedText, cinematicRanges/);
  assert.match(activeSimpleLoop, /Improve my draft/);
  assert.doesNotMatch(activeSimpleLoop, /Pasting is disabled in Writing Hub/);
  assert.doesNotMatch(activeSimpleLoop, /Copying is disabled on this page/);
});

test('cinematic feedback has responsive, accessible, reduced-motion styling', () => {
  const css = readProjectFile('src/pages/writing/WritingHub.css');
  assert.match(css, /\.cinematic-feedback/);
  assert.match(css, /\.cinematic-feedback__detail--strong/);
  assert.match(css, /\.cinematic-feedback__detail--weak/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test('production persistence does not store the full Writing Hub snapshot on shared devices', () => {
  const source = readProjectFile('src/lib/brains_heist/writingIntegrationService.ts');
  assert.match(source, /storage && getWritingRepositoryMode\(\) !== 'db'/);
  assert.match(source, /Production writing records belong in Supabase/);
});

test('ship-ready migration uses real per-genre, month, class, rubric, and prompt data', () => {
  const sql = readProjectFile('supabase/migrations/20260726120000_writing_hub_ship_ready.sql');
  assert.match(sql, /rpc_bh_writing_student_prompt/);
  assert.match(sql, /safety_status'\s*=\s*'approved'/);
  assert.match(sql, /ss\.state->'by_genre'/);
  assert.match(sql, /to_char\(a\.created_at, 'YYYY-MM'\)\s*=\s*v_month/);
  assert.match(sql, /string_agg\(distinct c\.class_name/);
  assert.match(sql, /latest_subscale_scores/);
  assert.match(sql, /average_score_by_genre/);
  assert.match(sql, /prompt_effectiveness/);
  assert.doesNotMatch(sql, /Generic prompt/);
  assert.doesNotMatch(sql, /See secure student summary/);
});

test('teacher feedback actions save securely and copy intentionally', () => {
  const source = readProjectFile('src/pages/writing/WritingMonitoringView.tsx');
  assert.match(source, /saveTeacherReportScoped/);
  assert.match(source, /saveFeedbackDraft/);
  assert.match(source, /navigator\.clipboard\.writeText/);
  assert.doesNotMatch(source, /Practice assignment will be connected in the next phase/);
});

test('teacher quick reports open professional print previews instead of raw text downloads', () => {
  const source = readProjectFile('src/pages/writing/WritingExportCenter.tsx');
  assert.match(source, /exportParentReadyReport/);
  assert.match(source, /Preview &amp; Print Teacher Report/);
  assert.match(source, /Preview &amp; Print Parent Report/);
  assert.match(source, /openProfessionalWritingReport/);
  assert.doesNotMatch(source, /text\/plain/);
  assert.match(source, /Class Snapshot/);
  assert.doesNotMatch(source, /Use Advanced Tools/);
});

test('premium Writing Hub keeps authorship context, score meaning, and teacher reporting synchronized', () => {
  const hub = readProjectFile('src/pages/writing/WritingHub.tsx');
  const monitoring = readProjectFile('src/pages/writing/WritingMonitoringView.tsx');
  const exports = readProjectFile('src/pages/writing/WritingExportCenter.tsx');
  const report = readProjectFile('src/lib/brains_heist/writingReportDocument.ts');
  const sql = readProjectFile('supabase/migrations/20260726160000_writing_hub_premium_release.sql');

  assert.match(hub, /Automated estimate/);
  assert.match(hub, /getStudentWritingIntegrityMode/);
  assert.match(hub, /recordWritingPaste/);
  assert.match(monitoring, /Writing Command Center/);
  assert.match(monitoring, /practice_completed_count/);
  assert.match(monitoring, /openProfessionalWritingReport/);
  assert.match(exports, /Preview &amp; Print Parent Report/);
  assert.doesNotMatch(exports, /text\/plain/);
  assert.match(report, /Confidential student learning record/);
  assert.match(sql, /'submission_count'/);
  assert.match(sql, /'practice_completed_count'/);
  assert.match(sql, /'needs_review'/);
  assert.match(sql, /latest_integrity_signals/);
  assert.match(sql, /uq_bh_writing_attempts_attempt_key/);
  assert.match(sql, /cta\.teacher_user_id = \(select auth\.uid\(\)\)/);
  assert.match(sql, /when 'supervised' then 3/);
});
