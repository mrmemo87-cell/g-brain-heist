import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';

const validatorPath = 'scripts/validate-taxonomy-review-batch.mjs';
const importerPath = 'scripts/import-taxonomy-review-batch.mjs';
const artifactPath = 'content/verified-question-taxonomy/bh-production-legacy-1.jsonl';
const migrationPath = 'supabase/migrations/20260825120000_superadmin_question_taxonomy_review_queue.sql';
const expectedFileHash = '398cc58311160e29b8bc80d5f75e1e41b42a250c61b0dcd791d0c923311c732a';
const expectedBatchChecksum = 'daaab5856e5d487644eaa73bd0da98a76964519f02a281ad3598e340b4a28961';

const retiredQuestionIds = new Set([
  '0c929e4c-e42d-4269-b765-b3a3a23985c8',
  '192d0c7f-c45c-4f52-a282-483fdc9f471d',
  '3a5dfe43-f7e9-4408-92b9-72461d74a4eb',
  '3d12f655-9994-4653-a21a-e6b74401adac',
  '673a8165-b022-46d0-8211-f8adc6159ff0',
  'a17a81e3-f94f-4b94-a066-5c91dcdf4ccb',
  'e15cbaba-047a-43cb-ab15-8edf967aacc3',
  'fb24d0f9-71fa-4173-b3f9-cb25c6d84a8c',
]);

const importerEnv = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'fake-service-role-for-offline-test',
  TAXONOMY_REVIEW_IMPORT_TARGET: 'staging',
};

async function loadValidator() {
  return await import(pathToFileURL(path.resolve(validatorPath)).href) as {
    loadAndValidateTaxonomyReviewBatch: (filePath?: string) => any;
  };
}

async function loadImporter() {
  return await import(pathToFileURL(path.resolve(importerPath)).href) as {
    buildTaxonomyReviewImportEnvelope: (validation: any) => any;
    buildTaxonomyReviewStagingPlan: (envelope: any, chunkSize?: number) => any;
    importTaxonomyReviewBatch: (options: Record<string, unknown>) => Promise<any>;
  };
}

test('locked legacy taxonomy review artifact validates with deterministic counts and checksums', async () => {
  const { loadAndValidateTaxonomyReviewBatch } = await loadValidator();
  const result = loadAndValidateTaxonomyReviewBatch();

  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.equal(result.summary.total, 958);
  assert.equal(result.summary.verified, 950);
  assert.equal(result.summary.retired, 8);
  assert.equal(result.summary.inReview, 958);
  assert.equal(result.summary.proposalsWithMappingDrift, 15);
  assert.equal(result.summary.staleGovernedMappings, 15);
  assert.equal(result.summary.uniqueQuestionIds, 958);
  assert.equal(result.summary.uniqueQuestionContentHashes, 958);
  assert.equal(result.summary.sourceFileSha256, expectedFileHash);
  assert.equal(result.summary.batchChecksum, expectedBatchChecksum);
});

test('every proposal is hash-bound, uniquely keyed, and remains human in_review', async () => {
  const { loadAndValidateTaxonomyReviewBatch } = await loadValidator();
  const result = loadAndValidateTaxonomyReviewBatch();
  const proposalKeys = new Set(result.proposals.map((proposal: any) => proposal.proposalKey));
  const proposalHashes = new Set(result.proposals.map((proposal: any) => proposal.proposalHash));

  assert.equal(proposalKeys.size, 958);
  assert.equal(proposalHashes.size, 958);
  assert.ok(result.proposals.every((proposal: any) => /^[0-9a-f]{64}$/.test(proposal.proposalHash)));
  assert.ok(result.proposals.every((proposal: any) => proposal.payload.reviewStatus === 'in_review'));
  assert.ok(result.proposals.every((proposal: any) => proposal.payload.humanReview === true));
  assert.ok(result.proposals.every((proposal: any) => proposal.proposalKey
    === `${proposal.taxonomyVersion}:${proposal.sourceQuestionId}`));

  const retired = result.proposals.filter((proposal: any) => proposal.sourceLifecycleStatus === 'retired');
  assert.equal(retired.length, 8);
  assert.deepEqual(new Set(retired.map((proposal: any) => proposal.sourceQuestionId)), retiredQuestionIds);
  assert.equal(result.proposals.filter((proposal: any) => proposal.sourceLifecycleStatus === 'verified').length, 950);
});

