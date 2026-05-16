import React from 'react';
import { useSchoolAdmin } from '../SchoolAdminContext';

const IeltsAnalyticsTab: React.FC = () => {
  const { classes = [], students = [] } = useSchoolAdmin();

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-purple-500/30 bg-gradient-to-br from-gray-900 to-purple-950/40 p-6 shadow-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-purple-300">IELTS Academy</p>
        <h3 className="mt-2 text-2xl font-bold text-white">IELTS Analytics</h3>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-purple-50/80">
          Analytics will become the school-level intelligence layer after safe result and practice pipelines are in place. This placeholder
          does not calculate bands, query global practice attempts, or expose protected exam answers.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-gray-700 bg-gray-900/80 p-4 text-sm text-gray-300">
          <p className="font-semibold text-white">Class cohort</p>
          <p className="mt-2 text-gray-400">{classes.length} classes available for future scoped analytics filters.</p>
        </div>
        <div className="rounded-xl border border-gray-700 bg-gray-900/80 p-4 text-sm text-gray-300">
          <p className="font-semibold text-white">Student cohort</p>
          <p className="mt-2 text-gray-400">{students.length} students available for future scoped analytics filters.</p>
        </div>
        <div className="rounded-xl border border-gray-700 bg-gray-900/80 p-4 text-sm text-gray-300">
          <p className="font-semibold text-white">Skill lens</p>
          <p className="mt-2 text-gray-400">Reading, listening, writing, and speaking lenses will be enabled later.</p>
        </div>
      </div>

      <div className="rounded-2xl border border-purple-500/30 bg-gray-900/80 p-5">
        <h4 className="text-lg font-semibold text-white">Analytics coming soon</h4>
        <ul className="mt-4 grid gap-3 text-sm text-gray-300 md:grid-cols-3">
          <li className="rounded-xl border border-gray-700 bg-black/20 p-4">Readiness snapshots for classes preparing for mock exams.</li>
          <li className="rounded-xl border border-gray-700 bg-black/20 p-4">Weak skill heatmaps after safe school-scoped data is available.</li>
          <li className="rounded-xl border border-gray-700 bg-black/20 p-4">Band trends in a later phase, without implementing band estimation now.</li>
        </ul>
      </div>
    </div>
  );
};

export default IeltsAnalyticsTab;
