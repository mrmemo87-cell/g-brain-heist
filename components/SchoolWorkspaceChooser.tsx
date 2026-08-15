import React from 'react';

interface SchoolWorkspaceChooserProps {
  schoolName?: string | null;
  onOpenAdministration: () => void;
  onOpenTeaching: () => void;
  onLogout: () => void;
}

const SchoolWorkspaceChooser: React.FC<SchoolWorkspaceChooserProps> = ({ schoolName, onOpenAdministration, onOpenTeaching, onLogout }) => (
  <main className="school-workspace-chooser">
    <section aria-labelledby="workspace-chooser-title" aria-describedby="workspace-chooser-description" className="school-workspace-chooser-card">
      <header className="school-workspace-chooser-heading">
        <p className="school-admin-eyebrow">Choose your workspace</p>
        <h1 id="workspace-chooser-title">Welcome to {schoolName || 'your school'}</h1>
        <p id="workspace-chooser-description">Your account includes administration and teaching access. Choose where you want to work—you can switch again at any time without signing out.</p>
      </header>
      <div className="school-workspace-options">
        <button type="button" onClick={onOpenAdministration} className="school-workspace-option">
          <span className="school-workspace-option-icon" aria-hidden="true">🏫</span>
          <span className="school-workspace-option-copy"><strong>School Administration</strong><small>People, classes, curriculum, admissions and whole-school reporting</small></span>
          <span className="school-workspace-option-arrow" aria-hidden="true">→</span>
        </button>
        <button type="button" onClick={onOpenTeaching} className="school-workspace-option">
          <span className="school-workspace-option-icon" aria-hidden="true">📚</span>
          <span className="school-workspace-option-copy"><strong>Teacher Portal</strong><small>Your allocated classes, students, assessments and teaching tools</small></span>
          <span className="school-workspace-option-arrow" aria-hidden="true">→</span>
        </button>
      </div>
      <button type="button" onClick={onLogout} className="school-workspace-signout">Sign out</button>
    </section>
  </main>
);

export default SchoolWorkspaceChooser;
