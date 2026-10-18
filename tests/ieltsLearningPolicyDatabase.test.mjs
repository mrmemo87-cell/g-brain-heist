import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';
// Diagnostic Bible 2.0.0 section 8A.4A: bh-learning-policy-v1 acceptance cases (8A.8) run against the real SQL definition.
const sql=readFileSync('supabase/migrations/20261019070000_ielts_learning_policy_v1.sql','utf8');
const fn=sql.slice(sql.indexOf('create or replace function private.ielts_policy_v1_state'),sql.indexOf('end $$;')+7);
const db=new PGlite();await db.exec('create schema private;');await db.exec(fn);
const s=(at,opps,correct,independent=true)=>({at,opps,correct,independent});
async function state(sources,practice=null){return (await db.query("select private.ielts_policy_v1_state($1::jsonb,$2::timestamptz,'2026-10-19'::timestamptz) j",[JSON.stringify(sources),practice])).rows[0].j;}
const cases=[
 ['no evidence',[],null,'not_enough_evidence'],
 ['one miss cannot create a weakness',[s('2026-10-01',1,0)],null,'not_enough_evidence'],
 ['one success cannot create a strength',[s('2026-10-01',1,1)],null,'not_enough_evidence'],
 ['a low single source is only a possible difficulty',[s('2026-10-01',2,0)],null,'possible_difficulty'],
 ['a whole sitting is still one source',[s('2026-10-01',6,1)],null,'possible_difficulty'],
 ['two independent low sources repeat the difficulty',[s('2026-10-01',2,1),s('2026-10-05',2,0)],null,'repeated_difficulty'],
 ['assisted or repeated work cannot establish improvement',[s('2026-10-01',2,0),s('2026-10-05',6,6,false)],null,'possible_difficulty'],
 ['two strong sources show a repeated strength',[s('2026-10-01',2,2),s('2026-10-05',3,3)],null,'repeated_strength'],
 ['fresh comparable success after difficulty is improvement',[s('2026-10-01',2,0),s('2026-10-08',3,3)],null,'improvement_observed'],
 ['a gain under 25 points is not improvement',[s('2026-10-01',4,2),s('2026-10-08',2,2)],null,'mixed'],
 ['improvement is sustained by a later check 14+ days on',[s('2026-09-01',2,0),s('2026-09-08',3,3),s('2026-09-30',4,3)],null,'improvement_sustained'],
 ['a later check under 14 days does not sustain',[s('2026-09-01',2,0),s('2026-09-08',3,3),s('2026-09-12',4,3)],null,'improvement_observed'],
 ['difficulty can appear again after improvement',[s('2026-09-01',2,0),s('2026-09-08',3,3),s('2026-09-30',2,0)],null,'difficulty_observed_again'],
 ['persistence needs practice, a low post-practice check and 21 days',[s('2026-09-01',2,0),s('2026-09-30',3,1)],'2026-09-15','persistent_candidate'],
 ['without practice it stays repeated difficulty',[s('2026-09-01',2,0),s('2026-09-30',3,1)],null,'repeated_difficulty'],
 ['persistence needs 21 days of evidence',[s('2026-09-01',2,0),s('2026-09-10',3,1)],'2026-09-05','repeated_difficulty'],
];
for(const [name,src,practice,expected] of cases)test(name,async()=>{assert.equal((await state(src,practice)).state,expected);});
test('stale evidence is flagged after 90 days and the policy is named',async()=>{const r=await state([s('2026-06-01',2,0)]);assert.equal(r.stale,true);assert.equal(r.policy,'bh-learning-policy-v1');assert.equal((await state([s('2026-10-01',2,0)])).stale,false);});
