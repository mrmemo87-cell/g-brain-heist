import {JSDOM,VirtualConsole} from 'jsdom';
import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {build} from 'esbuild';
const base={id:'00000000-0000-0000-0000-000000000201',student_id:'00000000-0000-0000-0000-000000000202',manager:false,title:'Photography workshop',display_code:'L-001',purpose:'guided_practice',instructions:'No more than two words and/or a number.',success_description:'Select the final confirmed details.',reason:'Delivery pilot; no diagnosis asserted.',questions:Array.from({length:6},(_,i)=>({id:'q'+(i+1),prompt:'Detail '+(i+1)})),audio_bucket:'test-audio',audio_path:'test.mp3',audio_sha256:'a'.repeat(64),status:'assigned',answers:{},revision:0,source_attempt_id:'00000000-0000-0000-0000-000000000203',play_count:0,conditions_need_review:false,result:null,review:null};
const bundle=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {RouterProvider,createBrowserRouter} from './src/lib/router';import Page from './src/pages/ielts/IeltsLearningPractice';createRoot(document.getElementById('root')).render(<RouterProvider router={createBrowserRouter([{path:'/ielts/practice/targeted/:allocationId',element:<Page/>}])}/>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,format:'iife',write:false,loader:{'.css':'empty'},define:{'import.meta':JSON.stringify({env:{VITE_SUPABASE_URL:'https://test.supabase.co',VITE_SUPABASE_ANON_KEY:'test-key'}})},logLevel:'silent'});
async function mount({server=base,local=null,failSave=false,failAi=false,failReview=false}={}){
 const errors=[],calls=[];let plays=0;const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/ielts/practice/targeted/'+base.id,runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});const w=dom.window;
 Object.assign(w,{TextEncoder,TextDecoder,Request,Response,Headers});w.crypto.randomUUID=randomUUID;
 w.HTMLMediaElement.prototype.pause=function(){};w.HTMLMediaElement.prototype.play=async function(){plays++;this.dispatchEvent(new w.Event('play'));};
 if(local)w.localStorage.setItem(`bh_learning_${base.student_id}_${base.id}`,JSON.stringify(local));
 w.fetch=async(url,options)=>{
  const fn=String(url).split('/').pop();const args=options?.body?JSON.parse(options.body):{};calls.push({fn,args});let result;
  if(String(url).includes('/object/sign/'))result={signedURL:'/object/sign/test-audio/test.mp3?token=fixture'};
  else if(fn==='rpc_ielts_learning_detail')result=structuredClone(server);
  else if(fn==='rpc_ielts_learning_review_context')result={school_id:'school-fixture',student_name:'Gulzada',questions:base.questions.map(q=>({...q,accepted_answers:['Sunday']})),teacher_notes:'Listen for the final confirmed day.',source:{score:8,total:12,confidence:'low',integrity_state:'clear',items:[{id:'q1',prompt:'Where is the workshop?',construct:'Distractor resistance',response:'main hall',accepted_answers:['science lab'],correct:false,response_state:'answered'}]}};
  else if(fn==='ielts_learning_teacher_ai'){if(failAi)return new Response(JSON.stringify({error:'ai_unavailable'}),{status:503});result={id:'draft-fixture',fields:{went_well:'You chose the final day correctly.',work_on:'Explain why the earlier day is not the answer.',practice:'Replay the correction and write the final detail.',check_again:'Try a fresh task with your teacher.'}};}

  else if(fn==='rpc_ielts_learning_save'){if(failSave)return new Response(JSON.stringify({message:'network unavailable'}),{status:503});server={...server,answers:args.p_answers,revision:server.revision+1};result=server.revision;}
  else if(fn==='rpc_ielts_learning_incident')result=null;
  else if(fn==='rpc_ielts_learning_submit'){server={...server,status:'submitted',result:{score:['writing','speaking'].includes(server.skill)?null:1,total:['writing','speaking'].includes(server.skill)?null:6,submitted_at:'2026-10-09T00:00:00Z',outcomes:server.questions.map(q=>({id:q.id,correct:q.id==='q1',accepted_answers:['Sunday']}))}};result=server;}
  else if(fn==='rpc_ielts_learning_review'||fn==='rpc_ielts_learning_review_with_draft'){if(failReview)return new Response(JSON.stringify({message:'network unavailable'}),{status:503});server={...server,review:{fields:args.p_feedback,reviewer:'Test teacher',reviewed_at:'2026-10-09T00:00:00Z'}};result=server;}
  else throw Error('Unexpected request '+fn);
  return new Response(JSON.stringify(result),{status:200,headers:{'Content-Type':'application/json'}});
 };
 w.eval(bundle.outputFiles[0].text);
 const wait=async(fn)=>{for(let i=0;i<120;i++){if(fn())return;await new Promise(r=>setTimeout(r,15));}throw Error('UI did not settle: '+w.document.body.textContent+' '+errors.join(','));};
 const button=label=>[...w.document.querySelectorAll('button')].find(b=>b.textContent===label);
 const change=(input,value)=>{const proto=input.tagName==='TEXTAREA'?w.HTMLTextAreaElement.prototype:input.tagName==='SELECT'?w.HTMLSelectElement.prototype:w.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(input,value);input.dispatchEvent(new w.Event(input.tagName==='SELECT'?'change':'input',{bubbles:true}));};
 const heading=()=>w.document.querySelector('.il-step h2')?.textContent??'';
 const next=async()=>{const before=w.document.querySelector('.il-step-count').textContent;for(let t=0;t<10;t++){[...w.document.querySelectorAll('.il-step-nav button')].at(-1).dispatchEvent(new w.MouseEvent('click',{bubbles:true}));for(let i=0;i<20;i++){if(w.document.querySelector('.il-step-count').textContent!==before)return;await new Promise(r=>setTimeout(r,15));}}throw Error('Step did not advance from '+before);};
 const goTo=async title=>{for(let i=0;i<40&&heading()!==title;i++)await next();assert.equal(heading(),title);};
 const radio=value=>w.document.querySelector(`.il-step-option[data-value="${value}"]`);
 const student=!server.manager&&!server.result;
 if(student)await wait(()=>heading()!=='');
 else await wait(()=>server.skill && server.skill!=="listening" ? w.document.body.textContent.includes(server.content?.prompt??"The passage") : button('Play recording')&&!button('Play recording').disabled);
 return{dom,w,wait,button,change,calls,errors,plays:()=>plays,heading,next,goTo,radio};
}
const teacherBundle=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {RouterProvider,createBrowserRouter} from './src/lib/router';import Page from './src/pages/ielts/IeltsLearningTeacher';createRoot(document.getElementById('root')).render(<RouterProvider router={createBrowserRouter([{path:'/',element:<Page schoolId="school-fixture"/>}])}/>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,format:'iife',write:false,loader:{'.css':'empty'},define:{'import.meta':JSON.stringify({env:{VITE_SUPABASE_URL:'https://test.supabase.co',VITE_SUPABASE_ANON_KEY:'test-key'}})},logLevel:'silent'});
test('task loads without autoplay or keys; steps one at a time, explicit play, save and submit reveal server result',async()=>{
 const m=await mount();assert.match(m.w.document.body.textContent,/L-001 · Photography workshop/);assert.equal(m.heading(),'Guided practice');assert.equal(m.plays(),0);assert.doesNotMatch(m.w.document.body.textContent,/Accepted|Sunday/);
 assert.equal(m.button('Submit for review'),undefined,'submit only on the final step');
 await m.goTo('Listen');m.button('Play recording').click();await m.wait(()=>m.plays()===1);
 await m.goTo('Question 1 of 6');assert.equal(m.w.document.querySelectorAll('.il-step-body input').length,1,'one question per step');
 m.change(m.w.document.querySelector('.il-step-body input'),'Sunday');await m.wait(()=>m.w.document.querySelector('.il-step-body input').value==='Sunday');
 await m.next();assert.equal(m.heading(),'Question 2 of 6');await m.goTo('Check your answers');assert.match(m.w.document.body.textContent,/1 of 6 answered/);
 m.button('Submit for review').click();await m.wait(()=>m.w.document.body.textContent.includes('Task result: 1 / 6'));
 assert.match(m.w.document.body.textContent,/L-001 · Photography workshop/);assert.equal(m.calls.filter(c=>c.fn==='rpc_ielts_learning_save').length,1);assert.equal(m.calls.filter(c=>c.fn==='rpc_ielts_learning_submit').length,1);assert.match(m.w.document.body.textContent,/Accepted:\s*Sunday/);assert.deepEqual(m.errors,[]);m.dom.window.close();
});
test('pending device answers require explicit recovery; failed saving never submits or erases edits',async()=>{
 const m=await mount({local:{q1:'Sunday'},failSave:true});await m.goTo('Check your answers');assert.equal(m.button('Submit for review').disabled,true);
 m.button('Use my device answers').click();await m.wait(()=>m.w.document.querySelector('.il-step-review').textContent.includes('Sunday'));m.button('Submit for review').click();
 await m.wait(()=>m.w.document.body.textContent.includes('We could not confirm this step'));
 assert.equal(m.calls.filter(c=>c.fn==='rpc_ielts_learning_submit').length,0);assert.match(m.w.document.querySelector('.il-step-review').textContent,/Sunday/);assert.match(m.w.localStorage.getItem(`bh_learning_${base.student_id}_${base.id}`),/Sunday/);assert.deepEqual(m.errors,[]);m.dom.window.close();
});
test('teacher feedback requires all four fields and is explicitly attributed after sharing',async()=>{
 const server={...base,manager:true,status:'submitted',result:{score:1,total:6,outcomes:base.questions.map(q=>({id:q.id,correct:true,accepted_answers:['Sunday']}))}};
 const m=await mount({server});assert.equal(m.button('Confirm and share feedback').disabled,true);
 for(const input of m.w.document.querySelectorAll('textarea'))m.change(input,'Clear feedback for this response.');
 await m.wait(()=>!m.button('Confirm and share feedback').disabled);m.button('Confirm and share feedback').click();await m.wait(()=>m.w.document.body.textContent.includes('Shared by Test teacher'));
 assert.equal(m.calls.filter(c=>c.fn==='rpc_ielts_learning_review').length,1);assert.deepEqual(m.errors,[]);m.dom.window.close();
});

