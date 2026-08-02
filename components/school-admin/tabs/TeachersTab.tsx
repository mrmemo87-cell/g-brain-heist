import React from 'react';
import { useSchoolAdmin } from '../SchoolAdminContext';
import * as SchoolAdminService from '../../../services/schoolAdminService';
import { formatAdminDate, friendlySchoolAdminError } from '../../../src/lib/schoolAdminPresentation';
import { createSchoolDocumentId, escapeSchoolDocumentHtml, openSchoolDocumentPreview, schoolDocumentFileName } from '../../../src/lib/schoolDocument';
import { formatAssignableTeacherLabel, getAssignableTeachers } from '../../../src/lib/schoolAdminTeacherAssignments';

type AssignmentSort = 'class' | 'subject' | 'teacher' | 'assigned_at';

const TeachersTab: React.FC = () => {
  const {
    addToast, assignmentClassId, assignmentPage, assignmentPageSize, assignmentSaving,
    assignmentSubjectInput, assignmentTeacherId, classById, classes, dbSubjects,
    handleAssignTeacher, loadAdminTools, school, setAssignmentClassId,
    setAssignmentPage, setAssignmentPageSize, setAssignmentSubjectInput,
    setAssignmentTeacherId, setConfirmDialog, setConfirmReason, teacherAssignments, teachers,
  } = useSchoolAdmin();
  const [filterClassId, setFilterClassId] = React.useState('');
  const [filterSubject, setFilterSubject] = React.useState('');
  const [filterTeacherId, setFilterTeacherId] = React.useState('');
  const [sortKey, setSortKey] = React.useState<AssignmentSort>('class');
  const [sortDirection, setSortDirection] = React.useState<'asc' | 'desc'>('asc');

  const availableTeachers = React.useMemo(() => getAssignableTeachers(teachers || []), [teachers]);
  const subjectOptions = React.useMemo(() => Array.from(new Set([
    ...(dbSubjects || []).map((subject: any) => subject.name),
    ...(teacherAssignments || []).map((assignment: any) => assignment.subject),
  ].filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b))), [dbSubjects, teacherAssignments]);

  const sortedAssignments = React.useMemo(() => {
    const rows = (teacherAssignments || []).filter((assignment: any) => {
      if (filterClassId && assignment.class_id !== filterClassId) return false;
      if (filterSubject && assignment.subject !== filterSubject) return false;
      if (filterTeacherId && assignment.teacher_user_id !== filterTeacherId) return false;
      return true;
    });
    const direction = sortDirection === 'asc' ? 1 : -1;
    return rows.slice().sort((left: any, right: any) => {
      const leftClass = classById[left.class_id];
      const rightClass = classById[right.class_id];
      const leftTeacher = teachers.find((teacher: any) => teacher.user_id === left.teacher_user_id);
      const rightTeacher = teachers.find((teacher: any) => teacher.user_id === right.teacher_user_id);
      const values: Record<AssignmentSort, [string, string]> = {
        class: [leftClass?.class_code || '', rightClass?.class_code || ''],
        subject: [left.subject || '', right.subject || ''],
        teacher: [leftTeacher?.username || '', rightTeacher?.username || ''],
        assigned_at: [left.assigned_at || '', right.assigned_at || ''],
      };
      return values[sortKey][0].localeCompare(values[sortKey][1], undefined, { numeric: true }) * direction;
    });
  }, [classById, filterClassId, filterSubject, filterTeacherId, sortDirection, sortKey, teacherAssignments, teachers]);

  React.useEffect(() => { setAssignmentPage(1); }, [filterClassId, filterSubject, filterTeacherId, assignmentPageSize, setAssignmentPage]);
  const totalPages = Math.max(1, Math.ceil(sortedAssignments.length / assignmentPageSize));
  React.useEffect(() => { setAssignmentPage((page: number) => Math.min(page, totalPages)); }, [setAssignmentPage, totalPages]);
  const pagedAssignments = sortedAssignments.slice((assignmentPage - 1) * assignmentPageSize, assignmentPage * assignmentPageSize);

  const changeSort = (next: AssignmentSort) => {
    if (sortKey === next) setSortDirection((current) => current === 'asc' ? 'desc' : 'asc');
    else { setSortKey(next); setSortDirection('asc'); }
  };
  const sortLabel = (label: string, key: AssignmentSort) => `${label}${sortKey === key ? (sortDirection === 'asc' ? ' ↑' : ' ↓') : ''}`;

  const printTeacherAllocations = () => {
    if (!school) return;
    const rows = sortedAssignments.map((assignment: any, index: number) => {
      const schoolClass = classById[assignment.class_id];
      const teacher = teachers.find((item: any) => item.user_id === assignment.teacher_user_id);
      return `<tr><td>${index + 1}</td><td>${escapeSchoolDocumentHtml(schoolClass?.class_code || 'Unknown')}</td><td>${escapeSchoolDocumentHtml(schoolClass?.class_name || '—')}</td><td>${escapeSchoolDocumentHtml(assignment.subject)}</td><td>${escapeSchoolDocumentHtml(teacher?.username || 'Unknown teacher')}</td><td>${escapeSchoolDocumentHtml(formatAdminDate(assignment.assigned_at))}</td></tr>`;
    }).join('');
    try {
      openSchoolDocumentPreview({
        meta: { documentId: createSchoolDocumentId('class'), templateVersion: 'teacher-allocation-v1', title: 'Teacher Allocation Register', subtitle: `${sortedAssignments.length} current assignments`, schoolName: school.name, schoolLogoUrl: school.logo_url, audience: 'internal', status: 'final', confidentiality: 'confidential', generatedAt: new Date().toISOString(), schoolId: school.id, sourceType: 'teacher_allocations', sourceId: 'current' },
        bodyHtml: `<table><thead><tr><th>No.</th><th>Class</th><th>Class name</th><th>Subject</th><th>Teacher</th><th>Assigned</th></tr></thead><tbody>${rows || '<tr><td colspan="6">No teaching assignments match the current filters.</td></tr>'}</tbody></table><div class="document-signatures"><div class="document-signature">Prepared by · Name / signature / date</div><div class="document-signature">Approved by · Name / signature / date</div></div>`,
        orientation: 'landscape', inkSaver: true, fileName: schoolDocumentFileName(school.name, 'Teacher_Allocation_Register'),
      });
    } catch (error) { addToast(error instanceof Error ? error.message : 'Unable to open the allocation register.', 'error'); }
  };

  return <div className="space-y-6">
    <section className="admin-section-heading"><div><p className="school-admin-eyebrow">Administration</p><h2>Teacher Assignments</h2><p>Connect each class to a curriculum subject and the teacher responsible for it.</p></div><button type="button" className="admin-button-secondary" onClick={printTeacherAllocations}>Print allocation register</button></section>

    <section className="admin-form-card" aria-labelledby="assign-teacher-title">
      <div className="admin-card-heading"><div><h3 id="assign-teacher-title">Assign teacher to class and subject</h3><p>Select in operational order: class, subject, then teacher.</p></div></div>
      <div className="admin-form-grid admin-form-grid-three">
        <label className="admin-field"><span>Class <i>Required</i></span><select value={assignmentClassId} onChange={(event) => setAssignmentClassId(event.target.value)}><option value="">Select class</option>{classes.map((schoolClass: any) => <option key={schoolClass.id} value={schoolClass.id}>{schoolClass.class_code} — {schoolClass.class_name}</option>)}</select></label>
        <label className="admin-field"><span>Subject <i>Required</i></span><select value={assignmentSubjectInput} onChange={(event) => setAssignmentSubjectInput(event.target.value)}><option value="">Select subject</option>{dbSubjects.map((subject: any) => <option key={subject.id} value={subject.name}>{subject.name}{subject.code ? ` (${subject.code})` : ''}</option>)}</select></label>
        <label className="admin-field"><span>Teacher <i>Required</i></span><select value={assignmentTeacherId} onChange={(event) => setAssignmentTeacherId(event.target.value)}><option value="">Select teacher</option>{availableTeachers.map((teacher: any) => <option key={teacher.user_id} value={teacher.user_id}>{formatAssignableTeacherLabel(teacher)}</option>)}</select></label>
      </div>
      {!dbSubjects.length && <div className="admin-inline-warning" role="status"><strong>No subjects available</strong><span>Add curriculum subjects before creating a teaching assignment.</span></div>}
      {!availableTeachers.length && <div className="admin-inline-warning" role="status"><strong>No teachers available</strong><span>Only active members with teaching access appear here.</span></div>}
      <div className="admin-form-actions"><button className="admin-button-primary" onClick={handleAssignTeacher} disabled={assignmentSaving || !assignmentClassId || !assignmentTeacherId || !assignmentSubjectInput}>{assignmentSaving ? 'Assigning…' : 'Assign teacher'}</button></div>
    </section>

    <section className="admin-table-card" aria-labelledby="current-assignments-title">
      <div className="admin-card-heading admin-assignment-heading"><div><h3 id="current-assignments-title">Current assignments</h3><p>{sortedAssignments.length} assignments match the current filters.</p></div><div className="admin-assignment-filters">
        <select aria-label="Filter assignments by class" value={filterClassId} onChange={(event) => setFilterClassId(event.target.value)}><option value="">All classes</option>{classes.map((schoolClass: any) => <option key={schoolClass.id} value={schoolClass.id}>{schoolClass.class_code}</option>)}</select>
        <select aria-label="Filter assignments by subject" value={filterSubject} onChange={(event) => setFilterSubject(event.target.value)}><option value="">All subjects</option>{subjectOptions.map((subject) => <option key={String(subject)} value={String(subject)}>{String(subject)}</option>)}</select>
        <select aria-label="Filter assignments by teacher" value={filterTeacherId} onChange={(event) => setFilterTeacherId(event.target.value)}><option value="">All teachers</option>{availableTeachers.map((teacher: any) => <option key={teacher.user_id} value={teacher.user_id}>{formatAssignableTeacherLabel(teacher)}</option>)}</select>
        <select aria-label="Assignments per page" value={assignmentPageSize} onChange={(event) => setAssignmentPageSize(Number(event.target.value))}><option value={5}>5 rows</option><option value={10}>10 rows</option><option value={20}>20 rows</option></select>
      </div></div>
      {pagedAssignments.length ? <div className="admin-table-scroll"><table>
        <thead><tr><th><button className="admin-sort-button" onClick={() => changeSort('class')}>{sortLabel('Class', 'class')}</button></th><th><button className="admin-sort-button" onClick={() => changeSort('subject')}>{sortLabel('Subject', 'subject')}</button></th><th><button className="admin-sort-button" onClick={() => changeSort('teacher')}>{sortLabel('Teacher', 'teacher')}</button></th><th><button className="admin-sort-button" onClick={() => changeSort('assigned_at')}>{sortLabel('Date assigned', 'assigned_at')}</button></th><th className="admin-actions-column">Actions</th></tr></thead>
        <tbody>{pagedAssignments.map((assignment: any) => {
          const schoolClass = classById[assignment.class_id];
          const teacher = teachers.find((item: any) => item.user_id === assignment.teacher_user_id);
          return <tr key={assignment.id}><td><strong>{schoolClass?.class_code || 'Unknown class'}</strong><span className="admin-table-subline">{schoolClass?.class_name || 'Class record unavailable'}</span></td><td>{assignment.subject}</td><td><strong>{teacher?.username || 'Unknown teacher'}</strong>{teacher?.email && <span className="admin-table-subline">{teacher.email}</span>}</td><td>{formatAdminDate(assignment.assigned_at)}</td><td className="admin-row-actions"><button className="admin-button-danger admin-button-small" onClick={() => {
            setConfirmReason(''); setConfirmDialog({ title: 'Delete teaching assignment?', description: `Remove ${teacher?.username || 'this teacher'} from ${assignment.subject} in ${schoolClass?.class_code || 'this class'}? The class and user accounts will remain unchanged.`, confirmLabel: 'Delete assignment', cancelLabel: 'Keep assignment', isDestructive: true, onConfirm: async () => {
              const result = await SchoolAdminService.deleteTeacherAssignment(assignment.id, school?.id);
              if (result.success) { addToast('Teaching assignment deleted', 'success'); if (school) await loadAdminTools(school.id); }
              else addToast(friendlySchoolAdminError(result.error, 'The teaching assignment could not be deleted. Please try again.'), 'error');
            } });
          }}>Delete</button></td></tr>;
        })}</tbody>
      </table></div> : <div className="admin-empty-state"><h3>No assignments found</h3><p>Adjust the filters or create a new class-subject-teacher assignment.</p></div>}
      {sortedAssignments.length > 0 && <footer className="community-pagination"><span>Page {assignmentPage} of {totalPages}</span><div><button disabled={assignmentPage === 1} onClick={() => setAssignmentPage((page: number) => Math.max(1, page - 1))}>Previous</button><button disabled={assignmentPage >= totalPages} onClick={() => setAssignmentPage((page: number) => Math.min(totalPages, page + 1))}>Next</button></div></footer>}
    </section>
  </div>;
};

export default TeachersTab;
