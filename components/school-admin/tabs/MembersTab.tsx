import React from 'react';
import { useSchoolAdmin } from '../SchoolAdminContext';
import type { SchoolRole } from '../../../types';
import '../../../src/styles/school-admin-members.css';

type DirectoryTab = 'admin' | 'teacher' | 'student';

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

const DirectoryIcon: React.FC<{ tab: DirectoryTab }> = ({ tab }) => {
  if (tab === 'admin') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3.5 19 6v5.6c0 4.1-2.5 7.3-7 8.9-4.5-1.6-7-4.8-7-8.9V6l7-2.5Z" />
        <path d="m8.8 12 2.1 2.1 4.5-4.6" />
      </svg>
    );
  }
  if (tab === 'teacher') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="10" cy="8" r="3" />
        <path d="M4.5 19c.5-3.6 2.3-5.5 5.5-5.5s5 1.9 5.5 5.5" />
        <path d="M17 5.5h3v7h-3" />
        <path d="M15.5 9H20" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m3.5 8 8.5-4 8.5 4-8.5 4-8.5-4Z" />
      <path d="M6.5 10.2v5.1c2.9 2.1 8.1 2.1 11 0v-5.1" />
      <path d="M20.5 8v6" />
    </svg>
  );
};

const SearchIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4 4" />
  </svg>
);

