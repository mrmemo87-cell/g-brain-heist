import React from 'react';
import { teacherProgrammeRoute, type TeacherProgrammeEntry } from '../../services/ieltsTeacherProgrammeEntry';
import './TeacherIeltsProgrammeShortcut.css';

export function IeltsProgrammeIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-2H4V4Zm16 0h-4a3 3 0 0 0-3 3m0 14a4 4 0 0 1 4-2h3V4M7 8h3M7 12h3m6-4h2m-2 4h2" /></svg>;
}

export default function TeacherIeltsProgrammeShortcut({ entry, failed, onRetry }: { entry: TeacherProgrammeEntry | null; failed: boolean; onRetry: () => void }) {
  if (failed) return <div className="teacher-ielts-shortcut teacher-ielts-shortcut--retry" role="status"><p>We could not check your IELTS allocation.</p><button type="button" onClick={onRetry}>Check IELTS access again</button></div>;
  if (!entry) return null;
  return <section className="teacher-ielts-shortcut" aria-labelledby="teacher-ielts-shortcut-title">
    <span className="teacher-ielts-shortcut__mark"><IeltsProgrammeIcon /></span>
    <div className="teacher-ielts-shortcut__copy"><span className="teacher-ielts-shortcut__eyebrow">Your school programme</span><h3 id="teacher-ielts-shortcut-title">IELTS Programme</h3><p>{entry.name} · You are the allocated programme lead.</p><p>Review student work, plan practice and guide the next step.</p></div>
    <a href={teacherProgrammeRoute(entry)}>Open IELTS Programme <span aria-hidden="true">→</span></a>
  </section>;
}
