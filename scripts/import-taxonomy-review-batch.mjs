#!/usr/bin/env node
process.env.NO_COLOR = '1';
process.env.FORCE_COLOR = '0';

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_TAXONOMY_REVIEW_BATCH_PATH,
  EXPECTED_TAXONOMY_REVIEW_COUNTS,
  TAXONOMY_REVIEW_BATCH_ID,
  loadAndValidateTaxonomyReviewBatch,
  taxonomyReviewChunkChecksum,
} from './validate-taxonomy-review-batch.mjs';

const VALID_TARGETS = new Set(['local', 'staging', 'production']);
const SOURCE_ARTIFACT = 'content/verified-question-taxonomy/bh-production-legacy-1.jsonl';
const IMPORT_RPC = 'rpc_import_verified_question_taxonomy_review_batch';
const STAGE_MANIFEST_RPC = 'rpc_stage_verified_question_taxonomy_review_manifest';
const STAGE_CHUNK_RPC = 'rpc_stage_verified_question_taxonomy_review_chunk';
const FINALIZE_STAGED_RPC = 'rpc_finalize_verified_question_taxonomy_review_batch';
export const DEFAULT_TAXONOMY_REVIEW_CHUNK_SIZE = 75;
export const MAX_TAXONOMY_REVIEW_CHUNK_SIZE = 100;

export function parseTaxonomyReviewImportArgs(argv) {
  const args = {
    batchPath: DEFAULT_TAXONOMY_REVIEW_BATCH_PATH,
    dryRun: false,
    chunked: false,
    chunkSize: DEFAULT_TAXONOMY_REVIEW_CHUNK_SIZE,
    confirmProduction: null,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--chunked') args.chunked = true;
    else if (arg === '--chunk-size') {
      const value = argv[index + 1];
      if (!value) throw new Error('--chunk-size requires an integer');
      args.chunkSize = Number(value);
      index += 1;
    } else if (arg.startsWith('--chunk-size=')) {
      args.chunkSize = Number(arg.slice('--chunk-size='.length));
    } else if (arg === '--batch-path') {
      const value = argv[index + 1];
      if (!value) throw new Error('--batch-path requires a JSONL path');
      args.batchPath = path.resolve(value);
      index += 1;
    } else if (arg.startsWith('--batch-path=')) {
      args.batchPath = path.resolve(arg.slice('--batch-path='.length));
    } else if (arg === '--confirm-production') {
      throw new Error(`Production confirmation must be explicit: --confirm-production=${TAXONOMY_REVIEW_BATCH_ID}`);
    } else if (arg.startsWith('--confirm-production=')) {
      args.confirmProduction = arg.slice('--confirm-production='.length);
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isInteger(args.chunkSize)
      || args.chunkSize < 1
      || args.chunkSize > MAX_TAXONOMY_REVIEW_CHUNK_SIZE) {
    throw new Error(`--chunk-size must be an integer from 1 to ${MAX_TAXONOMY_REVIEW_CHUNK_SIZE}`);
  }

  return args;
}

export function usage() {
  return `Usage: node scripts/import-taxonomy-review-batch.mjs [--dry-run] [--chunked] [--chunk-size 75] [--batch-path path]\n\nRequired environment variables:\n  SUPABASE_URL\n  SUPABASE_SERVICE_ROLE_KEY\n  TAXONOMY_REVIEW_IMPORT_TARGET=local|staging|production\n\nThe importer validates the locked 958-row artifact before any database call. The default sends one atomic service-role RPC. --chunked uses hidden immutable staging chunks and one transactional finalize, so partial uploads never appear in the review queue. Neither path approves proposals. Production requires --confirm-production=${TAXONOMY_REVIEW_BATCH_ID}.`;
}

export function requireTaxonomyReviewImportEnvironment(env, args) {
  const url = env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const target = env.TAXONOMY_REVIEW_IMPORT_TARGET;

  if (!url) throw new Error('SUPABASE_URL is required');
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required; publishable and browser credentials are refused');
  if (!target || !VALID_TARGETS.has(target)) {
    throw new Error('TAXONOMY_REVIEW_IMPORT_TARGET must be one of: local, staging, production');
  }
  if (target === 'production' && args.confirmProduction !== TAXONOMY_REVIEW_BATCH_ID) {
    throw new Error(`Production import requires --confirm-production=${TAXONOMY_REVIEW_BATCH_ID}`);
  }
  if (String(serviceKey).startsWith('sb_publishable_')) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY contains a publishable key; refusing privileged import');
  }

  return { url, serviceKey, target };
}

