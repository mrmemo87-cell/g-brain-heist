import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const migrationFiles = [
    'supabase/migrations/20260521133000_ielts_listening_content_upsert_rpcs.sql',
    'supabase/migrations/20260521143000_ielts_reading_content_upsert_rpcs.sql',
    'supabase/migrations/20260521153000_ielts_writing_content_upsert_rpc.sql',
    'supabase/migrations/20260521163000_ielts_speaking_content_upsert_rpc.sql',
    'supabase/migrations/20260521120000_ielts_content_manager_rpcs.sql'
];
const bannedPatterns = [
    { pattern: /estimated_band/i, label: 'estimated_band' },
    { pattern: /\b(reading_set_id|listening_set_id)\b\s*(=|,|\))/i, label: 'reading_set_id/listening_set_id column refs' },
    { pattern: /updated_at\s*=\s*now\(\)/i, label: 'updated_at = now()' },
    { pattern: /st\.title/i, label: 'st.title' }
];
test('IELTS content manager migrations avoid stale schema references', () => {
    for (const relPath of migrationFiles) {
        const absPath = path.resolve(process.cwd(), relPath);
        const sql = fs.readFileSync(absPath, 'utf8');
        for (const { pattern, label } of bannedPatterns) {
            assert.equal(pattern.test(sql), false, `${relPath} contains forbidden schema reference: ${label}`);
        }
    }
});
