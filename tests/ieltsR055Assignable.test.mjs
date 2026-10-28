import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync,readdirSync} from 'node:fs';
// R-055 (Lesson 6 mixed check) was recorded as a variant of R-049, so the allocation gate refused it as an independent
// check. The fix appends a pinned owner review marking it fresh; it must stay append-only and guarded.
const f=readdirSync('supabase/migrations').filter(n=>n.endsWith('_ielts_r055_independent_check_assignable.sql'));
test('R-055 correction is a single append-only, pinned and guarded review',()=>{
 assert.equal(f.length,1);const sql=readFileSync('supabase/migrations/'+f[0],'utf8');
 assert.doesNotMatch(sql,/\bupdate\b|\bdelete\b|ielts_learning_releases/i,'append-only; release unchanged');
 assert.match(sql,/'bh-ielts-targeted-reading-r33-v2'/);assert.match(sql,/'6afaa70484ceed081e8dede868a07798360edab71ba50fb92c9b276daadfaf5a'/);
 assert.match(sql,/r049_was_exposed/);assert.match(sql,/unexpected_originality_match/);assert.match(sql,/'fresh'/);
 assert.match(sql,/label_not_corrected/);assert.match(sql,/release_lost/);
});
