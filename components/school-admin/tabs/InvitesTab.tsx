import React from 'react';
import { useSchoolAdmin } from '../SchoolAdminContext';

const InvitesTab: React.FC = () => {
  const {
    actionLoading, copyToClipboard, handleRotateInviteCode, school, students, teachers,
  } = useSchoolAdmin();

  return (
    <div className="space-y-4">
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <h3 className="mb-4 text-lg font-semibold text-slate-900">Current Invite Code</h3>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button
              type="button"
              className="font-mono text-2xl font-bold text-cyan-400 hover:text-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 rounded-lg"
              onClick={() => copyToClipboard(school.invite_code || '')}
              aria-label="Copy invite code"
            >
              {school.invite_code || 'No code'}
            </button>
            <div className="text-sm text-gray-400">
              Share this with teachers/students to join.
            </div>
          </div>
          <button
            onClick={handleRotateInviteCode}
            disabled={actionLoading}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 rounded-lg transition-colors font-medium"
          >
            {actionLoading ? 'Rotating...' : 'Rotate Code'}
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-3">
          Rotating invalidates the old code immediately.
        </p>
      </div>
    </div>
  );
};

export default InvitesTab;
