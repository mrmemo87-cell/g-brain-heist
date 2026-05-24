import React, { useState, useEffect } from 'react';
import { useSchoolAdmin } from '../SchoolAdminContext';
import { updateSchoolSettings } from '../../../services/schoolAdminService';

const IeltsSettingsTab: React.FC = () => {
  const { school, addToast } = useSchoolAdmin();
  const [extraPracticeEnabled, setExtraPracticeEnabled] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (school?.settings) {
      const raw = school.settings?.ielts_extra_practice_enabled;
      setExtraPracticeEnabled(typeof raw === 'boolean' ? raw : false);
    }
  }, [school?.settings]);

  const handleToggleExtraPractice = async (checked: boolean) => {
    if (!school?.id) return;
    setLoading(true);
    try {
      const result = await updateSchoolSettings(school.id, {
        ielts_extra_practice_enabled: checked,
      });
      if (result.success) {
        setExtraPracticeEnabled(checked);
        addToast?.(
          checked
            ? '✅ Extra Practice enabled for all students'
            : '⚠️ Extra Practice disabled for all students',
          'success'
        );
      } else {
        throw new Error(result.error || 'Failed to update settings');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update IELTS settings';
      addToast?.(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-gray-900 to-cyan-950/40 p-6 shadow-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-cyan-300">IELTS Academy</p>
        <h3 className="mt-2 text-2xl font-bold text-white">Settings & Configuration</h3>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-cyan-50/80">
          Control school-wide IELTS features and student access options.
        </p>
      </div>

      {/* Extra Practice Toggle Card */}
      <div className="rounded-2xl border border-cyan-500/20 bg-gray-900/80 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex-1">
            <h4 className="text-lg font-semibold text-white">Extra Practice Access</h4>
            <p className="mt-2 text-sm text-gray-400">
              When enabled, students can access free practice content beyond assigned work. When disabled, students only see assigned IELTS practice and their learning journey.
            </p>
            <div className="mt-4 rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-cyan-300">Current Status</p>
              <p className="mt-1 text-sm font-semibold text-cyan-100">
                {extraPracticeEnabled ? '✅ Enabled' : '❌ Disabled'}
              </p>
            </div>
          </div>

          {/* Toggle Switch */}
          <div className="flex flex-shrink-0 items-center gap-4 sm:flex-col">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={extraPracticeEnabled}
                onChange={(e) => handleToggleExtraPractice(e.target.checked)}
                disabled={loading}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-cyan-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-600" />
            </label>
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              {loading ? 'Updating...' : 'Toggle'}
            </span>
          </div>
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-4">
          <div className="flex gap-3">
            <div className="mt-0.5 text-xl">📚</div>
            <div>
              <h5 className="font-semibold text-white">When Enabled</h5>
              <ul className="mt-2 space-y-1 text-xs text-gray-300">
                <li>• Students see free practice in IELTS home</li>
                <li>• Trial listening test accessible</li>
                <li>• Practice content browsable by skill</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-700 bg-gray-900/80 p-4">
          <div className="flex gap-3">
            <div className="mt-0.5 text-xl">🔒</div>
            <div>
              <h5 className="font-semibold text-white">When Disabled</h5>
              <ul className="mt-2 space-y-1 text-xs text-gray-300">
                <li>• Students only see assigned practice</li>
                <li>• Learning journey still accessible</li>
                <li>• Controlled practice environment</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default IeltsSettingsTab;
