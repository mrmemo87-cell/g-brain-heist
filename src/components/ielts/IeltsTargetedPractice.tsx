import IeltsMaterialProvenance from "./IeltsMaterialProvenance";
import { ieltsMaterialTitle } from "../../../services/ieltsMaterialCode";
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { learningWorkspace, type LearningAllocation } from '../../../services/ieltsLearningService';
import '../../styles/ielts-navigation.css';
const status = (task: LearningAllocation) => task.status === 'closed' ? 'Closed · saved work' : task.reviewed ? 'Teacher feedback ready' : task.status === 'submitted' ? 'Submitted · awaiting review' : task.status === 'in_progress' ? 'In progress' : 'Ready to start';
export function IeltsTargetedTaskCards({ tasks, compact = false }: { tasks: LearningAllocation[]; compact?: boolean }) {
  const ordered = [...tasks].sort((a,b) => Number(['submitted','closed'].includes(a.status)) - Number(['submitted','closed'].includes(b.status)));
  return <>
    {tasks.length === 0 ? <div className="it-task"><h3>No targeted tasks yet</h3><p>Your teacher can assign a short task based on your screener feedback. Your saved results are still in My Journey.</p><Link to="/ielts/journey">View your feedback →</Link></div> : <div className={compact ? 'it-next-grid' : 'it-list'}>
      {(compact ? ordered.slice(0,3) : ordered).map(task => <article className="it-task" key={task.id}>
        <div className="it-meta"><span>{task.skill[0].toUpperCase() + task.skill.slice(1)}</span><span className="it-status">{status(task)}</span></div>
        <h3>{ieltsMaterialTitle(task.display_code, task.title)}</h3><IeltsMaterialProvenance label={task.originality_label}/><p>{task.reason}</p>
        {task.due_at && Number.isFinite(Date.parse(task.due_at)) && <p>Due {new Date(task.due_at).toLocaleDateString(undefined,{dateStyle:'medium'})}</p>}
        <Link to={'/ielts/practice/targeted/' + task.id}>{task.status === 'closed' ? 'View saved work' : task.reviewed ? 'View teacher feedback' : task.status === 'submitted' ? 'View saved work' : task.status === 'in_progress' ? 'Continue task' : 'Start task'} →</Link>
      </article>)}
    </div>}
    {compact && <Link className="it-more" to="/ielts/practice/targeted">View all targeted practice{tasks.length ? ` (${tasks.length})` : ''} →</Link>}
  </>;
}
export default function IeltsTargetedPractice() {
  const [tasks,setTasks]=useState<LearningAllocation[]|null>(null),[error,setError]=useState(false),[retry,setRetry]=useState(0);
  useEffect(()=>{let active=true;setTasks(null);setError(false);learningWorkspace().then(w=>{if(active)setTasks(w.allocations);}).catch(()=>{if(active)setError(true);});return()=>{active=false;};},[retry]);
  return <section className="ij-panel" aria-labelledby="targeted-practice-heading"><div className="ij-section-heading"><div><p className="ij-eyebrow">Your next focused step</p><h2 id="targeted-practice-heading">Targeted Practice</h2><p>Short tasks your teacher chooses for you, with your saved work and feedback.</p></div></div>
    {error ? <div role="alert"><p>We could not check your targeted tasks. Your saved work is safe.</p><button className="ij-link" onClick={()=>setRetry(v=>v+1)}>Try targeted practice again</button></div> : tasks ? <IeltsTargetedTaskCards tasks={tasks} compact/> : <p role="status">Checking your targeted tasks…</p>}
  </section>;
}
