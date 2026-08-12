import React, { useState, useEffect } from 'react';
import { useSchoolAdmin } from '../SchoolAdminContext';
import {
  resolveIeltsExtraPracticeAccess,
  updateIeltsExtraPracticeAccess,
} from '../../../services/ieltsExtraPracticeAccessService';
import { friendlyIeltsAdminError } from '../../../src/lib/schoolAdminPresentation';

const IeltsSettingsTab: React.FC = () => {
  const { addToast } = useSchoolAdmin();
  const [extraPracticeEnabled, setExtraPracticeEnabled] = useState<boolean | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const access = await resolveIeltsExtraPracticeAccess();
        if (!active) return;
        if (access.status === 'error') {
          setExtraPracticeEnabled(null);
          setCanManage(false);
          setLoadError(friendlyIeltsAdminError(
            access.error || access.reason,
            'Unable to verify Extra Practice access. Refresh the page and try again.',
          ));
        } else {
          setExtraPracticeEnabled(access.enabled);
          setCanManage(access.canManage);
        }
      } catch (error) {
        if (!active) return;
        setExtraPracticeEnabled(null);
        setCanManage(false);
        setLoadError(friendlyIeltsAdminError(
          error,
          'Unable to verify Extra Practice access. Refresh the page and try again.',
        ));
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, []);

  const handleToggleExtraPractice = async (checked: boolean) => {
    if (!canManage || extraPracticeEnabled === null) return;
    setLoading(true);
    setLoadError(null);
    try {
      const result = await updateIeltsExtraPracticeAccess(checked);
      if (result.status === 'ready') {
        setExtraPracticeEnabled(result.enabled);
        setCanManage(result.canManage);
        addToast?.(
          result.enabled
            ? 'Extra Practice enabled for all students'
            : 'Extra Practice disabled for all students',
          'success'
        );
      } else {
        throw new Error(result.error || result.reason || 'setting_update_failed');
      }
    } catch (error) {
      const message = friendlyIeltsAdminError(error, 'Unable to update Extra Practice access. Please try again.');
      setLoadError(message);
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
            <p id="ielts-extra-practice-description" className="mt-2 text-sm text-gray-400">
              When enabled, students can access free practice content beyond assigned work. When disabled, students only see assigned IELTS practice and their learning journey.
            </p>
            <div className="mt-4 rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-cyan-300">Current Status</p>
              <p id="ielts-extra-practice-status" role="status" aria-live="polite" className="mt-1 text-sm font-semibold text-cyan-100">
                {loadError ? 'Unable to verify' : extraPracticeEnabled === null ? 'Verifying access…' : extraPracticeEnabled ? 'Enabled' : 'Disabled'}
              </p>
              {loadError ? <p className="mt-2 text-sm font-semibold text-red-200" role="alert">{loadError}</p> : null}
            </div>
          </div>

          {/* Toggle Switch */}
          <div className="flex flex-shrink-0 items-center gap-4 sm:flex-col">
            <label className={`relative inline-flex items-center ${loading || !canManage || extraPracticeEnabled === null ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
              <input
                type="checkbox"
                role="switch"
                aria-label="Allow students to use Extra Practice"
                aria-describedby="ielts-extra-practice-description ielts-extra-practice-status"
                aria-busy={loading}
                checked={extraPracticeEnabled === true}
                onChange={(e) => handleToggleExtraPractice(e.target.checked)}
                disabled={loading || !canManage || extraPracticeEnabled === null}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-cyan-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-600" />
            </label>
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              {loading
                ? extraPracticeEnabled === null ? 'Verifying…' : 'Updating…'
                : !canManage || extraPracticeEnabled === null
                  ? 'Unavailable'
                  : extraPracticeEnabled ? 'On' : 'Off'}
            </span>
          </div>
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-4">
          <div className="flex gap-3">
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
