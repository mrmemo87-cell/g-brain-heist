import React, { Suspense, useEffect, useState } from 'react';
import type { Profile, TeacherAssignmentSummary } from '../types';
import * as GameService from '../services/gameService';
import * as SchoolAdminService from '../services/schoolAdminService';

const FullTeacherPortal = React.lazy(() => import('./TeacherPortal'));

type TeacherStartView =
  | 'students'
  | 'question-bank'
  | 'assignments'
  | 'reports'
  | 'writing-monitoring'
  | 'cambridge-reports'
  | 'quest-builder';

interface TeacherDashboardEntryProps {
  profile: Profile;
  onComplete: () => void;
  onLogout?: () => void;
  onLockdown?: () => void;
  isSchoolAdmin?: boolean;
  onOpenSchoolAdmin?: () => void;
  onOpenAdmissions?: () => void;
}

interface DashboardCounts {
  classes: number;
  students: number;
  assignments: number;
  completed: number;
}

const EMPTY_COUNTS: DashboardCounts = {
  classes: 0,
  students: 0,
  assignments: 0,
  completed: 0,
};

export default function TeacherDashboardEntry(props: TeacherDashboardEntryProps) {
  const [openView, setOpenView] = useState<TeacherStartView | null>(null);
  const [counts, setCounts] = useState(EMPTY_COUNTS);

  useEffect(() => {
    let active = true;

    void Promise.allSettled([
      SchoolAdminService.getTeacherAssignedClasses(),
      GameService.get_students_for_assignment(),
      GameService.get_teacher_assignments(),
    ]).then(([classesResult, studentsResult, assignmentsResult]) => {
      if (!active) return;
      const assignments: TeacherAssignmentSummary[] =
        assignmentsResult.status === 'fulfilled' ? assignmentsResult.value : [];
      setCounts({
        classes: classesResult.status === 'fulfilled' ? classesResult.value.length : 0,
        students: studentsResult.status === 'fulfilled' ? studentsResult.value.length : 0,
        assignments: assignments.length,
        completed: assignments.reduce((total, item) => total + (item.completed_count || 0), 0),
      });
    });

    return () => {
      active = false;
    };
  }, []);

  if (openView) {
    return (
      <Suspense
        fallback={
          <main className="min-h-screen bg-slate-950 p-6 text-white">
            <div className="mx-auto max-w-6xl animate-pulse rounded-2xl border border-cyan-400/20 bg-slate-900 p-8">
              Opening workspace…
            </div>
          </main>
        }
      >
        <FullTeacherPortal {...props} initialView={openView} />
      </Suspense>
    );
  }

  const cards: Array<{
    label: string;
    value: number | string;
    detail: string;
    icon: string;
    view: TeacherStartView;
  }> = [
    { label: 'My classes', value: counts.classes, detail: 'View assigned classes and students', icon: '🏫', view: 'students' },
    { label: 'Given assignments', value: counts.assignments, detail: `${counts.completed} student completions`, icon: '📋', view: 'assignments' },
    { label: 'Student responses', value: counts.students, detail: 'Review student progress', icon: '💬', view: 'reports' },
    { label: 'Question bank', value: 'Open', detail: 'Create and organise questions', icon: '🧠', view: 'question-bank' },
  ];

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-white sm:px-6">
      <section className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img
              src={props.profile.avatar_url || '/BRAINS.svg'}
              alt=""
              className="h-12 w-12 rounded-full border border-cyan-400/50 object-cover"
            />
            <div>
              <p className="text-sm text-cyan-300">Teacher dashboard</p>
              <h1 className="text-2xl font-bold">{props.profile.username}</h1>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {props.isSchoolAdmin && props.onOpenSchoolAdmin && (
              <button type="button" onClick={props.onOpenSchoolAdmin} className="rounded-lg border border-cyan-400/50 px-4 py-2 text-sm">
                School admin
              </button>
            )}
            {props.onLogout && (
              <button type="button" onClick={props.onLogout} className="rounded-lg border border-white/20 px-4 py-2 text-sm">
                Sign out
              </button>
            )}
          </div>
        </header>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((card) => (
            <button
              key={card.label}
              type="button"
              onClick={() => setOpenView(card.view)}
              className="rounded-2xl border border-white/10 bg-slate-900 p-5 text-left transition hover:-translate-y-0.5 hover:border-cyan-400/60 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-400"
            >
              <span className="text-2xl" aria-hidden="true">{card.icon}</span>
              <span className="mt-4 block text-xs font-semibold uppercase tracking-wider text-cyan-300">{card.label}</span>
              <strong className="mt-1 block text-3xl">{card.value}</strong>
              <span className="mt-2 block text-sm text-slate-300">{card.detail}</span>
            </button>
          ))}
        </div>

        <nav className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Teacher tools">
          <button type="button" onClick={() => setOpenView('writing-monitoring')} className="rounded-xl border border-white/10 bg-slate-900/70 px-4 py-3 text-left hover:border-cyan-400/50">
            ✍️ Writing
          </button>
          <button type="button" onClick={() => setOpenView('cambridge-reports')} className="rounded-xl border border-white/10 bg-slate-900/70 px-4 py-3 text-left hover:border-cyan-400/50">
            📊 Cambridge reports
          </button>
          <button type="button" onClick={() => setOpenView('quest-builder')} className="rounded-xl border border-white/10 bg-slate-900/70 px-4 py-3 text-left hover:border-cyan-400/50">
            🚀 Quest builder
          </button>
          {props.onLockdown && (
            <button type="button" onClick={props.onLockdown} className="rounded-xl border border-white/10 bg-slate-900/70 px-4 py-3 text-left hover:border-cyan-400/50">
              🔒 Lockdown
            </button>
          )}
        </nav>
      </section>
    </main>
  );
}
