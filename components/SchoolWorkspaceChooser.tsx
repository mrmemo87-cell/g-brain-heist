import React from 'react';

interface SchoolWorkspaceChooserProps {
  schoolName?: string | null;
  onOpenAdministration: () => void;
  onOpenTeaching: () => void;
  onLogout: () => void;
}

const SchoolWorkspaceChooser: React.FC<SchoolWorkspaceChooserProps> = ({ schoolName, onOpenAdministration, onOpenTeaching, onLogout }) => (
  <main className="school-workspace-chooser">
    <section aria-labelledby="workspace-chooser-title" className="school-workspace-chooser-card">
      <p className="school-admin-eyebrow">Choose your workspace</p>
      <h1 id="workspace-chooser-title">Welcome to {schoolName || 'your school'}</h1>
      <p>Your account has administration and teaching access. Choose where you want to work; you can switch again at any time without signing out.</p>
      <div className="school-workspace-options">
        <button type="button" onClick={onOpenAdministration}><span aria-hidden="true">🏫</span><strong>School Administration</strong><small>People, classes, curriculum, admissions and whole-school reporting</small></button>
        <button type="button" onClick={onOpenTeaching}><span aria-hidden="true">📚</span><strong>Teacher Portal</strong><small>Your assigned classes, students, assessments and teaching tools</small></button>
      </div>
      <button type="button" onClick={onLogout} className="school-workspace-signout">Sign out</button>
    </section>
  </main>
);

export default SchoolWorkspaceChooser;
