import React, { useState, useEffect, useCallback } from 'react';
import BackButton from './BackButton';
import { ToastMessage } from '../types';
import * as SchoolAdminService from '../services/schoolAdminService';
import type { SchoolStats, SchoolMember, InviteCode, SchoolInfo } from '../services/schoolAdminService';
import type { SchoolRole } from '../types';

interface SchoolAdminPortalProps {
  onComplete: () => void;
  addToast: (message: string, type: ToastMessage['type']) => void;
}

type AdminTab = 'dashboard' | 'members' | 'invites' | 'settings';

const SchoolAdminPortal: React.FC<SchoolAdminPortalProps> = ({ onComplete, addToast }) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [loading, setLoading] = useState(true);
  const [school, setSchool] = useState<SchoolInfo | null>(null);
  const [stats, setStats] = useState<SchoolStats | null>(null);
  const [members, setMembers] = useState<SchoolMember[]>([]);
  const [membersTotal, setMembersTotal] = useState(0);
  const [inviteCodes, setInviteCodes] = useState<InviteCode[]>([]);
  
  // Filters
  const [memberSearch, setMemberSearch] = useState('');
  const [memberRoleFilter, setMemberRoleFilter] = useState<SchoolRole | ''>('');
  const [showExpiredInvites, setShowExpiredInvites] = useState(false);
  
  // Modals
  const [showGenerateInviteModal, setShowGenerateInviteModal] = useState(false);
  const [showMemberActionModal, setShowMemberActionModal] = useState(false);
  const [selectedMember, setSelectedMember] = useState<SchoolMember | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  
  // Invite form state
  const [newInviteRole, setNewInviteRole] = useState<SchoolRole>('student');
  const [newInviteMaxUses, setNewInviteMaxUses] = useState<number | ''>('');
  const [newInviteExpiresDays, setNewInviteExpiresDays] = useState<number>(30);

  // Settings state
  const [settingsName, setSettingsName] = useState('');
  const [settingsAllowStudent, setSettingsAllowStudent] = useState(true);
  const [settingsAllowTeacher, setSettingsAllowTeacher] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  // Load initial data
  useEffect(() => {
    loadSchoolData();
  }, []);

  const loadSchoolData = async () => {
    setLoading(true);
    try {
      const schoolData = await SchoolAdminService.getCurrentSchool();
      if (!schoolData || schoolData.role !== 'school_admin') {
        addToast('You do not have school admin permissions', 'error');
        onComplete();
        return;
      }

      setSchool(schoolData.school);
      setSettingsName(schoolData.school.name);
      setSettingsAllowStudent(schoolData.school.allow_student_signup);
      setSettingsAllowTeacher(schoolData.school.allow_teacher_signup);

      // Load stats
      const statsData = await SchoolAdminService.getSchoolStats(schoolData.school.id);
      setStats(statsData);

      // Load members
      await loadMembers(schoolData.school.id);

      // Load invite codes
      await loadInviteCodes(schoolData.school.id);
    } catch (err) {
      console.error('Error loading school data:', err);
      addToast('Failed to load school data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadMembers = useCallback(async (schoolId: string) => {
    const { members: memberList, total } = await SchoolAdminService.listSchoolMembers(schoolId, {
      role: memberRoleFilter || undefined,
      search: memberSearch || undefined,
      limit: 50,
    });
    setMembers(memberList);
    setMembersTotal(total);
  }, [memberRoleFilter, memberSearch]);

  const loadInviteCodes = useCallback(async (schoolId: string) => {
    const codes = await SchoolAdminService.listInviteCodes(schoolId, showExpiredInvites);
    setInviteCodes(codes);
  }, [showExpiredInvites]);

  // Reload members when filters change
  useEffect(() => {
    if (school?.id) {
      loadMembers(school.id);
    }
  }, [school?.id, memberSearch, memberRoleFilter, loadMembers]);

  // Reload invite codes when filter changes
  useEffect(() => {
    if (school?.id) {
      loadInviteCodes(school.id);
    }
  }, [school?.id, showExpiredInvites, loadInviteCodes]);

  // Member actions
  const handleUpdateRole = async (newRole: SchoolRole) => {
    if (!school || !selectedMember) return;
    
    setActionLoading(true);
    const result = await SchoolAdminService.updateMemberRole(
      school.id,
      selectedMember.user_id,
      newRole
    );
    setActionLoading(false);

    if (result.success) {
      addToast(`Updated ${selectedMember.username}'s role to ${newRole}`, 'success');
      await loadMembers(school.id);
      setShowMemberActionModal(false);
    } else {
      addToast(result.error || 'Failed to update role', 'error');
    }
  };

  const handleRemoveMember = async () => {
    if (!school || !selectedMember) return;
    
    if (!confirm(`Are you sure you want to remove ${selectedMember.username} from the school?`)) {
      return;
    }

    setActionLoading(true);
    const result = await SchoolAdminService.removeMember(school.id, selectedMember.user_id);
    setActionLoading(false);

    if (result.success) {
      addToast(`Removed ${selectedMember.username} from the school`, 'success');
      await loadMembers(school.id);
      const statsData = await SchoolAdminService.getSchoolStats(school.id);
      setStats(statsData);
      setShowMemberActionModal(false);
    } else {
      addToast(result.error || 'Failed to remove member', 'error');
    }
  };

  const handleBanMember = async () => {
    if (!school || !selectedMember) return;
    
    const reason = prompt('Enter ban reason (optional):');
    
    setActionLoading(true);
    const result = await SchoolAdminService.banMember(school.id, selectedMember.user_id, reason || undefined);
    setActionLoading(false);

    if (result.success) {
      addToast(`Banned ${selectedMember.username}`, 'success');
      await loadMembers(school.id);
      const statsData = await SchoolAdminService.getSchoolStats(school.id);
      setStats(statsData);
      setShowMemberActionModal(false);
    } else {
      addToast(result.error || 'Failed to ban member', 'error');
    }
  };

  const handleUnbanMember = async () => {
    if (!school || !selectedMember) return;
    
    setActionLoading(true);
    const result = await SchoolAdminService.unbanMember(school.id, selectedMember.user_id);
    setActionLoading(false);

    if (result.success) {
      addToast(`Unbanned ${selectedMember.username}`, 'success');
      await loadMembers(school.id);
      const statsData = await SchoolAdminService.getSchoolStats(school.id);
      setStats(statsData);
      setShowMemberActionModal(false);
    } else {
      addToast(result.error || 'Failed to unban member', 'error');
    }
  };

  // Invite code actions
  const handleGenerateInvite = async () => {
    if (!school) return;

    setActionLoading(true);
    const result = await SchoolAdminService.generateInviteCode(school.id, newInviteRole, {
      maxUses: newInviteMaxUses || undefined,
      expiresInDays: newInviteExpiresDays,
    });
    setActionLoading(false);

    if (result.success && result.code) {
      addToast(`Generated invite code: ${result.code}`, 'success');
      await loadInviteCodes(school.id);
      const statsData = await SchoolAdminService.getSchoolStats(school.id);
      setStats(statsData);
      setShowGenerateInviteModal(false);
      // Reset form
      setNewInviteRole('student');
      setNewInviteMaxUses('');
      setNewInviteExpiresDays(30);
    } else {
      addToast(result.error || 'Failed to generate invite code', 'error');
    }
  };

  const handleRevokeInvite = async (invite: InviteCode) => {
    if (!school) return;
    
    if (!confirm(`Are you sure you want to revoke invite code ${invite.code}?`)) {
      return;
    }

    const result = await SchoolAdminService.revokeInviteCode(school.id, invite.id);

    if (result.success) {
      addToast('Invite code revoked', 'success');
      await loadInviteCodes(school.id);
      const statsData = await SchoolAdminService.getSchoolStats(school.id);
      setStats(statsData);
    } else {
      addToast(result.error || 'Failed to revoke invite code', 'error');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    addToast('Copied to clipboard!', 'success');
  };

  // Settings actions
  const handleSaveSettings = async () => {
    if (!school) return;

    setSavingSettings(true);
    const result = await SchoolAdminService.updateSchoolSettings(school.id, {
      name: settingsName,
      allow_student_signup: settingsAllowStudent,
      allow_teacher_signup: settingsAllowTeacher,
    });
    setSavingSettings(false);

    if (result.success) {
      addToast('Settings saved successfully', 'success');
      setSchool({
        ...school,
        name: settingsName,
        allow_student_signup: settingsAllowStudent,
        allow_teacher_signup: settingsAllowTeacher,
      });
    } else {
      addToast(result.error || 'Failed to save settings', 'error');
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatRelativeTime = (dateString: string | null) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return formatDate(dateString);
  };

  const getRoleBadgeColor = (role: SchoolRole | string) => {
    switch (role) {
      case 'school_admin': return 'bg-purple-500 text-white';
      case 'teacher': return 'bg-blue-500 text-white';
      case 'student': return 'bg-green-500 text-white';
      default: return 'bg-gray-500 text-white';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400 mx-auto"></div>
          <p className="mt-4 text-gray-400">Loading school portal...</p>
        </div>
      </div>
    );
  }

  if (!school) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400">No school found</p>
          <button onClick={onComplete} className="mt-4 text-cyan-400 hover:underline">
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <BackButton onClick={onComplete} />
          <div>
            <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-500">
              {school.name}
            </h1>
            <p className="text-gray-400 text-sm">School Admin Portal</p>
          </div>
        </div>
        {school.logo_url && (
          <img src={school.logo_url} alt={school.name} className="h-12 w-12 rounded-lg object-cover" />
        )}
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {(['dashboard', 'members', 'invites', 'settings'] as AdminTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg font-medium transition-all whitespace-nowrap ${
              activeTab === tab
                ? 'bg-cyan-500 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            {tab === 'dashboard' && '📊 Dashboard'}
            {tab === 'members' && `👥 Members (${membersTotal})`}
            {tab === 'invites' && `🔑 Invite Codes (${inviteCodes.length})`}
            {tab === 'settings' && '⚙️ Settings'}
          </button>
        ))}
      </div>

      {/* Dashboard Tab */}
      {activeTab === 'dashboard' && stats && (
        <div className="space-y-6">
          {/* Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <div className="text-3xl font-bold text-cyan-400">{stats.total_students}</div>
              <div className="text-gray-400 text-sm">Students</div>
            </div>
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <div className="text-3xl font-bold text-blue-400">{stats.total_teachers}</div>
              <div className="text-gray-400 text-sm">Teachers</div>
            </div>
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <div className="text-3xl font-bold text-purple-400">{stats.total_admins}</div>
              <div className="text-gray-400 text-sm">Admins</div>
            </div>
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <div className="text-3xl font-bold text-green-400">{stats.active_users_7d}</div>
              <div className="text-gray-400 text-sm">Active (7d)</div>
            </div>
          </div>

          {/* Secondary Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <div className="text-2xl font-bold text-yellow-400">{stats.xp_earned_7d.toLocaleString()}</div>
              <div className="text-gray-400 text-sm">XP Earned (7d)</div>
            </div>
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <div className="text-2xl font-bold text-orange-400">{stats.pending_invites}</div>
              <div className="text-gray-400 text-sm">Pending Invites</div>
            </div>
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <div className="text-2xl font-bold text-green-400">{stats.used_invites}</div>
              <div className="text-gray-400 text-sm">Used Invites</div>
            </div>
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <div className="text-2xl font-bold text-red-400">{stats.banned_members}</div>
              <div className="text-gray-400 text-sm">Banned</div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => { setActiveTab('invites'); setShowGenerateInviteModal(true); }}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg transition-colors"
              >
                🔑 Generate Invite Code
              </button>
              <button
                onClick={() => setActiveTab('members')}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg transition-colors"
              >
                👥 Manage Members
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Members Tab */}
      {activeTab === 'members' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-4 items-center">
            <input
              type="text"
              placeholder="Search by username or email..."
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              className="flex-1 min-w-[200px] px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500"
            />
            <select
              value={memberRoleFilter}
              onChange={(e) => setMemberRoleFilter(e.target.value as SchoolRole | '')}
              className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
            >
              <option value="">All Roles</option>
              <option value="student">Students</option>
              <option value="teacher">Teachers</option>
              <option value="school_admin">Admins</option>
            </select>
          </div>

          {/* Members List */}
          <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-750 border-b border-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">User</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">Role</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-400 hidden md:table-cell">Grade</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-400 hidden lg:table-cell">Level</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-400 hidden lg:table-cell">Last Seen</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">Status</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-400">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {members.map((member) => (
                    <tr key={member.user_id} className="hover:bg-gray-750">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <img
                            src={member.avatar_url || '/avatars/default.png'}
                            alt={member.username}
                            className="w-8 h-8 rounded-full bg-gray-700"
                          />
                          <div>
                            <div className="font-medium text-white">{member.username}</div>
                            <div className="text-xs text-gray-500">{member.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getRoleBadgeColor(member.role)}`}>
                          {member.role.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-400 hidden md:table-cell">
                        {member.grade ? `Grade ${member.grade}${member.batch ? ` (${member.batch})` : ''}` : '-'}
                      </td>
                      <td className="px-4 py-3 text-gray-400 hidden lg:table-cell">
                        Lvl {member.level} ({member.xp.toLocaleString()} XP)
                      </td>
                      <td className="px-4 py-3 text-gray-400 hidden lg:table-cell">
                        {formatRelativeTime(member.last_seen)}
                      </td>
                      <td className="px-4 py-3">
                        {member.is_banned ? (
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-500/20 text-red-400">
                            Banned
                          </span>
                        ) : (
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-500/20 text-green-400">
                            Active
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => { setSelectedMember(member); setShowMemberActionModal(true); }}
                          className="text-cyan-400 hover:text-cyan-300 text-sm"
                        >
                          Manage
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {members.length === 0 && (
              <div className="p-8 text-center text-gray-500">
                No members found matching your criteria
              </div>
            )}
          </div>
        </div>
      )}

      {/* Invites Tab */}
      {activeTab === 'invites' && (
        <div className="space-y-4">
          {/* Actions Bar */}
          <div className="flex flex-wrap justify-between items-center gap-4">
            <button
              onClick={() => setShowGenerateInviteModal(true)}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg transition-colors font-medium"
            >
              + Generate New Code
            </button>
            <label className="flex items-center gap-2 text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={showExpiredInvites}
                onChange={(e) => setShowExpiredInvites(e.target.checked)}
                className="rounded border-gray-600 bg-gray-800 text-cyan-500 focus:ring-cyan-500"
              />
              Show expired/revoked
            </label>
          </div>

          {/* Invite Codes List */}
          <div className="space-y-3">
            {inviteCodes.map((invite) => (
              <div
                key={invite.id}
                className={`bg-gray-800 rounded-xl p-4 border ${
                  invite.is_active ? 'border-gray-700' : 'border-red-500/30 opacity-60'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div
                      className="font-mono text-lg font-bold text-cyan-400 cursor-pointer hover:text-cyan-300"
                      onClick={() => copyToClipboard(invite.code)}
                      title="Click to copy"
                    >
                      {invite.code}
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getRoleBadgeColor(invite.role_to_assign)}`}>
                      {invite.role_to_assign.replace('_', ' ')}
                    </span>
                    {!invite.is_active && (
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-500/20 text-red-400">
                        {new Date(invite.expires_at || '') < new Date() ? 'Expired' : 'Revoked'}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-sm text-gray-400">
                      <span className="font-medium text-white">{invite.use_count}</span>
                      {invite.max_uses ? ` / ${invite.max_uses}` : ''} uses
                    </div>
                    {invite.is_active && (
                      <button
                        onClick={() => handleRevokeInvite(invite)}
                        className="text-red-400 hover:text-red-300 text-sm"
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-4 text-xs text-gray-500">
                  <span>Created: {formatDate(invite.created_at)}</span>
                  <span>Expires: {invite.expires_at ? formatDate(invite.expires_at) : 'Never'}</span>
                  {invite.creator_username && <span>By: {invite.creator_username}</span>}
                </div>
              </div>
            ))}
            {inviteCodes.length === 0 && (
              <div className="bg-gray-800 rounded-xl p-8 text-center text-gray-500 border border-gray-700">
                No invite codes found. Generate one to invite users to your school.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Settings Tab */}
      {activeTab === 'settings' && (
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
      )}

      {/* Generate Invite Modal */}
      {showGenerateInviteModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl p-6 max-w-md w-full border border-gray-700">
            <h3 className="text-xl font-bold mb-4">Generate Invite Code</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Role to Assign</label>
                <select
                  value={newInviteRole}
                  onChange={(e) => setNewInviteRole(e.target.value as SchoolRole)}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="student">Student</option>
                  <option value="teacher">Teacher</option>
                  <option value="school_admin">School Admin</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Max Uses (optional)</label>
                <input
                  type="number"
                  min="1"
                  placeholder="Unlimited"
                  value={newInviteMaxUses}
                  onChange={(e) => setNewInviteMaxUses(e.target.value ? parseInt(e.target.value) : '')}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Expires In (days)</label>
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={newInviteExpiresDays}
                  onChange={(e) => setNewInviteExpiresDays(parseInt(e.target.value) || 30)}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowGenerateInviteModal(false)}
                className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleGenerateInvite}
                disabled={actionLoading}
                className="flex-1 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 rounded-lg transition-colors font-medium"
              >
                {actionLoading ? 'Generating...' : 'Generate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Member Action Modal */}
      {showMemberActionModal && selectedMember && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl p-6 max-w-md w-full border border-gray-700">
            <div className="flex items-center gap-4 mb-4">
              <img
                src={selectedMember.avatar_url || '/avatars/default.png'}
                alt={selectedMember.username}
                className="w-12 h-12 rounded-full bg-gray-700"
              />
              <div>
                <h3 className="text-xl font-bold">{selectedMember.username}</h3>
                <p className="text-gray-400 text-sm">{selectedMember.email}</p>
              </div>
            </div>

            <div className="space-y-3">
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
              onClick={() => { setShowMemberActionModal(false); setSelectedMember(null); }}
              className="w-full mt-4 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SchoolAdminPortal;
