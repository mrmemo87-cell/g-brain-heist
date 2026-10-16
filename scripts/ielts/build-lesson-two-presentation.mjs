// Private authoring builder. Requires the Codex Artifact Tool primary runtime.
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Presentation, PresentationFile } from '@oai/artifact-tool';
const pack=path.resolve(process.argv[2]??'');
const build=path.resolve(process.argv[3]??'.lesson-build');
await fs.mkdir(build,{recursive:true});
const slides=JSON.parse(await fs.readFile(path.join(pack,'Teacher-private/slides.json'),'utf8'));
const manifest=JSON.parse(await fs.readFile(path.join(pack,'manifest.json'),'utf8'));
const presentation=Presentation.create({slideSize:{width:1280,height:720}});
const font='DejaVu Sans';
presentation.theme.defaultFont=font;
function textbox(slide,name,text,x,y,w,h,size,color,bold=false){
 const s=slide.shapes.add({geometry:'textbox',name,position:{left:x,top:y,width:w,height:h},fill:'none',line:{style:'solid',fill:'none',width:0}});
 s.text=text;s.text.style={typeface:font,fontSize:size,color,bold,verticalAlignment:'top',insets:0};return s;
}
const logoFile=path.join(pack,'assets/school-logo.jpg');
let logo;try {const b=await fs.readFile(logoFile);logo=b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);}catch{}
for(const [i,s] of slides.entries()){
 const slide=presentation.slides.add();const dark=!!s.dark;slide.background.fill=dark?'#15243A':'#FFFFFF';
 const ink=dark?'#FFFFFF':'#15243A';const muted=dark?'#DCE5EF':'#4C6076';
 textbox(slide,'school',manifest.school,64,30,1050,30,19,muted,true);
 textbox(slide,'title',s.title,64,116,1152,132,52,ink,true);
 textbox(slide,'body',s.body,64,274,1152,358,s.size??32,ink);
 textbox(slide,'identity',`Brains Heist IELTS · IELTS-02 · presentation ${manifest.presentation_version} · ${i+1}/${slides.length}`,64,664,1080,30,17,muted);
 if(logo&&!dark)slide.images.add({blob:logo,contentType:'image/jpeg',alt:manifest.school+' logo',fit:'contain',position:{left:1144,top:24,width:72,height:82}});
 slide.speakerNotes.text=s.notes+'\nPrivate teacher-review draft. Classroom timing only. Source: private lesson-two/lesson.json v1.0.0. Diagnostic Bible 1.10.0; Lessons Bible 1.1.0; Visual & UX Bible 1.1.0.';
}
const candidate=path.join(build,'candidate.pptx');await(await PresentationFile.exportPptx(presentation)).save(candidate);
const skill='/root/.codex/skills/builtins/presentations';
const {finalizePresentation}=await import(pathToFileURL(path.join(skill,'container_tools/artifact_tool_utils.mjs')).href);
const finalPath=path.join(pack,'Teacher-private/Lesson_2_Presentation.pptx');
await finalizePresentation({workspaceDir:path.dirname(pack),candidatePath:candidate,finalPath,pythonExecutable:process.env.CODEX_PRIMARY_RUNTIME_PYTHON,integrityValidatorPath:path.join(skill,'container_tools/inspect_presentation_package_integrity.py'),layoutValidatorPath:path.join(skill,'container_tools/inspect_presentation_layout_geometry.py'),layoutArgs:['--expected-slide-size-emu','12192000,6858000','--validate-bullet-geometry','--validate-heading-fit'],explicitTotalSlideCount:slides.length,requiredNativeTableOwnerSlides:[],requiredNativeChartOwnerSlides:[],fontPolicy:{basis:'design',families:[font]},verifyArtifactToolImport:true,receiptPath:path.join(build,'presentation-validation.json')});
await fs.copyFile(finalPath,path.join(pack,'Teacher-private/Lesson_2_Presentation_static.pptx'));
// Both PowerPoints are motion-free. HTML supplies an optional finite manual fade.
await fs.mkdir(path.join(build,'slides'),{recursive:true});
for (const [i,slide] of presentation.slides.items.entries()){
 const png=await presentation.export({slide,format:'png',scale:1});
 await fs.writeFile(path.join(build,'slides',`slide-${String(i+1).padStart(2,'0')}.png`),new Uint8Array(await png.arrayBuffer()));
}
console.log(JSON.stringify({slides:slides.length,finalPath}));
