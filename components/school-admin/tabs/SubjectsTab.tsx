import React from 'react';
import AcademicSetupPanel from '../AcademicSetupPanel';
import AcademicYearContinuityCard from '../AcademicYearContinuityCard';
import AcademicYearRolloverWizard from '../AcademicYearRolloverWizard';
import SchoolSubjectsManager from '../SchoolSubjectsManager';

type SubjectWorkspace = 'subjects' | 'academic-setup';

const SubjectsTab: React.FC = () => {
  const [workspace, setWorkspace] = React.useState<SubjectWorkspace>('subjects');

  return (
    <div className="space-y-6">
      <section className="admin-section-heading">
        <div>
          <p className="school-admin-eyebrow">Academic planning</p>
          <h2>Curriculum &amp; Subjects</h2>
          <p>Your school defines its own subjects. Academic mapping is optional and only connects a school subject to governed curriculum, questions and learning intelligence.</p>
        </div>
      </section>

      <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1" role="tablist" aria-label="Curriculum and subjects workspace">
        <button
          type="button"
          role="tab"
          aria-selected={workspace === 'subjects'}
          onClick={() => setWorkspace('subjects')}
          className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition ${workspace === 'subjects' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
        >
          School Subjects
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={workspace === 'academic-setup'}
          onClick={() => setWorkspace('academic-setup')}
          className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition ${workspace === 'academic-setup' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
        >
          Academic Setup
        </button>
      </div>

      {workspace === 'subjects' ? (
        <SchoolSubjectsManager />
      ) : (
        <div className="space-y-6">
          <div className="rounded-2xl border border-blue-100 bg-blue-50 px-5 py-4 text-sm text-blue-950">
            <strong>Advanced academic configuration.</strong> Academic years, framework scope and rollover live here. These settings support the school subject catalogue; they do not define which subjects your school is allowed to have.
          </div>
          <AcademicYearContinuityCard />
          <AcademicYearRolloverWizard />
          <AcademicSetupPanel />
        </div>
      )}
    </div>
  );
};

export default SubjectsTab;
