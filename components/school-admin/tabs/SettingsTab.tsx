import React from 'react';
import { useSchoolAdmin } from '../SchoolAdminContext';
import InvitesTab from './InvitesTab';

const SettingsTab: React.FC = () => {
  const {
    handleSaveSettings, savingSettings, school, setSettingsAllowStudent, setSettingsAllowTeacher,
    settingsAllowStudent, settingsAllowTeacher,
  } = useSchoolAdmin();
  const identityRequestHref = `mailto:support@brainsheist.com?subject=${encodeURIComponent(`School identity change request — ${school.name}`)}&body=${encodeURIComponent(`School: ${school.name}\nSchool ID: ${school.id}\n\nRequested change and reason:\n`)}`;

  return (
    <div className="space-y-6">
      <section className="admin-section-heading"><div><p className="school-admin-eyebrow">Joining &amp; access</p><h2>School identity and access</h2><p>The school code is the single controlled route for teachers and students joining this workspace.</p></div></section>
      <InvitesTab />

      <section className="admin-form-card">
        <div className="admin-card-heading"><div><h3>Verified school identity</h3><p>The approved name and logo are locked because they appear on official reports and documents.</p></div><span className="admin-locked-pill">Locked</span></div>
        <div className="school-identity-lock">
          <img src={school.logo_url || '/logo.png'} alt={`${school.name} logo`} />
          <div><span>Approved school name</span><strong>{school.name}</strong><small>{school.slug}</small></div>
          <a className="admin-button-ghost" href={identityRequestHref}>Request identity change</a>
        </div>
        <div className="admin-access-note"><strong>Why this is protected</strong><span>Name and logo changes require platform review and an audit record. This prevents temporary rebranding of official reports before switching the school identity back.</span></div>
      </section>

      <section className="admin-form-card">
        <div className="admin-card-heading"><div><h3>Registration rules</h3><p>Control who can use the school code to create an account. Existing members are not affected.</p></div></div>
        <div className="registration-rule-list">
          <label><input type="checkbox" checked={settingsAllowStudent} onChange={(event) => setSettingsAllowStudent(event.target.checked)} /><span><strong>Allow student self-registration</strong><small>Students can create their own account with the school code.</small></span></label>
          <label><input type="checkbox" checked={settingsAllowTeacher} onChange={(event) => setSettingsAllowTeacher(event.target.checked)} /><span><strong>Allow teacher self-registration</strong><small>Teachers can create their own account with the school code.</small></span></label>
        </div>
        <div className="admin-form-actions"><button type="button" onClick={handleSaveSettings} disabled={savingSettings} className="admin-button-primary">{savingSettings ? 'Saving…' : 'Save registration rules'}</button></div>
      </section>
    </div>
  );
};

export default SettingsTab;
