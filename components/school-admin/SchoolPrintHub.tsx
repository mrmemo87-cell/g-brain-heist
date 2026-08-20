import React from 'react';

export type SchoolPrintSource =
  | 'classes'
  | 'teachers'
  | 'admissions'
  | 'cambridge'
  | 'ielts'
  | 'academic-profiles'
  | 'interventions';

interface SchoolPrintHubProps {
  onOpenSource: (source: SchoolPrintSource) => void;
}

const reportGroups: Array<{
  title: string;
  description: string;
  reports: Array<{ title: string; description: string; source: SchoolPrintSource; action: string }>;
}> = [
  {
    title: 'Student progress & support',
    description: 'School-ready reports about attainment, learning needs and follow-up.',
    reports: [
      { title: 'Student Academic Profile', description: 'Choose a student, subject and reporting period, then generate the individual progress report with learning trends.', source: 'academic-profiles', action: 'Choose student & print' },
      { title: 'Student Support Plan', description: 'Open the authorised support workspace to review a student need and print the relevant school record after the plan is prepared.', source: 'interventions', action: 'Open support plans' },
    ],
  },
  {
    title: 'Assessments & programmes',
    description: 'Formal assessment and programme reporting owned by the relevant school workspace.',
    reports: [
      { title: 'Cambridge assessment reports', description: 'Choose the class, student or assessment from Cambridge Assessments before opening its printable report.', source: 'cambridge', action: 'Open Cambridge reports' },
      { title: 'IELTS results & exam documents', description: 'Open the IELTS programme to select the required result, reviewed feedback or exam document.', source: 'ielts', action: 'Open IELTS documents' },
      { title: 'Admission candidate reports', description: 'Choose the candidate and completed admission attempt before opening the placement/report record.', source: 'admissions', action: 'Open admission reports' },
    ],
  },
  {
    title: 'School operations',
    description: 'Operational records generated from the school source of truth.',
    reports: [
      { title: 'Class rosters', description: 'Choose the class in Classes & Registration and print the current official roster.', source: 'classes', action: 'Choose class & print' },
      { title: 'Teacher allocation summary', description: 'Open Teacher Allocation to review current class-and-subject coverage before printing or recording the allocation summary.', source: 'teachers', action: 'Open teacher allocations' },
    ],
  },
];

const SchoolPrintHub: React.FC<SchoolPrintHubProps> = ({ onOpenSource }) => (
  <section className="space-y-5" aria-labelledby="school-print-hub-title">
    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-5 shadow-sm sm:p-6">
      <span className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-700">Print Center</span>
      <h2 id="school-print-hub-title" className="mt-1 text-2xl font-bold text-slate-950">What do we need to print?</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Start with the type of school record. Brains Heist will take you to the workspace that owns the live data, where you can narrow it to the correct class, student, assessment or reporting period before printing. This avoids stale or duplicated reports.</p>
    </div>

    <details className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" open>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 bg-slate-950 px-5 py-4 text-white marker:hidden">
        <span><small className="block text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-300">Report library</small><strong className="mt-1 block text-lg">Reports</strong></span>
        <span className="text-sm font-semibold text-slate-300">Choose a report family ▾</span>
      </summary>
      <div className="grid gap-4 p-4 sm:p-5">
        {reportGroups.map((group) => (
          <details key={group.title} className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50" open={group.title === 'Student progress & support'}>
            <summary className="cursor-pointer list-none px-4 py-4 marker:hidden">
              <div className="flex items-start justify-between gap-4"><div><strong className="text-sm text-slate-950">{group.title}</strong><p className="mt-1 text-xs leading-5 text-slate-600">{group.description}</p></div><span className="text-slate-500" aria-hidden="true">▾</span></div>
            </summary>
            <div className="grid gap-3 border-t border-slate-200 bg-white p-3 md:grid-cols-2">
              {group.reports.map((report) => (
                <article key={report.title} className="flex min-h-40 flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <h3 className="font-bold text-slate-950">{report.title}</h3>
                  <p className="mt-2 flex-1 text-xs leading-5 text-slate-600">{report.description}</p>
                  <button type="button" onClick={() => onOpenSource(report.source)} className="mt-4 inline-flex items-center justify-between rounded-lg bg-[#1e4b82] px-3.5 py-2.5 text-left text-xs font-bold text-white hover:bg-[#173d6c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2">
                    <span>{report.action}</span><span aria-hidden="true">→</span>
                  </button>
                </article>
              ))}
            </div>
          </details>
        ))}
      </div>
    </details>

    <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4 text-xs leading-5 text-cyan-950"><strong>Why the Print Center opens the source workspace:</strong> school reports depend on live filters such as student, class, assessment, subject and reporting period. Printing from the source keeps the document accurate and lets the generated copy enter Document History normally.</div>
  </section>
);

export default SchoolPrintHub;
