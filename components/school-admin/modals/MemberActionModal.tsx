import React from 'react';
import ReactDOM from 'react-dom';
import { useSchoolAdmin } from '../SchoolAdminContext';
import { verifyStudentFullName } from '../../../services/schoolAdminService';

const MemberActionModal: React.FC = () => {
  const {
    actionLoading, forceChangeAvatar, forceChangeLoading, forceChangeReason, forceChangeUsername, handleBanMember, handleClearProfileChange, handleForceProfileChange, handleRemoveMember, handleSuspendStudent, handleUnbanMember, handleUnsuspendStudent, handleUpdateRole, loadStudentModStatus, modTargetStatus, selectedMember, setForceChangeAvatar, setForceChangeReason, setForceChangeUsername, setModTargetId, setModTargetStatus, setSelectedMember, setShowMemberActionModal, setSuspendDuration, setSuspendReason, showMemberActionModal, students, suspendDuration, suspendLoading, suspendReason,
  } = useSchoolAdmin();
  const [verifiedName, setVerifiedName] = React.useState('');
  const [nameSaving, setNameSaving] = React.useState(false);
  const [nameMessage, setNameMessage] = React.useState('');

  React.useEffect(() => {
    setVerifiedName(selectedMember?.full_name || '');
    setNameMessage('');
  }, [selectedMember?.user_id, selectedMember?.full_name]);

  const reviewRealName = async (approved: boolean) => {
    if (!selectedMember) return;
    setNameSaving(true);
    setNameMessage('');
    const result = await verifyStudentFullName(selectedMember.user_id, approved, verifiedName);
    setNameSaving(false);
    if (!result.success) {
      setNameMessage(result.error || 'Could not update the name');
      return;
    }
    setSelectedMember({ ...selectedMember, full_name: result.full_name || verifiedName, full_name_status: result.status });
    setNameMessage(approved ? 'Real name confirmed for school exams.' : 'Name returned to the student for correction.');
  };

  return (
    <>
    {showMemberActionModal && selectedMember && ReactDOM.createPortal(
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[9999] p-4">
        <div
          className="bg-gray-800 rounded-xl p-6 max-w-lg w-full border border-gray-700 max-h-[90vh] overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="member-action-title"
          aria-describedby="member-action-description"
        >
          <div className="flex items-center gap-4 mb-4">
            <img
              src={selectedMember.avatar_url || '/avatars/default.png'}
              alt={selectedMember.username}
              className="w-12 h-12 rounded-full bg-gray-700"
            />
            <div>
              <h3 id="member-action-title" className="text-xl font-bold">{selectedMember.username}</h3>
              <p id="member-action-description" className="text-gray-400 text-sm">{selectedMember.email}</p>
            </div>
          </div>

          <div className="space-y-3">
            {selectedMember.role === 'student' && (
              <div className="bg-gray-700/50 rounded-lg p-4">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <h4 className="text-sm font-medium text-gray-200">School exam identity</h4>
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    selectedMember.full_name_status === 'verified' ? 'bg-green-500/20 text-green-300' :
                    selectedMember.full_name_status === 'rejected' ? 'bg-red-500/20 text-red-300' :
                    'bg-amber-500/20 text-amber-300'
                  }`}>{selectedMember.full_name_status || 'pending'}</span>
                </div>
                <label htmlFor="student-real-name" className="block text-xs text-gray-400 mb-1">Real first and last name</label>
                <input
                  id="student-real-name"
                  value={verifiedName}
                  onChange={(event) => setVerifiedName(event.target.value)}
                  placeholder="Waiting for student submission"
                  className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white focus:outline-none focus:border-cyan-400"
                />
                <p className="mt-2 text-xs text-gray-400">Confirm against the school register. This name is used on Cambridge tests; the codename remains visible in game areas.</p>
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <button onClick={() => reviewRealName(false)} disabled={nameSaving || !verifiedName.trim()} className="px-3 py-2 rounded-lg bg-red-600/80 hover:bg-red-500 disabled:opacity-50">Request correction</button>
                  <button onClick={() => reviewRealName(true)} disabled={nameSaving || verifiedName.trim().length < 5 || !verifiedName.trim().includes(' ')} className="px-3 py-2 rounded-lg bg-green-600 hover:bg-green-500 disabled:opacity-50">{nameSaving ? 'Saving…' : 'Confirm name'}</button>
                </div>
                {nameMessage && <p className="mt-2 text-xs text-cyan-300">{nameMessage}</p>}
              </div>
            )}

            {/* Role Change */}
            <div className="bg-gray-700/50 rounded-lg p-4">
              <h4 className="text-sm font-medium text-gray-400 mb-2">Change Role</h4>
              <div className="flex gap-2">
                {(['student', 'teacher', 'school_admin'] as SchoolRole[]).map((role) => (
                  <button
                    key={role}
                    onClick={() => handleUpdateRole(role)}
                    disabled={selectedMember.role === role || actionLoading}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      selectedMember.role === role
                        ? 'bg-cyan-500 text-white cursor-default'
                        : 'bg-gray-600 hover:bg-gray-500 text-gray-200'
                    } disabled:opacity-50`}
                  >
                    {role.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

            {/* Ban/Unban */}
            <div className="bg-gray-700/50 rounded-lg p-4">
              <h4 className="text-sm font-medium text-gray-400 mb-2">Account Status</h4>
              {selectedMember.is_banned ? (
                <button
                  onClick={handleUnbanMember}
                  disabled={actionLoading}
                  className="w-full px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 rounded-lg transition-colors"
                >
                  {actionLoading ? 'Processing...' : 'Unban User'}
                </button>
              ) : (
                <button
                  onClick={handleBanMember}
                  disabled={actionLoading}
                  className="w-full px-4 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 rounded-lg transition-colors"
                >
                  {actionLoading ? 'Processing...' : 'Ban User'}
                </button>
              )}
            </div>

            {/* Suspension Controls — students only */}
            {selectedMember.role === 'student' && !selectedMember.is_banned && (
              <div className="bg-gray-700/50 rounded-lg p-4">
                <h4 className="text-sm font-medium text-amber-400 mb-2">⏱️ Time-Limited Suspension</h4>
                {modTargetStatus && modTargetStatus.mod_status === 'suspended' ? (
                  <div className="space-y-2">
                    <p className="text-sm text-amber-200">
                      Suspended until {new Date(modTargetStatus.banned_until!).toLocaleString()}
                    </p>
                    <button
                      onClick={handleUnsuspendStudent}
                      disabled={suspendLoading}
                      className="w-full px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 rounded-lg transition-colors text-white font-medium"
                    >
                      {suspendLoading ? 'Processing...' : 'Lift Suspension Early'}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-3 items-end">
                      <div className="w-32">
                        <label className="block text-xs text-gray-400 mb-1">Duration</label>
                        <select
                          value={suspendDuration}
                          onChange={(e) => setSuspendDuration(Number(e.target.value))}
                          className="w-full px-2 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm"
                        >
                          <option value={1}>1 hour</option>
                          <option value={6}>6 hours</option>
                          <option value={24}>24 hours</option>
                          <option value={72}>3 days</option>
                          <option value={168}>7 days</option>
                          <option value={720}>30 days</option>
                        </select>
                      </div>
                      <div className="flex-1 min-w-[140px]">
                        <label className="block text-xs text-gray-400 mb-1">Reason</label>
                        <input
                          type="text"
                          value={suspendReason}
                          onChange={(e) => setSuspendReason(e.target.value)}
                          placeholder="e.g. Inappropriate behavior"
                          className="w-full px-2 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm"
                        />
                      </div>
                    </div>
                    <button
                      onClick={handleSuspendStudent}
                      disabled={suspendLoading}
                      className="w-full px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 rounded-lg transition-colors text-white font-medium"
                    >
                      {suspendLoading ? 'Suspending...' : 'Suspend Student'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Force Profile Change — students only */}
            {selectedMember.role === 'student' && !selectedMember.is_banned && (
              <div className="bg-gray-700/50 rounded-lg p-4">
                <h4 className="text-sm font-medium text-yellow-400 mb-2">✏️ Force Profile Change</h4>
                {modTargetStatus?.required_changes ? (
                  <div className="space-y-2">
                    <div className="space-y-1">
                      {modTargetStatus.required_changes.username && (
                        <p className="text-sm text-yellow-200">⬜ Username change pending</p>
                      )}
                      {modTargetStatus.required_changes.avatar && (
                        <p className="text-sm text-yellow-200">⬜ Avatar change pending</p>
                      )}
                      {modTargetStatus.required_changes.reason && (
                        <p className="text-xs text-gray-400 mt-1">Reason: {modTargetStatus.required_changes.reason}</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => loadStudentModStatus(modTargetStatus.user_id)}
                        className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg transition-colors text-white font-medium text-sm"
                      >
                        🔄 Refresh Status
                      </button>
                      <button
                        onClick={handleClearProfileChange}
                        disabled={forceChangeLoading}
                        className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 rounded-lg transition-colors text-white font-medium text-sm"
                      >
                        {forceChangeLoading ? 'Clearing...' : 'Clear Requirement'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-4 items-center">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={forceChangeUsername}
                          onChange={(e) => setForceChangeUsername(e.target.checked)}
                          className="w-4 h-4 rounded border-gray-600 text-purple-600 focus:ring-purple-500"
                        />
                        <span className="text-sm text-gray-300">Username</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={forceChangeAvatar}
                          onChange={(e) => setForceChangeAvatar(e.target.checked)}
                          className="w-4 h-4 rounded border-gray-600 text-purple-600 focus:ring-purple-500"
                        />
                        <span className="text-sm text-gray-300">Avatar</span>
                      </label>
                    </div>
                    <input
                      type="text"
                      value={forceChangeReason}
                      onChange={(e) => setForceChangeReason(e.target.value)}
                      placeholder="Reason (optional)"
                      className="w-full px-2 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm"
                    />
                    <button
                      onClick={handleForceProfileChange}
                      disabled={forceChangeLoading || (!forceChangeUsername && !forceChangeAvatar)}
                      className="w-full px-4 py-2 bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 rounded-lg transition-colors text-white font-medium"
                    >
                      {forceChangeLoading ? 'Setting...' : 'Require Change'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Remove from School */}
            <button
              onClick={handleRemoveMember}
              disabled={actionLoading}
              className="w-full px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 rounded-lg transition-colors"
            >
              {actionLoading ? 'Processing...' : 'Remove from School'}
            </button>
          </div>

          <button
            onClick={() => {
              setShowMemberActionModal(false);
              setSelectedMember(null);
              setModTargetStatus(null);
              setModTargetId('');
              setSuspendReason('');
              setForceChangeUsername(false);
              setForceChangeAvatar(false);
              setForceChangeReason('');
            }}
            className="w-full mt-4 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
            autoFocus
          >
            Close
          </button>
        </div>
      </div>,
      document.body
    )}
    </>
  );
};

export default MemberActionModal;
