import IeltsBatchCourseMaterials,{type CoursePreset} from './IeltsBatchCourseMaterials';
import IeltsBatchLearningLoop,{type PreparedAssignment} from './IeltsBatchLearningLoop';
import IeltsMockCapture from './IeltsMockCapture';
import IeltsBatchPracticeEffect from './IeltsBatchPracticeEffect';
import IeltsBatchSkillCoverage from './IeltsBatchSkillCoverage';
import {groupBySkill} from './materialLabel';
import React, {useEffect,useRef,useState} from 'react';
import {batchPracticePreview,assignBatchPractice,type BatchPracticePreview} from '../../../services/ieltsBatchService';
import {programmeEvidenceRoute} from '../../../services/ieltsProgrammeService';
import {IeltsButton,IeltsNotice} from '../../components/ielts/IeltsUi';
import {IeltsEmailOptions,IeltsEmailStatusLine} from '../../components/ielts/IeltsEmailControls';
import {notifyIeltsStudents,type IeltsEmailQueued} from '../../../services/ieltsEmailService';
export default function IeltsBatchPractice({batchId,onClose}:{batchId:string;onClose:()=>void}){
 const [mode,setMode]=useState<'loop'|'effect'|'coverage'|'targeted'|'course'|'mocks'>('loop');
 const [coursePreset,setCoursePreset]=useState<CoursePreset|null>(null);
 const pending=useRef<string[]|null>(null);
 const [data,setData]=useState<BatchPracticePreview|null>(null),[task,setTask]=useState(''),[selected,setSelected]=useState<string[]>([]);
 const [reason,setReason]=useState(''),[due,setDue]=useState(''),[reviewed,setReviewed]=useState(false),[repeat,setRepeat]=useState(false);
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[refresh,setRefresh]=useState(0);
 const lock=useRef(false),request=useRef(crypto.randomUUID());
 const [emailOn,setEmailOn]=useState(true),[remindOn,setRemindOn]=useState(true),[emailQueued,setEmailQueued]=useState<IeltsEmailQueued|null>(null),[emailError,setEmailError]=useState('');
 useEffect(()=>{let alive=true;setLoading(true);setData(null);setSelected([]);setReviewed(false);setRepeat(false);setError('');
  batchPracticePreview(batchId,task||null).then(d=>{if(!alive)return;setData(d);const wanted=pending.current;pending.current=null;
   if(wanted){const m=d.tasks.find(t=>t.code===task);setSelected(d.students.filter(s=>wanted.includes(s.id)&&s.eligible&&s.source_ready&&!s.active&&!(m?.purpose==='independent_check'&&s.prior_count>0)).map(s=>s.id));}}).catch(()=>{if(alive)setError('Practice could not load. Refresh to check the latest batch and available materials.');}).finally(()=>{if(alive)setLoading(false);});return()=>{alive=false;};
 },[batchId,task,refresh]);
 const material=data?.tasks.find(t=>t.code===task);
 const ready=(s:BatchPracticePreview['students'][number])=>s.eligible&&s.source_ready&&!s.active&&!(material?.purpose==='independent_check'&&s.prior_count>0);
 const readyStudents=data?.students.filter(ready)??[];
 const repeating=data?.students.some(s=>selected.includes(s.id)&&s.prior_count>0)??false;
 const prepare=(p:PreparedAssignment)=>{if(p.material){setCoursePreset({material:p.material,students:p.students,reason:p.reason});setMode('course');return;}pending.current=p.students;setReason(p.reason);setMessage('');request.current=crypto.randomUUID();setTask(p.task);setRefresh(n=>n+1);setMode('targeted');};
 const save=async()=>{
  if(lock.current||!data||!material||!reviewed||reason.trim().length<10||!selected.length||(repeating&&!repeat))return;
  lock.current=true;setSaving(true);setError('');setMessage('');
  setEmailQueued(null);setEmailError('');try{const result=await assignBatchPractice(batchId,data.batch.revision,task,selected,reason.trim(),due?new Date(due).toISOString():null,request.current,repeat,reviewed);setMessage(`Assigned to ${result.assigned_count} students. Each student has their own saved task and progress.`);request.current=crypto.randomUUID();setRefresh(n=>n+1);
   if(emailOn&&result.allocation_ids?.length)notifyIeltsStudents('targeted_assigned',result.allocation_ids,Boolean(due)&&remindOn).then(setEmailQueued).catch(()=>setEmailError('The task is assigned, but the email could not be queued. Students will still see it on their IELTS home.'));}
  catch{setError('Assignment could not be confirmed. Refresh the preview and check practice history before retrying. Source reviews, existing work and fresh-check exposure are checked again when assigning.');}
  finally{lock.current=false;setSaving(false);}
 };
 return <section className="ix-panel" aria-label="Assign batch practice"><header className="ix-header"><div><p className="ix-eyebrow">Released practice · Four skills</p><h2>Assign tasks to {data?.batch.name??'your batch'}</h2></div><IeltsButton disabled={saving} onClick={onClose}>Back to batches</IeltsButton></header>
<div className="ix-actions"><IeltsButton disabled={saving} aria-pressed={mode==='loop'} onClick={()=>setMode('loop')}>This week</IeltsButton><IeltsButton disabled={saving} aria-pressed={mode==='effect'} onClick={()=>setMode('effect')}>Did it work?</IeltsButton><IeltsButton disabled={saving} aria-pressed={mode==='coverage'} onClick={()=>setMode('coverage')}>Skill coverage</IeltsButton><IeltsButton disabled={saving} aria-pressed={mode==='targeted'} onClick={()=>setMode('targeted')}>Targeted practice</IeltsButton><IeltsButton disabled={saving} aria-pressed={mode==='mocks'} onClick={()=>setMode('mocks')}>Mock results</IeltsButton><IeltsButton disabled={saving} aria-pressed={mode==='course'} onClick={()=>{setCoursePreset(null);setMode('course');}}>Course materials</IeltsButton></div>
 {mode==='loop'?<IeltsBatchLearningLoop batchId={batchId} onPrepare={prepare}/>:mode==='effect'?<IeltsBatchPracticeEffect batchId={batchId} onPrepare={prepare}/>:mode==='coverage'?<IeltsBatchSkillCoverage batchId={batchId}/>:mode==='mocks'?<IeltsMockCapture batchId={batchId}/>:mode==='course'?<IeltsBatchCourseMaterials batchId={batchId} onBusyChange={setSaving} preset={coursePreset}/>:<>
 <IeltsNotice>Practice only. Screeners stay in initial assessments and are excluded from this material list.</IeltsNotice>
 {message&&<p role="status">{message}</p>}<IeltsEmailStatusLine queued={emailQueued} error={emailError}/>{error&&<IeltsNotice error>{error}</IeltsNotice>}{loading&&<p role="status">Checking materials and student readiness…</p>}
 <IeltsButton disabled={saving||loading} onClick={()=>setRefresh(n=>n+1)}>Refresh preview</IeltsButton>
 {data&&<fieldset disabled={saving||loading} className="ix-list" style={{border:0,padding:0,margin:0}}>
 <label className="ix-field">Practice material<select value={task} onChange={e=>{setTask(e.target.value);setData(null);setSelected([]);setReviewed(false);setRepeat(false);setMessage('');request.current=crypto.randomUUID();}}><option value="">Choose a released practice task</option>{groupBySkill(data.tasks).map(g=><optgroup key={g.skill} label={`${g.label} (${g.items.length})`}>{g.items.map(t=><option key={t.code} value={t.code}>{t.display_code} · {t.title} · {t.purpose==='guided_practice'?'Practice':'Fresh check'}</option>)}</optgroup>)}</select></label>
 {!data.tasks.length&&<p>No released practice is available. Ask the content administrator to finish review; screeners cannot be substituted.</p>}
 {material&&<><article className="ix-row"><h3>{material.display_code} · {material.title}</h3><p>{material.instructions}</p><p><strong>Success looks like:</strong> {material.success_description}</p><p className="ix-muted">{material.purpose==='guided_practice'?'Guided practice supports learning.':'Fresh checks require unseen material and are checked again for related prior exposure.'} Completing this task does not establish a band or improvement.</p></article>
 <div className="ix-header"><h3>Choose students · {readyStudents.length} of {data.students.length} ready</h3><IeltsButton disabled={!readyStudents.length} onClick={()=>{setSelected(readyStudents.map(s=>s.id));setReviewed(false);}}>Select all ready students</IeltsButton><IeltsButton onClick={()=>{setSelected([]);setReviewed(false);}}>Clear selection</IeltsButton></div>
 <div className="ix-list">{data.students.map(s=>{const available=ready(s),route=s.source_id?programmeEvidenceRoute(material.skill,{attempt_id:s.source_id}):null;return <article className="ix-row" key={s.id}><label className="ix-check"><input type="checkbox" disabled={!available} checked={selected.includes(s.id)} onChange={e=>{setSelected(ids=>e.target.checked?[...ids,s.id]:ids.filter(id=>id!==s.id));setReviewed(false);}}/><span><strong>{s.name}</strong> · {s.class_name}<p>{!s.eligible?'IELTS access needs checking':s.active?'Already assigned · continue existing work':!s.source_ready?'Initial assessment or teacher review needed':!available?'Already exposed · choose another fresh check':s.prior_count?'Previously used · intentional repeat required':'Ready for selection'}</p></span></label>{route&&<a className="ix-button ix-button--secondary" href={route} target="_blank" rel="noreferrer">View starting evidence</a>}</article>;})}</div>
 <label className="ix-field">Why this task? <span className="ix-muted">Students see this message with the task.</span><textarea value={reason} maxLength={1200} onChange={e=>setReason(e.target.value)} placeholder="Write it to the students, e.g. “Practise listening for the final answer after a speaker changes their mind.”"/></label><label className="ix-field">Due date (optional)<input type="datetime-local" value={due} onChange={e=>setDue(e.target.value)}/></label>
 <IeltsEmailOptions email={emailOn} onEmail={setEmailOn} remind={remindOn} onRemind={setRemindOn} hasDue={Boolean(due)}/>
 {repeating&&<label className="ix-check"><input type="checkbox" checked={repeat} onChange={e=>setRepeat(e.target.checked)}/><span>I checked previous use and intend this repeat for guided practice.</span></label>}
 <label className="ix-check"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/><span>I reviewed the selected students’ starting evidence and chose this task for their learning needs.</span></label>
 <IeltsButton variant="primary" disabled={!reviewed||!selected.length||reason.trim().length<10||(repeating&&!repeat)} onClick={()=>void save()}>{saving?'Assigning…':`Confirm & assign to ${selected.length} students`}</IeltsButton><p className="ix-muted">Every selected student is checked. If anyone no longer qualifies, no partial batch is silently assigned. Existing student work remains intact.</p>
 </>}
 </fieldset>}
 </>}</section>;
}
