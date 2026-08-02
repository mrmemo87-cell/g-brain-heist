import React from 'react';
import { useSchoolAdmin } from '../SchoolAdminContext';
import type { SchoolRole } from '../../../types';

const MembersTab: React.FC = () => {
  const { actionLoading, bulkMemberAction, classes, handleBulkMemberAction, loadStudentModStatus, memberPage, memberPageSize, memberRoleFilter, memberSearch, memberTotalPages, members, schoolAdmins, selectedMemberIds, setActiveTab, setBulkMemberAction, setMemberPage, setMemberPageSize, setMemberRoleFilter, setMemberSearch, setModTargetId, setModTargetStatus, setSelectedClassId, setSelectedGrade, setSelectedMember, setSelectedStudentId, setShowMemberActionModal, studentAssignments, toggleMemberSelection, toggleSelectAllMembers } = useSchoolAdmin();
  const activePeopleTab: 'teacher' | 'student' = memberRoleFilter === 'student' ? 'student' : 'teacher';
  const administrators = Array.isArray(schoolAdmins) ? schoolAdmins : [];
  const communityMembers = Array.isArray(members) ? members : [];
  const visiblePeople = communityMembers.filter((member: any) => member.role === activePeopleTab);

  const openMember = (member: any) => {
    setSelectedMember(member);
    if (member.role === 'student') {
      const normaliseClassCode = (value: unknown) => String(value || '').toUpperCase().replace(/\s+/g, '');
      const assignedClassId = studentAssignments[member.user_id]
        || classes.find((schoolClass: any) => normaliseClassCode(schoolClass.class_code) === normaliseClassCode(member.batch))?.id
        || '';
      const assignedClass = classes.find((schoolClass: any) => schoolClass.id === assignedClassId);
      setSelectedStudentId(member.user_id);
      setSelectedClassId(assignedClassId);
      setSelectedGrade(member.grade ?? assignedClass?.grade_level ?? '');
      setModTargetId(member.user_id);
      loadStudentModStatus(member.user_id);
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
    <section className="admin-section-heading"><div><p className="school-admin-eyebrow">Administration</p><h2>Students &amp; Staff</h2><p>Review students, teachers and administrators, including their placement, access and account status.</p></div></section>

    <section className="community-admins">
      <div className="community-section-title"><div><span className="community-icon">A</span><div><h3>School administrators</h3><p>Authorised users with whole-school control</p></div></div><strong>{administrators.length || '—'}</strong></div>
      <div className="community-admin-list">
        {administrators.length ? administrators.map((member: any) => <button key={member.user_id} onClick={() => openMember(member)} className="community-admin-card"><img src={member.avatar_url || '/avatars/default.png'} alt=""/><span><strong>{member.full_name || member.username}</strong><small>@{member.username} · {member.is_owner ? 'School owner' : `Delegated administrator${member.can_teach ? ' + Teacher' : ''}`}</small></span><i>{member.is_owner ? 'View protected owner →' : 'Manage access →'}</i></button>) : <p className="community-empty">No administrator profiles are available.</p>}
      </div>
    </section>

    <div className="admin-segmented community-tabs" role="tablist" aria-label="Community roles">
      <button className={activePeopleTab === 'teacher' ? 'is-active' : ''} onClick={() => selectRole('teacher')}><strong>Teachers</strong><span>Teaching and pastoral staff</span></button>
      <button className={activePeopleTab === 'student' ? 'is-active' : ''} onClick={() => selectRole('student')}><strong>Students</strong><span>Enrolment and class records</span></button>
    </div>

    {activePeopleTab === 'teacher' && <section className="teacher-assignment-callout" aria-label="Teacher class and subject assignments">
      <div><strong>Assign teaching responsibilities</strong><span>Connect a teacher to a subject and class, or review existing assignments.</span></div>
      <button onClick={() => setActiveTab('teachers')}>Assign teachers →</button>
    </section>}

    <section className="community-directory">
      <div className="community-toolbar"><input aria-label={`Search ${activePeopleTab}s`} placeholder={`Search ${activePeopleTab}s by name, username or email`} value={memberSearch} onChange={e => setMemberSearch(e.target.value)} /><label>Show <select value={memberPageSize} onChange={e => setMemberPageSize(Number(e.target.value))}><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option></select></label></div>
      <div className="community-bulk"><label><input type="checkbox" checked={visiblePeople.length > 0 && visiblePeople.every((m: any) => selectedMemberIds.has(m.user_id))} onChange={e => toggleSelectAllMembers(visiblePeople.map((m: any) => m.user_id), e.target.checked)}/> {selectedMemberIds.size} selected</label><select value={bulkMemberAction} onChange={e => setBulkMemberAction(e.target.value)}><option value="">Bulk action</option><option value="role:student">Change role to student</option><option value="role:teacher">Change role to teacher</option><option value="ban">Ban accounts</option><option value="unban">Unban accounts</option><option value="remove">Remove from school</option></select><button disabled={!bulkMemberAction || !selectedMemberIds.size || actionLoading} onClick={handleBulkMemberAction}>Apply</button></div>
      <div className="community-table-wrap community-table-desktop"><table><thead><tr><th>Person</th><th>Role</th><th>{activePeopleTab === 'student' ? 'Year / class' : 'Department / class'}</th><th>Date joined</th><th>Status</th><th /></tr></thead><tbody>
        {visiblePeople.map((member: any) => <tr key={member.user_id} onClick={() => openMember(member)} tabIndex={0} onKeyDown={e => e.key === 'Enter' && openMember(member)}>
          <td><div className="community-person"><input aria-label={`Select ${member.username}`} type="checkbox" checked={selectedMemberIds.has(member.user_id)} onClick={e => e.stopPropagation()} onChange={() => toggleMemberSelection(member.user_id)}/><img src={member.avatar_url || '/avatars/default.png'} alt=""/><span><strong>{member.full_name || member.username}</strong><small>@{member.username} · {member.email}</small></span></div></td>
          <td><span className="role-chip">{member.role === 'student' ? 'Student' : 'Teacher'}</span></td><td>{member.grade ? `Year ${member.grade}` : 'Not assigned'}{member.batch ? ` · ${member.batch}` : ''}</td><td>{member.joined_at ? new Date(member.joined_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not recorded'}</td><td><span className={`status-dot ${member.is_banned ? 'is-blocked' : ''}`} />{member.is_banned ? 'Restricted' : 'Active'}</td><td><button onClick={e => { e.stopPropagation(); openMember(member); }}>Manage →</button></td>
        </tr>)}
      </tbody></table>{!visiblePeople.length && <div className="community-empty">No {activePeopleTab}s match this view.</div>}</div>
      <div className="community-mobile-list" aria-label={`${activePeopleTab === 'student' ? 'Students' : 'Teachers'} directory`}>
        {visiblePeople.map((member: any) => <article className="community-mobile-card" key={member.user_id}>
          <div className="community-mobile-card__heading">
            <label className="community-mobile-select">
              <input aria-label={`Select ${member.username}`} type="checkbox" checked={selectedMemberIds.has(member.user_id)} onChange={() => toggleMemberSelection(member.user_id)}/>
            </label>
            <img src={member.avatar_url || '/avatars/default.png'} alt="" />
            <span>
              <strong>{member.full_name || member.username}</strong>
              <small>@{member.username}</small>
              <small>{member.email}</small>
            </span>
            <span className="role-chip">{member.role === 'student' ? 'Student' : 'Teacher'}</span>
          </div>
          <dl className="community-mobile-card__details">
            <div><dt>{activePeopleTab === 'student' ? 'Year / class' : 'Department / class'}</dt><dd>{member.grade ? `Year ${member.grade}` : 'Not assigned'}{member.batch ? ` · ${member.batch}` : ''}</dd></div>
            <div><dt>Status</dt><dd><span className={`status-dot ${member.is_banned ? 'is-blocked' : ''}`} />{member.is_banned ? 'Restricted' : 'Active'}</dd></div>
            <div><dt>Date joined</dt><dd>{member.joined_at ? new Date(member.joined_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not recorded'}</dd></div>
          </dl>
          <button className="community-mobile-manage" onClick={() => openMember(member)}>Manage member →</button>
        </article>)}
        {!visiblePeople.length && <div className="community-empty">No {activePeopleTab}s match this view.</div>}
      </div>
      <footer className="community-pagination"><span>Page {memberPage} of {memberTotalPages}</span><div><button disabled={memberPage === 1} onClick={() => setMemberPage((p: number) => Math.max(1, p - 1))}>Previous</button><button disabled={memberPage >= memberTotalPages} onClick={() => setMemberPage((p: number) => Math.min(memberTotalPages, p + 1))}>Next</button></div></footer>
    </section>
  </div>;
};
export default MembersTab;
