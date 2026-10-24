// Explicit review gate before the existing atomic importer. Dry-run is the default.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../content/physics-0654');
const original = readFileSync(resolve(dir, 'review-manifest.json'));
const manifest = JSON.parse(original);
const approvalPath = process.argv.find((arg) => arg.startsWith('--approval='))?.slice(11);
if (!approvalPath) throw new Error('Human content/taxonomy review required: supply --approval=/path/to/signed-review.json');
const approval = JSON.parse(readFileSync(resolve(approvalPath), 'utf8'));
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
if (approval.status !== 'approved' || !String(approval.reviewer || '').trim()
    || !Number.isFinite(Date.parse(approval.reviewedAt))
    || approval.manifestSha256 !== digest(original)
    || approval.gradeEligibilityConfirmed !== true
    || approval.registryProposalApproved !== true || approval.contentAndAOReviewApproved !== true) {
  throw new Error('Exact-version human review, grade eligibility, content/AO and registry approval required');
}
for (const [name, expected] of Object.entries(manifest.sha256)) {
  if (digest(readFileSync(resolve(dir, name))) !== expected) throw new Error(`Reviewed file changed: ${name}`);
}
const pkg = JSON.parse(readFileSync(resolve(dir, 'candidate-package.json'), 'utf8'));
pkg.authority = approval.reviewer;
if (pkg.questions.length !== 62 || pkg.questions.some((q) => !q.assessmentProfile || q.assessmentProfile.programmeCode !== '0654')) {
  throw new Error('Unexpected Physics release contents');
}
const url = process.env.SUPABASE_URL;
const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !secret) throw new Error('Service-role environment required; never use a browser key');
if (new URL(url).hostname !== 'sozodkxwhubespiedgxm.supabase.co') throw new Error('Unexpected Brains Heist project');
const client = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const dryRun = !process.argv.includes('--publish');
const { data, error } = await client.rpc('rpc_import_registry_verified_mcq_package', { p_package: pkg, p_dry_run: dryRun });
if (error) throw new Error(error.message);
console.log(JSON.stringify(data, null, 2));
