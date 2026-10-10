import {JSDOM,VirtualConsole} from 'jsdom';
import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {build} from 'esbuild';
const define={'import.meta':JSON.stringify({env:{VITE_SUPABASE_URL:'https://test.supabase.co',VITE_SUPABASE_ANON_KEY:'test-key'}})};
const bundles={};
for(const mode of ['desk','targeted','school']) bundles[mode]=(await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {RouterProvider,createBrowserRouter} from './src/lib/router';import Context from './components/school-admin/SchoolAdminContext';import Page from '${mode==='desk'?'./src/pages/ielts/IeltsTeacherPracticeDesk':mode==='targeted'?'./src/pages/ielts/IeltsLearningTeacher':'./components/school-admin/tabs/IeltsPracticeTab'}';createRoot(document.getElementById('root')).render(<RouterProvider router={createBrowserRouter([{path:"/",element:<Context.Provider value={{school:{id:'school'},classes:[{id:'class',class_name:'Class 9',student_count:2}],students:[],studentAssignments:{},addToast:()=>{}}}><Page schoolId="school" onOpenReviews={()=>{}} /></Context.Provider>}])}/>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,format:'iife',write:false,loader:{'.css':'empty'},define,logLevel:'silent'})).outputFiles[0].text;
const usage={type:'targeted',id:'task',assigned_count:1,students_count:1,active_count:1,submitted_count:0,completed_count:0,shared_count:0,last_assigned_at:'2026-10-08',latest_assignment_id:'existing'};
async function mount(mode,{fail=false,purpose='guided_practice',prior=usage}={}){
 const calls=[],errors=[];const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});const w=dom.window;Object.assign(w,{TextEncoder,TextDecoder,Request,Response,Headers});w.crypto.randomUUID=randomUUID;
 w.fetch=async(url,options)=>{const fn=String(url).split('/').pop(),args=options?.body?JSON.parse(options.body):{};calls.push({fn,args});let result;
 if(fn==='rpc_ielts_teacher_practice_history') {if(fail)return new Response(JSON.stringify({message:'unavailable'}),{status:503});result={rows:args.p_offset?[{row_id:'old',kind:'targeted',assignment_id:'old',student_name:'Student',title:'Earlier task',skill:'reading',status:'closed',assignment_status:'closed',feedback_status:'not_ready',assigned_at:'2026-09-01'}]:[{row_id:'one',kind:'targeted',assignment_id:'existing',student_name:'Gulzada',title:'Photography workshop',display_code:'L-001',skill:'listening',status:'submitted',assignment_status:'submitted',feedback_status:'shared',feedback_at:'2026-10-09',assigned_at:'2026-10-08'},{row_id:'two',kind:'school',assignment_id:'class-work',student_name:'Gulzada',class_name:'Class 9',title:'Reading task',assignment_title:'Weekly reading',skill:'reading',status:'completed',assignment_status:'assigned',feedback_status:'not_tracked',assigned_at:'2026-10-08'}],has_more:!args.p_offset};}
 else if(fn==='rpc_ielts_teacher_material_usage'){if(fail)return new Response(JSON.stringify({message:'unavailable'}),{status:503});result=args.p_items.map(i=>({...prior,...i}));}
 else if(fn==='rpc_ielts_learning_workspace')result={manager:true,pilot_only:true,tasks:[{code:'task',pilot_student:'student',pilot_student_name:'Gulzada',title:'Task',display_code:'L-001',skill:'listening',purpose,approved:true,requires_review:false,questions:[],content:{},success_description:'Check the final detail.'}],allocations:[]};
 else if(fn==='rpc_ielts_programme_workspace')result={students:[{id:'student',name:'Gulzada',listening:{attempt_id:'source'}}]};
 else if(fn==='rpc_ielts_practice_list_assignments')result=[];
 else if(fn==='rpc_ielts_practice_content_catalog_with_provenance')result=[{content_type:'ielts_reading_set',content_id:'material',title:'Reading material',display_code:'R-003',skill:'reading'}];
 else if(fn==='rpc_ielts_practice_assignment_detail')result={assignment:{id:args.p_assignment_id,title:'Existing assignment',status:'assigned',items:[],item_count:1},students:[],items:[]};
 else throw Error(fn);
 return new Response(JSON.stringify(result),{status:200,headers:{'Content-Type':'application/json'}});
 };
 const wait=async f=>{for(let i=0;i<150;i++){if(f())return;await new Promise(r=>setTimeout(r,15));}throw Error(w.document.body.textContent);};
 const button=l=>[...w.document.querySelectorAll('button')].find(b=>b.textContent.trim()===l);
 const change=(input,value)=>{const proto=input.tagName==='SELECT'?w.HTMLSelectElement.prototype:input.tagName==='TEXTAREA'?w.HTMLTextAreaElement.prototype:w.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(input,value);input.dispatchEvent(new w.Event(input.tagName==='SELECT'?'change':'input',{bubbles:true}));};
 w.eval(bundles[mode]);await wait(()=>mode==='desk'
   ? calls.some(c=>c.fn==='rpc_ielts_teacher_practice_history') && button('Refresh history')&&!button('Refresh history').disabled
   : mode==='targeted'
   ? button('Confirm and assign') && (fail?w.document.body.textContent.includes('Previous assignments could not'):w.document.body.textContent.includes(prior.active_count?'Already active':prior.shared_count?'Previously used':prior.submitted_count?'Previously submitted':'Previously assigned'))
   : w.document.querySelector('[data-testid="ielts-practice-class-select"]'));

 return {dom,w,calls,errors,wait,button,change};
}
test('unified desk separates shared feedback from completed work, filters and paginates on the server',async()=>{
 const m=await mount('desk');try{
 assert.match(m.w.document.body.textContent,/L-001 · Photography workshop/);assert.match(m.w.document.body.textContent,/Feedback shared/);assert.match(m.w.document.body.textContent,/Check feedback in practice reviews/);
 assert.ok(m.button('Open saved assignment →'));
 m.button('Next').click();await m.wait(()=>m.w.document.body.textContent.includes('Earlier task'));assert.equal(m.calls.at(-1).args.p_offset,50);
 m.change(m.w.document.querySelector('input'),'L-001');m.button('Search').click();await m.wait(()=>m.calls.at(-1).args.p_search==='L-001');assert.equal(m.calls.at(-1).args.p_offset,0);
 assert.deepEqual(m.errors,[]);m.button('Open saved assignment →').click();assert.equal(m.w.location.pathname,'/ielts/practice/targeted/existing');
 }finally{m.dom.window.close();}
});
test('history failure is explicit and never says no assignments',async()=>{
 const m=await mount('desk',{fail:true});try{assert.match(m.w.document.body.textContent,/assignments are safe/);assert.doesNotMatch(m.w.document.body.textContent,/No assignments match/);assert.ok(m.button('Refresh history'));}finally{m.dom.window.close();}
});
test('targeted picker opens existing work, blocks active duplicates and exposed independent checks',async()=>{
 const m=await mount('targeted');try{m.change(m.w.document.querySelector('textarea'),'A useful practice reason.');assert.equal(m.button('Confirm and assign').disabled,true);assert.ok(m.button('Open existing assignment →'));m.button('Open existing assignment →').click();assert.equal(m.w.location.pathname,'/ielts/practice/targeted/existing');assert.equal(m.calls.some(c=>c.fn==='rpc_ielts_learning_allocate'),false);}finally{m.dom.window.close();}
 const fresh=await mount('targeted',{purpose:'independent_check',prior:{...usage,active_count:0}});try{await fresh.wait(()=>fresh.w.document.body.textContent.includes('Choose a different fresh check'));fresh.change(fresh.w.document.querySelector('textarea'),'A useful practice reason.');assert.equal(fresh.button('Confirm and assign').disabled,true);}finally{fresh.dom.window.close();}
});
test('guided repeat needs explicit confirmation; unavailable history preserves wording and blocks assignment',async()=>{
 const m=await mount('targeted',{prior:{...usage,active_count:0,submitted_count:1,shared_count:1}});try{m.change(m.w.document.querySelector('textarea'),'A useful practice reason.');await m.wait(()=>m.w.document.querySelector('input[type=checkbox]'));assert.equal(m.button('Confirm and assign').disabled,true);m.w.document.querySelector('input[type=checkbox]').click();await m.wait(()=>!m.button('Confirm and assign').disabled);}finally{m.dom.window.close();}
 const f=await mount('targeted',{fail:true});try{f.change(f.w.document.querySelector('textarea'),'Keep this practice reason.');assert.equal(f.button('Confirm and assign').disabled,true);assert.ok(f.button('Retry history check'));assert.equal(f.w.document.querySelector('textarea').value,'Keep this practice reason.');}finally{f.dom.window.close();}
});
test('school picker shows recipient-scoped use and requires an intentional repeat before creating',async()=>{
 const m=await mount('school');try{
 m.change(m.w.document.querySelector('[data-testid="ielts-practice-class-select"]'),'class');
 m.w.document.querySelector('[data-testid="ielts-practice-content-picker-0"]').click();
 await m.wait(()=>m.w.document.querySelector('[data-testid="ielts-practice-content-option-ielts_reading_set-material"]')?.textContent.includes('Already active'));
 m.w.document.querySelector('[data-testid="ielts-practice-content-option-ielts_reading_set-material"]').click();await m.wait(()=>m.w.document.body.textContent.includes('Previous use for students in this class'));
 const create=m.w.document.querySelector('[data-testid="ielts-practice-create-assignment"]');assert.equal(create.disabled,true);await m.wait(()=>m.w.document.querySelector('input[type=checkbox]'));
 const repeat=[...m.w.document.querySelectorAll('input[type=checkbox]')].find(c=>c.parentElement.textContent.includes('I checked existing work'));repeat.click();await m.wait(()=>!create.disabled);
 assert.equal(m.calls.filter(c=>c.fn==='rpc_ielts_teacher_material_usage').every(c=>c.args.p_class==='class'&&c.args.p_student===null),true);
 assert.equal(m.calls.some(c=>c.fn==='rpc_ielts_practice_create_assignment'),false);m.change(m.w.document.querySelector('[data-testid="ielts-practice-class-select"]'),'');assert.equal(create.disabled,true);assert.deepEqual(m.errors,[]);
 }finally{m.dom.window.close();}
});