export function buildTaxonomyReviewImportEnvelope(validation) {
  if (!validation?.ok) throw new Error('Cannot build an import envelope from an invalid taxonomy review batch');
  return {
    schemaVersion: 1,
    batchId: TAXONOMY_REVIEW_BATCH_ID,
    taxonomyVersion: TAXONOMY_REVIEW_BATCH_ID,
    sourceArtifact: SOURCE_ARTIFACT,
    sourceFileSha256: validation.summary.sourceFileSha256,
    batchChecksum: validation.summary.batchChecksum,
    expectedCounts: {
      total: EXPECTED_TAXONOMY_REVIEW_COUNTS.total,
      verified: EXPECTED_TAXONOMY_REVIEW_COUNTS.verified,
      retired: EXPECTED_TAXONOMY_REVIEW_COUNTS.retired,
      inReview: EXPECTED_TAXONOMY_REVIEW_COUNTS.inReview,
    },
    proposals: validation.proposals,
  };
}

export function buildTaxonomyReviewStagingPlan(envelope, chunkSize = DEFAULT_TAXONOMY_REVIEW_CHUNK_SIZE) {
  if (!Number.isInteger(chunkSize) || chunkSize < 1 || chunkSize > MAX_TAXONOMY_REVIEW_CHUNK_SIZE) {
    throw new Error(`chunkSize must be an integer from 1 to ${MAX_TAXONOMY_REVIEW_CHUNK_SIZE}`);
  }
  const sorted = [...envelope.proposals].sort((left, right) => left.proposalKey.localeCompare(right.proposalKey));
  const chunks = [];
  for (let start = 0; start < sorted.length; start += chunkSize) {
    const proposals = sorted.slice(start, start + chunkSize);
    const chunkIndex = chunks.length;
    const chunkChecksum = taxonomyReviewChunkChecksum(proposals);
    const payloadBytes = Buffer.byteLength(JSON.stringify({
      p_batch_id: envelope.batchId,
      p_chunk_index: chunkIndex,
      p_chunk_checksum: chunkChecksum,
      p_proposals: proposals,
    }), 'utf8');
    chunks.push({ chunkIndex, chunkChecksum, proposals, payloadBytes });
  }
  return {
    manifest: {
      schemaVersion: envelope.schemaVersion,
      batchId: envelope.batchId,
      taxonomyVersion: envelope.taxonomyVersion,
      sourceArtifact: envelope.sourceArtifact,
      sourceFileSha256: envelope.sourceFileSha256,
      batchChecksum: envelope.batchChecksum,
      expectedCounts: envelope.expectedCounts,
      totalChunks: chunks.length,
    },
    chunks,
    maxChunkPayloadBytes: Math.max(0, ...chunks.map((chunk) => chunk.payloadBytes)),
  };
}

function assertRpcResult(result, envelope) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new Error(`${IMPORT_RPC} returned an invalid result`);
  }
  const batchChecksum = result.batchChecksum ?? result.batch_checksum;
  if (batchChecksum && batchChecksum !== envelope.batchChecksum) {
    throw new Error(`${IMPORT_RPC} returned a different batch checksum`);
  }
  const total = Number(result.total ?? result.total_count ?? envelope.expectedCounts.total);
  if (total !== envelope.expectedCounts.total) {
    throw new Error(`${IMPORT_RPC} returned ${total} proposals; expected ${envelope.expectedCounts.total}`);
  }
}

const transientRpcError = (error) => {
  const status = Number(error?.status ?? error?.statusCode ?? error?.code);
  if ([408, 429, 500, 502, 503, 504].includes(status)) return true;
  return /(?:network|fetch|timeout|timed out|connection|temporar|503|504|429)/i
    .test(String(error?.message ?? error ?? ''));
};

const retryDelay = (attempt) => new Promise((resolve) => setTimeout(resolve, 250 * (2 ** attempt)));

async function callIdempotentRpc(client, rpc, args, attempts = 3) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const { data, error } = await client.rpc(rpc, args);
    if (!error) return data;
    lastError = error;
    if (!transientRpcError(error) || attempt === attempts - 1) break;
    await retryDelay(attempt);
  }
  throw new Error(`${rpc} failed: ${lastError?.message ?? String(lastError)}`);
}

