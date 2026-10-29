import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';
// Teachers find targeted practice by skill, then lesson or series, then step in teaching order.
const out=await build({entryPoints:['services/ieltsTargetedCatalogue.ts'],bundle:true,format:'esm',write:false,logLevel:'silent'});
const {targetedCatalogue,placeTargetedTask}=await import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));
const t=(code,title,skill,purpose='guided_practice')=>({code,title,skill,purpose,display_code:code.toUpperCase()});
const tasks=[
 t('l-031','Listening Lesson 10 step 2 of 6: Who is speaking?','listening'),
 t('l-030','Listening Lesson 10 step 1 of 6: Follow the signposts','listening'),
 t('l-035','Listening Lesson 10 step 6 of 6: Mixed check','listening','independent_check'),
 t('l-001','Follow the correction: photography workshop','listening'),
 t('r-080','Vocabulary V1 step 1 of 6: Meet the words','reading'),
 t('r-050','Lesson 13 step 1 of 6: Fact or view?','reading'),
 t('r-020','Lesson 2 step 2 of 6: Find the detail','reading'),
 t('r-019','Lesson 2 step 1 of 6: What must you check?','reading'),
 t('r-031','Green roofs, step 2: does this paragraph contain it?','reading'),
 t('r-030','Green roofs, step 1: what kind of information?','reading'),
 t('r-036','Green roofs: mixed trap check','reading','independent_check'),
 t('w-001','Develop a new argument','writing'),
 t('r-005','Museum photographs: find the detail','reading'),
 t('r-006','School solar panels: find the detail','reading','independent_check'),
];
test('lessons, vocabulary sets and series come in teaching order, steps in order, single tasks last',()=>{
 const c=targetedCatalogue(tasks);
 assert.deepEqual(c.reading.map(f=>f.familyName),['Lesson 2','Lesson 13','Vocabulary V1','Green roofs','Find the detail'],'question-type pairs follow the lessons');
 assert.deepEqual(c.reading[4].tasks.map(x=>x.task.purpose),['guided_practice','independent_check'],'guided practice before its fresh check');
 assert.deepEqual(c.reading[0].tasks.map(x=>x.task.code),['r-019','r-020']);
 assert.deepEqual(c.reading[3].tasks.map(x=>x.task.code),['r-030','r-031','r-036'],'the mixed check closes its series');
 assert.equal(c.reading[3].tasks[2].place.stepLabel,'Final check');
 assert.deepEqual(c.listening.map(f=>f.familyName),['Lesson 10','More practice tasks']);
 assert.deepEqual(c.listening[0].tasks.map(x=>x.place.stepLabel),['Step 1 of 6','Step 2 of 6','Step 6 of 6']);
 assert.equal(c.listening[0].tasks[0].place.shortTitle,'Follow the signposts');
 assert.deepEqual(c.writing.map(f=>f.familyName),['More practice tasks']);assert.deepEqual(c.speaking,[]);
});
test('every task lands in exactly one place',()=>{
 const c=targetedCatalogue(tasks);const codes=Object.values(c).flat().flatMap(f=>f.tasks.map(x=>x.task.code));
 assert.deepEqual(codes.sort(),tasks.map(x=>x.code).sort());
 assert.equal(placeTargetedTask(t('x','Reading Lesson 9 step 3 of 6: Main idea','reading')).familyName,'Lesson 9');
});
