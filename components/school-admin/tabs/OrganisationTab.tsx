import React from 'react';
import ClassesTab from './ClassesTab';
import RosterTab from './RosterTab';

const OrganisationTab: React.FC = () => {
  const [view, setView] = React.useState<'classes' | 'register'>('classes');
  return <div className="space-y-5">
    <section className="admin-section-heading"><div><p className="school-admin-eyebrow">School organisation</p><h2>Classes, year groups & register</h2><p>Structure the school and manage its complete register without switching workspaces.</p></div></section>
    <div className="admin-segmented" role="tablist" aria-label="Organisation views">
      <button className={view === 'classes' ? 'is-active' : ''} onClick={() => setView('classes')}>Classes & year groups</button>
      <button className={view === 'register' ? 'is-active' : ''} onClick={() => setView('register')}>Whole-school register</button>
    </div>
    {view === 'classes' ? <ClassesTab /> : <RosterTab />}
  </div>;
};
export default OrganisationTab;
