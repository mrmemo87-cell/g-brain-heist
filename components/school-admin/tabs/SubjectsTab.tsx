import React from 'react';
import AcademicSetupPanel from '../AcademicSetupPanel';

const SubjectsTab: React.FC = () => (
  <div className="space-y-6">
    <section className="admin-section-heading">
      <div>
        <p className="school-admin-eyebrow">Academic planning</p>
        <h2>Curriculum &amp; Subjects</h2>
        <p>Set the academic year, school system, grade levels and the subjects taught in each grade.</p>
      </div>
    </section>
    <AcademicSetupPanel />
  </div>
);

export default SubjectsTab;
