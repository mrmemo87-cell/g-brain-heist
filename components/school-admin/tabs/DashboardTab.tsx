import React from 'react';
import { useSchoolAdmin } from '../SchoolAdminContext';

const DashboardTab: React.FC = () => {
  const {
    classes, members, school, setActiveTab, stats, students, teachers,
  } = useSchoolAdmin();

  const summaryCards = [
    { label: 'Pupils on roll', value: stats.students, note: 'Current enrolment', accent: 'border-blue-700' },
    { label: 'Teaching staff', value: stats.teachers, note: 'Staff accounts', accent: 'border-emerald-700' },
    { label: 'Administrators', value: stats.admins, note: 'Authorised users', accent: 'border-amber-600' },
    { label: 'School community', value: stats.total, note: 'All active records', accent: 'border-slate-600' },
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-6">
        <p className="text-xs font-bold uppercase tracking-widest text-blue-800">Executive overview</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Good day, school administrator</h2>
            <p className="mt-1 text-sm text-slate-500">A clear operational summary for {school?.name}. Select a record area to review or update it.</p>
          </div>
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">School records available</span>
        </div>
      </section>

      <section aria-label="School population summary" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {summaryCards.map((card) => (
          <div key={card.label} className={`rounded-xl border border-gray-200 border-t-4 ${card.accent} bg-white p-5`}>
            <div className="text-3xl font-bold text-slate-900">{card.value}</div>
            <div className="mt-2 text-sm font-bold text-slate-700">{card.label}</div>
            <div className="mt-1 text-xs text-slate-500">{card.note}</div>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-6">
        <div className="mb-4">
          <h3 className="text-lg font-bold text-slate-900">Priority record areas</h3>
          <p className="text-sm text-slate-500">Common administration tasks are grouped by the school record they affect.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <button onClick={() => setActiveTab('students')} className="rounded-xl border border-gray-200 bg-slate-50 p-4 text-left hover:border-blue-400 hover:bg-blue-50">
            <strong className="block text-sm text-slate-900">Pupil enrolment</strong><span className="mt-1 block text-xs text-slate-500">Place pupils in the correct year group and class.</span>
          </button>
          <button onClick={() => setActiveTab('teachers')} className="rounded-xl border border-gray-200 bg-slate-50 p-4 text-left hover:border-blue-400 hover:bg-blue-50">
            <strong className="block text-sm text-slate-900">Teaching assignments</strong><span className="mt-1 block text-xs text-slate-500">Link staff to classes and curriculum subjects.</span>
          </button>
          <button onClick={() => setActiveTab('invites')} className="rounded-xl border border-gray-200 bg-slate-50 p-4 text-left hover:border-blue-400 hover:bg-blue-50">
            <strong className="block text-sm text-slate-900">Joining and access</strong><span className="mt-1 block text-xs text-slate-500">Issue controlled access for new staff and pupils.</span>
          </button>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="text-sm font-bold text-slate-900">Register position</h3>
          <p className="mt-2 text-sm text-slate-600">{students.length} pupil records and {teachers.length} teaching staff records are currently available to this workspace.</p>
          <button onClick={() => setActiveTab('roster')} className="mt-4 text-sm font-bold text-blue-800 hover:underline">Open whole-school register →</button>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="text-sm font-bold text-slate-900">Data stewardship</h3>
          <p className="mt-2 text-sm text-slate-600">Review roles before granting access. Use school settings to control who may join, and keep class placements current.</p>
          <button onClick={() => setActiveTab('settings')} className="mt-4 text-sm font-bold text-blue-800 hover:underline">Review school controls →</button>
        </div>
      </section>
    </div>
  );
};

export default DashboardTab;