test('Reading presents the passage and choices without requesting Listening audio; explanations save with answers',async()=>{
 const server={...base,skill:'reading',content:{passage:'The library opened a quiet room for six weeks.'},recordings:[]};const m=await mount({server});assert.equal(m.calls.some(c=>c.fn.includes('sign')),false);
 await m.goTo('Read the passage');assert.match(m.w.document.body.textContent,/quiet room for six weeks/);
 await m.goTo('Question 1 of 6');assert.deepEqual([...m.w.document.querySelectorAll('.il-step-option')].map(b=>b.dataset.value),['TRUE','FALSE','NOT GIVEN']);
 m.radio('TRUE').click();m.change(m.w.document.querySelector('.il-step-body textarea'),'The passage says six weeks.');await m.wait(()=>m.radio('TRUE').getAttribute('aria-checked')==='true');
 await m.goTo('Check your answers');m.button('Submit for review').click();await m.wait(()=>m.calls.some(c=>c.fn==='rpc_ielts_learning_submit'));
 const saved=m.calls.find(c=>c.fn==='rpc_ielts_learning_save');assert.equal(saved.args.p_answers.q1,'TRUE');assert.equal(saved.args.p_answers.e1,'The passage says six weeks.');assert.deepEqual(m.errors,[]);m.dom.window.close();
});
test('Writing preserves device recovery and shows a saved response without a fabricated score',async()=>{
 const server={...base,skill:'writing',content:{prompt:'Explain one useful life skill.'},questions:[{id:'response',prompt:'Your paragraph'}],recordings:[]};const m=await mount({server,local:{response:'Students can learn budgeting by planning a weekly food budget.'}});
 await m.goTo('Your task');assert.match(m.w.document.body.textContent,/Explain one useful life skill/);await m.goTo('Check your answers');assert.equal(m.button('Submit for review').disabled,true);
 m.button('Use my device answers').click();await m.wait(()=>m.w.document.body.textContent.includes('Your response is ready.'));m.button('Submit for review').click();await m.wait(()=>m.w.document.body.textContent.includes('Your response is saved'));assert.doesNotMatch(m.w.document.body.textContent,/Task result:|null \/ null/);assert.deepEqual(m.errors,[]);m.dom.window.close();
});
test('Speaking review requires four criterion comments and explicit audio confirmation',async()=>{
 const server={...base,skill:'speaking',manager:true,content:{prompt:'Describe a place you study.'},questions:[{id:'response',prompt:'Notes'}],recordings:[],result:{score:null,total:null,outcomes:[]}};const m=await mount({server});const inputs=[...m.w.document.querySelectorAll('textarea')].filter(e=>!e.disabled);assert.equal(inputs.length,8);for(const input of inputs)m.change(input,'Add a clear detail that supports your reason.');await m.wait(()=>inputs.every(e=>e.value.length>5));assert.equal(m.button('Confirm and share feedback').disabled,true);m.w.document.querySelector('input[type=checkbox]').click();await m.wait(()=>!m.button('Confirm and share feedback').disabled);m.button('Confirm and share feedback').click();await m.wait(()=>m.w.document.body.textContent.includes('Shared by Test teacher'));assert.equal(m.calls.find(c=>c.fn==='rpc_ielts_learning_review').args.p_feedback.audio_checked,true);assert.deepEqual(m.errors,[]);m.dom.window.close();
});
test('teacher confirms the exact new material before assigning with the matching Writing source',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/',runScripts:'outside-only',pretendToBeVisual:true});try { const w=dom.window;Object.assign(w,{TextEncoder,TextDecoder,Request,Response,Headers});w.crypto.randomUUID=randomUUID;const calls=[];
 const task={pilot_student:'b30e9c28-96f1-4d34-83e9-9b28b4926f42',pilot_student_name:'Gulzada',code:'writing-task',title:'Develop an example',skill:'writing',purpose:'guided_practice',success_description:'Explain your example.',instructions:'Write one paragraph.',content:{prompt:'Explain a useful skill.',teacher_notes:'Review actual writing.'},questions:[{id:'response',prompt:'Paragraph',primary_name:'Develop ideas',supporting_name:'Examples'}],content_sha256:'b'.repeat(64),requires_review:true,approved:false};
 w.fetch=async(url,options)=>{const fn=String(url).split('/').pop(),args=JSON.parse(options.body);calls.push({fn,args});let result;if(fn==='rpc_ielts_learning_workspace')result={manager:true,tasks:[task],allocations:[]};else if(fn==='rpc_ielts_programme_workspace')result={students:[{id:'b30e9c28-96f1-4d34-83e9-9b28b4926f42',name:'Gulzada',listening:{attempt_id:'listening-source'},writing:{attempt_id:'writing-source',reviewed:true}}]};else if(fn==='rpc_ielts_teacher_material_usage')result=[{type:'targeted',id:'writing-task',assigned_count:0,active_count:0,shared_count:0,completed_count:0,submitted_count:0,students_count:0,last_assigned_at:null,latest_assignment_id:null}];else if(fn==='rpc_ielts_learning_approve_content'){task.approved=true;result=null;}else if(fn==='rpc_ielts_learning_allocate')result='allocation';else throw Error(fn);return new Response(JSON.stringify(result),{status:200,headers:{'Content-Type':'application/json'}});};
 const wait=async f=>{for(let i=0;i<100;i++){if(f())return;await new Promise(r=>setTimeout(r,15));}throw Error(w.document.body.textContent);};const button=label=>[...w.document.querySelectorAll('button')].find(b=>b.textContent===label);
 const change=(input,value)=>{Object.getOwnPropertyDescriptor(w.HTMLTextAreaElement.prototype,'value').set.call(input,value);input.dispatchEvent(new w.Event('input',{bubbles:true}));};w.eval(teacherBundle.outputFiles[0].text);await wait(()=>button('Confirm and assign') && [...w.document.querySelectorAll('select')].some(s=>s.value==='writing-task') && w.document.body.textContent.includes('Review writing source evidence'));assert.equal(button('Confirm and assign').disabled,true);assert.match(w.document.body.textContent,/Review writing source evidence/);
 const fields=w.document.querySelectorAll('textarea');change(fields[0],'Reviewed wording, criteria, mapping, timing and originality.');change(fields[1],'Named-student delivery pilot; no diagnosis asserted.');w.document.querySelector('input[type=checkbox]').click();await wait(()=>!button('Confirm material for pilot').disabled);button('Confirm material for pilot').click();await wait(()=>!button('Confirm and assign').disabled);button('Confirm and assign').click();await wait(()=>calls.some(c=>c.fn==='rpc_ielts_learning_allocate'));assert.equal(calls.find(c=>c.fn==='rpc_ielts_learning_allocate').args.p_source,'writing-source');assert.equal(calls.find(c=>c.fn==='rpc_ielts_learning_approve_content').args.p_hash,task.content_sha256);}finally{dom.window.close();}
});

