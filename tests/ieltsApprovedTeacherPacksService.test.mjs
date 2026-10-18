import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import {webcrypto} from 'node:crypto';
globalThis.crypto??=webcrypto;
const buildResult=await build({entryPoints:['services/ieltsApprovedTeacherPacks.ts'],bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent',plugins:[{name:'client',setup(b){b.onLoad({filter:/supabaseClient\.ts$/},()=>({contents:'export const supabase=globalThis.packClient;',loader:'js'}));}}]});
let payload,bytes,downloadCount=0;
globalThis.packClient={rpc:async()=>({data:payload}),storage:{from:()=>({download:async()=>{downloadCount++;return {data:bytes};}})}};
const api=await import('data:text/javascript;base64,'+Buffer.from(buildResult.outputFiles[0].text).toString('base64'));
test('download accepts only exact release identity and verifies actual bytes, not just size',async()=>{
 bytes=new Blob(['approved']);const hash=Buffer.from(await crypto.subtle.digest('SHA-256',await bytes.arrayBuffer())).toString('hex');
 const pack={lesson_code:'IELTS-03',title:'Approved title',version:'1.0.1',branding_version:'1.0.0',school:{id:'school',name:'Own School',logo_url:null},object_path:`templates/IELTS-03/1.0.0/${hash}.zip`,sha256:hash,size_bytes:8};
 payload={school_id:'school',school:pack.school,release:'teacher_only',packs:[pack]};assert.deepEqual(await api.approvedTeacherPacks('school'),[pack]);assert.equal((await api.approvedTeacherPackSource(pack)).size,8);
 bytes=new Blob(['tampered']);await assert.rejects(api.approvedTeacherPackSource(pack),/verification failed/);
 bytes=new Blob(['short']);await assert.rejects(api.approvedTeacherPackSource(pack),/unavailable/);
 payload.school_id='other';await assert.rejects(api.approvedTeacherPacks('school'),/unavailable/);
 payload.school_id='school';pack.object_path='other/IELTS-03/1.0.1/'+hash+'.zip';await assert.rejects(api.approvedTeacherPacks('school'),/identity mismatch/);
 assert.equal(downloadCount,3);
});
test('all 24 course lessons are accepted; codes outside the course are not',async()=>{
 bytes=new Blob(['lesson']);const hash=Buffer.from(await crypto.subtle.digest('SHA-256',await bytes.arrayBuffer())).toString('hex');
 const school={id:'school',name:'Own School',logo_url:null};
 const mk=code=>({lesson_code:code,title:'Lesson',version:'0.2.0',branding_version:'1.0.0',school,object_path:`templates/${code}/1.0.0/${hash}.zip`,sha256:hash,size_bytes:6});
 payload={school_id:'school',school,release:'teacher_only',packs:[mk('IELTS-01'),mk('IELTS-17'),mk('IELTS-24')]};assert.equal((await api.approvedTeacherPacks('school')).length,3);
 payload={...payload,packs:[mk('IELTS-25')]};await assert.rejects(api.approvedTeacherPacks('school'),/identity mismatch/);
});
