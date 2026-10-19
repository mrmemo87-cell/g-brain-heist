import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';
// "Did it work?" (bh-practice-effect-v1): independent evidence before the first practice vs after it. Practice never counts.
const sql=readFileSync('supabase/migrations/20261019220000_ielts_practice_effect.sql','utf8');
const fn=sql.slice(sql.indexOf('create or replace function private.ielts_practice_effect_v1'),sql.indexOf('end $$;')+7);
const db=new PGlite();await db.exec('create schema private;');await db.exec(fn);
const s=(at,opps,correct,independent=true)=>({at,opps,correct,independent});
const effect=async(sources,practice)=>(await db.query('select private.ielts_practice_effect_v1($1::jsonb,$2::timestamptz) j',[JSON.stringify(sources),practice])).rows[0].j;
const P='2026-10-10';
const cases=[
 ['not practised',[s('2026-10-01',6,2)],null,'not_practised'],
 ['practised, no fresh check yet',[s('2026-10-01',6,2)],P,'waiting_for_check'],
 ['practice itself never counts as a check',[s('2026-10-01',6,2),s('2026-10-12',6,6,false)],P,'waiting_for_check'],
 ['a check without a starting point cannot show change',[s('2026-10-12',6,6)],P,'no_starting_point'],
 ['two fresh questions are too few to tell',[s('2026-10-01',6,1),s('2026-10-12',2,2)],P,'too_few_questions'],
 ['a clear gain on a fresh check is higher',[s('2026-10-01',6,2),s('2026-10-12',6,5)],P,'higher'],
 ['a gain under 25 points is similar',[s('2026-10-01',6,3),s('2026-10-12',6,4)],P,'similar'],
 ['a gain that stays under 70% is higher but not secure',[s('2026-10-01',10,2),s('2026-10-12',10,6)],P,'higher_not_secure'],
 ['a clear drop is lower',[s('2026-10-01',6,5),s('2026-10-12',6,2)],P,'lower'],
];
for(const [name,src,practice,expected] of cases)test(name,async()=>{assert.equal((await effect(src,practice)).verdict,expected);});
test('before and after are counted separately and named',async()=>{const r=await effect([s('2026-10-01',6,2),s('2026-10-03',4,1),s('2026-10-12',6,5)],P);
 assert.deepEqual([r.before.opportunities,r.before.correct,r.after.opportunities,r.after.correct],[10,3,6,5]);assert.match(r.policy,/provisional/);});
