import React from 'react';
import { useSchoolAdmin } from '../SchoolAdminContext';

const MembersTab: React.FC = () => {
  const {
    actionLoading, bulkMemberAction, formatRelativeTime, getRoleBadgeColor, handleBulkMemberAction, loadModerationLog, loadStudentModStatus, memberPage, memberPageSize, memberRoleFilter, memberSearch, memberSortDirection, memberSortKey, memberTotalPages, members, modLog, modLogExpanded, modLogLoading, school, selectedMemberIds, setBulkMemberAction, setMemberPage, setMemberPageSize, setMemberRoleFilter, setMemberSearch, setModLogExpanded, setModTargetId, setModTargetStatus, setSelectedMember, setShowMemberActionModal, sortedMembers, status, students, toggleMemberSelection, toggleMemberSort, toggleSelectAllMembers,
  } = useSchoolAdmin();

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-center">
        <label htmlFor="member-search" className="sr-only">
          Search members
        </label>
        <input
          id="member-search"
          type="text"
          placeholder="Search by username or email..."
          value={memberSearch}
          onChange={(e) => setMemberSearch(e.target.value)}
          className="flex-1 min-w-[200px] px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/40"
        />
        <label htmlFor="member-role-filter" className="sr-only">
          Filter by role
        </label>
        <select
          id="member-role-filter"
          value={memberRoleFilter}
          onChange={(e) => setMemberRoleFilter(e.target.value as SchoolRole | '')}
          className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/40"
        >
          <option value="">All Roles</option>
          <option value="student">Students</option>
          <option value="teacher">Teachers</option>
          <option value="school_admin">Admins</option>
        </select>
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <span>Rows:</span>
          <select
            value={memberPageSize}
            onChange={(e) => setMemberPageSize(Number(e.target.value))}
            className="px-2 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
          </select>
        </div>
      </div>

      {/* Bulk Actions */}
      <div className="flex flex-wrap items-center gap-3 bg-gray-800/60 border border-gray-700 rounded-lg px-4 py-3">
        <span className="text-sm text-gray-400">
          {selectedMemberIds.size} selected
        </span>
        <select
          value={bulkMemberAction}
          onChange={(e) => setBulkMemberAction(e.target.value)}
          className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500"
        >
          <option value="">Bulk actions</option>
          <option value="role:student">Change role → Student</option>
          <option value="role:teacher">Change role → Teacher</option>
          <option value="role:school_admin">Change role → Admin</option>
          <option value="ban">Ban selected</option>
          <option value="unban">Unban selected</option>
          <option value="remove">Remove from school</option>
        </select>
        <button
          onClick={handleBulkMemberAction}
          disabled={!bulkMemberAction || selectedMemberIds.size === 0 || actionLoading}
          className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 rounded-lg text-sm font-medium"
        >
          Apply
        </button>
      </div>

      {/* Members List */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-750 border-b border-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={members.length > 0 && members.every((member) => selectedMemberIds.has(member.user_id))}
                      onChange={(e) => toggleSelectAllMembers(members.map((m) => m.user_id), e.target.checked)}
                      className="rounded border-gray-600 bg-gray-700 text-cyan-500 focus:ring-cyan-500"
                      aria-label="Select all members on this page"
                    />
                    <button
                      type="button"
                      onClick={() => toggleMemberSort('username')}
                      className="inline-flex items-center gap-1 hover:text-white"
                    >
                      User
                      <span className="text-xs">{memberSortKey === 'username' ? (memberSortDirection === 'asc' ? '▲' : '▼') : ''}</span>
                    </button>
                  </label>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">
                  <button
                    type="button"
                    onClick={() => toggleMemberSort('role')}
                    className="inline-flex items-center gap-1 hover:text-white"
                  >
                    Role
                    <span className="text-xs">{memberSortKey === 'role' ? (memberSortDirection === 'asc' ? '▲' : '▼') : ''}</span>
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 hidden md:table-cell">
                  <button
                    type="button"
                    onClick={() => toggleMemberSort('grade')}
                    className="inline-flex items-center gap-1 hover:text-white"
                  >
                    Grade
                    <span className="text-xs">{memberSortKey === 'grade' ? (memberSortDirection === 'asc' ? '▲' : '▼') : ''}</span>
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 hidden lg:table-cell">
                  <button
                    type="button"
                    onClick={() => toggleMemberSort('level')}
                    className="inline-flex items-center gap-1 hover:text-white"
                  >
                    Level
                    <span className="text-xs">{memberSortKey === 'level' ? (memberSortDirection === 'asc' ? '▲' : '▼') : ''}</span>
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 hidden lg:table-cell">
                  <button
                    type="button"
                    onClick={() => toggleMemberSort('last_seen')}
                    className="inline-flex items-center gap-1 hover:text-white"
                  >
                    Last Seen
                    <span className="text-xs">{memberSortKey === 'last_seen' ? (memberSortDirection === 'asc' ? '▲' : '▼') : ''}</span>
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">
                  <button
                    type="button"
                    onClick={() => toggleMemberSort('status')}
                    className="inline-flex items-center gap-1 hover:text-white"
                  >
                    Status
                    <span className="text-xs">{memberSortKey === 'status' ? (memberSortDirection === 'asc' ? '▲' : '▼') : ''}</span>
                  </button>
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {sortedMembers.map((member) => (
                <tr key={member.user_id} className="hover:bg-gray-750">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={selectedMemberIds.has(member.user_id)}
                        onChange={() => toggleMemberSelection(member.user_id)}
                        className="rounded border-gray-600 bg-gray-700 text-cyan-500 focus:ring-cyan-500"
                        aria-label={`Select ${member.username}`}
                      />
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
                    ) : member.banned_until && new Date(member.banned_until) > new Date() ? (
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-amber-500/20 text-amber-400" title={`Until ${new Date(member.banned_until).toLocaleString()}`}>
                        Suspended
                      </span>
                    ) : member.required_changes ? (
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-yellow-500/20 text-yellow-400">
                        Change Req
                      </span>
                    ) : (
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-500/20 text-green-400">
                        Active
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => {
                        setSelectedMember(member);
                        setShowMemberActionModal(true);
                        // Auto-load moderation status for students
                        if (member.role === 'student') {
                          setModTargetId(member.user_id);
                          loadStudentModStatus(member.user_id);
                        } else {
                          setModTargetStatus(null);
                        }
                      }}
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
        {members.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-gray-700 text-sm text-gray-400">
            <span>
              Page {memberPage} of {memberTotalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setMemberPage((prev) => Math.max(1, prev - 1))}
                disabled={memberPage === 1}
                className="px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setMemberPage((prev) => Math.min(memberTotalPages, prev + 1))}
                disabled={memberPage >= memberTotalPages}
                className="px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
        {members.length === 0 && (
          <div className="p-8 text-center text-gray-500">
            No members found matching your criteria
          </div>
        )}
      </div>

      {/* Collapsible Moderation Audit Log */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        <button
          onClick={() => {
            setModLogExpanded(!modLogExpanded);
            if (!modLogExpanded && modLog.length === 0) loadModerationLog();
          }}
          className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-700/50 transition-colors"
        >
          <h3 className="text-lg font-semibold text-gray-200">📋 Moderation Log</h3>
          <span className="text-gray-400 text-sm">{modLogExpanded ? '▲ Collapse' : '▼ Expand'}</span>
        </button>
        {modLogExpanded && (
          <div className="px-6 pb-4">
            <div className="flex justify-end mb-3">
              <button
                onClick={loadModerationLog}
                disabled={modLogLoading}
                className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded-lg text-sm transition-colors"
              >
                {modLogLoading ? 'Loading...' : 'Refresh'}
              </button>
            </div>
            {modLog.length === 0 && !modLogLoading && (
              <p className="text-sm text-gray-500">No moderation actions recorded yet.</p>
            )}
            {modLog.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-400 border-b border-gray-700">
                      <th className="pb-2 pr-4">When</th>
                      <th className="pb-2 pr-4">Admin</th>
                      <th className="pb-2 pr-4">Action</th>
                      <th className="pb-2 pr-4">Student</th>
                      <th className="pb-2">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700/50">
                    {modLog.map((entry) => (
                      <tr key={entry.id} className="text-gray-300 hover:bg-gray-700/30">
                        <td className="py-2 pr-4 whitespace-nowrap text-xs text-gray-500">
                          {new Date(entry.created_at).toLocaleString()}
                        </td>
                        <td className="py-2 pr-4 whitespace-nowrap">{entry.actor_username}</td>
                        <td className="py-2 pr-4 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                            entry.action === 'student_suspended' ? 'bg-amber-600/30 text-amber-300' :
                            entry.action === 'student_unsuspended' ? 'bg-green-600/30 text-green-300' :
                            entry.action === 'force_profile_change' ? 'bg-yellow-600/30 text-yellow-300' :
                            'bg-gray-600/30 text-gray-300'
                          }`}>
                            {entry.action.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="py-2 pr-4 whitespace-nowrap">{entry.target_username}</td>
                        <td className="py-2 text-xs text-gray-500 max-w-[300px] truncate">
                          {entry.details?.reason || entry.details?.duration_hours ? `${entry.details.duration_hours ? entry.details.duration_hours + 'h — ' : ''}${entry.details.reason || ''}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default MembersTab;
