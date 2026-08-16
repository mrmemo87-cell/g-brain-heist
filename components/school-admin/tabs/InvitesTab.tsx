import React from 'react';
import { useSchoolAdmin } from '../SchoolAdminContext';

interface InvitesTabProps {
  showRotate?: boolean;
}

const InvitesTab: React.FC<InvitesTabProps> = ({ showRotate = true }) => {
  const {
    actionLoading, copyToClipboard, handleRotateInviteCode, school, students, teachers,
  } = useSchoolAdmin();
  const invitationLink = React.useMemo(() => {
    const url = new URL('/', window.location.origin);
    if (school.invite_code) url.searchParams.set('schoolInvite', school.invite_code);
    return url.toString();
  }, [school.invite_code]);

  const sendInvitationLink = async () => {
    const shareData = {
      title: `Join ${school.name} on Brains Heist`,
      text: `Use this secure school invitation to join ${school.name} as a teacher or student.`,
      url: invitationLink,
    };
    if (typeof navigator.share === 'function') {
      try { await navigator.share(shareData); return; } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }
    window.location.href = `mailto:?subject=${encodeURIComponent(shareData.title)}&body=${encodeURIComponent(`${shareData.text}\n\n${shareData.url}`)}`;
  };

  return (
    <div className="space-y-4">
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <h3 className="mb-4 text-lg font-semibold text-slate-900">School invitation</h3>
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
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => copyToClipboard(invitationLink)} disabled={!school.invite_code} className="admin-button-secondary">Copy invitation link</button>
            <button type="button" onClick={() => void sendInvitationLink()} disabled={!school.invite_code} className="admin-button-primary">Send invitation link</button>
            {showRotate ? <button onClick={handleRotateInviteCode} disabled={actionLoading} className="admin-button-ghost">{actionLoading ? 'Rotating…' : 'Rotate code'}</button> : null}
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-3">Teachers and students who open the invitation link will have the code filled and checked automatically.{showRotate ? ' Rotating the code invalidates the old code and link immediately.' : ''}</p>
      </div>
    </div>
  );
};

export default InvitesTab;
