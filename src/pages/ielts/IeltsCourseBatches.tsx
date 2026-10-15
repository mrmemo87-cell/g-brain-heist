import React, { useEffect, useRef, useState } from 'react';
import { IeltsButton, IeltsNotice } from '../../components/ielts/IeltsUi';
import { ieltsBatches, ieltsBatchRoster, saveIeltsBatch, type IeltsBatch, type IeltsBatchRoster } from '../../../services/ieltsBatchService';
export default function IeltsCourseBatches({schoolId,onAssign}:{schoolId:string;onAssign:()=>void}) {
 const [batches,setBatches]=useState<IeltsBatch[]>([]),[roster,setRoster]=useState<IeltsBatchRoster|null>(null);
 const [name,setName]=useState(''),[selected,setSelected]=useState<string[]>([]),[search,setSearch]=useState(''),[applied,setApplied]=useState(''),[offset,setOffset]=useState(0);
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[revision,setRevision]=useState(0);
 const lock=useRef(false),request=useRef(0);
 useEffect(()=>{let alive=true;setLoading(true);setError('');ieltsBatches(schoolId).then(x=>{if(alive)setBatches(x);}).catch(()=>{if(alive)setError('Course batches could not load. Refresh to try again.');}).finally(()=>{if(alive)setLoading(false);});return()=>{alive=false;};},[schoolId,revision]);
 useEffect(()=>()=>{request.current++;},[schoolId]);
 const open=async(id:string,term='',page=0,keepSelection=false)=>{
  const key=++request.current;setLoading(true);setError('');
  try{const r=await ieltsBatchRoster(id,term,page);if(key!==request.current)return;if(keepSelection&&r.revision!==roster?.revision)throw Error("roster_changed");setRoster(r);if(!keepSelection){setName(r.name);setSelected(r.members.map(x=>x.id));setSearch('');setApplied('');setOffset(0);}}
  catch{if(key===request.current)setError('The roster could not open. Refresh before changing this batch.');}finally{if(key===request.current)setLoading(false);}
 };
 const save=async()=>{
  if(lock.current||!name.trim())return;lock.current=true;setSaving(true);setError('');setMessage('');
  try{const id=await saveIeltsBatch(schoolId,name.trim(),roster?selected:[],roster?.id,roster?.revision);setRevision(n=>n+1);await open(id);setMessage(roster?'Batch updated. Choose catch-up work separately for new members.':'Batch created. Add the students taking this course.');}
  catch{setError('The batch could not be saved. Keep your selections, then reopen the latest roster before retrying. Another teacher may have changed it.');}
  finally{lock.current=false;setSaving(false);}
 };
 return <section className="ix-workspace" aria-label="IELTS course batches">
  <header className="ix-header"><div><p className="ix-eyebrow">One course · Different classes</p><h2>Course batches</h2><p className="ix-muted">Bring your IELTS students together for shared assignments and individual follow-up.</p></div><IeltsButton disabled={loading||saving} onClick={()=>{request.current++;setRoster(null);setName('');setSelected([]);setMessage('');setError('');}}>New batch</IeltsButton></header>
  {error&&<IeltsNotice error>{error}<IeltsButton disabled={saving} onClick={()=>roster?void open(roster.id):setRevision(n=>n+1)}>Refresh batches</IeltsButton></IeltsNotice>}
  {message&&<p role="status">{message}</p>}{loading&&<p role="status">Loading batches…</p>}
  {!roster&&<><div className="ix-list">{batches.map(b=><article className="ix-row" key={b.id}><div className="ix-header"><div><h3>{b.name}</h3><p>{b.student_count} students · {b.eligible_count} currently eligible</p></div><IeltsButton disabled={loading||saving} onClick={()=>void open(b.id)}>Manage roster</IeltsButton></div></article>)}</div><div className="ix-panel"><h3>Create a course batch</h3><label className="ix-field">Batch name<input maxLength={80} value={name} onChange={e=>setName(e.target.value)} placeholder="IELTS · October 2026" disabled={saving}/></label><IeltsButton variant="primary" disabled={saving||loading||!name.trim()} onClick={()=>void save()}>{saving?'Saving…':'Create batch'}</IeltsButton></div></>}
  {roster&&<div className="ix-panel"><div className="ix-header"><div><h3>{roster.name}</h3><p>{selected.length} selected · Regular school classes stay in place.</p></div><IeltsButton disabled={saving} onClick={()=>{request.current++;setRoster(null);setName('');setLoading(false);}}>Back to batches</IeltsButton></div>
   <fieldset disabled={saving||loading} style={{border:0,padding:0,margin:0}} className="ix-list"><label className="ix-field">Batch name<input maxLength={80} value={name} onChange={e=>setName(e.target.value)}/></label>
   <details open><summary>Current members · {roster.members.length}</summary><div className="ix-list">{roster.members.map(s=><label key={s.id} className="ix-check"><input type="checkbox" checked={selected.includes(s.id)} onChange={e=>setSelected(x=>e.target.checked?[...x,s.id]:x.filter(id=>id!==s.id))}/><span><strong>{s.name}</strong> · {s.class_name??'Class unavailable'}{s.username!==s.name&&<small> · {s.username}</small>}{!s.eligible&&<p className="ix-muted">Access needs checking before assigning new work.</p>}</span></label>)}</div>{!roster.members.length&&<p>No students yet. Choose eligible students below.</p>}</details>
   <form className="ix-fields" onSubmit={e=>{e.preventDefault();setApplied(search.trim());setOffset(0);void open(roster.id,search.trim(),0,true);}}><label className="ix-field">Find eligible students<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Name, username or school class"/></label><IeltsButton type="submit">Search students</IeltsButton></form>
   <div className="ix-list">{roster.candidates.slice(0,50).filter(s=>!roster.members.some(m=>m.id===s.id)).map(s=><label className="ix-check" key={s.id}><input type="checkbox" checked={selected.includes(s.id)} onChange={e=>setSelected(x=>e.target.checked?[...x,s.id]:x.filter(id=>id!==s.id))}/><span><strong>{s.name}</strong> · {s.class_name??'Class unavailable'}{s.username!==s.name&&<small> · {s.username}</small>}</span></label>)}</div>
   <div className="ix-actions"><IeltsButton disabled={!offset} onClick={()=>{setOffset(offset-50);void open(roster.id,applied,offset-50,true);}}>Previous students</IeltsButton><IeltsButton disabled={!roster.has_more} onClick={()=>{setOffset(offset+50);void open(roster.id,applied,offset+50,true);}}>Next students</IeltsButton></div>
   <p className="ix-muted">Only students with active school IELTS access appear. Removing someone from the batch keeps their existing work and results.</p>
   <IeltsButton variant="primary" disabled={!name.trim()||selected.length>500} onClick={()=>void save()}>{saving?'Saving…':'Save roster'}</IeltsButton></fieldset>
   <IeltsNotice>New members receive future assignments when you assign them. For earlier work, open an active assignment and choose Add batch members. Completed work is retained.</IeltsNotice><IeltsButton disabled={saving} onClick={onAssign}>Open school assignments →</IeltsButton>
  </div>}
 </section>;
}
