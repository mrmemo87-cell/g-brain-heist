import React from 'react';

export type TeacherWorkspaceIconName = 'home' | 'classes' | 'assignments' | 'reports' | 'profiles' | 'curriculum' | 'interventions' | 'questions' | 'writing' | 'cambridge' | 'battle' | 'more';
const paths: Record<TeacherWorkspaceIconName, React.ReactNode> = {
  home: <><path d="m3 10 9-7 9 7v11h-6v-7H9v7H3z"/></>,
  classes: <><path d="M3 21V7h18v14M8 7V3h8v4M2 21h20M9 21v-6h6v6M7 10h1m8 0h1"/></>,
  assignments: <><path d="M8 5H5v16h14V5h-3M8 3h8v4H8zM8 11h8M8 15h8"/></>,
  reports: <><path d="M4 3v18h17M8 17v-5m5 5V7m5 10V4"/></>,
  profiles: <><circle cx="12" cy="7" r="4"/><path d="M4 21v-3a8 8 0 0 1 16 0v3"/></>,
  curriculum: <><circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/></>,
  interventions: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></>,
  questions: <><path d="M12 5v16M3 4c4-1 6 0 9 1 3-1 5-2 9-1v16c-4-1-6 0-9 1-3-1-5-2-9-1z"/></>,
  writing: <><path d="m14 4 6 6M4 20l4-1L21 6l-4-4L4 15z"/></>,
  cambridge: <><path d="M5 3h14v18H5zM8 7h8m-8 4h5m-5 5 2 2 5-5"/></>,
  battle: <><path d="m4 3 11 11-3 3L3 6V3zM20 3l-7 7m-3 4-5 7m12-8 4 7M3 17l4 4m10-4 4 4"/></>,
  more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
};
export function teacherMobileLabel(id: string, label: string): string {
  return id === 'dashboard' ? 'Home' : id === 'students' ? 'Classes' : label;
}
export default function TeacherWorkspaceIcon({ name }: { name: TeacherWorkspaceIconName }) {
  return <svg className="teacher-workspace-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name]}</svg>;
}
