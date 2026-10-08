import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const read = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

test('IELTS Diagnostic Bible is wired into the repository agent contract', () => {
  const agents = read('AGENTS.md');
  const bible = read('docs/ielts/IELTS_DIAGNOSTIC_BIBLE.md');

  assert.match(bible, /\*\*Version:\*\* 1\.5\.0/i);
  assert.match(agents, /docs\/ielts\/IELTS_DIAGNOSTIC_BIBLE\.md/i);
  assert.match(agents, /Before making \*\*any\*\* change that can affect IELTS diagnostics/i);
});

test('unverified public Listening screener content is retired from delivery', () => {
  const hero = read('src/components/ielts/IeltsAnimatedHero.tsx');
  const screener = read('src/pages/ielts/TrialListeningTask2.tsx');
  const dashboard = read('services/ieltsDashboardService.ts');

  assert.match(hero, /Reviewed Listening Screener/i);
  assert.match(hero, /check availability/i);
  assert.doesNotMatch(hero, /What.?s Your Real IELTS Band Score|demo estimate/i);

  assert.match(screener, /fetchIeltsScreenerCatalog/i);
  assert.match(screener, /launchIeltsScreener/i);
  assert.match(screener, /reviewed Brains Heist content/i);
  assert.doesNotMatch(screener, /travelling to France|92\.4 percent|186 miles per hour|ielts-listening-sample-task-2-form-completion|getBandScore|bandScore|estimated_band/i);

  assert.match(dashboard, /const diagnosticCompleted = false/i);
  assert.match(dashboard, /const practiceScorePercent = null/i);
  assert.match(dashboard, /const weakestSkill: IeltsSkill \| null = null/i);
  assert.doesNotMatch(dashboard, /diagnosticCompleted\s*\?\s*'listening'|estimatedBand|diagnosticEvent/i);
});

test('ordinary Reading and Listening practice never manufacture readiness bands', () => {
  const scoring = read('src/lib/ieltsPracticeScoring.ts');
  const reading = read('src/pages/ielts/ReadingPractice.tsx');
  const listening = read('src/pages/ielts/ListeningPractice.tsx');
  const legacyListening = read('src/pages/ielts/TrialListeningTest.tsx');

  assert.doesNotMatch(scoring, /estimateIeltsBandFromPercent|est_band|bandScore/i);
  assert.doesNotMatch(reading, /Estimated Band Score|estimateIeltsBandFromPercent|estBand:|bandScore/i);
  assert.doesNotMatch(listening, /Estimated Band Score|estBand:|bandScore/i);
  assert.doesNotMatch(legacyListening, /Estimated Band Score|getBandScore|bandScore|getFeedback/i);

  assert.match(reading, /Practice result only — this score is not a verified IELTS readiness band/i);
  assert.match(listening, /Practice result only — this score is not a verified IELTS readiness band/i);
  const objectiveResult = read('src/pages/ielts/IeltsObjectiveResult.tsx');
  const legacyHub = read('components/ielts/IELTSApp.tsx');

  assert.doesNotMatch(objectiveResult, /est_band|Estimated readiness band|Unlock your Band|<strong>Weakness:<\/strong>/i);
  assert.match(objectiveResult, /Practice result:/i);
  assert.doesNotMatch(legacyHub, /latestMockBand|Latest mock band/i);
  assert.match(legacyHub, /Reviewed task band/i);
});


test('school readiness fails closed until governed diagnostic evidence exists', () => {
  const migration = read('supabase/migrations/20261005111500_ielts_diagnostic_bible_alignment.sql');

  assert.match(
    migration,
    /create or replace function public\.rpc_ielts_school_student_snapshot\(p_student_id uuid\)[\s\S]*as \$\$[\s\S]*end;\s*\$\$;/i,
    'school snapshot wrapper must use a valid PL/pgSQL dollar-quoted body',
  );
  assert.doesNotMatch(migration, /\nas \$(?!\$)\n|\n\$(?!\$);\n/, 'migration must not contain single-dollar function delimiters');
  const schoolResults = read('components/school-admin/tabs/IeltsResultsTab.tsx');
  const journey = read('src/pages/ielts/components/IeltsStudentJourney.tsx').replace(/\s+/g, ' ');

  assert.match(migration, /ielts_latest_skill_readiness[\s\S]*where false;/i);
  assert.match(migration, /revoke all on function public\.ielts_estimated_readiness_band\(numeric,numeric,numeric\) from public, anon, authenticated/i);
  assert.match(migration, /'\{latest_overall_estimate\}', 'null'::jsonb/i);
  assert.match(migration, /'\{summary,average_estimated_overall\}'[\s\S]*'null'::jsonb/i);

  assert.match(schoolResults, /Practice results are not promoted into readiness/i);
  assert.match(journey, /cannot give a reliable overall band/i);
});

test('productive-skill AI remains provisional and evidence-bounded', () => {
  const edge = read('supabase-functions/ielts_ai_review_draft/index.ts');

  assert.match(edge, /provisional TASK-SPECIFIC draft/i);
  assert.match(edge, /Set band_estimate to null/i);
  assert.match(edge, /Do NOT score pronunciation from transcript text/i);
  assert.match(edge, /human reviewer must listen to the audio/i);
  assert.doesNotMatch(edge, /You are an IELTS (?:Writing|Speaking) reviewer/i);
});

test('unreviewed AI-generated IELTS packs cannot create new trusted sessions', () => {
  const edge = read('supabase/functions/ielts_session/index.ts');
  const sessionPage = read('src/pages/ielts/IeltsSession.tsx');

  assert.match(edge, /REVIEWED_CONTENT_REQUIRED/i);
  assert.match(edge, /LEGACY_AI_SCORING_DISABLED/i);
  assert.doesNotMatch(edge, /OPENAI_API_KEY|requestPackFromOpenAI|requestMarkingFromOpenAI/i);
  assert.match(sessionPage, /Practice-only session/i);
  assert.match(sessionPage, /not a verified .*IELTS readiness estimate/i);
});
