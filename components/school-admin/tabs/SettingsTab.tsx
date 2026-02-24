import React from 'react';
import { useSchoolAdmin } from '../SchoolAdminContext';

const SettingsTab: React.FC = () => {
  const {
    handleSaveSettings, savingSettings, school, setSettingsAllowStudent, setSettingsAllowTeacher, setSettingsName, settingsAllowStudent, settingsAllowTeacher, settingsName, students, teachers,
  } = useSchoolAdmin();

  return (
    <div className="max-w-2xl space-y-6">
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <h3 className="text-lg font-semibold mb-4">School Settings</h3>

        <div className="space-y-4">
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
              When enabled, students can sign up for this school without an invite code
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
              When enabled, teachers can sign up for this school without an invite code
            </p>
          </div>

          <div className="pt-4">
            <button
              onClick={handleSaveSettings}
              disabled={savingSettings}
              className="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors font-medium"
            >
              {savingSettings ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="bg-gray-800 rounded-xl p-6 border border-red-500/30">
        <h3 className="text-lg font-semibold mb-2 text-red-400">Danger Zone</h3>
        <p className="text-sm text-gray-400 mb-4">
          These actions are irreversible. Please be careful.
        </p>
        <button
          disabled
          className="px-4 py-2 bg-red-600/50 text-red-200 rounded-lg cursor-not-allowed opacity-50"
        >
          Delete School (Coming Soon)
        </button>
      </div>
    </div>
  );
};

export default SettingsTab;
