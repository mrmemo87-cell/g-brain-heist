import { zipSync, strToU8 } from "fflate";
import type { TeacherLessonTwo, LessonTwoSource } from "./ieltsLessonTwoService";

const esc = (s: unknown) => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
const p = (s: unknown) => "<p>"+esc(s)+"</p>";
const h = (s: unknown) => "<h2>"+esc(s)+"</h2>";
const ol = (rows: unknown[]) => "<ol>"+rows.map(x=>"<li>"+esc(x)+"</li>").join("")+"</ol>";
const blanks = (n=3) => "<p class='lines'>________________________________________________________________________</p>".repeat(n);
const sheet = (s: string) => "<section class='page'>"+s+"</section>";
const css = "html{font:15px/1.5 Arial,system-ui,sans-serif;color:#15243a}body{max-width:900px;margin:auto;padding:24px}h1{font-size:28px}h2{color:#1746b0;font-size:21px;margin-top:18px}p,li{font-size:14px}li{padding-bottom:9px}header{border-top:8px solid #1746b0;border-bottom:1px solid #ddd;margin-bottom:20px;padding:10px 0}.page{page-break-after:always;break-after:page;min-height:920px}.lines{line-height:2;color:#aaa}button{padding:12px;cursor:pointer}small{color:#52667e}.teacher-warning{color:#b31b34;font-weight:bold}@page{size:A4;margin:14mm}@media print{body{max-width:none;padding:0}.page{min-height:0}nav{display:none!important}}";
function wrap(pack:TeacherLessonTwo,title:string,body:string,audience:string):string{
 return "<!doctype html><html lang='en'><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>"+esc(title)+"</title><style>"+css+"</style><body><header><small>Brains Heist IELTS · "+esc(pack.school.name)+" · IELTS-02 v1.0.0</small><h1>"+esc(title)+"</h1><small>"+esc(audience)+" · Classroom practice, not an official IELTS result</small></header>"+body+"</body></html>";
}
export function lessonTwoSlides(d:LessonTwoSource):{title:string;lines:string[]}[]{
const a=d.reading.items;
return [
 {title:"Lesson 2 · Reading evidence and developed answers",lines:["60 minutes","Guided reading, writing and speaking"]},
 {title:"Learning objectives",lines:d.objectives},
 {title:"Reading: commit first",lines:["The club meets on Thursday.","Claim: The club meets on Tuesday.","TRUE, FALSE or NOT GIVEN?"]},
 {title:"Reading model: reveal",lines:["FALSE — Thursday contradicts Tuesday."]},
 {title:"Reading practice",lines:[d.reading.title,"Use the student passage and six claims. Find evidence before answering."]},
 {title:"Reading Q1–Q2: reveal",lines:a.slice(0,2).map((q,i)=>(i+1)+". "+q.answer+" — "+q.reason)},
 {title:"Reading Q3–Q4: reveal",lines:a.slice(2,4).map((q,i)=>(i+3)+". "+q.answer+" — "+q.reason)},
 {title:"Reading Q5: reveal",lines:[a[4].answer,a[4].reason]},
 {title:"Reading Q6: reveal",lines:[a[5].answer,a[5].reason]},
 {title:"Paragraph model",lines:["Suggestion · reason · example",d.writing.model]},
 {title:"Develop one idea",lines:["Identify the reason and a specific example.","Why does the example support the suggestion?"]},
 {title:"Write your own paragraph",lines:[d.writing.prompt]},
 {title:"Speaking model",lines:[d.speaking.prompt,d.speaking.model]},
 {title:"Speaking pairs",lines:[d.speaking.instructions,d.speaking.followup]},
 {title:"Teacher observations",lines:[d.speaking.observation]},
 {title:"Exit ticket",lines:["One reading choice supported by evidence","One improvement to your developed answer"]},
 {title:"Homework",lines:d.homework}
];
}
export function lessonTwoSlideHtml(pack:TeacherLessonTwo):string{
 const slides=lessonTwoSlides(pack.content);
 const markup=slides.map((slide,i)=>"<article class='slide'"+(i?" hidden":"")+"><small>IELTS-02 · "+esc(pack.school.name)+" · "+(i+1)+"/17</small><h1>"+esc(slide.title)+"</h1>"+slide.lines.map(p).join("")+"</article>").join("");
 const slideCss="body{max-width:none;padding:0;background:#15243a;color:#fff}.slide{min-height:75vh;padding:4vw 8vw}.slide h1{font-size:clamp(30px,5vw,56px)}.slide p{font-size:clamp(19px,2.2vw,30px);color:#fff;max-width:1100px}nav{position:fixed;bottom:0;background:#15243a;width:100%;padding:16px;text-align:center}nav button{margin:0 6px}nav button:focus-visible{outline:3px solid #ffca6c}@media print{body{background:white;color:#15243a}.slide{display:block!important;break-after:page;min-height:0}.slide p{color:#15243a}}";
 const js="(function(){var a=[...document.querySelectorAll('.slide')],i=0,s=document.getElementById('slide-status');function show(n){i=Math.max(0,Math.min(a.length-1,n));a.forEach((x,j)=>x.hidden=j!==i);s.textContent=(i+1)+' / '+a.length}document.getElementById('prev').onclick=()=>show(i-1);document.getElementById('next').onclick=()=>show(i+1);document.addEventListener('keydown',e=>{if(['BUTTON','INPUT','TEXTAREA'].includes(document.activeElement.tagName))return;if(e.key==='ArrowRight'||e.key===' '){e.preventDefault();show(i+1)}if(e.key==='ArrowLeft'){e.preventDefault();show(i-1)}if(e.key==='Home')show(0);if(e.key==='End')show(a.length-1)});show(0)})();";
 return "<!doctype html><html lang='en'><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>IELTS-02 teacher slides</title><style>"+css+slideCss+"</style><body>"+markup+"<nav aria-label='Slide controls'><button id='prev'>Previous</button> <span id='slide-status' role='status'></span> <button id='next'>Next</button></nav><script>"+js+"</script></body></html>";
}
function workbook(pack:TeacherLessonTwo):string{
 const d=pack.content;
 return wrap(pack,"Student workbook",
 sheet(p("Name: _________________ Date: ____________")+h(d.reading.title)+p(d.reading.instructions)+d.reading.paragraphs.map(p).join(""))
 +sheet(h("Reading: first answers and evidence")+p("Keep your first answers when correcting.")+d.reading.items.map((x,i)=>p((i+1)+". "+x.statement)+p("Answer: __________ Evidence / missing information:")+blanks(1)).join(""))
 +sheet(h("Paragraph model")+p(d.writing.model)+p("Underline the suggestion, reason and example.")+h("Plan my paragraph")+blanks(4)+h("Speaking pairs")+p(d.speaking.prompt)+p(d.speaking.instructions)+p(d.speaking.followup))
 +sheet(h("Independent paragraph")+p(d.writing.prompt)+p("Support received (if any): _________________")+blanks(12)+h("Exit ticket")+blanks(2)),
 "Student only — no keys or fresh-check prompts");
}
function teacherGuide(pack:TeacherLessonTwo):string{
 const d=pack.content;
 return wrap(pack,"Teacher lesson guide",
 sheet(h("Preparation")+ol(d.prerequisites)+h("Objectives")+ol(d.objectives)+p(d.audio)+p("Check four screener and productive review states privately before teaching."))
 +d.stages.map(s=>sheet(h(s.start+"–"+s.end+" minutes · "+s.title)+p("Slides "+s.slides)+h("Teacher")+p(s.teacher)+h("Say")+p(s.say)+h("Student")+p(s.student)+h("Check")+p(s.check))).join("")
 +sheet(h("Support and follow-up")+p(d.writing.support)+p(d.writing.extension)+p(d.speaking.observation)+p("Preserve source evidence, support and actual observation. No classroom work is automatically scored or submitted.")),
 "Teacher only — keep private");
}
function keys(pack:TeacherLessonTwo):string{
 const d=pack.content;
 return wrap(pack,"Teacher keys and models",
 sheet("<p class='teacher-warning'>TEACHER ONLY · Do not give to students in advance</p>"+h("Reading answers")+d.reading.items.map((q,i)=>h((i+1)+". "+q.answer)+p(q.statement)+p("Evidence: "+q.evidence)+p("Reason: "+q.reason)).join(""))
 +sheet(h("Writing model")+p(d.writing.model)+h("Feedback checks")+ol(d.writing.feedback)+h("Speaking model")+p(d.speaking.model)+p(d.speaking.observation)),
 "Teacher only — answer keys");
}
function fresh(pack:TeacherLessonTwo):string{
 const f=pack.content.followup;
 return wrap(pack,"Private fresh-transfer check",
 sheet("<p class='teacher-warning'>WITHHOLD FROM ADVANCE STUDENT DISTRIBUTION</p>"+p(f.delivery)+h("Reading passage")+p(f.passage)+f.items.map((q,i)=>p((i+1)+". "+q.statement)+blanks(2)).join(""))
 +sheet(h("Writing check")+p(f.writing)+blanks(12))
 +sheet(h("Speaking check")+p(f.speaking)+blanks(8))
 +sheet(h("Private answer key")+f.items.map((q,i)=>h((i+1)+". "+q.answer)+p(q.evidence)+p(q.reason)).join("")+p(f.review)),
 "Teacher only — conditional follow-up");
}
export function lessonTwoFiles(pack:TeacherLessonTwo):Record<string,Uint8Array>{
 const d=pack.content;
 const html:Record<string,string>={
  "01-START-HERE.html":wrap(pack,"START HERE · IELTS-02",
    sheet(h("Before class")+p("Verify actual screener and Writing/Speaking review states. No recording is required.")
      +h("For students")+ol(["Students/workbook.html (4 pages)","Students/homework.html","Students/catch-up.html, if needed"])
      +h("Teacher only")+ol(["Teacher-private/guide.html","Teacher-private/keys.html","Teacher-private/planning.html","Teacher-private/presentation.html","Teacher-private/fresh-check.html"])
      +p("Open each HTML in a browser and choose Print → Save as PDF for A4 handouts.")
      +p("Use Previous/Next to advance offline teaching slides. Do not give students keys or withheld fresh work.")
      +p("This is an HTML teaching edition of the approved source, not a native PowerPoint export or pre-rendered PDF.")), "Teacher only"),
  "Students/workbook.html":workbook(pack),
  "Students/homework.html":wrap(pack,"Homework",sheet(ol(d.homework)+p("Name: _______________  Check date: _______________")),"Student handout"),
  "Students/catch-up.html":wrap(pack,"Late joiner catch-up",sheet(h("Missed teaching essentials")+p("Keep any previously completed screeners. Arrange missing assessments separately.")
    +p(d.reading.instructions)+h("Writing")+p("Suggestion, reason and specific example.")+h("Speaking")+p(d.speaking.prompt)+p("My next action: _____________")),"Student handout"),
  "Teacher-private/guide.html":teacherGuide(pack),
  "Teacher-private/keys.html":keys(pack),
  "Teacher-private/planning.html":wrap(pack,"Planning and review",
    sheet(h("Before class: evidence status")+blanks(14))+sheet(h("After class: actual observations")+blanks(14))
    +sheet(h("Next actions and dates")+blanks(14))+sheet(h("Teacher summary")+blanks(14)), "Teacher only"),
  "Teacher-private/fresh-check.html":fresh(pack),
  "Teacher-private/presentation.html":lessonTwoSlideHtml(pack)
 };
 const manifest=JSON.stringify({lesson:"IELTS-02",version:pack.version,school:pack.school,source_blob_sha1:pack.source_blob_sha1,
   release:"teacher_only",files:Object.keys(html),format:"Offline HTML teaching pack; Print to PDF"},null,2);
 return Object.fromEntries(Object.entries({...html,"versions.json":manifest}).map(([k,v])=>[k,strToU8(v)]));
}
export function lessonTwoZip(pack:TeacherLessonTwo):Blob{
 return new Blob([zipSync(lessonTwoFiles(pack))],{type:"application/zip"});
}