test('published targeted material supports choosing another entitled student without defaulting to the pilot',async()=>{
 const calls=[],errors=[];const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});
 try{const w=dom.window;Object.assign(w,{TextEncoder,TextDecoder,Request,Response,Headers});w.crypto.randomUUID=randomUUID;
 w.fetch=async(url,options)=>{const fn=String(url).split('/').pop(),args=JSON.parse(options.body);calls.push({fn,args});let result;
 if(fn==='rpc_ielts_learning_workspace')result={manager:true,pilot_only:false,tasks:[{code:'released-task',released:true,pilot_student:'pilot',pilot_student_name:'Gulzada',title:'Published task',skill:'listening',purpose:'guided_practice',approved:true,requires_review:true,questions:[],content:{},success_description:'Check details.'}],allocations:[]};
 else if(fn==='rpc_ielts_programme_workspace')result={students:[{id:'second',name:'Another student',listening:{attempt_id:'second-source'}},{id:'missing',name:'No evidence yet',listening:null}],total_students:2};
 else if(fn==='rpc_ielts_teacher_material_usage')result=args.p_items.map(i=>({...i,assigned_count:0,active_count:0,students_count:0}));
 else if(fn==='rpc_ielts_learning_allocate')result='new-allocation';else throw Error(fn);
 return new Response(JSON.stringify(result),{status:200,headers:{'Content-Type':'application/json'}});};
 const wait=async f=>{for(let i=0;i<150;i++){if(f())return;await new Promise(r=>setTimeout(r,15));}throw Error(w.document.body.textContent);};
 const button=label=>[...w.document.querySelectorAll('button')].find(b=>b.textContent===label);
 const change=(input,value)=>{const p=input.tagName==='SELECT'?w.HTMLSelectElement.prototype:input.tagName==='TEXTAREA'?w.HTMLTextAreaElement.prototype:w.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(input,value);input.dispatchEvent(new w.Event(input.tagName==='SELECT'?'change':'input',{bubbles:true}));};
 w.eval(bundles.targeted);await wait(()=>w.document.querySelector('[aria-label="Available student for this material"]')?.querySelector('option[value="second"]'));
 const picker=w.document.querySelector('[aria-label="Available student for this material"]');assert.equal(picker.value,'');assert.equal(button('Confirm and assign').disabled,true);
 change(picker,'second');await wait(()=>w.document.body.textContent.includes('Review listening source evidence'));change(w.document.querySelector('textarea'),'Use the task to practise the details identified in your screener.');await wait(()=>!button('Confirm and assign').disabled);
 button('Confirm and assign').click();await wait(()=>calls.some(c=>c.fn==='rpc_ielts_learning_allocate'));
 assert.equal(calls.find(c=>c.fn==='rpc_ielts_learning_allocate').args.p_student,'second');assert.equal(calls.find(c=>c.fn==='rpc_ielts_learning_allocate').args.p_source,'second-source');
 change(picker,'missing');await wait(()=>w.document.body.textContent.includes('No matching screener evidence'));assert.equal(button('Confirm and assign').disabled,true);assert.deepEqual(errors,[]);
 }finally{dom.window.close();}
});
