import React from 'react';
import { useSchoolAdmin } from '../SchoolAdminContext';
import InvitesTab from './InvitesTab';
import * as SchoolAdminService from '../../../services/schoolAdminService';

const SettingsTab: React.FC = () => {
  const {
    handleConfirmSchoolIdentity, handleSaveSettings, savingSettings, school, setSettingsAllowStudent, setSettingsAllowTeacher,
    setSettingsLogoFile, setSettingsLogoPreview, setSettingsLogoStatus, setSettingsName,
    settingsAllowStudent, settingsAllowTeacher, settingsLogoPreview, settingsLogoStatus, settingsName,
  } = useSchoolAdmin();
  const [identity, setIdentity] = React.useState<SchoolAdminService.SchoolIdentityStatus | null>(null);

  React.useEffect(() => {
    let active = true;
    void SchoolAdminService.getSchoolIdentityStatus(school.id)
      .then((value) => { if (active) setIdentity(value); })
      .catch(() => { if (active) setIdentity({ confirmed: true, confirmedAt: null, confirmedBy: null }); });
    return () => { active = false; };
  }, [school.id, school.name, school.logo_url]);

  React.useEffect(() => () => {
    if (settingsLogoPreview?.startsWith('blob:')) URL.revokeObjectURL(settingsLogoPreview);
  }, [settingsLogoPreview]);
  const identityRequestHref = `mailto:support@brainsheist.com?subject=${encodeURIComponent(`School identity change request — ${school.name}`)}&body=${encodeURIComponent(`School: ${school.name}\nSchool ID: ${school.id}\n\nRequested change and reason:\n`)}`;

  return (
    <div className="space-y-6">
      <section className="admin-section-heading"><div><p className="school-admin-eyebrow">Joining &amp; access</p><h2>School identity and access</h2><p>The school code is the single controlled route for teachers and students joining this workspace.</p></div></section>
      <InvitesTab />

      <section className="admin-form-card">
        <div className="admin-card-heading"><div><h3>{identity?.confirmed ? 'Verified school identity' : 'Confirm school identity'}</h3><p>{identity?.confirmed ? 'The confirmed name and logo stay consistent across official reports and documents.' : 'The School Head or an authorised administrator confirms these details once. Review them carefully before continuing.'}</p></div>{identity?.confirmed ? <span className="admin-locked-pill">Locked</span> : null}</div>
        {identity?.confirmed ? <>
          <div className="school-identity-lock">
            <img src={school.logo_url || '/logo.png'} alt={`${school.name} logo`} />
            <div><span>Confirmed school name</span><strong>{school.name}</strong><small>{school.slug}</small></div>
            <a className="admin-button-ghost" href={identityRequestHref}>Request identity change</a>
          </div>
          <div className="admin-access-note"><strong>Identity protection</strong><span>Later name or logo changes require a reviewed request and an audit record.</span></div>
        </> : <>
          <div className="admin-form-grid">
            <label className="admin-field admin-field-wide"><span>School name <i>Required</i></span><input value={settingsName} onChange={(event) => setSettingsName(event.target.value)} /></label>
            <label className="admin-field admin-field-wide"><span>School logo</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => {
              const file = event.target.files?.[0] || null;
              if (!file) return;
              if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) { setSettingsLogoStatus({ type: 'error', message: 'Choose a PNG, JPG or WebP image no larger than 2 MB.' }); return; }
              setSettingsLogoFile(file); setSettingsLogoPreview(URL.createObjectURL(file)); setSettingsLogoStatus({ type: 'info', message: 'Logo ready to upload when identity is confirmed.' });
            }} /><small>PNG, JPG or WebP · maximum 2 MB</small></label>
          </div>
          <div className="school-identity-preview"><img src={settingsLogoPreview || school.logo_url || '/logo.png'} alt="School identity preview" /><strong>{settingsName || school.name}</strong></div>
          {settingsLogoStatus ? <p className={`admin-field-${settingsLogoStatus.type}`}>{settingsLogoStatus.message}</p> : null}
          <div className="admin-form-actions"><button type="button" className="admin-button-primary" disabled={savingSettings || !settingsName.trim()} onClick={handleConfirmSchoolIdentity}>{savingSettings ? 'Confirming…' : 'Confirm and lock identity'}</button></div>
        </>}
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
