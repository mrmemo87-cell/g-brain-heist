import React, {useEffect,useRef,useState} from 'react';
import {unzipSync,strFromU8} from 'fflate';
import {approvedTeacherPacks,approvedTeacherPackBlob,type ApprovedTeacherPack} from '../../../services/ieltsApprovedTeacherPacks';
import {downloadLessonFile} from '../../../services/ieltsLessonResources';
import {packKind,packNumber,packSkill,courseWeek,groupBy,kindLabel,type PackKind} from './ieltsPackCatalogue';

type Resource='zip'|'slides'|'workbook'|'pptx';
const isMock=(code:string)=>packKind(code)==='mock';
const resourceName=(code:string,kind:Exclude<Resource,'zip'>)=>isMock(code)?(kind==='slides'?'Mock-Test-Control.html':'Answer-Sheet.pdf'):kind==='slides'?'Presentation.html':kind==='workbook'?'Workbook.pdf':'Editable.pptx';

/** Teacher library of released packs: course lessons by week, then optional extension lessons and mock tests. */
export default function IeltsApprovedTeacherPacks({schoolId}:{schoolId:string}) {
 const [packs,setPacks]=useState<ApprovedTeacherPack[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(''),[retry,setRetry]=useState(0);
 const [tab,setTab]=useState<PackKind>('course');
 const epoch=useRef(0),lock=useRef(false);
 useEffect(()=>{
  const run=++epoch.current; setPacks([]);setError('');setLoading(true);setBusy('');lock.current=false;setTab('course');
  approvedTeacherPacks(schoolId).then(p=>{if(epoch.current===run)setPacks(p);})
   .catch(()=>{if(epoch.current===run)setError('Teaching packs could not load. Check your programme access and retry.');})
   .finally(()=>{if(epoch.current===run)setLoading(false);});
  return ()=>{epoch.current++;};
 },[schoolId,retry]);
 async function download(pack:ApprovedTeacherPack,kind:Resource) {
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
 const byKind=(k:PackKind)=>packs.filter(p=>packKind(p.lesson_code)===k);
 const tabs=(['course','extension','mock'] as PackKind[]).filter(k=>byKind(k).length>0);
 const active:PackKind=tabs.includes(tab)?tab:(tabs[0]??'course');
 const shown=byKind(active);

 const row=(pack:ApprovedTeacherPack)=>{
  const mock=isMock(pack.lesson_code), working=busy===pack.lesson_code;
  return <article key={pack.object_path} className="pack-row" aria-label={`${pack.lesson_code} ${pack.title}`}>
   <span className="pack-num" aria-hidden="true">{packNumber(pack.lesson_code)}</span>
   <div className="pack-main">
    <h5>{pack.title}</h5>
    <p className="pack-meta"><span className="pack-chip">{packSkill(mock?'mock test':pack.title)}</span><span>{pack.lesson_code}</span><span>v{pack.version}</span></p>
   </div>
   <div className="pack-actions">
    <button type="button" className="sp-primary" disabled={!!busy} onClick={()=>void download(pack,'zip')}>{working?'Preparing…':mock?'Download mock test':'Download teacher pack'}</button>
    <details className="pack-more">
     <summary>Single files</summary>
     <div className="pack-more-menu">
      <button type="button" className="sp-secondary" disabled={!!busy} onClick={()=>void download(pack,'slides')}>{mock?'Control page preview (audio is in the full pack)':'Classroom presentation (HTML)'}</button>
      {!mock&&<button type="button" className="sp-secondary" disabled={!!busy} onClick={()=>void download(pack,'pptx')}>Editable PowerPoint</button>}
      <button type="button" className="sp-secondary" disabled={!!busy} onClick={()=>void download(pack,'workbook')}>{mock?'Answer sheet (PDF)':'Student workbook (PDF)'}</button>
     </div>
    </details>
   </div>
  </article>;
 };

 return <section aria-labelledby="pack-library-title" className="pack-library">
  <div className="pack-library-head">
   <h3 id="pack-library-title">Teaching packs</h3>
   {packs[0]&&<p className="lesson-muted">Branded for {packs[0].school.name}{!packs[0].school.logo_url&&' (add a school logo in settings to include it)'}. Each pack is a ZIP: open 01-START-HERE.html first. Keep keys, scripts and fresh checks private.</p>}
  </div>
  {loading&&<p role="status">Opening teaching packs…</p>}
  {error&&<div role="alert" className="lesson-alert"><p>{error}</p><button type="button" className="sp-secondary" disabled={!!busy} onClick={()=>setRetry(n=>n+1)}>Retry teaching packs</button></div>}
  {!loading&&!error&&packs.length===0&&<p className="lesson-muted">No approved teaching packs are released for this school yet.</p>}
  {tabs.length>1&&<div className="pack-tabs" role="group" aria-label="Pack type">
   {tabs.map(k=><button key={k} type="button" aria-pressed={active===k} className={active===k?'is-active':''} onClick={()=>setTab(k)}>{kindLabel[k]} <span>{byKind(k).length}</span></button>)}
  </div>}
  {active==='course'&&groupBy(shown,p=>courseWeek(p.lesson_code)).map(([week,list])=><section key={week} className="pack-week" aria-label={`Week ${week}`}>
   <h4 className="pack-week-title">Week {week}</h4>
   <div className="pack-list">{list.map(row)}</div>
  </section>)}
  {active==='extension'&&<>
   <p className="lesson-muted">Optional 60-minute lessons outside the 24-lesson course, for task types learners need extra practice with.</p>
   <div className="pack-list">{shown.map(row)}</div>
  </>}
  {active==='mock'&&<>
   <p className="lesson-muted">Full paper-based Academic tests with recordings and a timed control page. Results are raw scores and criterion feedback; there is no band conversion.</p>
   <div className="pack-list">{shown.map(row)}</div>
  </>}
 </section>;
}
