import fs from 'node:fs';
import path from 'node:path';

const migrationsDir = path.resolve(process.cwd(), 'supabase/migrations');
const baseline = '20260802120000';
const files = fs
  .readdirSync(migrationsDir)
  .filter((file) => file.endsWith('.sql') && file.slice(0, 14) >= baseline)
  .sort();

const failures = [];
const seenVersions = new Map();
const seenNames = new Map();

// These are historical CREATE OR REPLACE definitions whose EXECUTE privileges
// were already restricted by earlier migrations and are preserved by Postgres
// across CREATE OR REPLACE. The production project was also verified directly:
// PUBLIC/anon cannot execute these functions; only their intended caller roles can.
// Keep this list exact so future SECURITY DEFINER functions still have to revoke
// PUBLIC/anon in the migration that introduces them.
const historicalDefinerRevokeExceptions = new Set([
  '20260820081011_make_default_grade_class_creation_retry_safe.sql:school_admin_save_class',
  '20260820124037_teacher_question_bank_role_aware_catalog.sql:rpc_student_academic_subjects',
  '20260820124037_teacher_question_bank_role_aware_catalog.sql:rpc_student_learning_catalog',
  '20260820132006_optimize_teacher_question_bank_catalog.sql:get_all_active_questions',
  '20260821202736_fix_assignment_category_wrapper_composite_return.sql:rpc_create_assignment',
  '20260821202736_fix_assignment_category_wrapper_composite_return.sql:rpc_update_teacher_assignment',
  '20260821205000_fix_school_member_sync_for_moderation.sql:sync_user_school_id',
]);

for (const file of files) {
  const match = file.match(/^(\d{14})_([a-z0-9_]+)\.sql$/);
  if (!match) {
    failures.push(`${file}: migration filename must be <14-digit UTC timestamp>_<snake_case_name>.sql`);
    continue;
  }

  const [, version, name] = match;
  if (seenVersions.has(version)) {
    failures.push(`${file}: migration version ${version} is already used by ${seenVersions.get(version)}`);
  } else {
    seenVersions.set(version, file);
  }
  if (seenNames.has(name)) {
    failures.push(`${file}: migration name ${name} is already used by ${seenNames.get(name)}`);
  } else {
    seenNames.set(name, file);
  }

  const content = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
  const normalized = content.replace(/--.*$/gm, ' ');
  const definerFunctions = [...normalized.matchAll(/create\s+or\s+replace\s+function\s+public\.([a-zA-Z0-9_]+)[\s\S]*?\$\$;/gi)];

  for (const match of definerFunctions) {
    const [block, functionName] = match;
    // PostgreSQL accepts both `SET search_path = ...` and `SET search_path TO ...`.
    if (!/set\s+search_path\s*(?:=|to)\s*/.test(block.toLowerCase())) {
      failures.push(`${file}: SECURITY DEFINER public.${functionName} has no fixed search_path`);
    }

    const hasExplicitRevoke = new RegExp(
      `revoke\\s+all\\s+on\\s+function\\s+public\\.${functionName}\\b[\\s\\S]*?from\\s+(?:public(?:\\s*,\\s*anon)?|anon)`,
      'i',
    ).test(normalized);
    const historicalReplacement = historicalDefinerRevokeExceptions.has(`${file}:${functionName}`);
    if (!hasExplicitRevoke && !historicalReplacement) {
      failures.push(`${file}: SECURITY DEFINER public.${functionName} has no explicit PUBLIC/anon EXECUTE revoke`);
    }
  }
}

if (failures.length) {
  console.error('Supabase migration security guard failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Supabase migration security guard passed (${files.length} migrations checked).`);
