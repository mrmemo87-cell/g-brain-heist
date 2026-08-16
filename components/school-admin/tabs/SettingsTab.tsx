import React from 'react';
import { useSchoolAdmin } from '../SchoolAdminContext';
import InvitesTab from './InvitesTab';
import * as SchoolAdminService from '../../../services/schoolAdminService';

const SettingsTab: React.FC = () => {
  const {
    addToast,
    handleConfirmSchoolIdentity, handleSaveSettings, savingSettings, school, setSettingsAllowStudent, setSettingsAllowTeacher,
    setSettingsLogoFile, setSettingsLogoPreview, setSettingsLogoStatus, setSettingsName,
    settingsAllowStudent, settingsAllowTeacher, settingsLogoPreview, settingsLogoStatus, settingsName,
  } = useSchoolAdmin();
  const [identity, setIdentity] = React.useState<SchoolAdminService.SchoolIdentityStatus | null>(null);
  const [identityRequest, setIdentityRequest] = React.useState<SchoolAdminService.SchoolIdentityChangeRequest | null>(null);
  const [identityRequestOpen, setIdentityRequestOpen] = React.useState(false);
  const [identityRequestReason, setIdentityRequestReason] = React.useState('');
  const [identityRequestBusy, setIdentityRequestBusy] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    void Promise.all([
      SchoolAdminService.getSchoolIdentityStatus(school.id),
      SchoolAdminService.getSchoolIdentityChangeRequestStatus(school.id).catch(() => null),
    ])
      .then(([value, request]) => { if (active) { setIdentity(value); setIdentityRequest(request); } })
      .catch(() => { if (active) setIdentity({ confirmed: true, confirmedAt: null, confirmedBy: null }); });
    return () => { active = false; };
  }, [school.id, school.name, school.logo_url]);

  React.useEffect(() => () => {
    if (settingsLogoPreview?.startsWith('blob:')) URL.revokeObjectURL(settingsLogoPreview);
  }, [settingsLogoPreview]);

  const submitIdentityRequest = async () => {
    if (identityRequestReason.trim().length < 10) {
      addToast('Explain the identity change needed in at least 10 characters.', 'error');
      return;
    }
    setIdentityRequestBusy(true);
    const result = await SchoolAdminService.requestSchoolIdentityChange(school.id, identityRequestReason);
    setIdentityRequestBusy(false);
    if (!result.success) {
      addToast(result.error || 'The identity change request could not be sent.', 'error');
      return;
    }
    setIdentityRequest(result.request || await SchoolAdminService.getSchoolIdentityChangeRequestStatus(school.id));
    setIdentityRequestReason('');
    setIdentityRequestOpen(false);
    addToast(result.message || 'Request sent to the superadmin for review.', 'success');
  };

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
            <button type="button" className="admin-button-ghost" disabled={identityRequest?.status === 'pending'} onClick={() => setIdentityRequestOpen((open) => !open)}>{identityRequest?.status === 'pending' ? 'Request awaiting review' : 'Request identity change'}</button>
          </div>
          <div className="admin-access-note"><strong>Identity protection</strong><span>A superadmin must approve and unlock the school identity before the school can change and reconfirm it.</span></div>
          {identityRequest?.status === 'pending' ? <div className="admin-inline-warning" role="status"><strong>Waiting for superadmin review</strong><span>Requested {new Date(identityRequest.createdAt).toLocaleDateString()}. The school name and logo remain locked until approval.</span></div> : null}
          {identityRequest?.status === 'rejected' ? <div className="admin-inline-warning" role="status"><strong>Previous request was not approved</strong><span>{identityRequest.reviewNote || 'Review the request details before submitting a new request.'}</span></div> : null}
          {identityRequestOpen ? <div className="admin-form-grid">
            <label className="admin-field admin-field-wide"><span>Change needed and reason <i>Required</i></span><textarea rows={4} maxLength={1000} value={identityRequestReason} onChange={(event) => setIdentityRequestReason(event.target.value)} placeholder="Explain what must change and why…" /><small>This request goes directly to the superadmin. Approval unlocks the name and logo fields for your school.</small></label>
            <div className="admin-form-actions"><button type="button" className="admin-button-ghost" onClick={() => setIdentityRequestOpen(false)} disabled={identityRequestBusy}>Cancel</button><button type="button" className="admin-button-primary" onClick={() => void submitIdentityRequest()} disabled={identityRequestBusy || identityRequestReason.trim().length < 10}>{identityRequestBusy ? 'Sending…' : 'Send request to superadmin'}</button></div>
          </div> : null}
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
        <div className="admin-card-heading"><div><h3>Registration rules</h3><p>Only checked roles may join with the school code or invitation link. Existing members are not affected.</p></div></div>
        <div className="registration-rule-list">
          <label><input type="checkbox" checked={settingsAllowStudent} onChange={(event) => setSettingsAllowStudent(event.target.checked)} /><span><strong>Allow student registration</strong><small>When unchecked, students cannot join this school by code or invitation link.</small></span></label>
          <label><input type="checkbox" checked={settingsAllowTeacher} onChange={(event) => setSettingsAllowTeacher(event.target.checked)} /><span><strong>Allow teacher registration</strong><small>When unchecked, teachers cannot join this school by code or invitation link.</small></span></label>
        </div>
        <div className="admin-form-actions"><button type="button" onClick={handleSaveSettings} disabled={savingSettings} className="admin-button-primary">{savingSettings ? 'Saving…' : 'Save registration rules'}</button></div>
      </section>
    </div>
  );
};

export default SettingsTab;