test('locked artifact validation rejects even a valid-JSON payload mutation', async () => {
  const { loadAndValidateTaxonomyReviewBatch } = await loadValidator();
  const tempDir = mkdtempSync(path.join(tmpdir(), 'taxonomy-review-tamper-'));
  const tempPath = path.join(tempDir, 'tampered.jsonl');
  try {
    const lines = readFileSync(artifactPath, 'utf8').trimEnd().split('\n');
    const first = JSON.parse(lines[0]);
    first.primarySkillName = `${first.primarySkillName} altered`;
    lines[0] = JSON.stringify(first);
    writeFileSync(tempPath, `${lines.join('\n')}\n`);

    const result = loadAndValidateTaxonomyReviewBatch(tempPath);
    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /source file checksum mismatch/);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('importer dry-run validates locally and creates the exact atomic RPC envelope', async () => {
  const result = spawnSync(process.execPath, [importerPath, '--dry-run'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, ...importerEnv },
  });
  const output = `${result.stdout}\n${result.stderr}`;
  assert.equal(result.status, 0, output);
  assert.match(output, /dry-run validated for staging/);
  assert.match(output, /"total": 958/);
  assert.match(output, /"verified": 950/);
  assert.match(output, /"retired": 8/);
  assert.match(output, /"proposalsWithMappingDrift": 15/);
  assert.match(output, /"staleGovernedMappings": 15/);
  assert.match(output, /"payloadBytes": 3102882/);
  assert.match(output, new RegExp(expectedBatchChecksum));

  const { loadAndValidateTaxonomyReviewBatch } = await loadValidator();
  const { buildTaxonomyReviewImportEnvelope } = await loadImporter();
  const envelope = buildTaxonomyReviewImportEnvelope(loadAndValidateTaxonomyReviewBatch());
  assert.deepEqual(envelope.expectedCounts, { total: 958, verified: 950, retired: 8, inReview: 958 });
  assert.equal(envelope.proposals.length, 958);
  assert.ok(envelope.proposals.every((proposal: any) => proposal.payload.reviewStatus === 'in_review'));
  assert.ok(envelope.proposals.every((proposal: any) => proposal.payload.humanReview === true));
  assert.equal(envelope.batchChecksum, expectedBatchChecksum);
});

test('non-dry-run importer performs one service-only atomic RPC call', async () => {
  const { importTaxonomyReviewBatch } = await loadImporter();
  const calls: Array<{ rpc: string; args: any }> = [];
  const createClient = (url: string, key: string, options: any) => {
    assert.equal(url, importerEnv.SUPABASE_URL);
    assert.equal(key, importerEnv.SUPABASE_SERVICE_ROLE_KEY);
    assert.deepEqual(options.auth, {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    });
    return {
      rpc: async (rpc: string, args: any) => {
        calls.push({ rpc, args });
        return {
          data: {
            batchId: args.p_batch.batchId,
            batchChecksum: args.p_batch.batchChecksum,
            total: args.p_batch.expectedCounts.total,
            inserted: 958,
            existing: 0,
          },
          error: null,
        };
      },
    };
  };

  const result = await importTaxonomyReviewBatch({
    env: importerEnv,
    dryRun: false,
    createClient,
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].rpc, 'rpc_import_verified_question_taxonomy_review_batch');
  assert.equal(calls[0].args.p_batch.proposals.length, 958);
  assert.equal(result.rpcResult.inserted, 958);
});

test('chunked staging plan is deterministic, bounded, complete, and much smaller than the atomic body', async () => {
  const { loadAndValidateTaxonomyReviewBatch } = await loadValidator();
  const { buildTaxonomyReviewImportEnvelope, buildTaxonomyReviewStagingPlan } = await loadImporter();
  const envelope = buildTaxonomyReviewImportEnvelope(loadAndValidateTaxonomyReviewBatch());
  const plan = buildTaxonomyReviewStagingPlan(envelope, 75);

  assert.equal(plan.manifest.totalChunks, 13);
  assert.equal(plan.chunks.length, 13);
  assert.equal(plan.chunks.reduce((sum: number, chunk: any) => sum + chunk.proposals.length, 0), 958);
  assert.equal(new Set(plan.chunks.flatMap((chunk: any) => chunk.proposals.map((proposal: any) => proposal.proposalKey))).size, 958);
  assert.ok(plan.chunks.every((chunk: any, index: number) => chunk.chunkIndex === index));
  assert.ok(plan.chunks.every((chunk: any) => chunk.proposals.length <= 75));
  assert.ok(plan.chunks.every((chunk: any) => /^[0-9a-f]{64}$/.test(chunk.chunkChecksum)));
  assert.equal(plan.maxChunkPayloadBytes, 243706);
  assert.ok(plan.maxChunkPayloadBytes < 512_000);
});

test('chunked importer stages every immutable chunk then performs one transactional finalize', async () => {
  const { importTaxonomyReviewBatch } = await loadImporter();
  const calls: Array<{ rpc: string; args: any }> = [];
  const createClient = () => ({
    rpc: async (rpc: string, args: any) => {
      calls.push({ rpc, args });
      if (rpc === 'rpc_finalize_verified_question_taxonomy_review_batch') {
        return {
          data: {
            success: true,
            batchChecksum: args.p_batch_checksum,
            total: 958,
            verified: 950,
            retired: 8,
            inReview: 958,
            inserted: 958,
            existing: 0,
          },
          error: null,
        };
      }
      if (rpc === 'rpc_stage_verified_question_taxonomy_review_manifest') {
        return {
          data: {
            success: true,
            batchChecksum: args.p_manifest.batchChecksum,
            totalChunks: args.p_manifest.totalChunks,
          },
          error: null,
        };
      }
      return {
        data: {
          success: true,
          chunkIndex: args.p_chunk_index,
          chunkChecksum: args.p_chunk_checksum,
          proposalCount: args.p_proposals.length,
        },
        error: null,
      };
    },
  });

  const result = await importTaxonomyReviewBatch({
    env: importerEnv,
    chunked: true,
    chunkSize: 75,
    createClient,
  });

  assert.equal(calls.length, 15);
  assert.equal(calls[0].rpc, 'rpc_stage_verified_question_taxonomy_review_manifest');
  assert.equal(calls[0].args.p_manifest.totalChunks, 13);
  assert.deepEqual(
    calls.slice(1, 14).map((call) => call.rpc),
    Array(13).fill('rpc_stage_verified_question_taxonomy_review_chunk'),
  );
  assert.deepEqual(
    calls.slice(1, 14).map((call) => call.args.p_chunk_index),
    Array.from({ length: 13 }, (_, index) => index),
  );
  assert.equal(calls[14].rpc, 'rpc_finalize_verified_question_taxonomy_review_batch');
  assert.equal(calls[14].args.p_batch_checksum, expectedBatchChecksum);
  assert.equal(result.summary.transport, 'staged-chunks');
  assert.equal(result.rpcResult.inserted, 958);
});

test('importer refuses browser keys, unclear targets, and untyped production confirmation', () => {
  const publishable = spawnSync(process.execPath, [importerPath, '--dry-run'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      ...importerEnv,
      SUPABASE_SERVICE_ROLE_KEY: 'sb_publishable_example',
    },
  });
  assert.notEqual(publishable.status, 0);
  assert.match(`${publishable.stdout}\n${publishable.stderr}`, /contains a publishable key/);

  const unclear = spawnSync(process.execPath, [importerPath, '--dry-run'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      ...importerEnv,
      TAXONOMY_REVIEW_IMPORT_TARGET: '',
    },
  });
  assert.notEqual(unclear.status, 0);
  assert.match(`${unclear.stdout}\n${unclear.stderr}`, /must be one of: local, staging, production/);

  const production = spawnSync(process.execPath, [importerPath, '--dry-run', '--confirm-production'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      ...importerEnv,
      TAXONOMY_REVIEW_IMPORT_TARGET: 'production',
    },
  });
  assert.notEqual(production.status, 0);
  assert.match(`${production.stdout}\n${production.stderr}`, /--confirm-production=bh-production-legacy-1/);

  const oversizedChunk = spawnSync(process.execPath, [importerPath, '--dry-run', '--chunked', '--chunk-size=101'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, ...importerEnv },
  });
  assert.notEqual(oversizedChunk.status, 0);
  assert.match(`${oversizedChunk.stdout}\n${oversizedChunk.stderr}`, /--chunk-size must be an integer from 1 to 100/);
});

