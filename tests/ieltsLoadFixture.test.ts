import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
// Execute the exact portable guard used by k6; no hosted traffic or credentials.
const source=fs.readFileSync('load-tests/lib/ielts-fixture.mjs','utf8').replace('export function','function');
const validate=new Function(`${source};return validateIeltsFixture;`)();
const base='https://abcdefghijklmnopqrst.supabase.co';
const fixture=()=>({environment:'staging',projectRef:'abcdefghijklmnopqrst',teacher:{token:'teacher',studentId:'teacher',eventId:'event'},students:Array.from({length:30},(_,n)=>({studentId:`u${n}`,token:`t${n}`,assignmentId:`a${n}`,eventId:'event',section:'writing',edits:[{essay:'Synthetic'}],finalPayload:{essay:'Synthetic'},idempotencyKey:`key${n}`}))});
test('IELTS load harness refuses production, wrong environments, identity reuse and incomplete stages',()=>{
 assert.doesNotThrow(()=>validate(base,30,fixture()));
 assert.throws(()=>validate('https://sozodkxwhubespiedgxm.supabase.co',30,fixture()),/production/);
 assert.throws(()=>validate(base,500,fixture()),/Exactly/);
 const duplicate=fixture();duplicate.students[1].studentId=duplicate.students[0].studentId;assert.throws(()=>validate(base,30,duplicate),/distinct/);
 const wrong=fixture();wrong.environment='production';assert.throws(()=>validate(base,30,wrong),/staging/);
 const shared=fixture();shared.students[0].token='teacher';assert.throws(()=>validate(base,30,shared),/separate/);
});