const MembersTab: React.FC = () => {
  const {
    actionLoading, bulkMemberAction, classes, handleBulkMemberAction, loadStudentModStatus,
    memberPage, memberPageSize, memberRoleFilter, memberSearch, members, schoolAdmins, stats,
    selectedMemberIds, setActiveTab, setBulkMemberAction, setMemberPage, setMemberPageSize,
    setMemberRoleFilter, setMemberSearch, setModTargetId, setModTargetStatus, setSelectedClassId,
    setSelectedGrade, setSelectedMember, setSelectedStudentId, setShowMemberActionModal,
    studentAssignments, teacherAllocations, toggleMemberSelection, toggleSelectAllMembers,
  } = useSchoolAdmin();
  const [academicYearFilter, setAcademicYearFilter] = React.useState('');
  const [classFilter, setClassFilter] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<'all' | 'active' | 'restricted'>('all');
  const [directoryTab, setDirectoryTab] = React.useState<DirectoryTab>(memberRoleFilter === 'student' ? 'student' : 'teacher');
  const [adminSearch, setAdminSearch] = React.useState('');
  const [adminRoleFilter, setAdminRoleFilter] = React.useState<'all' | 'owner' | 'delegated'>('all');
  const [adminStatusFilter, setAdminStatusFilter] = React.useState<'all' | 'active' | 'restricted'>('all');

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

  const getTeacherClassIds = React.useCallback((member: any) => new Set(
    (teacherAllocations || [])
      .filter((allocation: any) => allocation.teacher_user_id === member.user_id)
      .map((allocation: any) => allocation.class_id),
  ), [teacherAllocations]);

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

  const normalizedAdminSearch = adminSearch.trim().toLocaleLowerCase();
  const filteredAdministrators = React.useMemo(() => administrators.filter((member: any) => {
    if (normalizedAdminSearch) {
      const searchableIdentity = [member.full_name, member.username, member.email]
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
        .join('\n')
        .toLocaleLowerCase();
      if (!searchableIdentity.includes(normalizedAdminSearch)) return false;
    }
    if (adminRoleFilter === 'owner' && !member.is_owner) return false;
    if (adminRoleFilter === 'delegated' && member.is_owner) return false;
    if (adminStatusFilter === 'active' && member.is_banned) return false;
    if (adminStatusFilter === 'restricted' && !member.is_banned) return false;
    return true;
  }), [adminRoleFilter, adminStatusFilter, administrators, normalizedAdminSearch]);

  const totalPages = Math.max(1, Math.ceil(filteredPeople.length / memberPageSize));
  const visiblePeople = filteredPeople.slice((memberPage - 1) * memberPageSize, memberPage * memberPageSize);

  React.useEffect(() => {
    setMemberPage(1);
  }, [academicYearFilter, classFilter, statusFilter, activePeopleTab, memberPageSize, memberSearch, setMemberPage]);

  React.useEffect(() => {
    setMemberPage((page: number) => Math.min(page, totalPages));
  }, [setMemberPage, totalPages]);

  React.useEffect(() => {
    if (directoryTab !== 'admin') setDirectoryTab(activePeopleTab);
  }, [activePeopleTab, directoryTab]);

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

  const selectRole = (role: SchoolRole) => {
    setDirectoryTab(role === 'student' ? 'student' : 'teacher');
    setAcademicYearFilter('');
    setClassFilter('');
    setStatusFilter('all');
    setMemberSearch('');
    setMemberRoleFilter(role);
    setMemberPage(1);
  };

  const selectAdminTab = () => {
    setDirectoryTab('admin');
    setMemberPage(1);
  };

  const tabCounts = {
    admin: stats?.admins ?? administrators.length,
    teacher: stats?.teachers ?? communityMembers.filter((member: any) => member.role === 'teacher').length,
    student: stats?.students ?? communityMembers.filter((member: any) => member.role === 'student').length,
  };

  const directoryTabs: Array<{ id: DirectoryTab; label: string; description: string; count: number }> = [
    { id: 'admin', label: 'School Admins', description: 'School-wide administration and permissions', count: tabCounts.admin },
    { id: 'teacher', label: 'Teachers', description: 'Teaching staff and class assignments', count: tabCounts.teacher },
    { id: 'student', label: 'Students', description: 'Enrolment, classes and account records', count: tabCounts.student },
  ];

  const renderDirectoryTab = (tab: DirectoryTab) => (
    <button
      key={tab}
      type="button"
      role="tab"
      aria-selected={directoryTab === tab}
      className={directoryTab === tab ? 'is-active' : ''}
      onClick={() => {
        if (tab === 'admin') selectAdminTab();
        else selectRole(tab);
      }}
    >
      <span className="community-role-tab__icon"><DirectoryIcon tab={tab} /></span>
      <span className="community-role-tab__copy">
        <strong>{directoryTabs.find((item) => item.id === tab)?.label}</strong>
        <small>{directoryTabs.find((item) => item.id === tab)?.description}</small>
      </span>
      <span className="community-role-tab__count">{directoryTabs.find((item) => item.id === tab)?.count ?? 0}</span>
    </button>
  );

  return <div className="space-y-5 staff-directory-workspace">
    <section className="admin-section-heading staff-directory-heading">
      <div>
        <p className="school-admin-eyebrow">Administration</p>
        <h2>Staff &amp; Students</h2>
        <p>Manage school administrators, teachers and students, including roles, placement and account access.</p>
      </div>
    </section>

    <div className="community-role-tabs" role="tablist" aria-label="Choose a school people directory">
      {renderDirectoryTab('admin')}
      {renderDirectoryTab('teacher')}
      {renderDirectoryTab('student')}
    </div>

    {directoryTab === 'teacher' && <section className="teacher-assignment-callout staff-directory-assignment-callout" aria-label="Teacher class and subject assignments">
      <div>
        <strong>Assign teaching responsibilities</strong>
        <span>Connect a teacher to a subject and class, or review existing assignments.</span>
      </div>
      <button onClick={() => setActiveTab('teachers')}>Allocate teachers →</button>
    </section>}

    {directoryTab === 'admin' ? (
      <section className="community-directory community-admin-directory" aria-label="School administrators directory">
        <div className="community-directory-intro">
          <div>
            <span className="community-directory-kicker">School-wide access</span>
            <h3>School administrators</h3>
            <p>Review protected ownership and delegated administration access from one place.</p>
          </div>
          <strong>{filteredAdministrators.length} administrator{filteredAdministrators.length === 1 ? '' : 's'}</strong>
        </div>

        <div className="community-toolbar community-toolbar--refined">
          <span className="community-search-field">
            <SearchIcon />
            <input
              aria-label="Search school administrators"
              placeholder="Search administrators by real name, username or email"
              value={adminSearch}
              onChange={(event) => setAdminSearch(event.target.value)}
            />
          </span>
        </div>

        <div className="community-filters community-admin-filters" aria-label="Administrator filters">
          <label>
            <span>Access level</span>
            <select value={adminRoleFilter} onChange={(event) => setAdminRoleFilter(event.target.value as typeof adminRoleFilter)}>
              <option value="all">All administrators</option>
              <option value="owner">School owner</option>
              <option value="delegated">Delegated administrators</option>
            </select>
          </label>
          <label>
            <span>Account status</span>
            <select value={adminStatusFilter} onChange={(event) => setAdminStatusFilter(event.target.value as typeof adminStatusFilter)}>
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="restricted">Restricted</option>
            </select>
          </label>
          <span className="community-filter-count">{filteredAdministrators.length} shown</span>
        </div>

        <div className="community-table-wrap community-table-desktop community-admin-table">
          <table>
            <thead>
              <tr>
                <th>Administrator</th>
                <th>Access level</th>
                <th>Teaching</th>
                <th>Account status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filteredAdministrators.map((member: any) => (
                <tr
                  key={member.user_id}
                  onClick={() => openMember(member)}
                  tabIndex={0}
                  onKeyDown={(event) => event.key === 'Enter' && openMember(member)}
                >
                  <td>
                    <div className="community-person">
                      <img src={member.avatar_url || '/avatars/default.png'} alt="" />
                      <span>
                        <strong>{highlightMatch(member.full_name || member.username, adminSearch)}</strong>
                        <small>@{highlightMatch(member.username, adminSearch)}{member.email ? <> · {highlightMatch(member.email, adminSearch)}</> : null}</small>
                      </span>
                    </div>
                  </td>
                  <td>
                    <span className={`admin-access-chip ${member.is_owner ? 'is-owner' : ''}`}>
                      {member.is_owner ? 'School owner' : 'Delegated admin'}
                    </span>
                  </td>
                  <td>{member.can_teach ? 'Teaching staff' : 'Administration only'}</td>
                  <td><span className={`status-dot ${member.is_banned ? 'is-blocked' : ''}`} />{member.is_banned ? 'Restricted' : 'Active'}</td>
                  <td><button onClick={(event) => { event.stopPropagation(); openMember(member); }}>{member.is_owner ? 'View →' : 'Manage →'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filteredAdministrators.length && <div className="community-empty">No administrators match these filters.</div>}
        </div>

        <div className="community-mobile-list" aria-label="School administrators">
          {filteredAdministrators.map((member: any) => (
            <article className="community-mobile-card community-admin-mobile-card" key={member.user_id}>
              <div className="community-mobile-card__heading">
                <img src={member.avatar_url || '/avatars/default.png'} alt="" />
                <span>
                  <strong>{highlightMatch(member.full_name || member.username, adminSearch)}</strong>
                  <small>@{highlightMatch(member.username, adminSearch)}</small>
                  {member.email ? <small>{highlightMatch(member.email, adminSearch)}</small> : null}
                </span>
                <span className={`admin-access-chip ${member.is_owner ? 'is-owner' : ''}`}>{member.is_owner ? 'Owner' : 'Admin'}</span>
              </div>
              <dl className="community-mobile-card__details">
                <div><dt>Access</dt><dd>{member.is_owner ? 'Protected school owner' : 'Delegated administrator'}</dd></div>
                <div><dt>Teaching</dt><dd>{member.can_teach ? 'Teaching staff' : 'Administration only'}</dd></div>
                <div><dt>Status</dt><dd><span className={`status-dot ${member.is_banned ? 'is-blocked' : ''}`} />{member.is_banned ? 'Restricted' : 'Active'}</dd></div>
              </dl>
              <button className="community-mobile-manage" onClick={() => openMember(member)}>{member.is_owner ? 'View protected account →' : 'Manage administrator →'}</button>
            </article>
          ))}
          {!filteredAdministrators.length && <div className="community-empty">No administrators match these filters.</div>}
        </div>
      </section>
    ) : (
      <section className="community-directory">
        <div className="community-directory-intro">
          <div>
            <span className="community-directory-kicker">{directoryTab === 'student' ? 'Student records' : 'Teaching staff'}</span>
            <h3>{directoryTab === 'student' ? 'Students' : 'Teachers'}</h3>
            <p>{directoryTab === 'student' ? 'Review enrolment, class placement and account access.' : 'Review teaching staff, class responsibilities and account access.'}</p>
          </div>
          <strong>{filteredPeople.length} {directoryTab}{filteredPeople.length === 1 ? '' : 's'}</strong>
        </div>

        <div className="community-toolbar community-toolbar--refined">
          <span className="community-search-field">
            <SearchIcon />
            <input
              aria-label={`Search ${activePeopleTab}s`}
              placeholder={`Search ${activePeopleTab}s by real name, username or email`}
              value={memberSearch}
              onChange={(event) => setMemberSearch(event.target.value)}
            />
          </span>
          <label className="community-page-size">Show
            <select value={memberPageSize} onChange={(event) => setMemberPageSize(Number(event.target.value))}>
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </label>
        </div>

        <div className="community-filters" aria-label={`${activePeopleTab === 'student' ? 'Student' : 'Teacher'} filters`}>
          <label>
            <span>Grade level</span>
            <select value={academicYearFilter} onChange={(event) => { setAcademicYearFilter(event.target.value); setClassFilter(''); }}>
              <option value="">All grade levels</option>
              {academicYears.map((grade) => <option key={grade} value={grade}>Grade {grade}</option>)}
            </select>
          </label>
          <label>
            <span>Class</span>
            <select value={classFilter} onChange={(event) => setClassFilter(event.target.value)}>
              <option value="">All classes</option>
              {classesForAcademicYear.map((schoolClass: any) => <option key={schoolClass.id} value={schoolClass.id}>{schoolClass.class_code} — {schoolClass.class_name}</option>)}
            </select>
          </label>
          <label>
            <span>Account status</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="restricted">Restricted</option>
            </select>
          </label>
          <span className="community-filter-count">{filteredPeople.length} {activePeopleTab}{filteredPeople.length === 1 ? '' : 's'}</span>
        </div>

        <div className="community-bulk">
          <label>
            <input
              type="checkbox"
              checked={visiblePeople.length > 0 && visiblePeople.every((member: any) => selectedMemberIds.has(member.user_id))}
              onChange={(event) => toggleSelectAllMembers(visiblePeople.map((member: any) => member.user_id), event.target.checked)}
            /> {selectedMemberIds.size} selected
          </label>
          <select value={bulkMemberAction} onChange={(event) => setBulkMemberAction(event.target.value)}>
            <option value="">Bulk action</option>
            <option value="ban">Ban accounts</option>
            <option value="unban">Unban accounts</option>
            <option value="remove">Remove from school</option>
          </select>
          <button disabled={!bulkMemberAction || !selectedMemberIds.size || actionLoading} onClick={handleBulkMemberAction}>Apply</button>
        </div>

        <div className="community-table-wrap community-table-desktop">
          <table>
            <thead>
              <tr>
                <th>{directoryTab === 'student' ? 'Student' : 'Teacher'}</th>
                <th>{directoryTab === 'student' ? 'Class placement' : 'Teaching placement'}</th>
                <th>Date joined</th>
                <th>Account status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visiblePeople.map((member: any) => {
                const placement = getDisplayPlacement(member);
                return <tr key={member.user_id} onClick={() => openMember(member)} tabIndex={0} onKeyDown={(event) => event.key === 'Enter' && openMember(member)}>
                  <td>
                    <div className="community-person">
                      <input
                        aria-label={`Select ${member.username}`}
                        type="checkbox"
                        checked={selectedMemberIds.has(member.user_id)}
                        onClick={(event) => event.stopPropagation()}
                        onChange={() => toggleMemberSelection(member.user_id)}
                      />
                      <img src={member.avatar_url || '/avatars/default.png'} alt="" />
                      <span>
                        <strong>{highlightMatch(member.full_name || member.username, memberSearch)}</strong>
                        <small>@{highlightMatch(member.username, memberSearch)} · {highlightMatch(member.email, memberSearch)}</small>
                      </span>
                    </div>
                  </td>
                  <td>{placement.grade ? `Grade ${placement.grade}` : 'Not assigned'}{placement.batch ? ` · ${placement.batch}` : ''}</td>
                  <td>{member.joined_at ? new Date(member.joined_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not recorded'}</td>
                  <td><span className={`status-dot ${member.is_banned ? 'is-blocked' : ''}`} />{member.is_banned ? 'Restricted' : 'Active'}</td>
                  <td><button onClick={(event) => { event.stopPropagation(); openMember(member); }}>Manage →</button></td>
                </tr>;
              })}
            </tbody>
          </table>
          {!visiblePeople.length && <div className="community-empty">No {activePeopleTab}s match these filters.</div>}
        </div>

        <div className="community-mobile-list" aria-label={`${activePeopleTab === 'student' ? 'Students' : 'Teachers'} directory`}>
          {visiblePeople.map((member: any) => {
            const placement = getDisplayPlacement(member);
            return <article className="community-mobile-card" key={member.user_id}>
              <div className="community-mobile-card__heading">
                <label className="community-mobile-select">
                  <input
                    aria-label={`Select ${member.username}`}
                    type="checkbox"
                    checked={selectedMemberIds.has(member.user_id)}
                    onChange={() => toggleMemberSelection(member.user_id)}
                  />
                </label>
                <img src={member.avatar_url || '/avatars/default.png'} alt="" />
                <span>
                  <strong>{highlightMatch(member.full_name || member.username, memberSearch)}</strong>
                  <small>@{highlightMatch(member.username, memberSearch)}</small>
                  <small>{highlightMatch(member.email, memberSearch)}</small>
                </span>
              </div>
              <dl className="community-mobile-card__details">
                <div><dt>{directoryTab === 'student' ? 'Class placement' : 'Teaching placement'}</dt><dd>{placement.grade ? `Grade ${placement.grade}` : 'Not assigned'}{placement.batch ? ` · ${placement.batch}` : ''}</dd></div>
                <div><dt>Status</dt><dd><span className={`status-dot ${member.is_banned ? 'is-blocked' : ''}`} />{member.is_banned ? 'Restricted' : 'Active'}</dd></div>
                <div><dt>Date joined</dt><dd>{member.joined_at ? new Date(member.joined_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not recorded'}</dd></div>
              </dl>
              <button className="community-mobile-manage" onClick={() => openMember(member)}>Manage member →</button>
            </article>;
          })}
          {!visiblePeople.length && <div className="community-empty">No {activePeopleTab}s match these filters.</div>}
        </div>

        <footer className="community-pagination">
          <span>Page {memberPage} of {totalPages} · {filteredPeople.length} result{filteredPeople.length === 1 ? '' : 's'}</span>
          <div>
            <button disabled={memberPage === 1} onClick={() => setMemberPage((page: number) => Math.max(1, page - 1))}>Previous</button>
            <button disabled={memberPage >= totalPages} onClick={() => setMemberPage((page: number) => Math.min(totalPages, page + 1))}>Next</button>
          </div>
        </footer>
      </section>
    )}
  </div>;
};

export default MembersTab;
