import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const context={review_on:'2026-11-06',evidence:[{source_id:'source',skill:'listening',kind:'screener'}]};
const fields={study_goal:'Agree a study goal with the student.',next_action:'Arrange the missing checks with the teacher.',review_on:context.review_on,skills:Object.fromEntries(['listening','reading','writing','speaking'].map(skill=>[skill,{pathway:'more_evidence',rationale:'More evidence is needed before choosing a pathway.',sources:[]}])),goals:[{skill:'writing',action:'Arrange a fresh writing check.',success:'A complete independent essay is saved.',check:'Teacher reviews the new essay.'}]};
async function harness(outputs){
 const source=(await readFile('supabase/functions/ielts_learning_plan_ai/index.ts','utf8')).replace(/import \{ createClient \} from "npm:[^"]+";/,'const createClient = globalThis.createClient;');
 const bundle=await build({stdin:{contents:source,resolveDir:process.cwd()+'/supabase/functions/ielts_learning_plan_ai',loader:'ts'},bundle:true,format:'iife',write:false,logLevel:'silent'});
 let handler;const requests=[],saved=[],logs=[];
 const client={auth:{getUser:async()=>({data:{user:{id:'teacher'}}})},rpc:async(name,args)=>{
  if(name==='rpc_ielts_claim_plan_ai')return {data:{id:'draft',context}};
  if(name==='rpc_ielts_finish_plan_ai'){saved.push(args);return {error:null};}
  if(name==='rpc_ielts_learning_report_context')return {data:{can_manage:true}};
  throw new Error('unexpected_rpc');
 }};
 const sandbox={createClient:()=>client,Deno:{env:{get:()=> 'test'},serve:fn=>handler=fn},Response,Request,AbortSignal,console:{warn:(...args)=>logs.push(args)},fetch:async(url,options)=>{
  requests.push(JSON.parse(options.body));const output=outputs.shift();
  return new Response(JSON.stringify({id:'provider',choices:[{finish_reason:'stop',message:{content:JSON.stringify(output)}}]}),{status:200});
 }};
 vm.runInNewContext(bundle.outputFiles[0].text,sandbox);
 const response=await handler(new Request('https://example.test',{method:'POST',headers:{authorization:'Bearer test','content-type':'application/json'},body:JSON.stringify({schoolId:'11111111-1111-4111-8111-111111111111',studentId:'22222222-2222-4222-8222-222222222222'})}));
 return {response,requests,saved,logs};
}
test('real handler repairs a rejected draft with its exact failure reason before saving teacher-only output',async()=>{
 const result=await harness([{...fields,goals:Array(4).fill(fields.goals[0])},fields]);
 assert.equal(result.response.status,200);
 assert.equal(result.requests.length,2);
 assert.match(result.requests[1].messages[0].content,/invalid_goal_count/);
 assert.deepEqual(result.requests[0].response_format.json_schema.schema.properties.review_on.enum,[context.review_on]);
 assert.equal(result.requests[0].response_format.json_schema.schema.properties.goals.maxItems,3);
 assert.equal(result.saved.length,1);assert.deepEqual(JSON.parse(JSON.stringify(result.saved[0].p_fields)),fields);
 assert.equal((await result.response.json()).teacher_confirmation_required,true);
});
test('two invalid drafts fail safely without storing fabricated fields or logging their text',async()=>{
 const bad={...fields,study_goal:'PRIVATE_DATA improved'};
 const result=await harness([bad,bad]);assert.equal(result.response.status,503);
 assert.equal(result.saved.length,1);assert.equal(result.saved[0].p_fields,null);
 assert.equal(JSON.stringify(result.logs).includes('PRIVATE_DATA'),false);
 assert.match(JSON.stringify(result.logs),/invalid_study_goal/);
});
