import React, { useEffect, useMemo, useState } from 'react';
import type { Grade } from '../../../types';
import { useAdmin } from '../AdminContext';
import ClickableUsername from '../../ClickableUsername';
import UserIntelligencePanel from '../users/UserIntelligencePanel';

type UserAction =
  | 'details'
  | 'coins'
  | 'xp'
  | 'gems'
  | 'ap'
  | 'level'
  | 'progress'
  | 'academics'
  | 'ban'
  | 'delete';

type SortKey = 'last-active' | 'name' | 'xp' | 'level';

const UsersTab: React.FC = () => {
  const {
    PAGE_SIZE, batchByGrade, changeUserRole, customCoinAmount, customGemstoneAmount, customLevelAmount, customXpAmount,
    deleteUser, fetchUsers, gradeOptions, grantCoins, grantCustomCoins, grantCustomGemstones, grantCustomXP, grantGemstones, grantXP,
    handleBatchChange, handleGradeChange, hasNextPage, resetUserAP, resetUserAcademics,
    resetUserProgress, resolveUserEmail, resolveUserLabel, roleChangeLoading, searchQuery, schoolOptions,
    setCustomCoinAmount, setCustomGemstoneAmount, setCustomLevel, setCustomLevelAmount, setCustomXpAmount, setSearchQuery,
    setShowCustomGrant, setUserBanState, setUserLevel, setUserPage, showCustomGrant, userPage,
    userRoleFilter, setUserRoleFilter, userGradeFilter, setUserGradeFilter,
    userSchoolFilter, setUserSchoolFilter, userStatusFilter, setUserStatusFilter, userSortKey, setUserSortKey,
    users, usersError, usersLoading,
  } = useAdmin();

  const roleFilter = userRoleFilter;
  const setRoleFilter = setUserRoleFilter;
  const gradeFilter = userGradeFilter;
  const setGradeFilter = setUserGradeFilter;
  const schoolFilter = userSchoolFilter;
  const setSchoolFilter = setUserSchoolFilter;
  const statusFilter = userStatusFilter;
  const setStatusFilter = setUserStatusFilter;
  const sortKey: SortKey = userSortKey;
  const setSortKey = setUserSortKey;
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  // AdminContext intentionally remains loose-typed. Normalize every collection at
  // the view boundary so an unexpected RPC/context payload can never crash the tab.
  const safeUsers = Array.isArray(users) ? users : [];
  const safeGradeOptions: Grade[] = Array.isArray(gradeOptions) ? gradeOptions : [];
  const safeBatchByGrade: Partial<Record<Grade, string[]>> = batchByGrade && typeof batchByGrade === 'object' ? batchByGrade : {};
  const safeSchoolOptions: Array<{ id: string; name: string }> = Array.isArray(schoolOptions) ? schoolOptions : [];

  const userGrade = (user: any): Grade | null => {
    if (typeof user?.grade === 'number' && user.grade >= 6 && user.grade <= 12) return user.grade as Grade;
    if (typeof user?.grade === 'string' && user.grade.trim()) {
      const parsed = Number.parseInt(user.grade, 10);
      return parsed >= 6 && parsed <= 12 ? (parsed as Grade) : null;
    }
    return null;
  };

  const schoolName = (user: any) => {
    const direct = user?.school_name ?? user?.school?.name ?? user?.schools?.name;
    if (typeof direct === 'string' && direct.trim()) return direct.trim();
    const schoolId = typeof user?.school_id === 'string' ? user.school_id : '';
    if (!schoolId) return 'Unassigned';
    return safeSchoolOptions.find((school) => school.id === schoolId)?.name || 'Assigned school';
  };

  const normalizedRole = (user: any) => String(user?.role || (user?.is_admin ? 'admin' : 'student')).toLowerCase();

  const normalizedStatus = (user: any) => {
    if (Boolean(user?.is_banned)) return 'banned';
    const raw = String(user?.status || '').toLowerCase();
    if (raw === 'suspended' || raw === 'banned') return 'banned';
    if (raw === 'inactive' || raw === 'disabled') return 'inactive';
    return 'active';
  };

  const lastActiveDate = (user: any) => {
    const raw = user?.last_seen ?? user?.last_active ?? user?.last_active_at ?? null;
    if (!raw) return null;
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
  };

  const lastActiveLabel = (user: any) => {
    const date = lastActiveDate(user);
    if (!date) return '—';
    const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  const roleOptions = useMemo(() => {
    const roles = new Set(['student', 'teacher', 'school_admin', 'admin']);
    safeUsers.forEach((user) => roles.add(normalizedRole(user)));
    return Array.from(roles).filter(Boolean).sort();
  }, [safeUsers]);

  const schoolFilterOptions = useMemo(
    () => [...safeSchoolOptions].sort((a, b) => a.name.localeCompare(b.name)),
    [safeSchoolOptions]
  );

  const filteredUsers = useMemo(() => {
    const rows = safeUsers.filter((user) => {
      if (roleFilter !== 'all' && normalizedRole(user) !== roleFilter) return false;
      if (gradeFilter !== 'all' && String(userGrade(user) ?? '') !== gradeFilter) return false;
      if (schoolFilter !== 'all' && String(user?.school_id || '') !== schoolFilter) return false;
      if (statusFilter !== 'all' && normalizedStatus(user) !== statusFilter) return false;
      return true;
    });

    return [...rows].sort((a, b) => {
      if (sortKey === 'name') return String(resolveUserLabel(a)).localeCompare(String(resolveUserLabel(b)));
      if (sortKey === 'xp') return Number(b?.xp ?? 0) - Number(a?.xp ?? 0);
      if (sortKey === 'level') return Number(b?.level ?? 0) - Number(a?.level ?? 0);
      const aTime = lastActiveDate(a)?.getTime() ?? 0;
      const bTime = lastActiveDate(b)?.getTime() ?? 0;
      return bTime - aTime;
    });
  }, [safeUsers, roleFilter, gradeFilter, schoolFilter, statusFilter, sortKey, resolveUserLabel]);

  const selectedUser = safeUsers.find((user) => user?.id === selectedUserId) ?? null;

  useEffect(() => {
    if (selectedUserId && !safeUsers.some((user) => user?.id === selectedUserId)) {
      setSelectedUserId(null);
    }
  }, [safeUsers, selectedUserId]);

  const clearFilters = () => {
    setRoleFilter('all');
    setGradeFilter('all');
    setSchoolFilter('all');
    setStatusFilter('all');
    setSortKey('last-active');
  };

  const runUserAction = (user: any, action: UserAction) => {
    const label = resolveUserLabel(user);
    switch (action) {
      case 'details':
        setSelectedUserId(user.id);
        return;
      case 'coins':
        void grantCoins(user.id, 1000);
        return;
      case 'xp':
        void grantXP(user.id, 500);
        return;
      case 'gems':
        void grantGemstones(user.id, 10);
        return;
      case 'ap':
        void resetUserAP(user.id);
        return;
      case 'level':
        void setUserLevel(user.id, user.level);
        return;
      case 'progress':
        void resetUserProgress(user.id, label);
        return;
      case 'academics':
        void resetUserAcademics(user.id, label);
        return;
      case 'ban':
        void setUserBanState(user.id, label, !Boolean(user.is_banned));
        return;
      case 'delete':
        void deleteUser(user.id, label);
        return;
    }
  };

  const statusBadge = (user: any) => {
    const status = normalizedStatus(user);
    if (status === 'banned') return <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/20 bg-rose-400/10 px-2 py-1 text-[11px] font-semibold text-rose-300"><span className="h-1.5 w-1.5 rounded-full bg-rose-400" />Banned</span>;
    if (status === 'inactive') return <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-600/50 bg-slate-800/70 px-2 py-1 text-[11px] font-semibold text-slate-400"><span className="h-1.5 w-1.5 rounded-full bg-slate-500" />Inactive</span>;
    return <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-[11px] font-semibold text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />Active</span>;
  };

  const roleBadgeClass = (role: string) => {
    if (role === 'admin' || role === 'superadmin') return 'border-amber-400/20 bg-amber-400/10 text-amber-300';
    if (role === 'teacher' || role === 'school_admin') return 'border-violet-400/20 bg-violet-400/10 text-violet-300';
    return 'border-sky-400/20 bg-sky-400/10 text-sky-300';
  };

  return (
    <div className="grid min-w-0 gap-4 xl:h-[calc(100dvh-112px)] xl:min-h-[560px] xl:grid-cols-[minmax(0,1fr)_430px] xl:overflow-hidden">
      <section className="min-w-0 rounded-2xl border border-slate-800/90 bg-[#0a1626]/88 shadow-[0_24px_70px_rgba(2,8,23,0.22)] xl:flex xl:min-h-0 xl:flex-col xl:overflow-hidden">
        <div className="shrink-0 border-b border-slate-800/80 px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-base font-bold text-white">Platform users</h2>
              <p className="mt-1 text-xs text-slate-500">Search, role, grade, school, status and sorting are server-backed across the full platform dataset.</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden text-xs text-slate-500 sm:inline">{safeUsers.length} loaded · page {userPage + 1}</span>
              <button
                type="button"
                onClick={() => void fetchUsers(userPage, searchQuery)}
                disabled={usersLoading}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/70 px-3 text-xs font-semibold text-slate-300 transition hover:border-slate-600 hover:bg-slate-800 disabled:opacity-50"
              >
                <svg className={`h-3.5 w-3.5 ${usersLoading ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4v7h-7" /></svg>
                {usersLoading ? 'Refreshing' : 'Refresh list'}
              </button>
            </div>
          </div>

          <div className="mt-4 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <div className="relative min-w-0 sm:col-span-2 lg:col-span-2">
              <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
              <input
                type="search"
                placeholder="Search username, email or class…"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="h-10 w-full min-w-0 rounded-lg border border-slate-700 bg-slate-950/50 pl-9 pr-3 text-sm text-white placeholder:text-slate-600"
              />
            </div>
            <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} className="h-10 w-full min-w-0 rounded-lg border border-slate-700 bg-slate-950/50 px-3 text-xs text-slate-200">
              <option value="all">All roles</option>
              {roleOptions.map((role) => <option key={role} value={role}>{role.replace(/_/g, ' ')}</option>)}
            </select>
            <select value={gradeFilter} onChange={(event) => setGradeFilter(event.target.value)} className="h-10 w-full min-w-0 rounded-lg border border-slate-700 bg-slate-950/50 px-3 text-xs text-slate-200">
              <option value="all">All grades</option>
              {safeGradeOptions.map((grade) => <option key={grade} value={String(grade)}>Grade {grade}</option>)}
            </select>
            <select value={schoolFilter} onChange={(event) => setSchoolFilter(event.target.value)} className="h-10 w-full min-w-0 rounded-lg border border-slate-700 bg-slate-950/50 px-3 text-xs text-slate-200">
              <option value="all">All schools</option>
              {schoolFilterOptions.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}
            </select>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-10 w-full min-w-0 rounded-lg border border-slate-700 bg-slate-950/50 px-3 text-xs text-slate-200">
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="banned">Banned</option>
            </select>
            <select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)} className="h-10 w-full min-w-0 rounded-lg border border-slate-700 bg-slate-950/50 px-3 text-xs text-slate-200">
              <option value="last-active">Sort: last active</option>
              <option value="name">Sort: name</option>
              <option value="xp">Sort: XP</option>
              <option value="level">Sort: level</option>
            </select>
            <button type="button" onClick={clearFilters} className="h-10 w-full min-w-0 rounded-lg border border-slate-700 px-3 text-xs font-semibold text-slate-400 transition hover:border-slate-600 hover:bg-slate-800 hover:text-slate-200">Reset</button>
          </div>
        </div>

        {usersError && (
          <div className="m-4 flex shrink-0 items-start justify-between gap-3 rounded-xl border border-rose-400/25 bg-rose-400/8 px-4 py-3 text-sm text-rose-200">
            <span>{usersError}</span>
            <button type="button" onClick={() => void fetchUsers(userPage, searchQuery)} className="shrink-0 text-xs font-bold text-rose-200 underline decoration-rose-400/40 underline-offset-4">Retry</button>
          </div>
        )}

        <div className="w-full max-w-full overflow-auto overscroll-x-contain overscroll-y-contain pb-2 [scrollbar-gutter:stable] xl:min-h-0 xl:flex-1">
          <table className="w-max min-w-[1180px] text-left">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-slate-800/90 bg-[#091524]/98 shadow-[0_1px_0_rgba(51,65,85,0.35)] backdrop-blur">
                <th className="px-4 py-3 sm:px-5">User</th>
                <th className="px-3 py-3">Role</th>
                <th className="px-3 py-3">School</th>
                <th className="px-3 py-3">Grade / Class</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">XP / Coins</th>
                <th className="px-3 py-3">Last active</th>
                <th className="px-4 py-3 text-right">Manage</th>
              </tr>
            </thead>
            <tbody>
              {usersLoading && safeUsers.length === 0 && Array.from({ length: 6 }).map((_, index) => (
                <tr key={`skeleton-${index}`} className="border-b border-slate-800/60">
                  <td className="px-5 py-4" colSpan={8}><div className="h-10 animate-pulse rounded-lg bg-slate-800/55" /></td>
                </tr>
              ))}

              {!usersLoading && safeUsers.length === 0 && (
                <tr><td colSpan={8} className="px-5 py-14 text-center"><p className="text-sm font-semibold text-slate-300">No users found</p><p className="mt-1 text-xs text-slate-500">Try a different search, then refresh this list.</p></td></tr>
              )}

              {safeUsers.length > 0 && filteredUsers.length === 0 && (
                <tr><td colSpan={8} className="px-5 py-14 text-center"><p className="text-sm font-semibold text-slate-300">No users match these page filters</p><button type="button" onClick={clearFilters} className="mt-2 text-xs font-bold text-cyan-300">Clear filters</button></td></tr>
              )}

              {filteredUsers.map((user) => {
                const role = normalizedRole(user);
                const grade = userGrade(user);
                const selected = selectedUserId === user.id;
                return (
                  <tr
                    key={user.id}
                    onClick={() => setSelectedUserId(user.id)}
                    className={`cursor-pointer border-b border-slate-800/60 transition last:border-b-0 ${selected ? 'bg-cyan-400/[0.055]' : 'hover:bg-slate-800/30'}`}
                  >
                    <td className="px-4 py-3.5 sm:px-5">
                      <div className="flex items-center gap-3">
                        <div className="relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full border border-slate-700 bg-slate-800 text-xs font-bold text-slate-400">
                          <span>{String(resolveUserLabel(user)).slice(0, 1).toUpperCase()}</span>
                          {user.avatar_url && <img src={user.avatar_url} alt="" className="absolute inset-0 h-full w-full object-cover" onError={(event) => { event.currentTarget.style.display = 'none'; }} />}
                        </div>
                        <div className="min-w-0">
                          <p className="max-w-[220px] truncate text-sm font-semibold text-white"><ClickableUsername userId={user.id} username={resolveUserLabel(user)}>{resolveUserLabel(user)}</ClickableUsername></p>
                          <p className="mt-0.5 max-w-[240px] truncate text-[11px] text-slate-500">{resolveUserEmail(user)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3.5"><span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-bold capitalize ${roleBadgeClass(role)}`}>{role.replace(/_/g, ' ')}</span></td>
                    <td className="max-w-[180px] truncate px-3 py-3.5 text-xs text-slate-300" title={schoolName(user)}>{schoolName(user)}</td>
                    <td className="px-3 py-3.5 text-xs text-slate-400"><span className="text-slate-300">{grade ? `Grade ${grade}` : '—'}</span>{user.batch ? <span className="ml-1 text-slate-600">· {user.batch}</span> : null}</td>
                    <td className="px-3 py-3.5">{statusBadge(user)}</td>
                    <td className="px-3 py-3.5"><p className="text-xs font-semibold text-slate-200">{Number(user.xp ?? 0).toLocaleString()} XP</p><p className="mt-0.5 text-[11px] text-amber-300/75">{Number(user.coins ?? 0).toLocaleString()} coins</p></td>
                    <td className="px-3 py-3.5"><p className="text-xs font-medium text-slate-300">{lastActiveLabel(user)}</p>{lastActiveDate(user) && <p className="mt-0.5 text-[10px] text-slate-600">{lastActiveDate(user)?.toLocaleDateString()}</p>}</td>
                    <td className="px-4 py-3.5 text-right" onClick={(event) => event.stopPropagation()}>
                      <select
                        aria-label={`Manage ${resolveUserLabel(user)}`}
                        value=""
                        onChange={(event) => {
                          const action = event.target.value as UserAction;
                          if (action) runUserAction(user, action);
                        }}
                        className="h-8 w-[112px] rounded-lg border border-slate-700 bg-slate-950/60 px-2 text-[11px] font-semibold text-slate-300"
                      >
                        <option value="">Manage…</option>
                        <option value="details">View details</option>
                        <option value="coins">Grant 1,000 coins</option>
                        <option value="xp">Grant 500 XP</option>
                        <option value="gems">Grant 10 gemstones</option>
                        <option value="ap">Reset AP</option>
                        <option value="level">Increase level</option>
                        <option value="progress">Reset progress</option>
                        <option value="academics">Reset school / grade / class</option>
                        <option value="ban">{Boolean(user.is_banned) ? 'Unban user' : 'Ban user'}</option>
                        <option value="delete">Delete user</option>
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex shrink-0 flex-col gap-3 border-t border-slate-800/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <p className="text-xs text-slate-500">Showing {filteredUsers.length} of {safeUsers.length} loaded users · {PAGE_SIZE} requested per page</p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setUserPage((page: number) => Math.max(0, page - 1))} disabled={userPage === 0 || usersLoading} className="h-8 rounded-lg border border-slate-700 px-3 text-xs font-semibold text-slate-400 transition hover:border-slate-600 hover:text-white disabled:opacity-35">Previous</button>
            <span className="grid h-8 min-w-8 place-items-center rounded-lg border border-cyan-400/20 bg-cyan-400/10 px-2 text-xs font-bold text-cyan-300">{userPage + 1}</span>
            <button type="button" onClick={() => setUserPage((page: number) => page + 1)} disabled={!hasNextPage || usersLoading} className="h-8 rounded-lg border border-slate-700 px-3 text-xs font-semibold text-slate-400 transition hover:border-slate-600 hover:text-white disabled:opacity-35">Next</button>
          </div>
        </div>
      </section>

      <aside className="min-w-0 xl:h-full xl:min-h-0">
        {selectedUser ? (() => {
          const grade = userGrade(selectedUser);
          const availableBatches = grade ? (safeBatchByGrade[grade] ?? ['N/A']) : ['N/A'];
          const role = normalizedRole(selectedUser);
          const customOpen = Boolean(showCustomGrant?.[selectedUser.id]);
          return (
            <div key={selectedUser.id} className="overflow-hidden rounded-2xl border border-slate-800/90 bg-[#0a1626]/92 shadow-[0_24px_70px_rgba(2,8,23,0.24)] xl:flex xl:h-full xl:min-h-0 xl:flex-col">
              <div className="flex shrink-0 items-start justify-between border-b border-slate-800/80 bg-[#0a1626]/98 p-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="relative grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full border border-slate-700 bg-slate-800 text-sm font-black text-slate-300">
                    <span>{String(resolveUserLabel(selectedUser)).slice(0, 1).toUpperCase()}</span>
                    {selectedUser.avatar_url && <img src={selectedUser.avatar_url} alt="" className="absolute inset-0 h-full w-full object-cover" onError={(event) => { event.currentTarget.style.display = 'none'; }} />}
                    <span className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[#0a1626] ${normalizedStatus(selectedUser) === 'active' ? 'bg-emerald-400' : normalizedStatus(selectedUser) === 'banned' ? 'bg-rose-400' : 'bg-slate-500'}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-white">{resolveUserLabel(selectedUser)}</p>
                    <p className="mt-0.5 truncate text-[11px] text-slate-500">{resolveUserEmail(selectedUser)}</p>
                    <span className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-[9px] font-bold capitalize ${roleBadgeClass(role)}`}>{role.replace(/_/g, ' ')}</span>
                  </div>
                </div>
                <button type="button" onClick={() => setSelectedUserId(null)} aria-label="Close user details" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-slate-800 text-slate-500 transition hover:bg-slate-800 hover:text-white">×</button>
              </div>

              <div className="space-y-4 p-4 xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:overscroll-contain xl:[scrollbar-gutter:stable]">
                <div>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-600">User details</p>
                  <dl className="space-y-2 rounded-xl border border-slate-800 bg-slate-950/30 p-3 text-xs">
                    <div className="flex items-center justify-between gap-3"><dt className="text-slate-500">User ID</dt><dd className="max-w-[190px] truncate font-mono text-[10px] text-slate-300" title={selectedUser.id}>{selectedUser.id}</dd></div>
                    <div className="flex items-center justify-between gap-3"><dt className="text-slate-500">School</dt><dd className="max-w-[190px] truncate text-right text-slate-300">{schoolName(selectedUser)}</dd></div>
                    <div className="flex items-center justify-between gap-3"><dt className="text-slate-500">Last active</dt><dd className="text-slate-300">{lastActiveLabel(selectedUser)}</dd></div>
                    <div className="flex items-center justify-between gap-3"><dt className="text-slate-500">Status</dt><dd>{statusBadge(selectedUser)}</dd></div>
                  </dl>
                </div>

                <UserIntelligencePanel userId={selectedUser.id} />

                <div>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-600">Placement & role</p>
                  <div className="grid gap-2">
                    <label className="grid grid-cols-[78px_1fr] items-center gap-2 text-xs text-slate-500"><span>Grade</span><select value={grade ?? ''} onChange={(event) => void handleGradeChange(selectedUser.id, event.target.value)} className="h-9 rounded-lg border border-slate-700 bg-slate-950/50 px-2 text-xs text-white"><option value="">Unset</option>{safeGradeOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
                    <label className="grid grid-cols-[78px_1fr] items-center gap-2 text-xs text-slate-500"><span>Class</span><select value={typeof selectedUser.batch === 'string' ? selectedUser.batch : ''} onChange={(event) => void handleBatchChange(selectedUser.id, event.target.value)} className="h-9 rounded-lg border border-slate-700 bg-slate-950/50 px-2 text-xs text-white"><option value="">Unset</option>{availableBatches.map((batch) => <option key={batch} value={batch}>{batch}</option>)}</select></label>
                    <label className="grid grid-cols-[78px_1fr] items-center gap-2 text-xs text-slate-500"><span>Role</span><select value={selectedUser.role || 'student'} onChange={(event) => void changeUserRole(selectedUser.id, event.target.value)} disabled={roleChangeLoading === selectedUser.id} className="h-9 rounded-lg border border-slate-700 bg-slate-950/50 px-2 text-xs text-white disabled:opacity-50"><option value="student">Student</option><option value="teacher">Teacher</option><option value="school_admin">School Admin</option><option value="admin">Admin</option></select></label>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {[
                    ['Level', Number(selectedUser.level ?? 0).toLocaleString()],
                    ['XP', Number(selectedUser.xp ?? 0).toLocaleString()],
                    ['Coins', Number(selectedUser.coins ?? 0).toLocaleString()],
                    ['Gemstones', Number(selectedUser.gemstones ?? 0).toLocaleString()],
                  ].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-800 bg-slate-950/30 p-2.5"><p className="text-[9px] font-bold uppercase tracking-[0.1em] text-slate-600">{label}</p><p className="mt-1 text-sm font-bold text-slate-200">{value}</p></div>)}
                </div>

                <div>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-600">Quick actions</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => void grantCoins(selectedUser.id, 1000)} className="rounded-lg border border-amber-400/20 bg-amber-400/8 px-2 py-2 text-[11px] font-semibold text-amber-200 transition hover:bg-amber-400/12">+1,000 coins</button>
                    <button type="button" onClick={() => void grantXP(selectedUser.id, 500)} className="rounded-lg border border-sky-400/20 bg-sky-400/8 px-2 py-2 text-[11px] font-semibold text-sky-200 transition hover:bg-sky-400/12">+500 XP</button>
                    <button type="button" onClick={() => void grantGemstones(selectedUser.id, 10)} className="rounded-lg border border-emerald-400/20 bg-emerald-400/8 px-2 py-2 text-[11px] font-semibold text-emerald-200 transition hover:bg-emerald-400/12">+10 gems</button>
                    <button type="button" onClick={() => void resetUserAP(selectedUser.id)} className="rounded-lg border border-slate-700 bg-slate-900/60 px-2 py-2 text-[11px] font-semibold text-slate-300 transition hover:bg-slate-800">Reset AP</button>
                    <button type="button" onClick={() => void setUserLevel(selectedUser.id, selectedUser.level)} className="rounded-lg border border-violet-400/20 bg-violet-400/8 px-2 py-2 text-[11px] font-semibold text-violet-200 transition hover:bg-violet-400/12">Increase level</button>
                    <button type="button" onClick={() => setShowCustomGrant((previous: Record<string, boolean>) => ({ ...previous, [selectedUser.id]: !previous[selectedUser.id] }))} className="rounded-lg border border-cyan-400/20 bg-cyan-400/8 px-2 py-2 text-[11px] font-semibold text-cyan-200 transition hover:bg-cyan-400/12">Custom grants</button>
                  </div>
                </div>

                {customOpen && (
                  <div className="space-y-2 rounded-xl border border-cyan-400/15 bg-cyan-400/[0.035] p-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-cyan-300/80">Custom grants & level</p>
                    <div className="grid gap-2">
                      <div className="flex gap-2"><input type="number" min="1" placeholder="Coins" value={customCoinAmount[selectedUser.id] || ''} onChange={(event) => setCustomCoinAmount((previous: Record<string, string>) => ({ ...previous, [selectedUser.id]: event.target.value }))} className="h-9 min-w-0 flex-1 rounded-lg border border-slate-700 px-2 text-xs" /><button type="button" onClick={() => void grantCustomCoins(selectedUser.id, Number.parseInt(customCoinAmount[selectedUser.id]) || 0)} className="rounded-lg border border-slate-700 px-3 text-[10px] font-bold text-slate-300">Grant</button></div>
                      <div className="flex gap-2"><input type="number" min="1" placeholder="XP" value={customXpAmount[selectedUser.id] || ''} onChange={(event) => setCustomXpAmount((previous: Record<string, string>) => ({ ...previous, [selectedUser.id]: event.target.value }))} className="h-9 min-w-0 flex-1 rounded-lg border border-slate-700 px-2 text-xs" /><button type="button" onClick={() => void grantCustomXP(selectedUser.id, Number.parseInt(customXpAmount[selectedUser.id]) || 0)} className="rounded-lg border border-slate-700 px-3 text-[10px] font-bold text-slate-300">Grant</button></div>
                      <div className="flex gap-2"><input type="number" min="1" placeholder="Gemstones" value={customGemstoneAmount[selectedUser.id] || ''} onChange={(event) => setCustomGemstoneAmount((previous: Record<string, string>) => ({ ...previous, [selectedUser.id]: event.target.value }))} className="h-9 min-w-0 flex-1 rounded-lg border border-slate-700 px-2 text-xs" /><button type="button" onClick={() => void grantCustomGemstones(selectedUser.id, Number.parseInt(customGemstoneAmount[selectedUser.id]) || 0)} className="rounded-lg border border-slate-700 px-3 text-[10px] font-bold text-slate-300">Grant</button></div>
                      <div className="flex gap-2"><input type="number" min="1" placeholder="Level" value={customLevelAmount[selectedUser.id] || ''} onChange={(event) => setCustomLevelAmount((previous: Record<string, string>) => ({ ...previous, [selectedUser.id]: event.target.value }))} className="h-9 min-w-0 flex-1 rounded-lg border border-slate-700 px-2 text-xs" /><button type="button" onClick={() => void setCustomLevel(selectedUser.id, Number.parseInt(customLevelAmount[selectedUser.id]) || 0)} className="rounded-lg border border-slate-700 px-3 text-[10px] font-bold text-slate-300">Set</button></div>
                    </div>
                  </div>
                )}

                <div className="border-t border-slate-800 pt-4">
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-600">Account controls</p>
                  <div className="grid gap-2">
                    <button type="button" onClick={() => void resetUserProgress(selectedUser.id, resolveUserLabel(selectedUser))} className="rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-2 text-left text-[11px] font-semibold text-slate-300 transition hover:bg-slate-800">Reset game progress</button>
                    <button type="button" onClick={() => void resetUserAcademics(selectedUser.id, resolveUserLabel(selectedUser))} className="rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-2 text-left text-[11px] font-semibold text-slate-300 transition hover:bg-slate-800">Reset school / grade / class</button>
                    <button type="button" onClick={() => void setUserBanState(selectedUser.id, resolveUserLabel(selectedUser), !Boolean(selectedUser.is_banned))} className={`rounded-lg border px-3 py-2 text-left text-[11px] font-semibold transition ${Boolean(selectedUser.is_banned) ? 'border-emerald-400/20 bg-emerald-400/8 text-emerald-200 hover:bg-emerald-400/12' : 'border-rose-400/20 bg-rose-400/8 text-rose-200 hover:bg-rose-400/12'}`}>{Boolean(selectedUser.is_banned) ? 'Unban user' : 'Ban user'}</button>
                    <button type="button" onClick={() => void deleteUser(selectedUser.id, resolveUserLabel(selectedUser))} className="rounded-lg border border-rose-500/35 bg-rose-950/20 px-3 py-2 text-left text-[11px] font-bold text-rose-300 transition hover:bg-rose-950/35">Delete user permanently</button>
                  </div>
                </div>
              </div>
            </div>
          );
        })() : (
          <div className="rounded-2xl border border-dashed border-slate-800 bg-[#0a1626]/55 p-6 text-center xl:grid xl:h-full xl:min-h-0 xl:place-items-center">
            <div><div className="mx-auto grid h-12 w-12 place-items-center rounded-xl border border-slate-800 bg-slate-900/60 text-slate-500"><svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="9" cy="8" r="3" /><path d="M3.5 19c.6-3.2 2.4-5 5.5-5s4.9 1.8 5.5 5" /><path d="M15 6a3 3 0 0 1 0 5" /></svg></div><p className="mt-3 text-sm font-semibold text-slate-300">Select a user</p><p className="mx-auto mt-1 max-w-[220px] text-xs leading-5 text-slate-600">Choose a row to open account details, placement controls and management actions here.</p></div>
          </div>
        )}
      </aside>
    </div>
  );
};

export default UsersTab;
