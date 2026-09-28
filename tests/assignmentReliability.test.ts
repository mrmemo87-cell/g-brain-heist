import test from 'node:test';
import assert from 'node:assert/strict';
import { QuestionInputGuard, retryAssignmentOperation, readAssignmentDraft, writeAssignmentDraft, clearAssignmentDraft } from '../services/assignmentReliability';

test('rapid clicks and transitions accept one action, including before React renders', () => {
  const guard = new QuestionInputGuard();
  assert.equal(Array.from({ length: 50 }, () => guard.claim(1000)).filter(Boolean).length, 1);
  assert.equal(guard.advance(1000), false);
  guard.finish(true);
  assert.equal(guard.claim(1000), false);
  assert.equal(Array.from({ length: 50 }, () => guard.advance(1000)).filter(Boolean).length, 1);
  assert.equal(guard.claim(1499), false);
  assert.equal(guard.claim(1500), true);
  guard.finish(false);
  assert.equal(guard.claim(1501), true);
});

test('transient failures retry with bounded backoff; permission and data errors never retry', async () => {
  let calls=0; const waits:number[]=[];
  assert.equal(await retryAssignmentOperation(async()=>{ if (++calls<3) throw {code:'57014'}; return 'saved'; },async ms=>{waits.push(ms);}), 'saved');
  assert.equal(calls,3); assert.ok(waits[1]>waits[0]);
  calls=0;
  await assert.rejects(retryAssignmentOperation(async()=>{calls++; throw new Error('ASSIGNMENT_CLOSED');}),/ASSIGNMENT_CLOSED/);
  assert.equal(calls,1);
  calls=0;
  await assert.rejects(retryAssignmentOperation(async()=>{calls++; throw new TypeError('Failed to fetch');},async()=>{}),/Failed to fetch/);
  assert.equal(calls,3);
});

test('draft survives reload, stays account scoped, and clears only after acknowledgement', () => {
  const values=new Map<string,string>();
  const storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);},removeItem:(key:string)=>{values.delete(key);}};
  const draft={answer:'A',timeTakenMs:450,savedAt:Date.now()};
  assert.equal(writeAssignmentDraft(storage,'student1','assignment1','question1',draft),true);
  assert.deepEqual(readAssignmentDraft(storage,'student1','assignment1','question1'),draft);
  assert.equal(readAssignmentDraft(storage,'student2','assignment1','question1'),null);
  assert.equal(readAssignmentDraft(storage,'student1','assignment2','question1'),null);
  clearAssignmentDraft(storage,'student1','assignment1','question1');
  assert.equal(readAssignmentDraft(storage,'student1','assignment1','question1'),null);
  assert.equal(writeAssignmentDraft({...storage,setItem:()=>{throw new Error('QuotaExceeded');}},'s','a','q',draft),false);
  writeAssignmentDraft(storage,'s','a','q',{...draft,savedAt:0});
  assert.equal(readAssignmentDraft(storage,'s','a','q'),null);
});
