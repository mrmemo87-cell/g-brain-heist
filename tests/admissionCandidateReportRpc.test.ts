import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const migrationPath = 'supabase/migrations/20260707150000_admission_report_content_version_variable_fix.sql';
const rpcSqlPath = 'ADM_RPCS.sql';
const migrationSql = readFileSync(migrationPath, 'utf8');
const rpcSql = readFileSync(rpcSqlPath, 'utf8');
const allSql = `${migrationSql}\n${rpcSql}`;

test('candidate report RPC does not read content_version from adm_blueprints', () => {
  for (const sql of [migrationSql, rpcSql]) {
    assert.doesNotMatch(sql, /v_blueprint\.content_version/);
    assert.doesNotMatch(sql, /\bb\.content_version/);
    assert.doesNotMatch(sql, /adm_blueprints\.content_version/);
  }
});

test('candidate report RPC derives optional content_version from question metadata only', () => {
  assert.doesNotMatch(migrationSql, /v_content_version/);
  assert.match(migrationSql, /'content_version', COALESCE\(q\.content_version, qp\.content_version\)/);
  assert.match(migrationSql, /'content_version', \(SELECT COALESCE\(max\(q\.content_version\), max\(qp\.content_version\)\)[\s\S]*FROM adm_answers ans[\s\S]*JOIN adm_questions q ON q\.id = ans\.question_id[\s\S]*LEFT JOIN adm_question_pools qp ON qp\.id = q\.pool_id[\s\S]*WHERE ans\.attempt_id = p_attempt_id\)/);
});

test('candidate report RPC preserves scored report readiness and access checks', () => {
  assert.match(migrationSql, /role_in_school IN \('school_admin', 'teacher'\)/);
  assert.match(migrationSql, /RETURN jsonb_build_object\('success', false, 'error', 'Access denied'\)/);
  assert.match(migrationSql, /v_attempt\.status <> 'scored' OR v_attempt\.submitted_at IS NULL/);
  assert.match(migrationSql, /RETURN jsonb_build_object\('success', false, 'error', 'Result not ready'\)/);
  assert.match(migrationSql, /v_attempt\.total_score IS NULL OR v_attempt\.max_score IS NULL OR v_attempt\.percentage IS NULL/);
  assert.doesNotMatch(migrationSql, /\ba\.score\b|\ba\.scored_at\b/);
});

test('candidate report RPC preserves SCI6 form metadata contract', () => {
  assert.match(migrationSql, /v_form\.form_code ILIKE 'SCI%'/);
  assert.match(migrationSql, /v_blueprint\.subject/);
  assert.match(migrationSql, /'form_code', v_form\.form_code/);
  assert.match(migrationSql, /'form_subject', v_form_subject/);
  assert.match(migrationSql, /'subject', v_form_subject/);
  assert.match(migrationSql, /'form_title', v_form_title/);
  assert.match(migrationSql, /'grade', v_form_grade/);
  assert.match(migrationSql, /WHEN lower\(COALESCE\(v_form_subject,''\)\) = 'science' THEN 'Science'/);
});

test('candidate report RPC joins real answers and questions', () => {
  assert.match(allSql, /JOIN adm_answers ans ON ans\.attempt_id = a\.id/);
  assert.match(allSql, /JOIN adm_questions q ON q\.id = ans\.question_id/);
  assert.doesNotMatch(allSql, /adm_attempt_answers/);
  assert.match(migrationSql, /SELECT count\(\*\) INTO v_total_questions FROM adm_answers ans WHERE ans\.attempt_id = p_attempt_id/);
});

test('candidate report RPC keeps candidate tokens hidden', () => {
  const returnBlock = migrationSql.slice(migrationSql.lastIndexOf('RETURN jsonb_build_object'));
  assert.doesNotMatch(returnBlock, /\baccess_token\b|\btoken\b|\bmagic_link\b|\binvite_token\b/);
});
