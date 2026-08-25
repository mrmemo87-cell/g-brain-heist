import React from 'react';
import AcademicSetupPanel from '../AcademicSetupPanel';
import AcademicYearContinuityCard from '../AcademicYearContinuityCard';

const SubjectsTab: React.FC = () => (
  <div className="space-y-6">
    <section className="admin-section-heading">
      <div>
        <p className="school-admin-eyebrow">Academic planning</p>
        <h2>Curriculum &amp; Subjects</h2>
        <p>Start each academic year with clean results while preserving previous assignments, writing and reports as protected school history.</p>
      </div>
    </section>
    <AcademicYearContinuityCard />
    <AcademicSetupPanel />
  </div>
);

export default SubjectsTab;
