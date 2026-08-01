import React from 'react';
import { useSchoolAdmin } from '../SchoolAdminContext';
import InvitesTab from './InvitesTab';

const SettingsTab: React.FC = () => {
  const {
    handleSaveSettings, savingSettings, school, setSettingsAllowStudent, setSettingsAllowTeacher, setSettingsName, settingsAllowStudent, settingsAllowTeacher, settingsName, settingsLogoFile, settingsLogoPreview, settingsLogoStatus, setSettingsLogoFile, setSettingsLogoPreview, setSettingsLogoStatus,
  } = useSchoolAdmin();

  return (
    <div className="space-y-6">
      <section className="admin-section-heading"><div><p className="school-admin-eyebrow">Joining & access</p><h2>School identity and access</h2><p>The school code is the single controlled route for teachers and students joining this workspace.</p></div></section>
      <InvitesTab />
      <section className="admin-form-card">
        <div className="admin-card-heading"><div><h3>School settings</h3><p>Keep the school identity and registration rules accurate across every portal.</p></div></div>

        <div className="space-y-4 p-6">
          <div className="school-logo-setting">
            <img src={settingsLogoPreview || school.logo_url || '/logo.png'} alt="Current school logo" />
            <div>
              <label htmlFor="school-logo" className="block text-sm font-medium text-slate-900">School logo</label>
              <p>Shown in this portal, teacher and student dashboards, and school reports.</p>
              <input id="school-logo" type="file" accept="image/png,image/jpeg,image/webp" disabled={savingSettings} onChange={(event) => {
                const file = event.target.files?.[0] || null;
                if (file && !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
                  setSettingsLogoFile(null);
                  setSettingsLogoPreview('');
                  setSettingsLogoStatus({ type: 'error', message: 'Logo not selected. Choose a PNG, JPG or WebP image.' });
                  event.target.value = '';
                  return;
                }
                if (file && file.size > 2 * 1024 * 1024) {
                  setSettingsLogoFile(null);
                  setSettingsLogoPreview('');
                  setSettingsLogoStatus({ type: 'error', message: 'Logo not selected. The image must be 2 MB or smaller.' });
                  event.target.value = '';
                  return;
                }
                setSettingsLogoFile(file);
                setSettingsLogoPreview(file ? URL.createObjectURL(file) : '');
                setSettingsLogoStatus(file
                  ? { type: 'info', message: `${file.name} is ready. Select “Upload logo & save settings” to apply it everywhere.` }
                  : null);
              }} />
              <small>PNG, JPG or WebP; maximum 2 MB.</small>
              {settingsLogoStatus && (
                <div className={`school-logo-status school-logo-status--${settingsLogoStatus.type}`} role={settingsLogoStatus.type === 'error' ? 'alert' : 'status'} aria-live="polite">
                  <span aria-hidden="true">{settingsLogoStatus.type === 'success' ? '✓' : settingsLogoStatus.type === 'error' ? '!' : '↑'}</span>
                  <span>{settingsLogoStatus.message}</span>
                </div>
              )}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">School Name</label>
            <input
              type="text"
              value={settingsName}
              onChange={(e) => setSettingsName(e.target.value)}
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">School Slug</label>
            <div className="px-4 py-2 bg-gray-700/50 border border-gray-600 rounded-lg text-gray-400">
              {school.slug}
            </div>
            <p className="text-xs text-gray-500 mt-1">Slug cannot be changed</p>
          </div>

          <div className="border-t border-gray-700 pt-4 space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={settingsAllowStudent}
                onChange={(e) => setSettingsAllowStudent(e.target.checked)}
                className="rounded border-gray-600 bg-gray-700 text-cyan-500 focus:ring-cyan-500"
              />
              <span className="text-white">Allow student self-registration</span>
            </label>
            <p className="text-xs text-gray-500 ml-6">
              Controls whether students may use the school code to create an account
            </p>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={settingsAllowTeacher}
                onChange={(e) => setSettingsAllowTeacher(e.target.checked)}
                className="rounded border-gray-600 bg-gray-700 text-cyan-500 focus:ring-cyan-500"
              />
              <span className="text-white">Allow teacher self-registration</span>
            </label>
            <p className="text-xs text-gray-500 ml-6">
              Controls whether teachers may use the school code to create an account
            </p>
          </div>

          <div className="pt-4">
            <button
              onClick={handleSaveSettings}
              disabled={savingSettings}
              className="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors font-medium"
            >
              {savingSettings ? (settingsLogoFile ? 'Uploading logo…' : 'Saving…') : (settingsLogoFile ? 'Upload logo & save settings' : 'Save settings')}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default SettingsTab;
