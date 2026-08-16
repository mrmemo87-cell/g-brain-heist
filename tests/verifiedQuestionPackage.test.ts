import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const importerMigration = readFileSync('supabase/migrations/20260815120000_verified_question_package_importer.sql', 'utf8');
const repairMigration = readFileSync('supabase/migrations/20260815121000_repair_verified_question_bank.sql', 'utf8');
const curriculumMigration = readFileSync('supabase/migrations/20260815122000_brain_heist_curriculum_2026_2.sql', 'utf8');
const releaseIndexMigration = readFileSync('supabase/migrations/20260815123000_index_verified_question_release_framework.sql', 'utf8');
const grade12CurriculumMigration = readFileSync('supabase/migrations/20260815124000_brains_heist_curriculum_2026_3.sql', 'utf8');
const grade11CompletionMigration = readFileSync('supabase/migrations/20260815125000_brains_heist_curriculum_2026_4.sql', 'utf8');
const mathematicsIctMigration = readFileSync('supabase/migrations/20260815130000_brains_heist_curriculum_2026_5.sql', 'utf8');
const geographyGlobalPerspectivesMigration = readFileSync('supabase/migrations/20260815131000_brains_heist_curriculum_2026_6.sql', 'utf8');
const visualImporterMigration = readFileSync('supabase/migrations/20260815132000_verified_question_visual_asset_importer.sql', 'utf8');
const grade6CurriculumMigration = readFileSync('supabase/migrations/20260815133000_brains_heist_curriculum_2026_7.sql', 'utf8');
const grade7CurriculumMigration = readFileSync('supabase/migrations/20260816093000_brains_heist_curriculum_2026_8.sql', 'utf8');
const grade5CurriculumMigration = readFileSync('supabase/migrations/20260816143000_brains_heist_curriculum_2026_10.sql', 'utf8');
const grade4CurriculumMigration = readFileSync('supabase/migrations/20260816150000_brains_heist_curriculum_2026_11.sql', 'utf8');
const visualAccessibilityMigration = readFileSync('supabase/migrations/20260815134000_question_visual_accessibility.sql', 'utf8');
const versionedVisualPathMigration = readFileSync('supabase/migrations/20260816121000_version_verified_question_visual_asset_paths.sql', 'utf8');

