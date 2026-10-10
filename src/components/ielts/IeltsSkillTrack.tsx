import React from 'react';
import type { IeltsSkillProgress } from '../../../services/ieltsDashboardService';
import { IeltsButton } from './IeltsUi';

export default function IeltsSkillTrack({ label, benefit, progress, locked, onNavigate, onUnlock }: {
  label: string; benefit: string; progress: IeltsSkillProgress; locked: boolean;
  onNavigate: (route: string) => void; onUnlock: () => void;
}) {
  const destination = progress.nextUnfinishedTaskRoute || (progress.allTasksCompleted ? '/ielts/journey' : null);
  const percent = progress.totalAvailableTasks ? Math.min(100, Math.round(100 * progress.completedTaskCount / progress.totalAvailableTasks)) : 0;
  return <article data-prime-skill className="ix-skill-track">
    <div className="ix-header"><h3>{label}</h3><span className="ix-status">{locked ? 'Prime required' : progress.allTasksCompleted ? 'Completed' : progress.totalAvailableTasks ? 'Available' : 'No tasks available'}</span></div>
    <p className="ix-muted">{benefit}</p><p>{progress.completedTaskCount} / {progress.totalAvailableTasks} completed</p>
    <progress value={percent} max={100} aria-label={`${label} task completion`} />
    <IeltsButton disabled={!locked && !destination} onClick={() => locked ? onUnlock() : destination && onNavigate(destination)}>
      {locked ? 'Explore IELTS Prime' : progress.allTasksCompleted ? 'View progress & feedback' : progress.buttonLabel}
    </IeltsButton>
    {!locked && !destination && <p className="ix-muted">No further practice is available in this track yet.</p>}
  </article>;
}
