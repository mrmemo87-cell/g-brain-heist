import React from 'react';
import InvitesTab from './InvitesTab';

const TeachersTab: React.FC = () => (
  <div className="space-y-6">
    <section className="admin-section-heading">
      <div>
        <p className="school-admin-eyebrow">School access</p>
        <h2>Teacher Allocation</h2>
        <p>Send the school invitation to a teacher. Registration still follows the school’s saved teacher registration rule.</p>
      </div>
    </section>
    <InvitesTab showRotate={false} />
  </div>
);

export default TeachersTab;
