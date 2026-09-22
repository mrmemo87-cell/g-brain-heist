import React from 'react';
import AcademicSetupPanel from '../AcademicSetupPanel';
import AcademicYearContinuityCard from '../AcademicYearContinuityCard';
import AcademicYearRolloverWizard from '../AcademicYearRolloverWizard';
import SubjectProvisioningPanel from '../SubjectProvisioningPanel';

const SubjectsTab: React.FC = () => (
  <div className="space-y-6">
    <section className="admin-section-heading">
      <div>
        <p className="school-admin-eyebrow">Academic planning</p>
        <h2>Curriculum &amp; Subjects</h2>
        <p>Create school-facing subjects, control exactly who studies them, allocate teachers, and preserve the governed academic mapping used by learning, reporting and analytics.</p>
      </div>
    </section>
    <SubjectProvisioningPanel />
    <AcademicYearContinuityCard />
    <AcademicYearRolloverWizard />
    <AcademicSetupPanel />
  </div>
);

export default SubjectsTab;
