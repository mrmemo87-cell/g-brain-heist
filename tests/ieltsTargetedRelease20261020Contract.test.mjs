import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
// Release of R-019 to R-043 (owner decision 2026-10-20 07:14): every task pinned to the exact hash, owner account,
// originality recorded before release, and the whole release aborts if any version changed.
const sql=readFileSync('supabase/migrations/20261020040000_ielts_targeted_reading_release_2026_10_20.sql','utf8');
test('releases exactly R-019 to R-043, pinned to exact hashes',()=>{
 const rows=[...sql.matchAll(/\('(R-\d{3})','(bh-ielts-targeted-reading-r\d+-v1)','([a-f0-9]{64})'\)/g)];
 assert.deepEqual(rows.map(r=>r[1]),Array.from({length:25},(_,i)=>`R-${String(19+i).padStart(3,'0')}`));
 for(const r of rows)assert.equal(Number(r[2].match(/-r(\d+)-v1/)[1])+16,Number(r[1].slice(2)));
 assert.match(sql,/reviewed_release_version_changed/);assert.match(sql,/originality_matches_found/);assert.match(sql,/release_not_effective/);
 assert.ok(sql.indexOf('ielts_material_originality_reviews')<sql.indexOf('ielts_learning_releases('),'originality before release');
 assert.match(sql,/1d4f3b8d-f24f-4651-ad33-85165359cf88/);assert.doesNotMatch(sql,/\bupdate\s+private\.|\bdelete\s+from/i);
});
test('releases Listening L-020 to L-029 pinned to exact content and audio hashes',()=>{
 const l=readFileSync('supabase/migrations/20261020060000_ielts_targeted_listening_05_release.sql','utf8');
 const src=JSON.parse(readFileSync('docs/ielts/practice/TARGETED_LISTENING_05.json','utf8'));
 const rows=[...l.matchAll(/\('(L-\d{3})','(bh-ielts-targeted-listening-l\d+-v1)','([a-f0-9]{64})','([a-f0-9]{64})'\)/g)];
 assert.deepEqual(rows.map(r=>r[1]),Array.from({length:10},(_,i)=>`L-0${20+i}`));
 for(const r of rows){const t=src.tasks.find(t=>t.code===r[2]);assert.equal(r[4],t.audio.sha256);assert.equal(t.audio.owner_audio_approval.sha256,r[4]);}
 assert.match(l,/reviewed_release_version_changed/);assert.match(l,/release_not_effective/);assert.doesNotMatch(l,/\bupdate\s+private\.|\bdelete\s+from/i);
});
