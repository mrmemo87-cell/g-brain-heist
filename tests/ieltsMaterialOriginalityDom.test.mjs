import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import {JSDOM,VirtualConsole} from 'jsdom';
const bundle=(await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import Review from './src/pages/ielts/IeltsMaterialOriginalityReview';window.done=0;createRoot(document.getElementById('root')).render(<Review target={{type:'ielts_reading_set',id:'2',title:'Draft'}} onDone={()=>window.done++} onClose={()=>{}}/>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,format:'iife',write:false,define:{'import.meta':JSON.stringify({env:{VITE_SUPABASE_URL:'https://test.supabase.co',VITE_SUPABASE_ANON_KEY:'test-key'}})},logLevel:'silent'})).outputFiles[0].text;
const matching={material_type:'ielts_reading_set',material_id:'1',content_hash:'original-hash',display_code:'R-001',reason:'shared_text',similarity:1,preview:{passage_or_prompt:'Earlier saved passage',questions:[{prompt:'Earlier question'}]}};
async function mount({exact=false,fail=false,matches=[matching]}={}){
 const calls=[],errors=[];const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});const w=dom.window;Object.assign(w,{TextEncoder,TextDecoder,Request,Response,Headers});
 w.fetch=async(url,options)=>{const fn=String(url).split('/').pop(),args=JSON.parse(options.body);calls.push({fn,args});
 if(fn==='rpc_ielts_material_originality_check')return new Response(JSON.stringify({display_code:'R-002',skill:'reading',content_hash:'new-hash',match_hash:'matches-hash',matches:exact?[{...matching,reason:'exact_copy'}]:matches,label:null,preview:{passage_or_prompt:'Draft passage',questions:[]}}),{status:200});
 if(fn==='rpc_ielts_material_originality_review')return new Response(JSON.stringify(fail?{message:'Material or comparison inventory changed. Run the originality check again.'}:{}),{status:fail?400:200});
 throw Error(fn);};
 w.eval(bundle);const wait=async(predicate)=>{for(let i=0;i<100&&!predicate();i++)await new Promise(r=>setTimeout(r,10));assert.ok(predicate(),'UI did not settle');};
 await wait(()=>w.document.body.textContent.includes('R-002'));
 const change=(el,value)=>{const proto=el.tagName==='TEXTAREA'?w.HTMLTextAreaElement.prototype:w.HTMLSelectElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value);el.dispatchEvent(new w.Event(el.tagName==='TEXTAREA'?'input':'change',{bubbles:true}));};
 const button=text=>[...w.document.querySelectorAll('button')].find(b=>b.textContent===text);
 return {dom,w,calls,errors,wait,change,button};
}
test('shared content defaults to a declared variant, with a saved comparison and version-bound decision',async()=>{
 const m=await mount();try{
 assert.match(m.w.document.body.textContent,/Earlier saved passage/);
 assert.equal(m.w.document.querySelector('select').value,'variant');assert.equal(m.button('Confirm review and publish').disabled,true);
 m.change(m.w.document.querySelectorAll('select')[1],'ielts_reading_set:1:original-hash');
 m.change(m.w.document.querySelector('textarea'),'Changed question evidence and explanation demand; the original passage is intentionally reused.');
 m.w.document.querySelector('input[type=checkbox]').click();await m.wait(()=>!m.button('Confirm review and publish').disabled);
 m.button('Confirm review and publish').click();await m.wait(()=>m.w.done===1);
 const args=m.calls.find(c=>c.fn==='rpc_ielts_material_originality_review').args;
 assert.equal(args.p_decision,'variant');assert.equal(args.p_parent_hash,'original-hash');assert.equal(args.p_content_hash,'new-hash');assert.equal(args.p_match_hash,'matches-hash');assert.equal(args.p_publish,true);assert.deepEqual(m.errors,[]);
 }finally{m.dom.window.close();}
});
test('exact copies have no approve action or override',async()=>{
 const m=await mount({exact:true});try{assert.match(m.w.document.body.textContent,/cannot be approved under another code/);assert.equal(m.button('Confirm review and publish'),undefined);assert.equal(m.calls.some(c=>c.fn==='rpc_ielts_material_originality_review'),false);}finally{m.dom.window.close();}
});
test('unflagged material still needs human comparison; stale-review failure keeps the written rationale',async()=>{
 const m=await mount({matches:[],fail:true});try{
 assert.match(m.w.document.body.textContent,/Human review is still required/);assert.equal(m.button('Confirm review and publish').disabled,true);
 m.change(m.w.document.querySelector('textarea'),'A different passage, new evidence and a different reasoning demand.');m.w.document.querySelector('input[type=checkbox]').click();await m.wait(()=>!m.button('Confirm review and publish').disabled);m.button('Confirm review and publish').click();await m.wait(()=>m.w.document.querySelector('[role=alert]'));
 assert.equal(m.w.done,0);assert.match(m.w.document.querySelector('textarea').value,/different passage/);assert.match(m.w.document.querySelector('[role=alert]').textContent,/changed/);
 m.button('Refresh comparison').click();await m.wait(()=>m.calls.filter(c=>c.fn==='rpc_ielts_material_originality_check').length===2);await m.wait(()=>!m.w.document.querySelector('input[type=checkbox]').checked);assert.equal(m.button('Confirm review and publish').disabled,true);assert.deepEqual(m.errors,[]);
 }finally{m.dom.window.close();}
});
const managerBundle=(await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import Page from './src/pages/ielts/IeltsContentManager';createRoot(document.getElementById('root')).render(<Page/>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,format:'iife',write:false,define:{'import.meta':JSON.stringify({env:{VITE_SUPABASE_URL:'https://test.supabase.co',VITE_SUPABASE_ANON_KEY:'test-key'}})},logLevel:'silent'})).outputFiles[0].text;
test('multi-step draft saving retains its ID after a question-save failure and never publishes midway',async()=>{
 const calls=[],errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});const w=dom.window;Object.assign(w,{TextEncoder,TextDecoder,Request,Response,Headers});let questionSaves=0;
 w.fetch=async(url,options)=>{const fn=String(url).split('/').pop(),args=JSON.parse(options.body);calls.push({fn,args});let data=[];
 if(fn==='rpc_ielts_content_upsert_reading_set')data={id:42};
 else if(fn==='rpc_ielts_content_replace_reading_questions'){questionSaves++;if(questionSaves===1)return new Response(JSON.stringify({message:'Question save interrupted. Retry this draft.'}),{status:503});data=null;}
 else if(fn==='rpc_ielts_material_originality_check')data={display_code:'R-042',skill:'reading',content_hash:'h',match_hash:'m',matches:[],label:null};
 else if(!['rpc_ielts_content_list','rpc_ielts_material_originality_queue'].includes(fn))throw Error(fn);
 return new Response(JSON.stringify(data),{status:200});};
 const wait=async(predicate)=>{for(let i=0;i<100&&!predicate();i++)await new Promise(r=>setTimeout(r,10));assert.ok(predicate(),'UI did not settle');};const button=text=>[...w.document.querySelectorAll('button')].find(b=>b.textContent===text);
 const change=(el,value)=>{Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?w.HTMLTextAreaElement.prototype:w.HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new w.Event('input',{bubbles:true}));};
 try{w.eval(managerBundle);await wait(()=>button('New Reading Task'));button('New Reading Task').click();await wait(()=>button('Save reading draft and review'));
 const input=label=>[...w.document.querySelectorAll('label')].find(l=>l.textContent.startsWith(label))?.querySelector('input,textarea');change(input('Title'),'A new task');change(input('Passage'),'A different passage with new evidence.');button('Add Question').click();await wait(()=>input('Question 1'));change(input('Question 1'),'What happened?');change(input('Answer JSON'),'["A new event"]');
 button('Save reading draft and review').click();await wait(()=>w.document.body.textContent.includes('Question save interrupted'));await wait(()=>!button('Save reading draft and review').disabled);button('Save reading draft and review').click();await wait(()=>w.document.body.textContent.includes('Originality review · R-042'));
 const writes=calls.filter(c=>c.fn==='rpc_ielts_content_upsert_reading_set');assert.equal(writes.length,2);assert.equal(writes[0].args.p_id,null);assert.equal(writes[1].args.p_id,42);assert.ok(writes.every(c=>c.args.p_is_active===false));assert.equal(calls.some(c=>c.fn==='rpc_ielts_material_originality_review'),false);assert.deepEqual(errors,[]);
 }finally{dom.window.close();}
});
