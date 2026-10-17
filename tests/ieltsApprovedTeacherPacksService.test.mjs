import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import {webcrypto} from 'node:crypto';
globalThis.crypto??=webcrypto;
const buildResult=await build({entryPoints:['services/ieltsApprovedTeacherPacks.ts'],bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent',plugins:[{name:'client',setup(b){b.onLoad({filter:/supabaseClient\.ts$/},()=>({contents:'export const supabase=globalThis.packClient;',loader:'js'}));}}]});
let payload,bytes,downloadCount=0;
globalThis.packClient={rpc:async()=>({data:payload}),storage:{from:()=>({download:async()=>{downloadCount++;return {data:bytes};}})}};
const api=await import('data:text/javascript;base64,'+Buffer.from(buildResult.outputFiles[0].text).toString('base64'));
test('download accepts only exact release identity and verifies actual bytes, not just size',async()=>{
 bytes=new Blob(['approved']);const hash=Buffer.from(await crypto.subtle.digest('SHA-256',await bytes.arrayBuffer())).toString('hex');
 const pack={lesson_code:'IELTS-03',title:'Approved title',version:'1.0.1',object_path:`school/IELTS-03/1.0.1/${hash}.zip`,sha256:hash,size_bytes:8};
 payload={school_id:'school',release:'teacher_only',packs:[pack]};assert.deepEqual(await api.approvedTeacherPacks('school'),[pack]);assert.equal((await api.approvedTeacherPackBlob(pack)).size,8);
 bytes=new Blob(['tampered']);await assert.rejects(api.approvedTeacherPackBlob(pack),/verification failed/);
 bytes=new Blob(['short']);await assert.rejects(api.approvedTeacherPackBlob(pack),/unavailable/);
 payload.school_id='other';await assert.rejects(api.approvedTeacherPacks('school'),/unavailable/);
 payload.school_id='school';pack.object_path='other/IELTS-03/1.0.1/'+hash+'.zip';await assert.rejects(api.approvedTeacherPacks('school'),/identity mismatch/);
 assert.equal(downloadCount,3);
});
