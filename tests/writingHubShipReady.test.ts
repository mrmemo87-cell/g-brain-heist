import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const readProjectFile = (relativePath: string): string =>
  readFileSync(relativePath, 'utf8');

test('student Writing Hub exposes the dashboard-first three-step journey and cinematic feedback', () => {
  const source = readProjectFile('src/pages/writing/WritingHub.tsx');
  const activeSimpleLoop = source.slice(source.indexOf('const WritingHubSimpleLoop'));
  assert.match(activeSimpleLoop, /\['Understand the question', 'Write your response', 'Show the feedback'\]/);
  assert.match(activeSimpleLoop, /Your writing analysis/);
  assert.match(activeSimpleLoop, /Clear all text/);
  assert.match(activeSimpleLoop, /Play Cinematic Feedback/);
  assert.match(activeSimpleLoop, /Replay Cinematic Feedback/);
  assert.match(activeSimpleLoop, /playSavedCinematicFeedback/);
  assert.match(activeSimpleLoop, /Cinematic Feedback/);
  assert.match(activeSimpleLoop, /Green shows what is working\. Red shows your clearest next improvement\./);
  assert.match(activeSimpleLoop, /renderAnnotatedText\(activeCinematicText, cinematicRanges/);
  assert.match(activeSimpleLoop, /Improve my draft/);
  assert.doesNotMatch(activeSimpleLoop, /Pasting is disabled in Writing Hub/);
  assert.doesNotMatch(activeSimpleLoop, /Copying is disabled on this page/);
});

test('writing prompt rotation migration deduplicates identities and remembers recent tasks', () => {
  const sql = readProjectFile('supabase/migrations/20260727120000_writing_prompt_rotation_integrity.sql');
  assert.match(sql, /bh_writing_prompt_bank_payload_id_unique/);
  assert.match(sql, /recent_attempts/);
  assert.match(sql, /payload->>'prompt_id'/);
  assert.match(sql, /p_current_prompt_id/);
  assert.match(sql, /pool_size/);
});

test('cinematic feedback has responsive, accessible, reduced-motion styling', () => {
  const css = readProjectFile('src/pages/writing/WritingHub.css');
  const source = readProjectFile('src/pages/writing/WritingHub.tsx');
  assert.match(css, /\.cinematic-feedback/);
  assert.match(css, /\.cinematic-feedback__detail--strong/);
  assert.match(css, /\.cinematic-feedback__detail--weak/);
  assert.match(css, /\.cinematic-feedback__finale/);
  assert.match(source, /Insight \{/);
  assert.match(source, /Watch it transform/);
  assert.match(source, /Start my revision/);
  assert.match(source, /spotlightMode/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test('teacher monitoring rows are enriched from the authorized live class roster', () => {
  const sql = readProjectFile('supabase/migrations/20260728153000_writing_monitor_roster_context.sql');
  assert.match(sql, /class_students/);
  assert.match(sql, /class_teacher_assignments/);
  assert.match(sql, /actor\.school_id = c\.school_id/);
  assert.match(sql, /'class_id'/);
  assert.match(sql, /'class_name'/);
  assert.match(sql, /'current_grade'/);
  assert.match(sql, /with ordinality/);
  assert.doesNotMatch(sql, /coalesce\([^)]*'Unassigned'/);
});

test('teacher monitor and analytics use the same premium workspace language and roster context', () => {
  const monitoring = readProjectFile('src/pages/writing/WritingMonitoringView.tsx');
  const analytics = readProjectFile('src/pages/writing/WritingAnalyticsDashboard.tsx');
  const monitoringCss = readProjectFile('src/pages/writing/WritingMonitoringView.css');
  const analyticsCss = readProjectFile('src/pages/writing/WritingAnalyticsDashboard.css');

  assert.match(monitoring, /writing-teacher-surface/);
  assert.match(monitoring, /Class and grade come from the live school roster/);
  assert.match(monitoring, /Class information unavailable/);
  assert.doesNotMatch(monitoring, /Class not linked/);
  assert.doesNotMatch(monitoring, /\?\? 'Unassigned'/);
  assert.match(analytics, /writing-teacher-surface/);
  assert.match(analytics, /getClassLabel/);
  assert.doesNotMatch(analytics, /\?\? 'Unassigned'/);
  assert.match(monitoringCss, /\.writing-monitor__hero/);
  assert.match(analyticsCss, /\.writing-analytics__section/);
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
  assert.match(source, /saveFeedback/);
  assert.match(source, /navigator\.clipboard\.writeText/);
  assert.doesNotMatch(source, /Practice assignment will be connected in the next phase/);
});

test('writing monitor follows the class-to-book drill-down in a collapsible light workspace', () => {
  const monitoring = readProjectFile('src/pages/writing/WritingMonitoringView.tsx');
  const css = readProjectFile('src/pages/writing/WritingMonitoringView.css');

  assert.match(monitoring, /Students and general writing data/);
  assert.match(monitoring, /Choose a class/);
  assert.match(monitoring, /Students in \$\{selectedClass\.name\}/);
  assert.match(monitoring, /Writing genres/);
  assert.match(monitoring, /submission book/);
  assert.match(monitoring, /Previous submission/);
  assert.match(monitoring, /Next submission/);
  assert.match(monitoring, /aria-expanded=\{!collapsed\}/);
  assert.match(monitoring, /SUPPORTED_GENRES/);
  assert.match(monitoring, /getTeacherAttemptListScoped/);
  assert.match(css, /\.writing-monitor__book-spread/);
  assert.match(css, /\.writing-monitor__collapse/);
  assert.match(css, /background: #f4f7fb/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test('teacher quick reports open professional print previews instead of raw text downloads', () => {
  const source = readProjectFile('src/pages/writing/WritingExportCenter.tsx');
  assert.match(source, /Turn writing evidence into a clear conversation/);
  assert.match(source, /Preview teacher report/);
  assert.match(source, /Preview family report/);
  assert.match(source, /openProfessionalWritingReport/);
  assert.doesNotMatch(source, /text\/plain/);
  assert.match(source, /View writing evidence/);
  assert.doesNotMatch(source, /Open Advanced Report Tools/);
  assert.doesNotMatch(source, /AI evaluation \/ assessment/);
  assert.doesNotMatch(source, /JSON\.stringify\(selectedAttempt/);
  assert.doesNotMatch(source, /UUID-shaped/);
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
  assert.match(exports, /Preview family report/);
  assert.doesNotMatch(exports, /text\/plain/);
  assert.match(exports, /Practice mode: the score supports learning but does not verify authorship/);
  assert.match(report, /Confidential student learning record/);
  assert.match(report, /@page\{size:A4 portrait;margin:9mm\}/);
  assert.match(sql, /'submission_count'/);
  assert.match(sql, /'practice_completed_count'/);
  assert.match(sql, /'needs_review'/);
  assert.match(sql, /latest_integrity_signals/);
  assert.match(sql, /uq_bh_writing_attempts_attempt_key/);
  assert.match(sql, /cta\.teacher_user_id = \(select auth\.uid\(\)\)/);
  assert.match(sql, /when 'supervised' then 3/);
});

test('student Writing Hub rehydrates by authenticated student before showing prompt history', () => {
  const hub = readProjectFile('src/pages/writing/WritingHub.tsx');
  const integration = readProjectFile('src/lib/brains_heist/writingIntegrationService.ts');
  const repository = readProjectFile('src/lib/brains_heist/writingRepository.ts');

  assert.match(repository, /ownerStudentId:\s*activeStudentId/);
  assert.match(repository, /isMissingAttemptKeyError/);
  assert.match(repository, /\.in\('payload->>id', attemptIds\)/);
  assert.match(repository, /insert legacy writing attempts failed/);
  assert.match(integration, /ensureWritingHydrationForStudent/);
  assert.match(integration, /hydratedStudentId\s*!==\s*expectedStudentId/);
  assert.match(integration, /generation\s*!==\s*hydrationGeneration/);
  assert.match(hub, /ensureWritingHydrationForStudent\(studentId\)/);
  assert.match(hub, /\[studentId,\s*activeGenre,\s*assessment\?\.total_score,\s*hydrationStatus\]/);
  assert.match(hub, /hydratedForStudentId === studentId/);
  assert.match(hub, /Checking saved submissions…/);
  assert.match(hub, /Loading your saved writing and feedback…/);
  assert.match(hub, /if \(!studentHistoryReady\) return;/);
});
