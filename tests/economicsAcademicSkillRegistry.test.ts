import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const registry = readFileSync('supabase/migrations/20260930110000_add_economics_igcse_registry_v1.sql', 'utf8');
const batchRpc = readFileSync('supabase/migrations/20260930110500_enable_economics_teacher_question_batches.sql', 'utf8');
const gameService = readFileSync('services/gameService.ts', 'utf8');
const interventionService = readFileSync('services/studentInterventionService.ts', 'utf8');
const batchWorkspace = readFileSync('components/teacher/QuestionBatchWorkspace.tsx', 'utf8');
const extractor = readFileSync('supabase/functions/teacher_question_pdf_extract/index.ts', 'utf8');
const bulkImport = readFileSync('src/lib/teacherQuestionBulkImport.ts', 'utf8');
const types = readFileSync('types.ts', 'utf8');

test('Economics is a first-class governed Brains Heist subject', () => {
  assert.match(registry, /bh-economics-core-v1/);
  assert.match(registry, /subject_key.*economics|economics.*subject_key/s);
  assert.match(registry, /'economics','Economics'/);
  assert.match(registry, /array\['0455'\]/);
  assert.match(types, /'Economics'/);
  assert.match(gameService, /Economics: 'economics'/);
  assert.match(interventionService, /Economics: 'economics'/);
});

test('Economics registry separates durable content from economic reasoning', () => {
  for (const strand of [
    'econ.foundations',
    'econ.markets',
    'econ.micro',
    'econ.macro',
    'econ.development',
    'econ.international',
    'econ.reasoning',
  ]) {
    assert.ok(registry.includes(strand), strand);
  }

  for (const code of [
    'econ.markets.demand.shift-movement',
    'econ.markets.ped.revenue',
    'econ.macro.policy.monetary',
    'econ.macro.inflation.causes',
    'econ.international.exchange-rates.appreciation-depreciation',
    'econ.reasoning.analysis.causal-chain',
    'econ.reasoning.evaluation.judgement',
  ]) {
    assert.ok(registry.includes(code), code);
  }
});

test('Cambridge IGCSE Economics 0455 remains an external versioned crosswalk', () => {
  assert.match(registry, /Cambridge IGCSE Economics/);
  assert.match(registry, /'0455'/);
  assert.match(registry, /'2027-2029'/);
  assert.match(registry, /CIE0455-2027-S1/);
  assert.match(registry, /CIE0455-2027-S6/);
  assert.match(registry, /CIE0455-AO1/);
  assert.match(registry, /CIE0455-AO2/);
  assert.match(registry, /CIE0455-AO3/);
  assert.match(registry, /external Cambridge assessment-objective crosswalk/i);
});

test('Economics evidence focuses cover key misconceptions and exam reasoning', () => {
  for (const focus of [
    'econ.focus.demand.shift-vs-movement',
    'econ.focus.ped.calculate',
    'econ.focus.ped.revenue',
    'econ.focus.market-failure.externalities',
    'econ.focus.monetary.interest-rate-chain',
    'econ.focus.inflation.demand-cost',
    'econ.focus.exchange-rate.direction-effects',
    'econ.focus.reasoning.chain-development',
    'econ.focus.reasoning.judgement',
  ]) {
    assert.ok(registry.includes(focus), focus);
  }
  assert.match(registry, /economics_evidence_focus_coverage_incomplete/);
});

test('teacher content workflows accept Economics end to end', () => {
  assert.match(batchWorkspace, /'Economics'/);
  assert.match(extractor, /"Economics"/);
  assert.match(bulkImport, /economics: 'Economics'/);
  assert.match(batchRpc, /academic_skill_registry_subject_aliases/);
  assert.match(batchRpc, /subject_alias\.alias_normalized = lower\(trim\(v_subject\)\)/);
  assert.doesNotMatch(batchRpc, /v_subject not in/);
});

test('teacher registry service exposes curriculum alignment metadata', () => {
  assert.match(registry, /frameworkAlignments/);
  assert.match(registry, /evidenceFocusCount/);
  assert.match(gameService, /TeacherAcademicFrameworkAlignment/);
  assert.match(gameService, /frameworkAlignments\?: TeacherAcademicFrameworkAlignment\[]/);
  assert.match(gameService, /evidenceFocusCount\?: number/);
});
