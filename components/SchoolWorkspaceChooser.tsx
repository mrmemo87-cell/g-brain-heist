import React from 'react';

interface SchoolWorkspaceChooserProps {
  schoolName?: string | null;
  onOpenSchoolHead?: () => void;
  onOpenAdministration?: () => void;
  onOpenTeaching?: () => void;
  onOpenParent?: () => void;
  onOpenStudent?: () => void;
  onOpenPlatformAdmin?: () => void;
  onLogout: () => void;
}

type WorkspaceKind = 'head' | 'administration' | 'teaching' | 'parent' | 'student' | 'platform';

const WorkspaceIcon: React.FC<{ kind: WorkspaceKind }> = ({ kind }) => {
  const paths: Record<WorkspaceKind, React.ReactNode> = {
    head: <><path d="M12 3 3 8l9 5 9-5z" /><path d="M6 11v6c3 2.6 9 2.6 12 0v-6" /></>,
    administration: <><path d="M4 10h16M6 10v9M10 10v9M14 10v9M18 10v9M3 19h18M12 3l9 5H3z" /></>,
    teaching: <><path d="M4 5.5c3-1 5.7-.5 8 1.5v13c-2.3-2-5-2.5-8-1.5zM20 5.5c-3-1-5.7-.5-8 1.5v13c2.3-2 5-2.5 8-1.5z" /></>,
    parent: <><circle cx="9" cy="8" r="3" /><circle cx="17" cy="10" r="2" /><path d="M3.5 20c.4-4 2.2-6 5.5-6s5.1 2 5.5 6M14 16c3.4-.4 5.4.9 6 4" /></>,
    student: <><path d="m3 8 9-5 9 5-9 5zM7 11v5c3 2.4 7 2.4 10 0v-5M21 8v6" /></>,
    platform: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M8 9v11" /></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[kind]}</svg>;
};

const SchoolWorkspaceChooser: React.FC<SchoolWorkspaceChooserProps> = ({
  schoolName,
  onOpenSchoolHead,
  onOpenAdministration,
  onOpenTeaching,
  onOpenParent,
  onOpenStudent,
  onOpenPlatformAdmin,
  onLogout,
}) => {
  const options = [
    onOpenSchoolHead && { kind: 'head' as const, title: 'School Head', description: 'School priorities, decisions, performance and governance', onOpen: onOpenSchoolHead },
    onOpenAdministration && { kind: 'administration' as const, title: 'School Administration', description: 'People, classes, curriculum, registration and school operations', onOpen: onOpenAdministration },
    onOpenTeaching && { kind: 'teaching' as const, title: 'Teacher Portal', description: 'Your classes, students, assessments and teaching tools', onOpen: onOpenTeaching },
    onOpenParent && { kind: 'parent' as const, title: 'Parent Portal', description: 'Your linked children and their school-approved progress', onOpen: onOpenParent },
    onOpenStudent && { kind: 'student' as const, title: 'Student Dashboard', description: 'Learning activities, assignments, progress and school programmes', onOpen: onOpenStudent },
    onOpenPlatformAdmin && { kind: 'platform' as const, title: 'Super Admin', description: 'Platform schools, users, approvals and governance', onOpen: onOpenPlatformAdmin },
  ].filter((option): option is Exclude<typeof option, false | undefined> => Boolean(option));

  return (
    <main className="school-workspace-chooser">
      <section aria-labelledby="workspace-chooser-title" aria-describedby="workspace-chooser-description" className="school-workspace-chooser-card">
        <header className="school-workspace-chooser-heading">
          <p className="school-admin-eyebrow">Choose your workspace</p>
          <h1 id="workspace-chooser-title">Welcome to {schoolName || 'Brains Heist'}</h1>
          <p id="workspace-chooser-description">Your account has more than one role. Choose the dashboard you want to open.</p>
        </header>
        <div className="school-workspace-options">
          {options.map((option) => (
            <button type="button" onClick={option.onOpen} className="school-workspace-option" key={option.kind}>
              <span className="school-workspace-option-icon" aria-hidden="true"><WorkspaceIcon kind={option.kind} /></span>
              <span className="school-workspace-option-copy"><strong>{option.title}</strong><small>{option.description}</small></span>
              <span className="school-workspace-option-arrow" aria-hidden="true">→</span>
            </button>
          ))}
        </div>
        <button type="button" onClick={onLogout} className="school-workspace-signout">Sign out</button>
      </section>
    </main>
  );
};

export default SchoolWorkspaceChooser;
