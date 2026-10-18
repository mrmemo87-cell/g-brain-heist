import React, {useEffect,useRef,useState} from 'react';
import {unzipSync,strFromU8} from 'fflate';
import {approvedTeacherPacks,approvedTeacherPackBlob,type ApprovedTeacherPack} from '../../../services/ieltsApprovedTeacherPacks';
import {downloadLessonFile} from '../../../services/ieltsLessonResources';
import IeltsTeacherDisclosure from '../../components/ielts/IeltsTeacherDisclosure';

const isMock=(code:string)=>code.startsWith('IELTS-M');
const packHint=(p:ApprovedTeacherPack)=>isMock(p.lesson_code)?`Full Academic IELTS mock test · paper-based · version ${p.version}`:p.lesson_code.startsWith('IELTS-X')?`Optional extension lesson · 60 minutes · version ${p.version}`:`Approved Academic IELTS lesson · 60 minutes · version ${p.version}`;
const resourceName=(code:string,kind:'slides'|'workbook'|'pptx')=>isMock(code)?(kind==='slides'?'Mock-Test-Control.html':'Answer-Sheet.pdf'):kind==='slides'?'Presentation.html':kind==='workbook'?'Workbook.pdf':'Editable.pptx';

export default function IeltsApprovedTeacherPacks({schoolId}:{schoolId:string}) {
 const [packs,setPacks]=useState<ApprovedTeacherPack[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(''),[retry,setRetry]=useState(0);
 const epoch=useRef(0),lock=useRef(false);
 useEffect(()=>{
  const run=++epoch.current; setPacks([]);setError('');setLoading(true);setBusy('');lock.current=false;
  approvedTeacherPacks(schoolId).then(p=>{if(epoch.current===run)setPacks(p);})
   .catch(()=>{if(epoch.current===run)setError('Teaching packs could not load. Check your programme access and retry.');})
   .finally(()=>{if(epoch.current===run)setLoading(false);});
  return ()=>{epoch.current++;};
 },[schoolId,retry]);
 async function download(pack:ApprovedTeacherPack,kind:'zip'|'slides'|'workbook'|'pptx') {
  if(lock.current)return; lock.current=true; const run=epoch.current;setBusy(pack.lesson_code);setError('');
  try {
   const blob=await approvedTeacherPackBlob(pack,kind);
   if(epoch.current!==run)return;
   if(kind==='zip')downloadLessonFile(blob,`${pack.lesson_code}-Teacher-Pack-v${pack.version}.zip`);
   else {
    const files=unzipSync(new Uint8Array(await blob.arrayBuffer()));
    const root=pack.lesson_code+'/';
    const ext=kind==='slides'?'.html':kind==='workbook'?'.pdf':'.pptx';
    const path=Object.keys(files).find(f=>f.startsWith(root)&&!f.startsWith(root+'assets/')&&f.endsWith(ext));
    const bytes=path?files[path]:undefined;if(!bytes)throw new Error('Missing approved resource');
    let output:Blob;
    if(kind==='slides') {
     const logo=files[root+'assets/school-logo.png'];if(!logo)throw new Error('Missing school logo');
     let binary='';for(const b of logo)binary+=String.fromCharCode(b);
     const html=strFromU8(bytes).replaceAll('../assets/school-logo.png','data:image/png;base64,'+btoa(binary));
     output=new Blob([html],{type:'text/html'});
    } else output=new Blob([new Uint8Array(bytes)],{type:kind==='workbook'?'application/pdf':'application/vnd.openxmlformats-officedocument.presentationml.presentation'});
    if(epoch.current===run)downloadLessonFile(output,`${pack.lesson_code}-${resourceName(pack.lesson_code,kind)}`);
   }
  } catch(e) {if(epoch.current===run)setError(e instanceof Error&&e.message==='School logo could not load.'?'Your school logo could not load. Ask your school administrator to check it, then retry.':'The download could not finish or verify. Please retry.');}
  finally {if(epoch.current===run){lock.current=false;setBusy('');}}
 }
 return <section aria-label="Approved teaching packs" className="lesson-library-content">
  {loading&&<p role="status">Opening approved teaching packs…</p>}
  {error&&<div role="alert" className="lesson-alert"><p>{error}</p><button type="button" className="sp-secondary" disabled={!!busy} onClick={()=>setRetry(n=>n+1)}>Retry teaching packs</button></div>}
  {!loading&&!error&&packs.length===0&&<p className="lesson-muted">No additional approved teaching packs are released for this school.</p>}
  {packs.map(pack=><IeltsTeacherDisclosure key={pack.object_path} title={`${pack.lesson_code} · ${pack.title}`} hint={packHint(pack)} marker="Available to teach" defaultExpanded={false}>
   <p className="lesson-muted">{pack.school.name}{!pack.school.logo_url&&' · School name branding; add a school logo in settings to include it.'}</p>
   {isMock(pack.lesson_code)
    ?<p>Full paper-based mock test: question papers, answer sheet, Listening recording with a timed control page, answer key, Speaking examiner script and feedback forms. Raw scores only; no band conversion. Version {pack.version}.</p>
    :<p>Light presentation, school-branded smart print materials, homework, targeted support, teacher guide and private keys. Version {pack.version}.</p>}
   {pack.lesson_code==='IELTS-03'&&<p>Includes the three approved recordings and offline audio players.</p>}
   {pack.lesson_code!=='IELTS-03'&&pack.lesson_code!=='IELTS-04'&&!isMock(pack.lesson_code)&&<p>The classroom presentation follows the workbook, reveals questions and answers on your clicks and plays any recordings from the slide. Recordings play from the complete pack; the single presentation file is for previewing.</p>}
   <div className="lesson-primary-actions">
    <button type="button" className="sp-primary" disabled={!!busy} onClick={()=>void download(pack,'zip')}>{busy===pack.lesson_code?'Preparing download…':'Download complete teacher pack'}</button>
    <button type="button" className="sp-secondary" disabled={!!busy} onClick={()=>void download(pack,'slides')}>{isMock(pack.lesson_code)?'Mock test control page':'Download light presentation'}</button>
    {!isMock(pack.lesson_code)&&<button type="button" className="sp-secondary" disabled={!!busy} onClick={()=>void download(pack,'pptx')}>Editable PowerPoint</button>}
    <button type="button" className="sp-secondary" disabled={!!busy} onClick={()=>void download(pack,'workbook')}>{isMock(pack.lesson_code)?'Answer sheet PDF':'Student workbook PDF'}</button>
   </div>
   <p className="lesson-muted">Teacher-only pack: keep scripts, keys and fresh follow-up checks private. Extract the ZIP and open 01-START-HERE.html for smart printing and audio. Classroom work does not automatically update Journey or estimate bands.</p>
  </IeltsTeacherDisclosure>)}
 </section>;
}
