import React from 'react';
import ClassesTab from './ClassesTab';
import RosterTab from './RosterTab';

const OrganisationTab: React.FC = () => {
  const [view, setView] = React.useState<'classes' | 'register'>('classes');
  return <div className="space-y-5">
    <section className="admin-section-heading"><div><p className="school-admin-eyebrow">School structure</p><h2>Classes &amp; Registration</h2><p>Build classes from the grades in your academic plan, then place registered students into the right class.</p></div></section>
    <div className="admin-segmented" role="tablist" aria-label="Organisation views">
      <button className={view === 'classes' ? 'is-active' : ''} onClick={() => setView('classes')}>1. Class setup</button>
      <button className={view === 'register' ? 'is-active' : ''} onClick={() => setView('register')}>2. Student placement</button>
    </div>
    {view === 'classes' ? <ClassesTab /> : <RosterTab />}
  </div>;
};
export default OrganisationTab;