test('all verified question packages pass their quality and balance profiles', () => {
  const result = spawnSync(process.execPath, ['scripts/validate-verified-question-package.mjs'], {
    cwd: process.cwd(), encoding: 'utf8',
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /passed \(80 questions/);
  for (const subject of ['Chemistry 20', 'English 20', 'Biology 20', 'Travel & Tourism 20']) {
    assert.match(result.stdout, new RegExp(subject.replace(/[&]/g, '\\&')));
  }
  assert.match(result.stdout, /brain-heist-g12-core-2026-3@2026\.3\.0 passed/);
  assert.match(result.stdout, /Physics 20/);
  assert.match(result.stdout, /brain-heist-g11-completion-2026-4@2026\.4\.0 passed/);
  assert.match(result.stdout, /brain-heist-mathematics-ict-2026-5@2026\.5\.0 passed/);
  assert.match(result.stdout, /Mathematics 40, ICT 40/);
  assert.match(result.stdout, /brain-heist-geography-global-perspectives-2026-6@2026\.6\.0 passed/);
  assert.match(result.stdout, /Geography 40, Global Perspectives 40/);
  assert.match(result.stdout, /brain-heist-grade-6-core-2026-7@2026\.7\.0 passed/);
  assert.match(result.stdout, /brain-heist-grade-7-core-2026-8@2026\.8\.0 passed/);
  assert.match(result.stdout, /brain-heist-grade-5-core-2026-10@2026\.10\.0 passed/);
  assert.match(result.stdout, /brain-heist-grade-4-core-2026-11@2026\.11\.0 passed/);
  for (const subject of ['Mathematics 20', 'English 20', 'Science 20', 'Geography 20']) {
    assert.match(result.stdout, new RegExp(subject));
  }
});

test('schema v2 verifies all visual bytes, metadata and question links', () => {
  for (const [packageDirectory, expectedAssets] of [['2026-7-0', 24], ['2026-8-0', 24], ['2026-10-0', 32], ['2026-11-0', 36]] as const) {
    const manifest = JSON.parse(readFileSync(`content/verified-question-packages/${packageDirectory}/manifest.json`, 'utf8'));
    assert.equal(manifest.schemaVersion, 2);
    assert.equal(manifest.assets.length, expectedAssets);
    assert.equal(new Set(manifest.assets.map((asset: any) => asset.assetId)).size, expectedAssets);
    assert.ok(manifest.assets.every((asset: any) => asset.publicPath.includes(asset.sha256.slice(0, 12))));

    const visualQuestions = manifest.files.flatMap((file: string) => {
      const source = JSON.parse(readFileSync(path.join('content/verified-question-packages', packageDirectory, file), 'utf8'));
      return source.questions.filter((question: any) => question.visualAssetId);
    });
    assert.equal(visualQuestions.length, expectedAssets);
  }

  const tempPackage = mkdtempSync(path.join(tmpdir(), 'bh-visual-package-'));
  try {
    cpSync('content/verified-question-packages/2026-7-0', tempPackage, { recursive: true });
    const tampered = JSON.parse(readFileSync(path.join(tempPackage, 'manifest.json'), 'utf8'));
    tampered.assets[0].sha256 = '0'.repeat(64);
    writeFileSync(path.join(tempPackage, 'manifest.json'), JSON.stringify(tampered));
    const result = spawnSync(process.execPath, ['scripts/validate-verified-question-package.mjs', tempPackage], {
      cwd: process.cwd(), encoding: 'utf8',
    });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /checksum|filename must include its checksum prefix/i);
  } finally {
    rmSync(tempPackage, { recursive: true, force: true });
  }
});

test('verified importer is atomic, idempotent and service-role only', () => {
  assert.match(importerMigration, /pg_advisory_xact_lock/);
  assert.match(importerMigration, /verified_question_package_version_hash_conflict/);
  assert.match(importerMigration, /p_dry_run boolean default true/);
  assert.match(importerMigration, /security invoker/i);
  assert.match(importerMigration, /revoke all on function public\.rpc_import_verified_question_package\(jsonb, boolean\)[\s\S]*from public, anon, authenticated/i);
  assert.match(importerMigration, /grant execute on function public\.rpc_import_verified_question_package\(jsonb, boolean\)[\s\S]*to service_role/i);
  assert.match(importerMigration, /active_verified_question_duplicate/);
  assert.match(importerMigration, /verified_question_import_releases/);
  assert.match(releaseIndexMigration, /verified_question_import_releases\(framework_version_id\)/);
});

test('visual importer is immutable, service-role only and hash-aware', () => {
  assert.match(visualImporterMigration, /rpc_import_verified_question_package_v2/);
  assert.match(visualImporterMigration, /verified_question_visual_assets/);
  assert.match(visualImporterMigration, /verified_question_visual_links/);
  assert.match(visualImporterMigration, /p_package::text, 'sha256'/);
  assert.match(visualImporterMigration, /p_image_url|v_image_url/);
  assert.match(visualImporterMigration, /enable row level security/);
  assert.match(visualImporterMigration, /revoke all on function public\.rpc_import_verified_question_package_v2\(jsonb, boolean\)[\s\S]*from public, anon, authenticated/i);
  assert.match(visualImporterMigration, /grant execute on function public\.rpc_import_verified_question_package_v2\(jsonb, boolean\)[\s\S]*to service_role/i);
  assert.match(visualAccessibilityMigration, /'image_alt_text', q\.image_alt_text/);
});

test('visual importer binds immutable asset paths to every package version', () => {
  assert.match(versionedVisualPathMigration, /v_asset_directory := replace\(v_package_version, '\.', '-'\)/);
  assert.match(versionedVisualPathMigration, /public\/question-assets\/' \|\| v_asset_directory/);
  assert.match(versionedVisualPathMigration, /verified_question_visual_importer_v2_definition_drift/);
  assert.match(versionedVisualPathMigration, /position\('2026-7-0' in v_updated\) > 0/);
});

test('repair migration preserves history while retiring reviewed defects and duplicates', () => {
  assert.match(repairMigration, /v_pair_count <> 96/);
  assert.match(repairMigration, /verified_question_duplicate_reviews/);
  assert.match(repairMigration, /verification_status = 'retired'/);
  assert.match(repairMigration, /question-bank-2026-1\.1/);
  for (const id of [
    'c283d024-8ea5-4a5e-86a9-c16837796d36',
    'c2f188de-11b6-4787-a739-b404ffcb27c5',
    '1ee7aaaf-125a-41e4-92af-3554e510c3a4',
    '658b0b3c-26a1-41c5-90dc-22e594e5e860',
    'd8a0e687-a5b6-4ff4-9177-046aef5a7aac',
  ]) assert.match(repairMigration, new RegExp(id));
  assert.match(repairMigration, /qa-sam-g8-2026/);
  assert.match(repairMigration, /status = 'archived'/);
});

test('2026.2 curriculum is a new immutable snapshot with the four required scopes', () => {
  assert.match(curriculumMigration, /version_code = '2026-1'/);
  assert.match(curriculumMigration, /'2026-2'/);
  for (const scope of ['chemistry-grade-11', 'english-grade-11', 'biology-grade-11', 'travel-tourism-grade-12']) {
    assert.match(curriculumMigration, new RegExp(scope));
  }
  assert.match(curriculumMigration, /status = 'in_review'/);
  assert.match(curriculumMigration, /status = 'approved'/);
  assert.match(curriculumMigration, /status = 'published'/);
  assert.match(curriculumMigration, /extensions\.digest/);
});

test('2026.3 curriculum immutably adds the four Grade 12 core scopes', () => {
  assert.match(grade12CurriculumMigration, /version_code = '2026-2'/);
  assert.match(grade12CurriculumMigration, /'2026-3'/);
  for (const scope of ['chemistry-grade-12', 'biology-grade-12', 'english-grade-12', 'physics-grade-12']) {
    assert.match(grade12CurriculumMigration, new RegExp(scope));
  }
  for (const objective of ['chem12-quantitative-equilibria', 'bio12-molecular-genetics', 'eng12-close-reading', 'phys12-mechanics']) {
    assert.match(grade12CurriculumMigration, new RegExp(objective));
  }
  assert.match(grade12CurriculumMigration, /status = 'in_review'/);
  assert.match(grade12CurriculumMigration, /status = 'approved'/);
  assert.match(grade12CurriculumMigration, /status = 'published'/);
  assert.match(grade12CurriculumMigration, /extensions\.digest/);
});

test('2026.4 curriculum completes and deepens the four Grade 11 scopes', () => {
  assert.match(grade11CompletionMigration, /version_code = '2026-3'/);
  assert.match(grade11CompletionMigration, /'2026-4'/);
  for (const scope of ['chemistry-grade-11', 'biology-grade-11', 'physics-grade-11', 'travel-tourism-grade-11']) {
    assert.match(grade11CompletionMigration, new RegExp(scope));
  }
  for (const objective of ['chem11-depth-quantitative', 'bio11-depth-cell-processes', 'phys11-measurement-motion', 'tt11-industry-motivation']) {
    assert.match(grade11CompletionMigration, new RegExp(objective));
  }
  assert.match(grade11CompletionMigration, /status = 'published'/);
  assert.match(grade11CompletionMigration, /extensions\.digest/);
});

test('2026.5 curriculum establishes Grade 11 and 12 Mathematics and ICT', () => {
  assert.match(mathematicsIctMigration, /version_code = '2026-4'/);
  assert.match(mathematicsIctMigration, /'2026-5'/);
  for (const scope of ['mathematics-grade-11', 'mathematics-grade-12', 'ict-grade-11', 'ict-grade-12']) {
    assert.match(mathematicsIctMigration, new RegExp(scope));
  }
  for (const objective of ['math11-number-algebra', 'math12-calculus', 'ict11-networks-security', 'ict12-databases-analytics']) {
    assert.match(mathematicsIctMigration, new RegExp(objective));
  }
  assert.match(mathematicsIctMigration, /status = 'in_review'/);
  assert.match(mathematicsIctMigration, /status = 'approved'/);
  assert.match(mathematicsIctMigration, /status = 'published'/);
  assert.match(mathematicsIctMigration, /extensions\.digest/);
});

test('2026.6 curriculum establishes Grade 11 and 12 Geography and Global Perspectives', () => {
  assert.match(geographyGlobalPerspectivesMigration, /version_code = '2026-5'/);
  assert.match(geographyGlobalPerspectivesMigration, /'2026-6'/);
  for (const scope of ['geography-grade-11', 'geography-grade-12', 'global-perspectives-grade-11', 'global-perspectives-grade-12']) {
    assert.match(geographyGlobalPerspectivesMigration, new RegExp(scope));
  }
  for (const objective of ['geo11-physical-processes', 'geo12-hazards-resilience', 'gp11-source-evaluation', 'gp12-evidence-synthesis']) {
    assert.match(geographyGlobalPerspectivesMigration, new RegExp(objective));
  }
  assert.match(geographyGlobalPerspectivesMigration, /status = 'in_review'/);
  assert.match(geographyGlobalPerspectivesMigration, /status = 'approved'/);
  assert.match(geographyGlobalPerspectivesMigration, /status = 'published'/);
  assert.match(geographyGlobalPerspectivesMigration, /extensions\.digest/);
});

test('2026.7 curriculum establishes curated Grade 6 core objectives', () => {
  assert.match(grade6CurriculumMigration, /version_code = '2026-6'/);
  assert.match(grade6CurriculumMigration, /'2026-7'/);
  for (const scope of ['mathematics-grade-6', 'english-grade-6', 'science-grade-6', 'geography-grade-6']) {
    assert.match(grade6CurriculumMigration, new RegExp(scope));
  }
  for (const objective of ['math6-number-operations', 'eng6-reading-inference', 'sci6-living-systems', 'geo6-map-skills']) {
    assert.match(grade6CurriculumMigration, new RegExp(objective));
  }
  assert.match(grade6CurriculumMigration, /legacy-classification/);
  assert.match(grade6CurriculumMigration, /status = 'published'/);
  assert.match(grade6CurriculumMigration, /extensions\.digest/);
});

test('2026.8 curriculum establishes curated Grade 7 core objectives', () => {
  assert.match(grade7CurriculumMigration, /version_code = '2026-7'/);
  assert.match(grade7CurriculumMigration, /'2026-8'/);
  for (const scope of ['mathematics-grade-7', 'english-grade-7', 'science-grade-7', 'geography-grade-7']) {
    assert.match(grade7CurriculumMigration, new RegExp(scope));
  }
  for (const objective of ['math7-ratio-proportion', 'eng7-reading-inference', 'sci7-cells-systems', 'geo7-map-fieldwork']) {
    assert.match(grade7CurriculumMigration, new RegExp(objective));
  }
  assert.match(grade7CurriculumMigration, /legacy-classification/);
  assert.match(grade7CurriculumMigration, /status = 'published'/);
  assert.match(grade7CurriculumMigration, /extensions\.digest/);
});

test('2026.10 curriculum establishes curated Grade 5 core objectives', () => {
  assert.match(grade5CurriculumMigration, /version_code = '2026-8'/);
  assert.match(grade5CurriculumMigration, /'2026-10'/);
  for (const scope of ['mathematics-grade-5', 'english-grade-5', 'science-grade-5', 'geography-grade-5']) {
    assert.match(grade5CurriculumMigration, new RegExp(scope));
  }
  for (const objective of ['math5-number-operations', 'eng5-reading-inference', 'sci5-living-things', 'geo5-maps-directions']) {
    assert.match(grade5CurriculumMigration, new RegExp(objective));
  }
  assert.match(grade5CurriculumMigration, /legacy-classification/);
  assert.match(grade5CurriculumMigration, /status = 'in_review'/);
  assert.match(grade5CurriculumMigration, /status = 'approved'/);
  assert.match(grade5CurriculumMigration, /status = 'published'/);
  assert.match(grade5CurriculumMigration, /extensions\.digest/);
});

test('2026.11 curriculum establishes curated Grade 4 core objectives', () => {
  assert.match(grade4CurriculumMigration, /version_code = '2026-10'/);
  assert.match(grade4CurriculumMigration, /'2026-11'/);
  for (const scope of ['mathematics-grade-4', 'english-grade-4', 'science-grade-4', 'geography-grade-4']) {
    assert.match(grade4CurriculumMigration, new RegExp(scope));
  }
  for (const objective of ['math4-number-place-value', 'eng4-reading-retrieval-inference', 'sci4-living-things-habitats', 'geo4-maps-place']) {
    assert.match(grade4CurriculumMigration, new RegExp(objective));
  }
  assert.match(grade4CurriculumMigration, /legacy-classification/);
  assert.match(grade4CurriculumMigration, /status = 'in_review'/);
  assert.match(grade4CurriculumMigration, /status = 'approved'/);
  assert.match(grade4CurriculumMigration, /status = 'published'/);
  assert.match(grade4CurriculumMigration, /extensions\.digest/);
});

test('verified importer CLI refuses missing service-role credentials and production confirmation', () => {
  const missing = spawnSync(process.execPath, ['scripts/import-verified-question-package.mjs', '--dry-run'], {
    cwd: process.cwd(), encoding: 'utf8',
    env: { ...process.env, SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: '', VERIFIED_QUESTION_IMPORT_TARGET: 'staging' },
  });
  assert.notEqual(missing.status, 0);
  assert.match(`${missing.stdout}\n${missing.stderr}`, /SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required/);

  const production = spawnSync(process.execPath, ['scripts/import-verified-question-package.mjs', '--dry-run'], {
    cwd: process.cwd(), encoding: 'utf8',
    env: { ...process.env, SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'fake', VERIFIED_QUESTION_IMPORT_TARGET: 'production' },
  });
  assert.notEqual(production.status, 0);
  assert.match(`${production.stdout}\n${production.stderr}`, /Production import requires --confirm-production/);
});
