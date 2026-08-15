#!/usr/bin/env node
process.env.NO_COLOR = '1';
process.env.FORCE_COLOR = '0';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { validateVerifiedQuestionPackage, DEFAULT_PACKAGE_DIR } from './validate-verified-question-package.mjs';

const VALID_TARGETS = new Set(['local', 'staging', 'production']);

function parseArgs(argv) {
  const args = { packageDir: DEFAULT_PACKAGE_DIR, dryRun: false, confirmProduction: false, skipRemoteAssets: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--confirm-production') args.confirmProduction = true;
    else if (arg === '--skip-remote-assets') args.skipRemoteAssets = true;
    else if (arg === '--package-dir') args.packageDir = path.resolve(argv[++index] ?? '');
    else if (arg.startsWith('--package-dir=')) args.packageDir = path.resolve(arg.slice('--package-dir='.length));
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function usage() {
  return `Usage: node scripts/import-verified-question-package.mjs [--dry-run] [--package-dir path] [--skip-remote-assets]\n\nRequired environment variables:\n  SUPABASE_URL\n  SUPABASE_SERVICE_ROLE_KEY\n  VERIFIED_QUESTION_IMPORT_TARGET=local|staging|production\n\nProduction imports require --confirm-production and always verify remote visual assets.`;
}

async function verifyRemoteAssets(pkg) {
  if (pkg.schemaVersion !== 2) return { checked: 0 };
  const assets = pkg.assets ?? [];
  for (let start = 0; start < assets.length; start += 6) {
    await Promise.all(assets.slice(start, start + 6).map(async (asset) => {
      const response = await fetch(asset.publicUrl, { cache: 'no-store', redirect: 'error' });
      if (!response.ok) throw new Error(`Visual asset ${asset.assetId} returned HTTP ${response.status}`);
      const contentType = response.headers.get('content-type')?.split(';')[0]?.trim();
      if (contentType !== asset.mimeType) throw new Error(`Visual asset ${asset.assetId} returned ${contentType || 'no content type'}`);
      const body = Buffer.from(await response.arrayBuffer());
      const actualHash = createHash('sha256').update(body).digest('hex');
      if (actualHash !== asset.sha256) throw new Error(`Visual asset ${asset.assetId} failed remote checksum verification`);
    }));
  }
  return { checked: assets.length };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return console.log(usage());
  const target = process.env.VERIFIED_QUESTION_IMPORT_TARGET;
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  if (!VALID_TARGETS.has(target)) throw new Error('VERIFIED_QUESTION_IMPORT_TARGET must be local, staging, or production');
  if (target === 'production' && !args.confirmProduction) throw new Error('Production import requires --confirm-production');
  if (target === 'production' && args.skipRemoteAssets) throw new Error('Production imports cannot skip remote visual-asset verification');

  const validation = validateVerifiedQuestionPackage(args.packageDir);
  if (!validation.valid) throw new Error(`Package validation failed:\n${validation.errors.map((error) => `- ${error}`).join('\n')}`);
  if (!args.skipRemoteAssets) {
    const remoteAssets = await verifyRemoteAssets(validation.package);
    if (remoteAssets.checked) console.log(`Remote visual assets verified: ${remoteAssets.checked}`);
  }
  const { createClient } = await import('@supabase/supabase-js');
  const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const importRpc = validation.package.schemaVersion === 2
    ? 'rpc_import_verified_question_package_v2'
    : 'rpc_import_verified_question_package';

  const { data: checked, error: checkError } = await client.rpc(importRpc, { p_package: validation.package, p_dry_run: true });
  if (checkError) throw checkError;
  console.log('Database dry-run passed:', JSON.stringify(checked));
  if (args.dryRun) return;

  const { data: imported, error: importError } = await client.rpc(importRpc, { p_package: validation.package, p_dry_run: false });
  if (importError) throw importError;
  console.log('Verified question package imported:', JSON.stringify(imported));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
