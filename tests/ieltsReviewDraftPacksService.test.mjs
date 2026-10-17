import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import {webcrypto} from 'node:crypto';
globalThis.crypto??=webcrypto;
const buildResult=await build({entryPoints:['services/ieltsReviewDraftPacks.ts'],bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent',plugins:[{name:'client',setup(b){b.onLoad({filter:/supabaseClient\.ts$/},()=>({contents:'export const supabase=globalThis.draftClient;',loader:'js'}));}}]});
let payload,rpcError=null,bytes,calls=[];
globalThis.draftClient={rpc:async(name,args)=>{calls.push({name,args});return name==='rpc_ielts_record_review_decision'?{data:payload.decisionReply,error:rpcError}:{data:payload,error:rpcError};},storage:{from:()=>({download:async()=>({data:bytes})})}};
const api=await import('data:text/javascript;base64,'+Buffer.from(buildResult.outputFiles[0].text).toString('base64'));
const school='8eeecf5d-0496-4e0d-b5cd-538f91c9cfa0';
async function draft(content='draft'){bytes=new Blob([content]);const hash=Buffer.from(await crypto.subtle.digest('SHA-256',await bytes.arrayBuffer())).toString('hex');
 return {lesson_code:'IELTS-17',title:'Timed Listening',version:'0.1.0',source_sha256:'a'.repeat(64),object_path:`review-drafts/${school}/IELTS-17/0.1.0/${hash}.zip`,sha256:hash,size_bytes:bytes.size,recordings:[{id:'IELTS-17-L1',status:'Produced v1; owner listening review pending'}],published_at:'2026-10-18T00:00:00Z',decision:null};}
test('catalogue accepts only exact school-scoped draft identities and verifies bytes',async()=>{
 const pack=await draft();rpcError=null;payload={school_id:school,release:'review_draft',can_decide:true,packs:[pack]};
 const c=await api.reviewDraftPacks(school);assert.equal(c.canDecide,true);assert.equal(c.packs.length,1);
 assert.equal((await api.reviewDraftPackBlob(pack)).size,pack.size_bytes);
 bytes=new Blob(['drafx']);await assert.rejects(api.reviewDraftPackBlob(pack),/verification failed/);
 bytes=new Blob(['x']);await assert.rejects(api.reviewDraftPackBlob(pack),/unavailable/);
 payload={...payload,packs:[{...pack,object_path:`review-drafts/other/IELTS-17/0.1.0/${pack.sha256}.zip`}]};await assert.rejects(api.reviewDraftPacks(school),/identity mismatch/);
 payload={...payload,packs:[{...pack,lesson_code:'IELTS-03',object_path:`review-drafts/${school}/IELTS-03/0.1.0/${pack.sha256}.zip`}]};await assert.rejects(api.reviewDraftPacks(school),/identity mismatch/);
 payload={...payload,release:'teacher_only',packs:[pack]};await assert.rejects(api.reviewDraftPacks(school),/unavailable/);
});
test('teachers without management rights see no drafts instead of an error',async()=>{
 rpcError={code:'42501',message:'not_authorized'};payload=null;assert.deepEqual(await api.reviewDraftPacks(school),{canDecide:false,packs:[]});
 rpcError={code:'500',message:'boom'};await assert.rejects(api.reviewDraftPacks(school),/unavailable/);rpcError=null;
});
test('decisions bind to the exact published bytes and require notes for change requests',async()=>{
 const pack=await draft();calls=[];rpcError=null;
 await assert.rejects(api.recordReviewDecision(school,pack,'changes_requested','   '),/Describe the changes/);assert.equal(calls.length,0);
 payload={decisionReply:{lesson_code:'IELTS-17',version:'0.1.0',decision:'approved',notes:null,decided_at:'2026-10-18T01:00:00Z',pack_sha256:pack.sha256}};
 const d=await api.recordReviewDecision(school,pack,'approved','');assert.equal(d.decision,'approved');
 assert.deepEqual(calls[0].args,{p_school:school,p_lesson_code:'IELTS-17',p_version:'0.1.0',p_pack_sha256:pack.sha256,p_decision:'approved',p_notes:null});
 payload={decisionReply:{...payload.decisionReply,pack_sha256:'b'.repeat(64)}};await assert.rejects(api.recordReviewDecision(school,pack,'approved',''),/could not be saved/);
 rpcError={code:'42501'};await assert.rejects(api.recordReviewDecision(school,pack,'approved',''),/could not be saved/);rpcError=null;
});
