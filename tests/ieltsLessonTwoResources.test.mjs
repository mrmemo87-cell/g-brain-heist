import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { strFromU8, unzipSync } from "fflate";
const built=await build({entryPoints:["services/ieltsLessonTwoResources.ts"],bundle:true,write:false,format:"esm",platform:"node",logLevel:"silent"});
const {lessonTwoFiles,lessonTwoSlides,lessonTwoZip}=await import("data:text/javascript;base64,"+Buffer.from(built.outputFiles[0].text).toString("base64"));
const six=Array.from({length:6},(_,i)=>({id:"q"+i,statement:"Public statement "+i,answer:"PRIVATE ANSWER "+i,evidence:"PRIVATE EVIDENCE "+i,reason:"SECRET REASON "+i}));
const pack={
 school:{id:"school-a",name:"School <A>",logo_url:null},lesson_code:"IELTS-02",version:"1.0.0",release:"teacher_only",
 source_blob_sha1:"a".repeat(40),
 content:{code:"IELTS-02",version:"1.0.0",title:"Reading evidence",duration:60,
  prerequisites:["Check previous assessments"],objectives:["Find evidence"],audio:"No recording required",
  reading:{id:"r",title:"Quiet place",instructions:"Read",paragraphs:["Read this public passage."],items:six},
  writing:{prompt:"Write paragraph",model:"Public writing example",support:"Frame",extension:"Extend",feedback:["Relevant answer"]},
  speaking:{prompt:"Talk",model:"Public speaking example",followup:"Why?",instructions:"Practice in pairs",support:"Starter",extension:"Extend",observation:"PRIVATE TEACHER OBSERVATION"},
  stages:Array.from({length:8},(_,i)=>({start:i*7,end:i*7+7,title:"Stage "+i,slides:"1",student:"Listen",teacher:"Private teacher cue",say:"Teacher words",check:"Check original answers"})),
  homework:["Review your paragraph"],followup:{status:"withheld",delivery:"Next week",passage:"PRIVATE FRESH PASSAGE",items:six.slice(0,4),writing:"PRIVATE FRESH WRITING",speaking:"PRIVATE FRESH SPEAKING",review:"PRIVATE FOLLOWUP"}
 }
};
test("IELTS-02 files maintain teacher/student separation and source identity",async()=>{
 const files=lessonTwoFiles(pack);
 const student=Object.entries(files).filter(([key])=>key.startsWith("Students/"));
 assert.equal(student.length,3);
 for(const [name,bytes] of student){
  const text=strFromU8(bytes);
  assert.ok(text.includes("School &lt;A&gt;"),name);
  assert.doesNotMatch(text,/PRIVATE ANSWER|PRIVATE FRESH|PRIVATE EVIDENCE|SECRET REASON|PRIVATE TEACHER OBSERVATION|Private teacher cue/,name);
 }
 const keys=strFromU8(files["Teacher-private/keys.html"]);
 assert.match(keys,/PRIVATE ANSWER 0/);
 const fresh=strFromU8(files["Teacher-private/fresh-check.html"]);
 assert.match(fresh,/PRIVATE FRESH PASSAGE/);
 const slides=lessonTwoSlides(pack.content);
 assert.equal(slides.length,17);
 assert.ok(slides[4].lines.join(" ").includes("Quiet place"));
 const manifest=JSON.parse(strFromU8(files["versions.json"]));
 assert.equal(manifest.source_blob_sha1,"a".repeat(40));
 const zipped=unzipSync(new Uint8Array(await lessonTwoZip(pack).arrayBuffer()));
 assert.deepEqual(Object.keys(zipped).sort(),Object.keys(files).sort());
 assert.ok(zipped["01-START-HERE.html"]);
});
