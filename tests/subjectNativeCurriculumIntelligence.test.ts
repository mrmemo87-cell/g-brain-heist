import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const experience = readFileSync('services/curriculumSubjectExperienceService.ts', 'utf8');
const actions = readFileSync('services/teacherCurriculumActionService.ts', 'utf8');
const service = readFileSync('services/teacherCurriculumIntelligenceService.ts', 'utf8');
const page = readFileSync('components/teacher/TeacherCurriculumIntelligencePage.tsx', 'utf8');

test('every published registry family has a subject-native Curriculum Intelligence profile', () => {
  for (const key of [
    'english:',
    'mathematics:',
    'science:',
    "'global-perspectives':",
    "'digital-technology':",
    'geography:',
    "'modern-languages':",
    "'travel-tourism':",
    'economics:',
  ]) {
    assert.ok(experience.includes(key), 'missing subject profile: ' + key);
  }

  for (const registry of [
    'bh-english-core',
    'bh-mathematics-core',
    'bh-science-core',
    'bh-global-perspectives-core',
    'bh-digital-technology-core',
    'bh-geography-core',
    'bh-modern-languages-core',
    'bh-travel-tourism-core',
    'bh-economics-core',
  ]) {
    assert.ok(experience.includes(registry), 'missing registry mapping: ' + registry);
  }
});

test('subject profiles give teachers subject-specific dimensions and language', () => {
  for (const phrase of [
    'Communication & comprehension',
    'Thinking & working mathematically',
    'Scientific practice & reasoning',
    'Evaluation & communication',
    'Computational thinking & creation',
    'Geographical skills & enquiry',
    'Communication skills',
    'Applied analysis & judgement',
    'Exam & economic reasoning',
  ]) {
    assert.ok(experience.includes(phrase), 'missing subject language: ' + phrase);
  }

  assert.match(page, /experience\?\.headline/);
  assert.match(page, /experience\?\.intro/);
  assert.match(page, /experience\?\.radarTitle/);
  assert.match(page, /experience\?\.navigatorTitle/);
  assert.match(page, /experience\?\.searchPlaceholder/);
});

test('reasoning dimensions use subject-specific registry strands', () => {
  for (const strand of [
    'eng\\.(reading|writing|listening|speaking)',
    'math\\.mathematical-practice',
    'science\\.(scientific-practice|context)',
    'gp\\.(evaluation|communication|reflection|collaboration)',
    'digital\\.(computational-thinking|programming)',
    'geo\\.(enquiry|skills)',
    'mfl\\.(listening|reading|speaking|writing)',
    'travel\\.(research-analysis|impacts-sustainability)',
    'econ\\.reasoning',
  ]) {
    assert.ok(experience.includes(strand), 'missing reasoning strand pattern: ' + strand);
  }
  assert.match(actions, /curriculumDimensionForSubject/);
  assert.match(service, /curriculumDimension\(leaf, experience\.key\)/);
});

test('reteach guidance is subject-native across major subject families', () => {
  for (const key of [
    'english:',
    'mathematics:',
    'science:',
    'geography:',
    "'global-perspectives':",
    "'digital-technology':",
    "'modern-languages':",
    "'travel-tourism':",
  ]) {
    assert.ok(actions.includes(key), 'missing subject playbook: ' + key);
  }

  for (const phrase of [
    'paragraph surgery',
    'estimate-before-calculate',
    'claim–evidence–reasoning',
    'source triangulation',
    'argument X-ray',
    'predict–run–explain',
    'retrieve–adapt–communicate',
    'mini case conference',
  ]) {
    assert.ok(actions.includes(phrase), 'missing subject teaching move: ' + phrase);
  }

  assert.match(actions, /economicsPlaybook/);
  assert.match(actions, /subjectGenericPlays/);
  assert.match(actions, /subjectPlaybooks/);
  assert.match(actions, /playFor\(subjectKey, leaf\)/);
});

test('Curriculum Intelligence no longer behaves as an Economics-first workspace', () => {
  assert.doesNotMatch(page, /const economics = rows\.find/);
  assert.doesNotMatch(page, /\['content', 'Economics content'/);
  assert.doesNotMatch(page, /\['reasoning', 'Exam & reasoning'/);
  assert.match(page, /experience\?\.contentDimension\.title/);
  assert.match(page, /experience\?\.reasoningDimension\.title/);
  assert.match(page, /curriculumGroupStorageKey/);
});

test('Economics-specific extensions remain conditional', () => {
  assert.match(service, /\/economics\/i\.test\(group\.subjectLabel\)/);
  assert.match(page, /canLaunchEconomicsDiagnostic/);
  assert.match(page, /snapshot\.paperReadiness/);
  assert.match(page, /EconomicsDiagnosticLauncher/);
});

test('unknown subjects still receive a safe intentional generic experience', () => {
  assert.match(experience, /generic:/);
  assert.match(experience, /Subject knowledge/);
  assert.match(experience, /Application & reasoning/);
  assert.match(experience, /Current governed evidence does not yet justify a shared class-level teaching priority/);
});