test('database import boundary is atomic, service-only, count-strict, and never auto-approves', () => {
  const migration = readFileSync(migrationPath, 'utf8');
  const signature = 'create or replace function public.rpc_import_verified_question_taxonomy_review_batch(';
  const start = migration.indexOf(signature);
  const end = migration.indexOf('\n$function$;', start);
  assert.ok(start >= 0 && end > start, 'Expected the atomic taxonomy import RPC');
  const rpc = migration.slice(start, end);

  assert.match(rpc, /auth\.jwt\(\) ->> 'role'.*<> 'service_role'/s);
  assert.match(rpc, /jsonb_array_length\(v_proposals\) <> v_expected_total/);
  assert.match(rpc, /v_expected_total <> v_expected_verified \+ v_expected_retired/);
  assert.match(rpc, /v_expected_in_review <> v_expected_total/);
  assert.match(rpc, /v_payload ->> 'reviewStatus'.*<> 'in_review'/s);
  assert.match(rpc, /v_payload ->> 'humanReview'.*is not true/s);
  assert.match(rpc, /v_question\.verification_status <> v_source_status/);
  assert.match(rpc, /v_question\.current_content_hash.*<> lower\(trim\(v_entry ->> 'questionContentHash'\)\)/s);
  assert.match(rpc, /message = 'taxonomy_import_count_mismatch'/);
  assert.doesNotMatch(rpc, /review_status\s*=\s*'approved'/i);
  assert.match(migration, /revoke all on function public\.rpc_import_verified_question_taxonomy_review_batch\(jsonb\)\s+from public, anon, authenticated, service_role;/);
  assert.match(migration, /grant execute on function public\.rpc_import_verified_question_taxonomy_review_batch\(jsonb\)\s+to service_role;/);
  assert.doesNotMatch(migration, /grant (?:insert|update|delete|all)[^;]*question_taxonomy_review_(?:batches|queue|decisions)[^;]*(?:anon|authenticated)/i);
});

