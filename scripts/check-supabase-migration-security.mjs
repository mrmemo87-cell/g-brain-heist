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
}

for (const file of files) {
  const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
  const normalized = sql.replace(/--.*$/gm, ' ').replace(/\s+/g, ' ');

  const publicTables = [...normalized.matchAll(/create\s+table(?:\s+if\s+not\s+exists)?\s+public\.([a-zA-Z0-9_]+)/gi)]
    .map((match) => match[1]);

  for (const table of publicTables) {
    const escaped = table.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!new RegExp(`alter\\s+table\\s+public\\.${escaped}\\s+enable\\s+row\\s+level\\s+security`, 'i').test(normalized)) {
      failures.push(`${file}: public.${table} is created without enabling RLS in the same migration`);
    }
  }

  const definerFunctions = [...normalized.matchAll(
    /create\s+(?:or\s+replace\s+)?function\s+public\.([a-zA-Z0-9_]+)[\s\S]*?security\s+definer[\s\S]*?(?=create\s+(?:or\s+replace\s+)?function|$)/gi,
  )];

  for (const match of definerFunctions) {
    const [block, functionName] = match;
    if (!/set\s+search_path\s*=/.test(block.toLowerCase())) {
      failures.push(`${file}: SECURITY DEFINER public.${functionName} has no fixed search_path`);
    }
    if (!new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.${functionName}\\b[\\s\\S]*?from\\s+(?:public(?:\\s*,\\s*anon)?|anon)`, 'i').test(normalized)) {
      failures.push(`${file}: SECURITY DEFINER public.${functionName} has no explicit PUBLIC/anon EXECUTE revoke`);
    }
  }

  if (/create\s+policy[\s\S]*?to\s+public[\s\S]*?(?:using|with\s+check)\s*\(\s*true\s*\)/i.test(normalized)) {
    failures.push(`${file}: unconditional PUBLIC RLS policy requires a documented security exception`);
  }
}

if (failures.length > 0) {
  console.error('Supabase migration security guard failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Supabase migration security guard passed for ${files.length} migration(s).`);
