import React from 'react';
import AcademicSetupPanel from '../AcademicSetupPanel';
import AcademicYearContinuityCard from '../AcademicYearContinuityCard';
import AcademicYearRolloverWizard from '../AcademicYearRolloverWizard';

const SubjectsTab: React.FC = () => (
  <div className="space-y-6">
    <section className="admin-section-heading">
      <div>
        <p className="school-admin-eyebrow">Academic planning</p>
        <h2>Curriculum &amp; Subjects</h2>
        <p>Start each academic year with clean results, move students forward safely, and keep every previous assignment, writing task and report available as protected school history.</p>
      </div>
    </section>
    <AcademicYearContinuityCard />
    <AcademicYearRolloverWizard />
    <AcademicSetupPanel />
  </div>
);

export default SubjectsTab;
