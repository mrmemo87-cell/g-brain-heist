import test from 'node:test';import assert from 'node:assert/strict';import{build}from'esbuild';import{zipSync,unzipSync,strToU8,strFromU8}from'fflate';import{webcrypto}from'node:crypto';globalThis.crypto??=webcrypto;
const built=await build({entryPoints:['services/ieltsPackBranding.ts'],bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
const{brandTeacherPack,packDigest,schoolPackLogo}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
const root='IELTS-03/',token='{{BH_SCHOOL_NAME}}',media='ppt/media/image.png',deck=root+'teacher/IELTS-03-Editable.pptx';
const rawFiles={
 [root+'teacher/Presentation.html']:strToU8('<header>'+token+'</header><img src="../assets/school-logo.png"><p>Approved prompt</p>'),
 [root+'student/Workbook.html']:strToU8('<header>'+token+'</header><p>Student question only</p>'),
 [root+'teacher/Guide-and-keys.html']:strToU8('<header>'+token+'</header><p>PRIVATE TEACHER KEY</p>'),
 [root+'teacher/audio/approved.mp3']:new Uint8Array([1,2,3,4]),
 [root+'assets/school-logo.png']:new Uint8Array([99]),
 [deck]:zipSync({[media]:new Uint8Array([99]),'ppt/slides/slide1.xml':strToU8('<a:t>'+token+'</a:t><a:t>Approved prompt</a:t>')}),
 'BRANDING.json':strToU8(JSON.stringify({version:'1.0.0',lesson_code:'IELTS-03',pdfs:{},pptx_media:{[deck]:media},source_archive_sha256:'original-hash',approved_source_sha256:'approved-content-hash'})),
};
const blob=new Blob([zipSync(rawFiles)]),school={id:'school-b',name:'Школа & "North" <img onerror=alert(1)>',logo_url:'https://example.test/own.png'},logo=new Uint8Array([7,8,9]);
test('every HTML/PPTX uses escaped authorized branding; audio/content stay byte-identical',async()=>{
 const out=unzipSync(new Uint8Array(await(await brandTeacherPack(blob,school,'IELTS-03','zip',logo)).arrayBuffer()));
 assert.match(strFromU8(out[root+'teacher/Presentation.html']),/Школа &amp; &quot;North&quot; &lt;img onerror=alert\(1\)&gt;/);
 assert.doesNotMatch(strFromU8(out[root+'student/Workbook.html']),/PRIVATE TEACHER KEY|<img onerror/);
 const pptx=unzipSync(out[deck]);assert.deepEqual(pptx[media],logo);assert.match(strFromU8(pptx['ppt/slides/slide1.xml']),/Approved prompt/);assert.doesNotMatch(strFromU8(pptx['ppt/slides/slide1.xml']),/\{\{BH_SCHOOL_NAME\}\}/);
 assert.deepEqual(out[root+'teacher/audio/approved.mp3'],rawFiles[root+'teacher/audio/approved.mp3']);
 const manifest=JSON.parse(strFromU8(out['MANIFEST.json']));assert.equal(manifest.school.id,school.id);assert.equal(manifest.school.name,school.name);assert.equal(manifest.approved_source_sha256,'approved-content-hash');
 for(const[path,hash]of Object.entries(manifest.files))assert.equal(await packDigest(out[path]),hash);
 assert.equal(out['BRANDING.json'],undefined);
});
test('missing logo cannot retain the authoring-school logo, even if an old asset is supplied',async()=>{
 const own={id:'school-c',name:'School Without Logo',logo_url:null};
 const out=unzipSync(new Uint8Array(await(await brandTeacherPack(blob,own,'IELTS-03','zip',logo)).arrayBuffer()));
 assert.notDeepEqual(out[root+'assets/school-logo.png'],logo);assert.deepEqual(out[root+'assets/school-logo.png'],await schoolPackLogo(own));
 assert.equal(JSON.parse(strFromU8(out['MANIFEST.json'])).school.logo_sha256,null);
 assert.match(strFromU8(out[root+'student/Workbook.html']),/School Without Logo/);
});
test('single-resource delivery excludes private guide and audio rather than branding unused PDFs',async()=>{
 const out=unzipSync(new Uint8Array(await(await brandTeacherPack(blob,school,'IELTS-03','slides',logo)).arrayBuffer()));
 assert.ok(out[root+'teacher/Presentation.html']);assert.equal(out[root+'teacher/Guide-and-keys.html'],undefined);assert.equal(out[root+'teacher/audio/approved.mp3'],undefined);assert.equal(out[deck],undefined);
});
test('mismatched school template and failed logo download do not export a misleading pack',async()=>{
 await assert.rejects(brandTeacherPack(blob,school,'IELTS-04','zip',logo),/template mismatch/);
 const old=globalThis.fetch;globalThis.fetch=async()=>new Response('',{status:404});try{await assert.rejects(schoolPackLogo(school),/School logo could not load/);}finally{globalThis.fetch=old;}
});