async function stageAndFinalizeTaxonomyReviewBatch(client, envelope, stagingPlan) {
  const manifestResult = await callIdempotentRpc(client, STAGE_MANIFEST_RPC, {
    p_manifest: stagingPlan.manifest,
  });
  if (manifestResult?.batchChecksum !== envelope.batchChecksum
      || Number(manifestResult?.totalChunks) !== stagingPlan.chunks.length) {
    throw new Error(`${STAGE_MANIFEST_RPC} returned mismatched staging identity`);
  }
  for (const chunk of stagingPlan.chunks) {
    const chunkResult = await callIdempotentRpc(client, STAGE_CHUNK_RPC, {
      p_batch_id: envelope.batchId,
      p_chunk_index: chunk.chunkIndex,
      p_chunk_checksum: chunk.chunkChecksum,
      p_proposals: chunk.proposals,
    });
    if (Number(chunkResult?.chunkIndex) !== chunk.chunkIndex
        || chunkResult?.chunkChecksum !== chunk.chunkChecksum
        || Number(chunkResult?.proposalCount) !== chunk.proposals.length) {
      throw new Error(`${STAGE_CHUNK_RPC} returned mismatched chunk ${chunk.chunkIndex}`);
    }
  }
  const result = await callIdempotentRpc(client, FINALIZE_STAGED_RPC, {
    p_batch_id: envelope.batchId,
    p_batch_checksum: envelope.batchChecksum,
  });
  assertRpcResult(result, envelope);
  return result;
}

export async function importTaxonomyReviewBatch({
  batchPath = DEFAULT_TAXONOMY_REVIEW_BATCH_PATH,
  dryRun = false,
  chunked = false,
  chunkSize = DEFAULT_TAXONOMY_REVIEW_CHUNK_SIZE,
  confirmProduction = null,
  env = process.env,
  createClient: createClientOverride,
} = {}) {
  // Validate the immutable artifact before reading any credentials into a
  // Supabase client or making any network/database call.
  const validation = loadAndValidateTaxonomyReviewBatch(batchPath);
  if (!validation.ok) {
    throw new Error(`Taxonomy review batch validation failed before import:\n${validation.errors.map((error) => `- ${error}`).join('\n')}`);
  }

  const target = requireTaxonomyReviewImportEnvironment(env, { confirmProduction });
  const envelope = buildTaxonomyReviewImportEnvelope(validation);
  const payloadBytes = Buffer.byteLength(JSON.stringify({ p_batch: envelope }), 'utf8');
  const stagingPlan = buildTaxonomyReviewStagingPlan(envelope, chunkSize);
  const summary = {
    target: target.target,
    dryRun,
    transport: chunked ? 'staged-chunks' : 'atomic-single-rpc',
    payloadBytes,
    totalChunks: stagingPlan.chunks.length,
    chunkSize,
    maxChunkPayloadBytes: stagingPlan.maxChunkPayloadBytes,
    ...validation.summary,
  };

  if (dryRun) return { summary, envelope, stagingPlan, rpcResult: null };

  const createClient = createClientOverride
    ?? (await import('@supabase/supabase-js')).createClient;
  const client = createClient(target.url, target.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const data = chunked
    ? await stageAndFinalizeTaxonomyReviewBatch(client, envelope, stagingPlan)
    : await callIdempotentRpc(client, IMPORT_RPC, { p_batch: envelope });
  assertRpcResult(data, envelope);

  return { summary, envelope, stagingPlan, rpcResult: data };
}

async function main() {
  const args = parseTaxonomyReviewImportArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const result = await importTaxonomyReviewBatch({
    batchPath: args.batchPath,
    dryRun: args.dryRun,
    chunked: args.chunked,
    chunkSize: args.chunkSize,
    confirmProduction: args.confirmProduction,
  });
  console.log(`Taxonomy review batch ${result.summary.dryRun ? 'dry-run validated' : 'imported'} for ${result.summary.target}`);
  console.log(JSON.stringify({
    batchId: result.summary.batchId,
    sourceFileSha256: result.summary.sourceFileSha256,
    batchChecksum: result.summary.batchChecksum,
    total: result.summary.total,
    verified: result.summary.verified,
    retired: result.summary.retired,
    inReview: result.summary.inReview,
    proposalsWithMappingDrift: result.summary.proposalsWithMappingDrift,
    staleGovernedMappings: result.summary.staleGovernedMappings,
    transport: result.summary.transport,
    payloadBytes: result.summary.payloadBytes,
    totalChunks: result.summary.totalChunks,
    chunkSize: result.summary.chunkSize,
    maxChunkPayloadBytes: result.summary.maxChunkPayloadBytes,
    database: result.rpcResult,
  }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
