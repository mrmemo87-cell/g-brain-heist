import React from 'react';
import { useSchoolAdmin } from '../SchoolAdminContext';

const IeltsExamsTab: React.FC = () => {
  const { school } = useSchoolAdmin();

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-br from-slate-900/95 to-blue-950/90 rounded-2xl border border-blue-500/30 p-6 shadow-xl">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-blue-300">IELTS Academy</p>
            <h3 className="mt-2 text-2xl font-bold text-white">IELTS Exams</h3>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-blue-100/80">
              Create and monitor controlled IELTS mock exams for {school?.name ?? 'this school'} using the secure Exam Mode manager.
              Exam content, assignments, timers, autosaves, and emergency controls remain school-scoped.
            </p>
          </div>
          <a
            href="/ielts/exams/manage"
            className="inline-flex items-center justify-center rounded-xl bg-blue-500 px-5 py-3 font-semibold text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-300"
          >
            Open IELTS Exam Manager
          </a>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-700/60 bg-gray-900/70 p-5 text-sm text-gray-300">
        <h4 className="text-lg font-semibold text-white">Available now</h4>
        <p className="mt-2">
          This tab connects school admins to the existing secure IELTS Exam Mode. Use it to create exams, attach protected forms,
          assign students, and open live monitoring without exposing answer keys in the school portal.
        </p>
      </div>
    </div>
  );
};

export default IeltsExamsTab;