test('proposal-key validation stays within PostgreSQL regex repetition limits', () => {
  const migration = readFileSync(migrationPath, 'utf8');
  assert.doesNotMatch(migration, /\{2,299\}/);
  assert.match(migration, /length\(proposal_key\) between 3 and 300/);
  assert.match(migration, /proposal_key\s*~\s*'\^\[a-z0-9\]\[a-z0-9\._:-\]\*\$'/);
});

test('mapping drift is preserved for review while approval resolves only current approved primary mappings', () => {
  const migration = readFileSync(migrationPath, 'utf8');
  assert.match(migration, /mapping_drift boolean not null default false/);
  assert.match(migration, /jsonb_array_elements\(v_payload -> 'governedMappings'\)/);
  assert.match(migration, /current_mapping\.status = 'approved'/);
  assert.match(migration, /current_mapping\.mapping_role = 'primary'/);
  assert.match(migration, /current_mapping\.superseded_at is null/);
  assert.match(migration, /'mappingDrift', b\.current_mapping_drift/);
  assert.match(migration, /'objectiveOptions', coalesce/);
  assert.match(migration, /message = 'taxonomy_approval_mapping_no_longer_current'/);
  assert.match(migration, /message = 'taxonomy_supersede_mapping_not_approved'/);
});

test('a returned proposal can later receive one terminal append-only decision', () => {
  const migration = readFileSync(migrationPath, 'utf8');
  const decisionTableStart = migration.indexOf('create table if not exists public.question_taxonomy_review_decisions (');
  const decisionTableEnd = migration.indexOf('\n);', decisionTableStart);
  const decisionTable = migration.slice(decisionTableStart, decisionTableEnd);
  assert.doesNotMatch(decisionTable, /review_item_id uuid not null unique/);
  assert.match(decisionTable, /previous_decision_id uuid unique/);

  const decisionRpcStart = migration.indexOf('create or replace function public.rpc_superadmin_decide_question_taxonomy_review(');
  const decisionRpcEnd = migration.indexOf('\n$function$;', decisionRpcStart);
  const decisionRpc = migration.slice(decisionRpcStart, decisionRpcEnd);
  assert.match(decisionRpc, /v_previous_decision in \('approve', 'retire', 'supersede'\)/);
  assert.match(decisionRpc, /v_previous_decision = 'return' and v_decision = 'return'/);
  assert.match(decisionRpc, /previous_decision_id, decision, rationale/);
  assert.doesNotMatch(decisionRpc, /v_previous_decision = 'return'.*taxonomy_review_already_decided/s);
});

