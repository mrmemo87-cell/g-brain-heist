import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';
// bh-productive-effect-v1 (Diagnostic Bible 2.0.0 section 8A.5): a criterion rating rising by >= 1.0 band on a fresh task,
// or a teacher status moving from developing to observed. Same-task repeats and cross-scale comparisons never count.
const sql=readFileSync('supabase/migrations/20261020010000_ielts_productive_effect.sql','utf8');
const fn=sql.slice(sql.indexOf('create or replace function private.ielts_productive_effect_v1'),sql.indexOf('end $$;')+7);
const db=new PGlite();await db.exec('create schema private;');await db.exec(fn);
const band=(at,task,value)=>({at,task,scale:'band',value:String(value)}),st=(at,task,value)=>({at,task,scale:'status',value});
const effect=async r=>(await db.query('select private.ielts_productive_effect_v1($1::jsonb) j',[JSON.stringify(r)])).rows[0].j;
const cases=[
 ['nothing rated',[],'no_rating'],
 ['one rated essay is waiting for a fresh task',[band('2026-10-01','w1',5)],'waiting_for_fresh_task'],
 ['rewriting the same task is not fresh',[band('2026-10-01','w1',5),band('2026-10-08','w1',7)],'waiting_for_fresh_task'],
 ['a rise of one band on a new task is higher',[band('2026-10-01','w1',5),band('2026-10-08','w2',6)],'higher'],
 ['half a band is similar',[band('2026-10-01','w1',5),band('2026-10-08','w2',5.5)],'similar'],
 ['a fall of one band is lower',[band('2026-10-01','w1',6.5),band('2026-10-08','w2',5.5)],'lower'],
 ['developing to observed is higher',[st('2026-10-01','screener',"developing"),st('2026-10-08','interview2','observed')],'higher'],
 ['observed to developing is lower',[st('2026-10-01','a','observed'),st('2026-10-08','b','developing')],'lower'],
 ['a band and a status are never compared',[st('2026-10-01','screener','developing'),band('2026-10-08','w2',7)],'different_scales'],
 ['insufficient evidence is ignored',[st('2026-10-01','screener','insufficient_evidence'),band('2026-10-08','w2',6)],'waiting_for_fresh_task'],
 ['the latest same-scale rating is compared with the first',[band('2026-10-01','w1',5),band('2026-10-08','w2',5.5),band('2026-10-20','w3',6)],'higher'],
];
for(const [name,r,v] of cases)test(name,async()=>{assert.equal((await effect(r)).verdict,v);});
test('the result names the first and latest rating and the policy',async()=>{const r=await effect([band('2026-10-01','w1',5),band('2026-10-08','w2',6)]);assert.equal(r.first.value,'5');assert.equal(r.last.value,'6');assert.equal(r.pieces,2);assert.match(r.policy,/provisional/);});