test('teacher review stays in the review desk with key, item-level original evidence and one AI draft button',async()=>{
 const server={...base,manager:true,status:'submitted',result:{score:6,total:6,outcomes:base.questions.map(q=>({id:q.id,correct:true,accepted_answers:['Sunday']}))}};
 const m=await mount({server});await m.wait(()=>m.button('AI help · Draft all feedback')&&!m.button('AI help · Draft all feedback').disabled);
 const text=m.w.document.body.textContent;assert.match(text,/← Review desk/);assert.match(text,/Answer key and teaching notes/);assert.match(text,/main hall/);assert.match(text,/science lab/);assert.doesNotMatch(text,/IELTS Journey|All targeted practice →|View the source evidence/);
 m.button('AI help · Draft all feedback').click();await m.wait(()=>m.w.document.querySelector('textarea').value.includes('final day'));
 assert.equal(m.calls.some(c=>c.fn.startsWith('rpc_ielts_learning_review_with')),false);assert.equal(m.w.document.querySelectorAll('textarea').length,4);
 m.button('Confirm and share feedback').click();await m.wait(()=>m.calls.some(c=>c.fn==='rpc_ielts_learning_review_with_draft'));assert.equal(m.calls.find(c=>c.fn==='rpc_ielts_learning_review_with_draft').args.p_draft,'draft-fixture');assert.deepEqual(m.errors,[]);m.dom.window.close();
});
test('AI replacement is explicit and an unavailable provider preserves teacher edits',async()=>{
 const server={...base,manager:true,status:'submitted',review:{fields:{went_well:'Teacher original wording.',work_on:'Teacher original wording.',practice:'Teacher original wording.',check_again:'Teacher original wording.'},reviewer:'Jess',reviewed_at:'2026-10-09'},result:{score:6,total:6,outcomes:[]}};
 const m=await mount({server});m.button('View or edit feedback').click();await m.wait(()=>!m.w.document.getElementById('learning-review-fields').hidden);await m.wait(()=>m.button('AI help · Draft all feedback')&&!m.button('AI help · Draft all feedback').disabled);m.button('AI help · Draft all feedback').click();await m.wait(()=>m.button('Apply AI draft'));assert.equal(m.w.document.querySelector('textarea').value,'Teacher original wording.');m.button('Keep my feedback').click();await m.wait(()=>!m.button('Apply AI draft'));assert.equal(m.w.document.querySelector('textarea').value,'Teacher original wording.');m.dom.window.close();
 const f=await mount({server,failAi:true});f.button('View or edit feedback').click();await f.wait(()=>!f.w.document.getElementById('learning-review-fields').hidden);await f.wait(()=>f.button('AI help · Draft all feedback')&&!f.button('AI help · Draft all feedback').disabled);f.button('AI help · Draft all feedback').click();await f.wait(()=>f.w.document.body.textContent.includes('AI help could not finish'));assert.equal(f.w.document.querySelector('textarea').value,'Teacher original wording.');f.dom.window.close();
});

