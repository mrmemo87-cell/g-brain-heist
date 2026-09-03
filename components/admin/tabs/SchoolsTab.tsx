import React, { useMemo, useState } from 'react';
import { useAdmin } from '../AdminContext';

const SchoolsTab: React.FC = () => {
  const {
    currentSchoolAdmin, filteredSchoolMembers,
    handleSetSchoolAdmin, isSuperadmin,
    loadSchoolMembers, loadSchoolQuotas, pilotTrialEnd,
    schoolAdminActionLoading, schoolAdminSchoolId, schoolMemberSearch,
    schoolMembersError, schoolMembersLoading, schoolOptions, schoolQuotas, schoolQuotasLoading, 
    setPilotTrialEnd,
    setSchoolAdminSchoolId, setSchoolMemberSearch, setSchoolMembers, setSchoolMembersError, 
    setSchoolQuotas, users,
  } = useAdmin();

  const [memberRoleFilter, setMemberRoleFilter] = useState('all');
  const [memberGradeFilter, setMemberGradeFilter] = useState('all');

  const visibleSchoolMembers = useMemo(() => {
    if (!schoolAdminSchoolId) return [];
    return filteredSchoolMembers.filter((member: any) => {
      if (memberRoleFilter !== 'all' && member.role !== memberRoleFilter) return false;
      if (memberGradeFilter !== 'all' && String(member.grade ?? '') !== memberGradeFilter) return false;
      return true;
    });
  }, [filteredSchoolMembers, memberGradeFilter, memberRoleFilter, schoolAdminSchoolId]);

  return (
    <div className="space-y-6">
      {isSuperadmin && (
        <div className="card-glass border-2 border-indigo-400/50 p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-2xl font-heading font-bold text-indigo-200">🏫 School Admin Management</h3>
                <span className="rounded-full border border-indigo-300/40 bg-indigo-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-indigo-100">
                  Superadmin only
                </span>
              </div>
              <p className="text-sm text-gray-400">
                Assign school admin role to users within a school. School admins can manage their school's members, classes, and settings.
              </p>
            </div>
            <button
              type="button"
              onClick={() => loadSchoolMembers(schoolAdminSchoolId)}
              disabled={!schoolAdminSchoolId || schoolMembersLoading}
              className="rounded-lg border border-indigo-400/60 bg-indigo-500/20 px-4 py-2 text-sm font-semibold text-indigo-100 hover:bg-indigo-500/30 disabled:opacity-60"
            >
              {schoolMembersLoading ? 'Loading...' : '🔄 Refresh Members'}
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-[2fr_1fr_1fr_1fr]">
            <select
              value={schoolAdminSchoolId}
              onChange={(event) => {
                const selectedId = event.target.value;
                setSchoolAdminSchoolId(selectedId);
                setSchoolMembers([]);
                setSchoolMembersError(null);
                setSchoolMemberSearch('');
                setMemberRoleFilter('all');
                setMemberGradeFilter('all');
                if (selectedId) {
                  loadSchoolMembers(selectedId);
                  loadSchoolQuotas(selectedId);
                } else {
                  setSchoolQuotas(null);
                  setPilotTrialEnd(null);
                }
              }}
              className="w-full rounded-lg border border-indigo-400/30 bg-black/40 px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              <option value="">Select a school to manage</option>
              {schoolOptions.map((school) => (
                <option key={school.id} value={school.id}>
                  {school.name}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={schoolMemberSearch}
              onChange={(event) => setSchoolMemberSearch(event.target.value)}
              placeholder="Search username or email..."
              className="w-full rounded-lg border border-indigo-400/30 bg-black/40 px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <select value={memberRoleFilter} onChange={(event) => setMemberRoleFilter(event.target.value)} className="w-full rounded-lg border border-indigo-400/30 bg-black/40 px-4 py-2 text-white">
              <option value="all">All roles</option>
              <option value="student">Students</option>
              <option value="teacher">Teachers</option>
              <option value="school_admin">School admins</option>
            </select>
            <select value={memberGradeFilter} onChange={(event) => setMemberGradeFilter(event.target.value)} className="w-full rounded-lg border border-indigo-400/30 bg-black/40 px-4 py-2 text-white">
              <option value="all">All grades</option>
              {[6, 7, 8, 9, 10, 11, 12].map((grade) => <option key={grade} value={String(grade)}>Grade {grade}</option>)}
            </select>
          </div>

          {schoolAdminSchoolId && (
            <div className="mt-4 rounded-lg border border-indigo-400/20 bg-indigo-500/10 px-4 py-2 text-sm text-indigo-100">
              {currentSchoolAdmin ? (
                <span>
                  📌 Current school admin: <strong>{currentSchoolAdmin.username || currentSchoolAdmin.email}</strong>
                  {currentSchoolAdmin.email && ` (${currentSchoolAdmin.email})`}
                </span>
              ) : (
                <span>⚠️ No school admin assigned yet. Select a member below to make them school admin.</span>
              )}
            </div>
          )}

          {/* Billing access is governed from the dedicated Billing tab. */}
          {schoolAdminSchoolId && (
            <div className="mt-4 rounded-lg border border-emerald-400/20 bg-emerald-500/10 px-4 py-3">
              <p className="text-sm font-semibold text-emerald-100">Billing and programme access are managed in Billing.</p>
              <p className="mt-1 text-xs text-emerald-100/70">A verified agreement must name the exact programmes before access changes.</p>
            </div>
          )}

          {/* ── Pilot Quota Management Panel ── */}
          {schoolAdminSchoolId && schoolQuotas && (
            <div className="mt-4 rounded-lg border border-amber-400/30 bg-amber-500/5 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <div><h4 className="text-sm font-bold text-amber-200">Pilot usage signals</h4><p className="mt-1 text-xs text-amber-100/60">Informational only. Usage never shortens the fixed 30-day all-feature pilot.</p></div>
                <div className="flex flex-wrap items-center gap-2">
                  {pilotTrialEnd && (
                    <span className="text-xs text-amber-300/80">
                      Trial ends: {new Date(pilotTrialEnd).toLocaleDateString()}
                      {new Date(pilotTrialEnd) <= new Date() && <span className="ml-1 text-red-400 font-bold">(EXPIRED)</span>}
                      {new Date(pilotTrialEnd) > new Date() && (
                        <span className="ml-1">({Math.ceil((new Date(pilotTrialEnd).getTime() - Date.now()) / 86400000)}d left)</span>
                      )}
                    </span>
                  )}
                  <button
                    onClick={() => loadSchoolQuotas(schoolAdminSchoolId)}
                    disabled={schoolQuotasLoading}
                    className="rounded border border-amber-400/40 bg-amber-500/20 px-2.5 py-1 text-xs font-semibold text-amber-100 hover:bg-amber-500/30 disabled:opacity-50"
                  >
                    {schoolQuotasLoading ? '⏳' : '🔄'} Refresh
                  </button>
                </div>
              </div>

              <div className="grid gap-2 md:grid-cols-2">
                {Object.entries(schoolQuotas).map(([fid, q]) => {
                  const pct = q.limit > 0 ? Math.min((q.used / q.limit) * 100, 100) : 0;
                  const barColor = pct >= 100 ? 'bg-cyan-500' : pct > 75 ? 'bg-amber-500' : 'bg-emerald-500';
                  const label = fid.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                  return (
                    <div key={fid} className="rounded-lg border border-white/10 bg-black/30 px-3 py-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-white/80">{label}</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-white/90">{q.used} recorded</span>
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {schoolAdminSchoolId && schoolQuotasLoading && !schoolQuotas && (
            <div className="mt-4 rounded-lg border border-amber-400/20 bg-amber-500/5 p-4 text-center">
              <div className="inline-block animate-spin h-5 w-5 border-2 border-amber-400 border-t-transparent rounded-full"></div>
              <p className="text-xs text-amber-200 mt-2">Loading quotas...</p>
            </div>
          )}

          {schoolMembersError && (
            <div className="mt-4 rounded-lg border border-red-400/40 bg-red-500/10 px-4 py-2 text-sm text-red-200">
              ❌ {schoolMembersError}
            </div>
          )}

          {schoolMembersLoading && (
            <div className="mt-4 rounded-lg border border-white/10 bg-black/30 p-8 text-center">
              <div className="inline-block animate-spin h-8 w-8 border-4 border-indigo-400 border-t-transparent rounded-full"></div>
              <p className="text-sm text-gray-400 mt-3">Loading school members...</p>
            </div>
          )}

          {!schoolMembersLoading && schoolAdminSchoolId && visibleSchoolMembers.length === 0 && (
            <div className="mt-4 rounded-lg border border-white/10 bg-black/30 p-8 text-center text-sm text-gray-400">
              <p className="text-4xl mb-2">🔍</p>
              <p>No members found for this school.</p>
              {schoolMemberSearch && <p className="text-xs mt-2">Try adjusting your search.</p>}
            </div>
          )}

          {schoolAdminSchoolId && visibleSchoolMembers.length > 0 && (
            <div className="mt-4 space-y-3">
              <p className="text-xs text-gray-400">
                Selected school only · showing {visibleSchoolMembers.length} member{visibleSchoolMembers.length !== 1 ? 's' : ''}
              </p>
              {visibleSchoolMembers.map((member) => {
                const isAdmin = member.role === 'school_admin';
                return (
                  <div
                    key={member.user_id}
                    className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4 transition-all ${
                      isAdmin
                        ? 'border-indigo-400/60 bg-indigo-500/15 shadow-[0_0_20px_rgba(99,102,241,0.3)]'
                        : 'border-white/10 bg-black/40 hover:bg-black/50'
                    }`}
                  >
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <p className="font-semibold text-white text-lg">
                          {member.username || member.email || member.user_id}
                        </p>
                        {isAdmin && (
                          <span className="rounded-full border border-indigo-300/40 bg-indigo-500/30 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-indigo-100 shadow-lg">
                            👑 School Admin
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-3 text-xs text-gray-400">
                        <span>📧 {member.email || 'No email'}</span>
                        <span>•</span>
                        <span>👤 {member.role.replace(/_/g, ' ')}</span>
                        {member.grade && (
                          <>
                            <span>•</span>
                            <span>📚 Grade {member.grade}</span>
                          </>
                        )}
                        {member.level > 0 && (
                          <>
                            <span>•</span>
                            <span>⭐ Level {member.level}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSetSchoolAdmin(schoolAdminSchoolId, member.user_id, !isAdmin)}
                      disabled={schoolAdminActionLoading === member.user_id}
                      className={`rounded-lg border px-4 py-2 text-sm font-semibold transition-all ${
                        isAdmin
                          ? schoolAdminActionLoading === member.user_id
                            ? 'border-red-400/50 bg-red-500/30 text-red-100 cursor-wait'
                            : 'border-red-400/50 bg-red-500/20 text-red-100 hover:bg-red-500/40 hover:border-red-400'
                          : schoolAdminActionLoading === member.user_id
                            ? 'border-indigo-400/50 bg-indigo-500/30 text-indigo-100 cursor-wait'
                            : 'border-indigo-400/50 bg-indigo-500/20 text-indigo-100 hover:bg-indigo-500/40 hover:border-indigo-400'
                      }`}
                    >
                      {schoolAdminActionLoading === member.user_id ? (
                        <>⏳ Updating...</>
                      ) : isAdmin ? (
                        <>❌ Remove Admin</>
                      ) : (
                        <>👑 Make School Admin</>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {!isSuperadmin && (
        <div className="card-glass border-2 border-red-400/50 p-8 text-center">
          <p className="text-4xl mb-4">🔒</p>
          <h3 className="text-2xl font-bold text-red-300 mb-2">Access Restricted</h3>
          <p className="text-gray-400">Only superadmins can manage schools and school admins.</p>
        </div>
      )}
    </div>
  );
};

export default SchoolsTab;
