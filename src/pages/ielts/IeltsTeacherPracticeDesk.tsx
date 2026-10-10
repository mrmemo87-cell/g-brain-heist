import { ieltsMaterialTitle } from "../../../services/ieltsMaterialCode";
import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { teacherPracticeHistory, practiceWorkLabel, type PracticeHistoryRow } from '../../../services/ieltsTeacherPracticeService';
import '../../styles/ielts-learning.css';
const Targeted = React.lazy(() => import('./IeltsLearningTeacher'));
const SchoolAssignments = React.lazy(() => import('../../../components/school-admin/tabs/IeltsPracticeTab'));
const date = (value: string | null) => value ? new Date(value).toLocaleDateString(undefined, {day:'numeric',month:'short',year:'numeric'}) : '—';
export default function IeltsTeacherPracticeDesk({schoolId,onOpenReviews}: {schoolId:string;onOpenReviews:()=>void}) {
  const [query,setQuery] = useState(() => window.location.search);
  const params = new URLSearchParams(query);
  useEffect(() => {
    const restore = () => setQuery(window.location.search);
    window.addEventListener('popstate',restore);
    return () => window.removeEventListener('popstate',restore);
  }, []);
  const mode = params.get('practice') === 'school' ? 'school' : params.get('practice') === 'targeted' ? 'targeted' : 'history';
  const candidate = params.get('assignment');
  const assignment = candidate && /^[\w-]{1,128}$/.test(candidate) ? candidate : undefined;
  const setMode = (next: 'history'|'targeted'|'school', id?: string) => {
    const updated = new URLSearchParams(window.location.search);
    if (next === 'history') updated.delete('practice'); else updated.set('practice', next);
    if (next === 'school' && id) updated.set('assignment', id); else updated.delete('assignment');
    const search = updated.size ? `?${updated}` : '';
    window.history.pushState(window.history.state, '', window.location.pathname + search + window.location.hash);
    setQuery(search);
  };
  const [rows,setRows] = useState<PracticeHistoryRow[]>([]), [more,setMore] = useState(false);
  const [search,setSearch] = useState(''), [applied,setApplied] = useState('');
  const [skill,setSkill] = useState(''), [kind,setKind] = useState(''), [status,setStatus] = useState('');
  const [offset,setOffset] = useState(0), [retry,setRetry] = useState(0), [loading,setLoading] = useState(true), [error,setError] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (mode !== 'history') return;
    let active = true; setRows([]); setMore(false); setLoading(true); setError('');
    teacherPracticeHistory(schoolId,{search:applied,skill,kind,status,offset}).then(d=>{if(active){setRows(d.rows);setMore(d.has_more);}})
      .catch(()=>{if(active)setError('Practice history could not load. Your assignments are safe. Retry when your connection is ready.');})
      .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[schoolId,mode,applied,skill,kind,status,offset,retry]);
  useEffect(() => {
    if (mode !== 'history') return;
    const refresh=()=>setRetry(n=>n+1);
    window.addEventListener('focus',refresh);
    return()=>window.removeEventListener('focus',refresh);
  }, [mode]);
  const openSchool = (id?:string) => setMode('school',id);
  return <div className="il-shell il-desk">
    <p className="il-eyebrow">TEACHER · PRACTICE DESK</p>
    <h2 ref={heading} tabIndex={-1}>The right task. The clear next step.</h2>
    <p>See what students have received, follow their work and choose what to give next.</p>
    <nav className="il-desk-nav" aria-label="Teacher practice tools">
      <button aria-pressed={mode==='history'} onClick={()=>setMode('history')}>Practice history</button>
      <button aria-pressed={mode==='targeted'} onClick={()=>setMode('targeted')}>Assign targeted practice</button>
      <button aria-pressed={mode==='school'} onClick={()=>openSchool()}>School assignments</button>
    </nav>
    {mode==='history' ? <section className="il-card">
      <h3>Every assignment, in one place</h3>
      <p className="il-muted">Work status and teacher feedback are separate. Completing or repeating a task does not establish improvement.</p>
      <form className="il-history-filters" onSubmit={e=>{e.preventDefault();setOffset(0);setApplied(search.trim());}}>
        <label className="il-answer">Student, class, title or task code<input maxLength={120} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search, e.g. L-002" /></label>
        <label className="il-answer">Skill<select value={skill} onChange={e=>{setSkill(e.target.value);setOffset(0);}}><option value="">All skills</option>{['listening','reading','writing','speaking'].map(s=><option key={s} value={s}>{s[0]?.toUpperCase()}{s.slice(1)}</option>)}</select></label>
        <label className="il-answer">Type<select value={kind} onChange={e=>{setKind(e.target.value);setOffset(0);}}><option value="">Both types</option><option value="targeted">Targeted practice</option><option value="school">School assignment</option></select></label>
        <label className="il-answer">Status<select value={status} onChange={e=>{setStatus(e.target.value);setOffset(0);}}><option value="">All statuses</option>{[['assigned','Not started'],['in_progress','In progress'],['submitted','Submitted'],['completed','Completed'],['shared','Feedback shared'],['overdue','Overdue'],['closed','Closed'],['archived','Archived']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
        <button type="submit">Search</button>
      </form>
      <div className="il-history-toolbar"><span>{loading?'Loading history…':`Showing ${rows.length} record${rows.length===1?'':'s'}${offset?` · page ${offset/50+1}`:''}`}</span><button disabled={loading} onClick={()=>setRetry(n=>n+1)}>Refresh history</button></div>
      {error && <p role="alert">{error}</p>}
      {!loading && !error && !rows.length && <p>No assignments match these filters. Choose another filter or assign the next task.</p>}
      {loading && <p role="status">Gathering assignment history…</p>}
      <div className="il-history-list">{rows.map(r=><article className="il-history-row" key={r.row_id}>
        <div><p className="il-eyebrow">{r.skill} · {r.kind==='targeted'?'Targeted practice':'School assignment'}</p><h4>{ieltsMaterialTitle(r.display_code, r.title)}</h4><p><strong>{r.student_name || 'Student'}</strong>{r.class_name?` · ${r.class_name}`:''}</p>{r.kind==='school' && <p className="il-muted">{r.assignment_title}</p>}<p className="il-muted">Assigned {date(r.assigned_at)}{r.due_at?` · Due ${date(r.due_at)}`:''}</p></div>
        <div className="il-history-state"><span className="il-history-badge">{practiceWorkLabel(r)}</span>{['closed','archived'].includes(r.assignment_status) && <span className="il-history-badge">Assignment {r.assignment_status}</span>}
          <p>{r.due_at && new Date(r.due_at).getTime()<Date.now() && ["assigned","in_progress"].includes(r.status) && !["closed","archived"].includes(r.assignment_status) && <span className="il-history-badge">Overdue</span>}</p>
          <p>{r.feedback_status==='shared'?`Feedback shared · ${date(r.feedback_at)}`:r.feedback_status==='pending'?'Teacher review needed':r.feedback_status==='not_tracked'?'Check feedback in practice reviews':'Feedback after submission'}</p>
          {r.kind==='targeted'?<Link to={'/ielts/practice/targeted/'+r.assignment_id}>{r.feedback_status==='pending'?'Review saved work':'Open saved assignment'} →</Link>:<button onClick={()=>openSchool(r.assignment_id)}>Open assignment progress →</button>}
        </div>
      </article>)}</div>
      <div className="il-history-toolbar" aria-label="History pages"><button disabled={loading||offset===0} onClick={()=>setOffset(n=>Math.max(0,n-50))}>Previous</button><button disabled={loading||!more} onClick={()=>setOffset(n=>n+50)}>Next</button></div>
    </section> : <React.Suspense fallback={<p role="status">Opening assignment tools…</p>}>
      {mode==='targeted'?<Targeted schoolId={schoolId}/>:<SchoolAssignments key={schoolId+':'+(assignment??'new')} initialAssignmentId={assignment} onOpenReviews={onOpenReviews}/>}
    </React.Suspense>}
  </div>;
}