test('hidden chunk staging is immutable, retry-safe, and exposes queue rows only after atomic finalize', () => {
  const migration = readFileSync(migrationPath, 'utf8');
  for (const table of [
    'question_taxonomy_review_staging_manifests',
    'question_taxonomy_review_staging_chunks',
  ]) {
    assert.match(migration, new RegExp(`create table if not exists private\\.${table}`));
    assert.match(migration, new RegExp(`alter table private\\.${table} enable row level security;`));
    assert.match(migration, new RegExp(`revoke all on table private\\.${table}\\s+from public, anon, authenticated, service_role;`));
    assert.match(migration, new RegExp(`before update or delete on private\\.${table}`));
  }

  const stageManifestStart = migration.indexOf('create or replace function public.rpc_stage_verified_question_taxonomy_review_manifest(');
  const stageManifestEnd = migration.indexOf('\n$function$;', stageManifestStart);
  const stageManifest = migration.slice(stageManifestStart, stageManifestEnd);
  assert.match(stageManifest, /auth\.jwt\(\) ->> 'role'.*<> 'service_role'/s);
  assert.match(stageManifest, /on conflict \(batch_key\) do nothing/);
  assert.match(stageManifest, /manifest_snapshot <> p_manifest/);
  assert.match(stageManifest, /taxonomy_staging_manifest_identity_conflict/);

  const stageChunkStart = migration.indexOf('create or replace function public.rpc_stage_verified_question_taxonomy_review_chunk(');
  const stageChunkEnd = migration.indexOf('\n$function$;', stageChunkStart);
  const stageChunk = migration.slice(stageChunkStart, stageChunkEnd);
  assert.match(stageChunk, /v_proposal_count not between 1 and 100/);
  assert.match(stageChunk, /octet_length\(p_proposals::text\) > 512000/);
  assert.match(stageChunk, /taxonomy_staging_chunk_payload_too_large/);
  assert.match(stageChunk, /extensions\.digest/);
  assert.match(stageChunk, /order by proposal ->> 'proposalKey'/);
  assert.match(stageChunk, /on conflict \(batch_key, chunk_index\) do nothing/);
  assert.match(stageChunk, /v_existing\.proposals <> p_proposals/);

  const finalizeStart = migration.indexOf('create or replace function public.rpc_finalize_verified_question_taxonomy_review_batch(');
  const finalizeEnd = migration.indexOf('\n$function$;', finalizeStart);
  const finalize = migration.slice(finalizeStart, finalizeEnd);
  assert.match(finalize, /where manifest\.batch_key = v_batch_key\s+for update;/);
  assert.match(finalize, /v_chunk_count <> v_manifest\.total_chunks/);
  assert.match(finalize, /v_min_chunk <> 0/);
  assert.match(finalize, /v_max_chunk <> v_manifest\.total_chunks - 1/);
  assert.match(finalize, /v_unique_keys <> v_total/);
  assert.match(finalize, /v_unique_hashes <> v_total/);
  assert.match(finalize, /v_computed_checksum <> v_manifest\.batch_checksum/);
  assert.match(finalize, /public\.rpc_import_verified_question_taxonomy_review_batch\(v_batch\)/);

  const catalogStart = migration.indexOf('create or replace function public.rpc_superadmin_question_taxonomy_review_queue(');
  const catalogEnd = migration.indexOf('\n$function$;', catalogStart);
  const catalog = migration.slice(catalogStart, catalogEnd);
  assert.doesNotMatch(catalog, /question_taxonomy_review_staging_/);
});
