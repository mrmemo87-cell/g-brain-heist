import React from 'react';
import { useSchoolAdmin } from '../SchoolAdminContext';
import type { SchoolRole } from '../../../types';

const highlightMatch = (value: string | null | undefined, search: string) => {
  const text = value || '';
  const query = search.trim();
  if (!query) return text;
  const lowerText = text.toLocaleLowerCase();
  const lowerQuery = query.toLocaleLowerCase();
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let matchIndex = lowerText.indexOf(lowerQuery);
  while (matchIndex >= 0) {
    if (matchIndex > cursor) parts.push(text.slice(cursor, matchIndex));
    parts.push(<mark key={`${matchIndex}-${cursor}`} className="community-search-match">{text.slice(matchIndex, matchIndex + query.length)}</mark>);
    cursor = matchIndex + query.length;
    matchIndex = lowerText.indexOf(lowerQuery, cursor);
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts.length ? <>{parts}</> : text;
};

const MembersTab: React.FC = () => {
  const {
    actionLoading, bulkMemberAction, classes, handleBulkMemberAction, loadStudentModStatus,
    memberPage, memberPageSize, memberRoleFilter, memberSearch, members, schoolAdmins,
    selectedMemberIds, setActiveTab, setBulkMemberAction, setMemberPage, setMemberPageSize,
    setMemberRoleFilter, setMemberSearch, setModTargetId, setModTargetStatus, setSelectedClassId,
    setSelectedGrade, setSelectedMember, setSelectedStudentId, setShowMemberActionModal,
    studentAssignments, teacherAllocations, toggleMemberSelection, toggleSelectAllMembers,
  } = useSchoolAdmin();
  const [academicYearFilter, setAcademicYearFilter] = React.useState('');
  const [classFilter, setClassFilter] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<'all' | 'active' | 'restricted'>('all');
  const activePeopleTab: 'teacher' | 'student' = memberRoleFilter === 'student' ? 'student' : 'teacher';
  const administrators = Array.isArray(schoolAdmins) ? schoolAdmins : [];
  // The role-filtered members result is the authoritative post-action directory.
  // Removal and moderation handlers refresh this collection, so the visible row
  // cannot survive after the backend has removed or updated the school member.
  const communityMembers = Array.isArray(members) ? members : [];
  const activeClasses = React.useMemo(() => (Array.isArray(classes) ? classes : []).filter((schoolClass: any) => schoolClass.is_active), [classes]);
  const academicYears = React.useMemo(() => Array.from(new Set(activeClasses.map((schoolClass: any) => Number(schoolClass.grade_level)).filter(Number.isFinite))).sort((a, b) => a - b), [activeClasses]);
  const classesForAcademicYear = React.useMemo(() => activeClasses.filter((schoolClass: any) => !academicYearFilter || String(schoolClass.grade_level) === academicYearFilter), [academicYearFilter, activeClasses]);

  const getAssignedClass = React.useCallback((member: any) => {
    if (member.role !== 'student') return null;
    const assignedClassId = studentAssignments[member.user_id] || '';
    return activeClasses.find((schoolClass: any) => schoolClass.id === assignedClassId) || null;
  }, [activeClasses, studentAssignments]);
  const getTeacherClassIds = React.useCallback((member: any) => new Set((teacherAllocations || []).filter((allocation: any) => allocation.teacher_user_id === member.user_id).map((allocation: any) => allocation.class_id)), [teacherAllocations]);
  const getDisplayPlacement = React.useCallback((member: any) => {
    const assignedClass = getAssignedClass(member);
    const teacherClass = member.role === 'teacher'
      ? activeClasses.find((schoolClass: any) => getTeacherClassIds(member).has(schoolClass.id))
      : null;
    return {
      grade: assignedClass?.grade_level ?? teacherClass?.grade_level ?? member.grade,
      batch: assignedClass?.class_code ?? teacherClass?.class_code ?? member.batch,
    };
  }, [activeClasses, getAssignedClass, getTeacherClassIds]);

  const normalizedMemberSearch = memberSearch.trim().toLocaleLowerCase();
  const filteredPeople = React.useMemo(() => communityMembers.filter((member: any) => {
    if (member.role !== activePeopleTab) return false;
    if (normalizedMemberSearch) {
      const searchableIdentity = [member.full_name, member.username, member.email]
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
        .join('\n')
        .toLocaleLowerCase();
      if (!searchableIdentity.includes(normalizedMemberSearch)) return false;
    }
    if (statusFilter === 'active' && member.is_banned) return false;
    if (statusFilter === 'restricted' && !member.is_banned) return false;
    if (!academicYearFilter && !classFilter) return true;
    if (member.role === 'student') {
      const assignedClass = getAssignedClass(member);
      if (academicYearFilter && String(assignedClass?.grade_level ?? member.grade ?? '') !== academicYearFilter) return false;
      if (classFilter && assignedClass?.id !== classFilter) return false;
      return true;
    }
    const teacherClassIds = getTeacherClassIds(member);
    if (classFilter) return teacherClassIds.has(classFilter);
    return activeClasses.some((schoolClass: any) => String(schoolClass.grade_level) === academicYearFilter && teacherClassIds.has(schoolClass.id));
  }), [academicYearFilter, activeClasses, activePeopleTab, classFilter, communityMembers, getAssignedClass, getTeacherClassIds, normalizedMemberSearch, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredPeople.length / memberPageSize));
  const visiblePeople = filteredPeople.slice((memberPage - 1) * memberPageSize, memberPage * memberPageSize);
  React.useEffect(() => { setMemberPage(1); }, [academicYearFilter, classFilter, statusFilter, activePeopleTab, memberPageSize, memberSearch, setMemberPage]);
  React.useEffect(() => { setMemberPage((page: number) => Math.min(page, totalPages)); }, [setMemberPage, totalPages]);

  const openMember = async (member: any) => {
    setSelectedMember(member);
    if (member.role === 'student') {
      const assignedClassId = studentAssignments[member.user_id] || '';
      const assignedClass = classes.find((schoolClass: any) => schoolClass.id === assignedClassId);
      setSelectedStudentId(member.user_id);
      setSelectedClassId(assignedClassId);
      setSelectedGrade(assignedClass?.grade_level ?? member.grade ?? '');
      setModTargetId(member.user_id);
      // Never render moderation actions with the previous student's status.
      // Waiting for this lookup also removes the race where Require Change could
      // be clicked while modTargetStatus was still null and silently do nothing.
      setModTargetStatus(null);
      await loadStudentModStatus(member.user_id);
    } else {
      setSelectedStudentId('');
      setSelectedClassId('');
      setSelectedGrade('');
      setModTargetStatus(null);
    }
    setShowMemberActionModal(true);
  };
  const selectRole = (role: SchoolRole) => { setMemberRoleFilter(role); setMemberPage(1); };

  return <div className="space-y-5">
    <section className="admin-section-heading"><div><p className="school-admin-eyebrow">Administration</p><h2>Staff &amp; Students</h2><p>Review teachers, students and administrators, including their placement, access and account status.</p></div></section>

    <section className="community-admins">
      <div className="community-section-title"><div><span className="community-icon">A</span><div><h3>School administrators</h3><p>Authorised users with whole-school control</p></div></div><strong>{administrators.length || '—'}</strong></div>
      <div className="community-admin-list">
        {administrators.length ? administrators.map((member: any) => <button key={member.user_id} onClick={() => openMember(member)} className="community-admin-card"><img src={member.avatar_url || '/avatars/default.png'} alt=""/><span><strong>{member.full_name || member.username}</strong><small>@{member.username} · {member.is_owner ? 'School owner' : 'Delegated administrator'}{member.can_teach ? ' · Teaching staff' : ''}</small></span><i>{member.is_owner ? 'View protected owner →' : 'Manage access →'}</i></button>) : <p className="community-empty">No administrator profiles are available.</p>}
      </div>
    </section>

    <div className="admin-segmented community-tabs" role="tablist" aria-label="Filter staff and students by role">
      <button className={activePeopleTab === 'teacher' ? 'is-active' : ''} onClick={() => selectRole('teacher')}><strong>Teachers</strong><span>Teaching and pastoral staff</span></button>
      <button className={activePeopleTab === 'student' ? 'is-active' : ''} onClick={() => selectRole('student')}><strong>Students</strong><span>Enrolment and class records</span></button>
    </div>

    {activePeopleTab === 'teacher' && <section className="teacher-assignment-callout" aria-label="Teacher class and subject assignments">
      <div><strong>Assign teaching responsibilities</strong><span>Connect a teacher to a subject and class, or review existing assignments.</span></div>
      <button onClick={() => setActiveTab('teachers')}>Allocate teachers →</button>
    </section>}

    <section className="community-directory">
      <div className="community-toolbar"><input aria-label={`Search ${activePeopleTab}s`} placeholder={`Search ${activePeopleTab}s by real name, username or email`} value={memberSearch} onChange={e => setMemberSearch(e.target.value)} /><label>Show <select value={memberPageSize} onChange={e => setMemberPageSize(Number(e.target.value))}><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option></select></label></div>
      <div className="community-filters" aria-label={`${activePeopleTab === 'student' ? 'Student' : 'Teacher'} filters`}>
        <label><span>Grade level</span><select value={academicYearFilter} onChange={(event) => { setAcademicYearFilter(event.target.value); setClassFilter(''); }}><option value="">All grade levels</option>{academicYears.map((grade) => <option key={grade} value={grade}>Grade {grade}</option>)}</select></label>
        <label><span>Class</span><select value={classFilter} onChange={(event) => setClassFilter(event.target.value)}><option value="">All classes</option>{classesForAcademicYear.map((schoolClass: any) => <option key={schoolClass.id} value={schoolClass.id}>{schoolClass.class_code} — {schoolClass.class_name}</option>)}</select></label>
        <label><span>Account status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}><option value="all">All statuses</option><option value="active">Active</option><option value="restricted">Restricted</option></select></label>
        <span className="community-filter-count">{filteredPeople.length} {activePeopleTab}{filteredPeople.length === 1 ? '' : 's'}</span>
      </div>
      <div className="community-bulk"><label><input type="checkbox" checked={visiblePeople.length > 0 && visiblePeople.every((m: any) => selectedMemberIds.has(m.user_id))} onChange={e => toggleSelectAllMembers(visiblePeople.map((m: any) => m.user_id), e.target.checked)}/> {selectedMemberIds.size} selected</label><select value={bulkMemberAction} onChange={e => setBulkMemberAction(e.target.value)}><option value="">Bulk action</option><option value="ban">Ban accounts</option><option value="unban">Unban accounts</option><option value="remove">Remove from school</option></select><button disabled={!bulkMemberAction || !selectedMemberIds.size || actionLoading} onClick={handleBulkMemberAction}>Apply</button></div>
      <div className="community-table-wrap community-table-desktop"><table><thead><tr><th>Person</th><th>Role</th><th>Grade level / class</th><th>Date joined</th><th>Status</th><th /></tr></thead><tbody>
        {visiblePeople.map((member: any) => { const placement = getDisplayPlacement(member); return <tr key={member.user_id} onClick={() => openMember(member)} tabIndex={0} onKeyDown={e => e.key === 'Enter' && openMember(member)}>
          <td><div className="community-person"><input aria-label={`Select ${member.username}`} type="checkbox" checked={selectedMemberIds.has(member.user_id)} onClick={e => e.stopPropagation()} onChange={() => toggleMemberSelection(member.user_id)}/><img src={member.avatar_url || '/avatars/default.png'} alt=""/><span><strong>{highlightMatch(member.full_name || member.username, memberSearch)}</strong><small>@{highlightMatch(member.username, memberSearch)} · {highlightMatch(member.email, memberSearch)}</small></span></div></td>
          <td><span className="role-chip">{member.role === 'student' ? 'Student' : 'Teacher'}</span></td><td>{placement.grade ? `Grade ${placement.grade}` : 'Not assigned'}{placement.batch ? ` · ${placement.batch}` : ''}</td><td>{member.joined_at ? new Date(member.joined_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not recorded'}</td><td><span className={`status-dot ${member.is_banned ? 'is-blocked' : ''}`} />{member.is_banned ? 'Restricted' : 'Active'}</td><td><button onClick={e => { e.stopPropagation(); openMember(member); }}>Manage →</button></td>
        </tr>; })}
      </tbody></table>{!visiblePeople.length && <div className="community-empty">No {activePeopleTab}s match these filters.</div>}</div>
      <div className="community-mobile-list" aria-label={`${activePeopleTab === 'student' ? 'Students' : 'Teachers'} directory`}>
        {visiblePeople.map((member: any) => { const placement = getDisplayPlacement(member); return <article className="community-mobile-card" key={member.user_id}>
          <div className="community-mobile-card__heading">
            <label className="community-mobile-select"><input aria-label={`Select ${member.username}`} type="checkbox" checked={selectedMemberIds.has(member.user_id)} onChange={() => toggleMemberSelection(member.user_id)}/></label>
            <img src={member.avatar_url || '/avatars/default.png'} alt="" />
            <span><strong>{highlightMatch(member.full_name || member.username, memberSearch)}</strong><small>@{highlightMatch(member.username, memberSearch)}</small><small>{highlightMatch(member.email, memberSearch)}</small></span>
            <span className="role-chip">{member.role === 'student' ? 'Student' : 'Teacher'}</span>
          </div>
          <dl className="community-mobile-card__details">
            <div><dt>Grade level / class</dt><dd>{placement.grade ? `Grade ${placement.grade}` : 'Not assigned'}{placement.batch ? ` · ${placement.batch}` : ''}</dd></div>
            <div><dt>Status</dt><dd><span className={`status-dot ${member.is_banned ? 'is-blocked' : ''}`} />{member.is_banned ? 'Restricted' : 'Active'}</dd></div>
            <div><dt>Date joined</dt><dd>{member.joined_at ? new Date(member.joined_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not recorded'}</dd></div>
          </dl>
          <button className="community-mobile-manage" onClick={() => openMember(member)}>Manage member →</button>
        </article>; })}
        {!visiblePeople.length && <div className="community-empty">No {activePeopleTab}s match these filters.</div>}
      </div>
      <footer className="community-pagination"><span>Page {memberPage} of {totalPages} · {filteredPeople.length} result{filteredPeople.length === 1 ? '' : 's'}</span><div><button disabled={memberPage === 1} onClick={() => setMemberPage((p: number) => Math.max(1, p - 1))}>Previous</button><button disabled={memberPage >= totalPages} onClick={() => setMemberPage((p: number) => Math.min(totalPages, p + 1))}>Next</button></div></footer>
    </section>
  </div>;
};

export default MembersTab;