test('confirmed sharing collapses the editor; saved feedback reopens collapsed and remains editable',async()=>{
 const fields={went_well:'Your final answers are correct.',work_on:'Explain why the earlier detail changed.',practice:'Listen and note the final detail.',check_again:'Try a fresh task with your teacher.'};
 const server={...base,manager:true,status:'submitted',result:{score:6,total:6,outcomes:[]}};
 const m=await mount({server});const editor=m.w.document.getElementById('learning-review-fields');assert.equal(editor.hidden,false);
 for(const input of editor.querySelectorAll('textarea'))m.change(input,'Clear feedback for this response.');
 await m.wait(()=>!m.button('Confirm and share feedback').disabled);m.button('Confirm and share feedback').click();
 await m.wait(()=>m.button('View or edit feedback')&&editor.hidden);
 assert.match(m.w.document.body.textContent,/Feedback shared/);assert.equal(m.button('View or edit feedback').getAttribute('aria-expanded'),'false');
 m.button('View or edit feedback').click();await m.wait(()=>!editor.hidden);assert.equal(editor.querySelector('textarea').value,'Clear feedback for this response.');
 m.change(editor.querySelector('textarea'),'An updated comment for this response.');await m.wait(()=>editor.querySelector('textarea').value.startsWith('An updated'));m.button('Confirm and share feedback').click();await m.wait(()=>editor.hidden);
 assert.equal(m.calls.filter(c=>c.fn==='rpc_ielts_learning_review').length,2);m.dom.window.close();
 const reopened=await mount({server:{...server,review:{fields,reviewer:'Jess',reviewed_at:'2026-10-09'}}});
 const savedEditor=reopened.w.document.getElementById('learning-review-fields');assert.equal(savedEditor.hidden,true);reopened.button('View or edit feedback').click();await reopened.wait(()=>!savedEditor.hidden);assert.equal(savedEditor.querySelector('textarea').value,fields.went_well);reopened.dom.window.close();
});
test('failed sharing keeps the feedback editor open and preserves all teacher wording',async()=>{
 const server={...base,manager:true,status:'submitted',result:{score:6,total:6,outcomes:[]}};
 const m=await mount({server,failReview:true});const editor=m.w.document.getElementById('learning-review-fields');
 for(const input of editor.querySelectorAll('textarea'))m.change(input,'Keep this teacher feedback safe.');
 await m.wait(()=>!m.button('Confirm and share feedback').disabled);m.button('Confirm and share feedback').click();await m.wait(()=>m.w.document.querySelector('[role=alert]'));
 assert.equal(editor.hidden,false);assert.equal(m.button('View or edit feedback'),undefined);assert.equal(editor.querySelector('textarea').value,'Keep this teacher feedback safe.');m.dom.window.close();
});
test('Reading headings use the task options and typed answers use a text box, without TFNG explanations',async()=>{
 const heads=[{value:'i',label:'i  First heading'},{value:'ii',label:'ii  Second heading'}];
 const questions=[{id:'q1',prompt:'Paragraph A',options:heads},{id:'q2',prompt:'Paragraph B',options:heads},{id:'q3',prompt:'Residents could receive a ______.',answer_format:'text'},{id:'q4',prompt:'Gap 4',answer_format:'text'},{id:'q5',prompt:'Gap 5',answer_format:'text'},{id:'q6',prompt:'Gap 6',answer_format:'text'}];
 const server={...base,skill:'reading',questions,content:{passage:'A. One.\n\nB. Two.',summary:'Residents could receive a (1) ______.'},recordings:[]};const m=await mount({server});
 await m.goTo('Read the passage');assert.match(m.w.document.body.textContent,/Summary\s*Residents could receive/);
 await m.goTo('Question 1 of 6');const opts=[...m.w.document.querySelectorAll('.il-step-option')];assert.deepEqual(opts.map(b=>b.dataset.value),['i','ii']);assert.match(opts[0].textContent,/First heading/);assert.doesNotMatch(m.w.document.querySelector('.il-step-options').textContent,/NOT GIVEN/);
 m.radio('ii').click();await m.wait(()=>m.radio('ii').getAttribute('aria-checked')==='true');
 await m.goTo('Question 3 of 6');const input=m.w.document.querySelector('.il-step-body .il-answer input');assert.ok(input);m.change(input,'grant');await m.wait(()=>m.w.document.querySelector('.il-step-body .il-answer input').value==='grant');
 for(let i=0;i<8;i++){assert.doesNotMatch(m.w.document.body.textContent,/Your evidence or the missing fact/,'no TFNG explanation boxes');if(m.heading()==='Check your answers')break;await m.next();}
 m.button('Submit for review').click();await m.wait(()=>m.calls.some(c=>c.fn==='rpc_ielts_learning_submit'));
 const saved=m.calls.filter(c=>c.fn==='rpc_ielts_learning_save').at(-1);assert.equal(saved.args.p_answers.q1,'ii');assert.equal(saved.args.p_answers.q3,'grant');assert.deepEqual(m.errors,[]);m.dom.window.close();
});
test('Listening multiple choice uses the task letters; listening gap items stay text boxes',async()=>{
 const opts=[{value:'A',label:'A  It went well.'},{value:'B',label:'B  It was disappointing.'},{value:'C',label:'C  It was too crowded.'}];
 const questions=[{id:'q1',prompt:"What is Peter's overall view?",options:opts},...Array.from({length:5},(_,i)=>({id:'q'+(i+2),prompt:'Detail '+(i+2)}))];
 const m=await mount({server:{...base,questions}});
 try{await m.goTo('Question 1 of 6');assert.deepEqual([...m.w.document.querySelectorAll('.il-step-option')].map(b=>b.dataset.value),['A','B','C']);assert.equal(m.w.document.querySelector('.il-step-option-letter').textContent,'A');
 assert.doesNotMatch(m.w.document.querySelector('.il-step-options').textContent,/NOT GIVEN/);
 m.radio('A').click();await m.wait(()=>m.radio('A').getAttribute('aria-checked')==='true');
 for(let n=2;n<=6;n++){await m.next();assert.equal(m.heading(),`Question ${n} of 6`);assert.equal(m.w.document.querySelectorAll('.il-step-body .il-answer input').length,1);assert.doesNotMatch(m.w.document.body.textContent,/Your evidence or the missing fact/);}
 await m.goTo('Check your answers');m.button('Save now').click();await m.wait(()=>m.calls.some(c=>c.fn==='rpc_ielts_learning_save'&&c.args.p_answers.q1==='A'));assert.deepEqual(m.errors,[]);}finally{m.dom.window.close();}
});
test('a disabled assign button always says why: an active assignment names the student and links to it',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/',runScripts:'outside-only',pretendToBeVisual:true});try{const w=dom.window;Object.assign(w,{TextEncoder,TextDecoder,Request,Response,Headers});w.crypto.randomUUID=randomUUID;
 const task={pilot_student:'b30e9c28-96f1-4d34-83e9-9b28b4926f42',pilot_student_name:'Gulzada',code:'reading-task',title:'Does this paragraph contain it?',skill:'reading',purpose:'guided_practice',success_description:'Find the kind.',instructions:'Answer six.',content:{passage:'A. One.'},questions:[{id:'q1',prompt:'P',primary_name:'Kinds',supporting_name:'Paraphrase'}],content_sha256:'c'.repeat(64),requires_review:true,approved:true};
 w.fetch=async(url,options)=>{const fn=String(url).split('/').pop();let result;if(fn==='rpc_ielts_learning_workspace')result={manager:true,tasks:[task],allocations:[]};else if(fn==='rpc_ielts_programme_workspace')result={students:[{id:task.pilot_student,name:'Gulzada',reading:{attempt_id:'reading-source'}}]};else if(fn==='rpc_ielts_teacher_material_usage')result=[{type:'targeted',id:'reading-task',assigned_count:1,active_count:1,shared_count:0,completed_count:0,submitted_count:0,students_count:1,last_assigned_at:'2026-10-26T14:31:00Z',latest_assignment_id:'alloc-1'}];else throw Error(fn);return new Response(JSON.stringify(result),{status:200,headers:{'Content-Type':'application/json'}});};
 const wait=async f=>{for(let i=0;i<100;i++){if(f())return;await new Promise(r=>setTimeout(r,15));}throw Error(w.document.body.textContent);};
 w.eval(teacherBundle.outputFiles[0].text);await wait(()=>w.document.querySelector('.il-assign-block')?.textContent.includes('Already assigned'));
 const block=w.document.querySelector('.il-assign-block');assert.match(block.textContent,/Already assigned to Gulzada and waiting for them to submit/);assert.match(block.textContent,/Open the current assignment/);
 assert.equal([...w.document.querySelectorAll('button')].find(b=>b.textContent==='Confirm and assign').disabled,true);}finally{dom.window.close();}
});
