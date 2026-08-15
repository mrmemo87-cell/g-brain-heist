import React from 'react';
import { useSchoolAdmin } from '../SchoolAdminContext';
import * as SchoolAdminService from '../../../services/schoolAdminService';
import { formatAdminDate, friendlySchoolAdminError } from '../../../src/lib/schoolAdminPresentation';
import { createSchoolDocumentId, escapeSchoolDocumentHtml, openSchoolDocumentPreview, schoolDocumentFileName } from '../../../src/lib/schoolDocument';
import { formatAssignableTeacherLabel, getAssignableTeachers } from '../../../src/lib/schoolAdminTeacherAssignments';
import { fetchSchoolAcademicSetup, type SchoolAcademicSetup } from '../../../services/schoolAcademicSetupService';

type AssignmentSort = 'academic_year' | 'class' | 'subject' | 'teacher' | 'assigned_at';

const TeachersTab: React.FC = () => {
  const {
    addToast, assignmentClassId, assignmentPage, assignmentPageSize, assignmentSaving,
    assignmentSubjectInput, assignmentTeacherId, classById, classes,
    handleAssignTeacher, loadAdminTools, school, setActiveTab, setAssignmentClassId,
    setAssignmentPage, setAssignmentPageSize, setAssignmentSubjectInput,
    setAssignmentTeacherId, setConfirmDialog, setConfirmReason, teacherAssignments, teachers,
  } = useSchoolAdmin();
  const [isAssignOpen, setIsAssignOpen] = React.useState(false);
  const [assignmentGradeLevel, setAssignmentGradeLevel] = React.useState('');
  const [filterGradeLevel, setFilterGradeLevel] = React.useState('');
  const [filterClassId, setFilterClassId] = React.useState('');
  const [filterSubject, setFilterSubject] = React.useState('');
  const [filterTeacherId, setFilterTeacherId] = React.useState('');
  const [sortKey, setSortKey] = React.useState<AssignmentSort>('class');
  const [sortDirection, setSortDirection] = React.useState<'asc' | 'desc'>('asc');
  const [academicSetup, setAcademicSetup] = React.useState<SchoolAcademicSetup | null>(null);

  React.useEffect(() => {
    let active = true;
    void fetchSchoolAcademicSetup(school.id).then((value) => { if (active) setAcademicSetup(value); }).catch(() => { if (active) setAcademicSetup(null); });
    return () => { active = false; };
  }, [school.id]);

  const activeClasses = React.useMemo(() => (classes || []).filter((schoolClass: any) => schoolClass.is_active), [classes]);
  const gradeLevels = React.useMemo(() => Array.from(new Set(activeClasses.map((schoolClass: any) => Number(schoolClass.grade_level)).filter(Number.isFinite))).sort((a, b) => a - b), [activeClasses]);
  const assignmentClasses = React.useMemo(() => activeClasses.filter((schoolClass: any) => assignmentGradeLevel && String(schoolClass.grade_level) === assignmentGradeLevel), [activeClasses, assignmentGradeLevel]);
  const filterClasses = React.useMemo(() => activeClasses.filter((schoolClass: any) => !filterGradeLevel || String(schoolClass.grade_level) === filterGradeLevel), [activeClasses, filterGradeLevel]);
  const availableTeachers = React.useMemo(() => getAssignableTeachers(teachers || []), [teachers]);
  const teacherFilterOptions = React.useMemo(() => {
    const options = new Map<string, { user_id: string; username: string; email: string; can_teach: boolean; role_in_school: string; is_owner: boolean }>();
    availableTeachers.forEach((teacher: any) => options.set(teacher.user_id, teacher));
    (teacherAssignments || []).forEach((assignment: any) => {
      if (!assignment.teacher_user_id || options.has(assignment.teacher_user_id)) return;
      options.set(assignment.teacher_user_id, {
        user_id: assignment.teacher_user_id,
        username: assignment.teacher_name || assignment.teacher_username || 'Unknown teacher',
        email: assignment.teacher_email || '',
        can_teach: Boolean(assignment.teacher_can_teach),
        role_in_school: 'teacher',
        is_owner: false,
      });
    });
    return Array.from(options.values()).sort((left, right) => left.username.localeCompare(right.username));
  }, [availableTeachers, teacherAssignments]);
  const currentYear = academicSetup?.years.find((year) => year.status === 'current') || academicSetup?.years[0];
  const currentOfferings = React.useMemo(() => (academicSetup?.offerings || []).filter((offering) => !currentYear || offering.academicYearId === currentYear.id), [academicSetup?.offerings, currentYear]);
  const selectedClassGradeLevel = activeClasses.find((schoolClass: any) => schoolClass.id === assignmentClassId)?.grade_level;
  const assignableSubjects = React.useMemo(() => Array.from(new Set(currentOfferings
    .filter((offering) => selectedClassGradeLevel != null && Number(offering.gradeLevel) === Number(selectedClassGradeLevel))
    .map((offering) => offering.subjectName))).sort((a, b) => a.localeCompare(b)), [selectedClassGradeLevel, currentOfferings]);
  const selectedFilterGrade = filterClassId
    ? String(activeClasses.find((schoolClass: any) => schoolClass.id === filterClassId)?.grade_level ?? '')
    : filterGradeLevel;
  const subjectOptions = React.useMemo(() => Array.from(new Set([
    ...currentOfferings
      .filter((offering) => !selectedFilterGrade || String(offering.gradeLevel) === selectedFilterGrade)
      .map((offering) => offering.subjectName),
    ...(teacherAssignments || [])
      .filter((assignment: any) => {
        const schoolClass = classById[assignment.class_id];
        if (filterClassId && assignment.class_id !== filterClassId) return false;
        return !selectedFilterGrade || String(schoolClass?.grade_level ?? '') === selectedFilterGrade;
      })
      .map((assignment: any) => assignment.subject),
  ].filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b))), [classById, currentOfferings, filterClassId, selectedFilterGrade, teacherAssignments]);

  React.useEffect(() => {
    if (!assignmentClassId) return;
    const selectedClass = activeClasses.find((schoolClass: any) => schoolClass.id === assignmentClassId);
    if (selectedClass?.grade_level != null) setAssignmentGradeLevel(String(selectedClass.grade_level));
  }, [activeClasses, assignmentClassId]);

  React.useEffect(() => {
    if (filterSubject && !subjectOptions.includes(filterSubject)) setFilterSubject('');
  }, [filterSubject, subjectOptions]);

  const sortedAssignments = React.useMemo(() => {
    const rows = (teacherAssignments || []).filter((assignment: any) => {
      const schoolClass = classById[assignment.class_id];
      if (filterGradeLevel && String(schoolClass?.grade_level ?? assignment.grade_level ?? '') !== filterGradeLevel) return false;
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
        academic_year: [String(leftClass?.grade_level ?? ''), String(rightClass?.grade_level ?? '')],
        class: [leftClass?.class_code || '', rightClass?.class_code || ''],
        subject: [left.subject || '', right.subject || ''],
        teacher: [left.teacher_name || leftTeacher?.username || '', right.teacher_name || rightTeacher?.username || ''],
        assigned_at: [left.assigned_at || '', right.assigned_at || ''],
      };
      return values[sortKey][0].localeCompare(values[sortKey][1], undefined, { numeric: true }) * direction;
    });
  }, [classById, filterGradeLevel, filterClassId, filterSubject, filterTeacherId, sortDirection, sortKey, teacherAssignments, teachers]);

  React.useEffect(() => { setAssignmentPage(1); }, [filterGradeLevel, filterClassId, filterSubject, filterTeacherId, assignmentPageSize, setAssignmentPage]);
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
      return `<tr><td>${index + 1}</td><td>${escapeSchoolDocumentHtml(schoolClass?.grade_level ?? assignment.grade_level ?? '—')}</td><td>${escapeSchoolDocumentHtml(schoolClass?.class_code || assignment.class_code || 'Unknown')}</td><td>${escapeSchoolDocumentHtml(schoolClass?.class_name || assignment.class_name || '—')}</td><td>${escapeSchoolDocumentHtml(assignment.subject)}</td><td>${escapeSchoolDocumentHtml(assignment.teacher_name || teacher?.username || 'Unknown teacher')}</td><td>${escapeSchoolDocumentHtml(formatAdminDate(assignment.assigned_at))}</td></tr>`;
    }).join('');
    try {
      openSchoolDocumentPreview({
        meta: { documentId: createSchoolDocumentId('teacher-allocation'), templateVersion: 'teacher-allocation-v1', title: 'Teacher Allocation Register', subtitle: `${sortedAssignments.length} current assignments`, schoolName: school.name, schoolLogoUrl: school.logo_url, audience: 'internal', status: 'final', confidentiality: 'confidential', generatedAt: new Date().toISOString(), schoolId: school.id, visibilityScope: 'school_staff', sourceType: 'teacher_allocations', sourceId: 'current' },
        bodyHtml: `<table><thead><tr><th>No.</th><th>Grade level</th><th>Class</th><th>Class name</th><th>Subject</th><th>Teacher</th><th>Assigned</th></tr></thead><tbody>${rows || '<tr><td colspan="7">No teaching assignments match the current filters.</td></tr>'}</tbody></table><div class="document-signatures"><div class="document-signature">Prepared by · Name / signature / date</div><div class="document-signature">Approved by · Name / signature / date</div></div>`,
        orientation: 'landscape', inkSaver: true, fileName: schoolDocumentFileName(school.name, 'Teacher_Allocation_Register'),
      });
    } catch (error) { addToast(error instanceof Error ? error.message : 'Unable to open the allocation register.', 'error'); }
  };

  return <div className="space-y-6">
    <section className="admin-section-heading"><div><p className="school-admin-eyebrow">Administration</p><h2>Teacher Assignments</h2><p>Review current teaching coverage, then add a class and subject assignment when needed.</p></div></section>

    <section className="admin-table-card" aria-labelledby="current-assignments-title">
      <div className="admin-card-heading admin-assignment-heading"><div><h3 id="current-assignments-title">Current assignments</h3><p>{sortedAssignments.length} assignments match the current filters.</p></div><div className="admin-assignment-actions">
        <button type="button" className="admin-button-secondary admin-print-button" onClick={printTeacherAllocations} disabled={!sortedAssignments.length} title="Print the filtered current assignments as a landscape register">Print teacher allocation register</button>
        <button type="button" className="admin-button-primary" onClick={() => availableTeachers.length ? setIsAssignOpen(true) : setActiveTab('members')} aria-expanded={isAssignOpen} aria-controls="assign-teacher-panel">{availableTeachers.length ? 'Assign teacher' : 'Add teaching staff'}</button>
      </div></div>
      <div className="admin-assignment-filters admin-assignment-filters-bar">
        <label><span>Grade level</span><select aria-label="Filter assignments by grade level" value={filterGradeLevel} onChange={(event) => { setFilterGradeLevel(event.target.value); setFilterClassId(''); setFilterSubject(''); }}><option value="">All grade levels</option>{gradeLevels.map((grade) => <option key={grade} value={grade}>Grade {grade}</option>)}</select></label>
        <label><span>Class</span><select aria-label="Filter assignments by class" value={filterClassId} onChange={(event) => { setFilterClassId(event.target.value); setFilterSubject(''); }}><option value="">All classes</option>{filterClasses.map((schoolClass: any) => <option key={schoolClass.id} value={schoolClass.id}>{schoolClass.class_code}</option>)}</select></label>
        <label><span>Subject</span><select aria-label="Filter assignments by subject" value={filterSubject} onChange={(event) => setFilterSubject(event.target.value)}><option value="">All subjects</option>{subjectOptions.map((subject) => <option key={String(subject)} value={String(subject)}>{String(subject)}</option>)}</select></label>
        <label><span>Teacher</span><select aria-label="Filter assignments by teacher" value={filterTeacherId} onChange={(event) => setFilterTeacherId(event.target.value)}><option value="">All teachers</option>{teacherFilterOptions.map((teacher: any) => <option key={teacher.user_id} value={teacher.user_id}>{formatAssignableTeacherLabel(teacher)}</option>)}</select></label>
        <label><span>Rows</span><select aria-label="Assignments per page" value={assignmentPageSize} onChange={(event) => setAssignmentPageSize(Number(event.target.value))}><option value={5}>5 rows</option><option value={10}>10 rows</option><option value={20}>20 rows</option></select></label>
      </div>
      {pagedAssignments.length ? <div className="admin-table-scroll"><table>
        <thead><tr><th><button className="admin-sort-button" onClick={() => changeSort('academic_year')}>{sortLabel('Grade level', 'academic_year')}</button></th><th><button className="admin-sort-button" onClick={() => changeSort('class')}>{sortLabel('Class', 'class')}</button></th><th><button className="admin-sort-button" onClick={() => changeSort('subject')}>{sortLabel('Subject', 'subject')}</button></th><th><button className="admin-sort-button" onClick={() => changeSort('teacher')}>{sortLabel('Teacher', 'teacher')}</button></th><th><button className="admin-sort-button" onClick={() => changeSort('assigned_at')}>{sortLabel('Date assigned', 'assigned_at')}</button></th><th className="admin-actions-column">Actions</th></tr></thead>
        <tbody>{pagedAssignments.map((assignment: any) => {
          const schoolClass = classById[assignment.class_id];
          const teacher = teachers.find((item: any) => item.user_id === assignment.teacher_user_id);
          const teacherName = assignment.teacher_name || teacher?.username || 'Unknown teacher';
          const teacherEmail = assignment.teacher_email || teacher?.email || '';
          const classCode = schoolClass?.class_code || assignment.class_code || 'Unknown class';
          const className = schoolClass?.class_name || assignment.class_name || 'Class record unavailable';
          const gradeLevel = schoolClass?.grade_level ?? assignment.grade_level;
          const teacherUnavailable = assignment.teacher_membership_status != null
            && (assignment.teacher_membership_status !== 'active' || !assignment.teacher_can_teach);
          return <tr key={assignment.id}><td>{gradeLevel != null ? `Grade ${gradeLevel}` : 'Not set'}</td><td><strong>{classCode}</strong><span className="admin-table-subline">{className}</span></td><td>{assignment.subject}</td><td><strong>{teacherName}</strong>{teacherEmail && <span className="admin-table-subline">{teacherEmail}</span>}{teacherUnavailable && <span className="admin-table-subline text-amber-700">Assignment needs staff-status review</span>}</td><td>{formatAdminDate(assignment.assigned_at)}</td><td className="admin-row-actions"><button className="admin-button-danger admin-button-small" onClick={() => {
            setConfirmReason(''); setConfirmDialog({ title: 'Delete teaching assignment?', description: `Remove ${teacherName} from ${assignment.subject} in ${classCode}? The class and user accounts will remain unchanged.`, confirmLabel: 'Delete assignment', cancelLabel: 'Keep assignment', isDestructive: true, onConfirm: async () => {
              const result = await SchoolAdminService.deleteTeacherAssignment(assignment.id, school?.id);
              if (result.success) { addToast('Teaching assignment deleted', 'success'); if (school) await loadAdminTools(school.id); }
              else addToast(friendlySchoolAdminError(result.error, 'The teaching assignment could not be deleted. Please try again.'), 'error');
            } });
          }}>Delete</button></td></tr>;
        })}</tbody>
      </table></div> : !availableTeachers.length
        ? <div className="admin-empty-state"><h3>No teaching staff registered yet</h3><p>Add a teacher or explicitly register an administrator who genuinely teaches. Administrative access alone does not create a teacher record.</p><button type="button" className="admin-button-primary" onClick={() => setActiveTab('members')}>Open Staff &amp; Students</button></div>
        : !teacherAssignments.length
          ? <div className="admin-empty-state"><h3>No teaching assignments yet</h3><p>Connect a registered teacher to a class and one of that grade level’s saved subjects.</p><button type="button" className="admin-button-primary" onClick={() => setIsAssignOpen(true)}>Create first assignment</button></div>
          : <div className="admin-empty-state"><h3>No assignments match these filters</h3><p>Change or clear a filter to view current teaching assignments.</p></div>}
      {sortedAssignments.length > 0 && <footer className="community-pagination"><span>Page {assignmentPage} of {totalPages}</span><div><button disabled={assignmentPage === 1} onClick={() => setAssignmentPage((page: number) => Math.max(1, page - 1))}>Previous</button><button disabled={assignmentPage >= totalPages} onClick={() => setAssignmentPage((page: number) => Math.min(totalPages, page + 1))}>Next</button></div></footer>}
    </section>

    {isAssignOpen && <section id="assign-teacher-panel" className="admin-form-card" aria-labelledby="assign-teacher-title">
      <div className="admin-card-heading"><div><h3 id="assign-teacher-title">Assign teacher to class and subject</h3><p>Select the grade level and class. Subject choices come from that grade's saved curriculum plan.</p></div><button type="button" className="admin-button-ghost admin-button-small" onClick={() => setIsAssignOpen(false)}>Close</button></div>
      <div className="admin-form-grid admin-form-grid-four">
        <label className="admin-field"><span>Grade level <i>Required</i></span><select value={assignmentGradeLevel} onChange={(event) => { setAssignmentGradeLevel(event.target.value); setAssignmentClassId(''); setAssignmentSubjectInput(''); }}><option value="">Select grade level</option>{gradeLevels.map((grade) => <option key={grade} value={grade}>Grade {grade}</option>)}</select></label>
        <label className="admin-field"><span>Class <i>Required</i></span><select value={assignmentClassId} disabled={!assignmentGradeLevel} onChange={(event) => { setAssignmentClassId(event.target.value); setAssignmentSubjectInput(''); }}><option value="">{assignmentGradeLevel ? 'Select class' : 'Select grade level first'}</option>{assignmentClasses.map((schoolClass: any) => <option key={schoolClass.id} value={schoolClass.id}>{schoolClass.class_code} — {schoolClass.class_name}</option>)}</select></label>
        <label className="admin-field"><span>Subject <i>Required</i></span><select value={assignmentSubjectInput} disabled={!assignmentClassId} onChange={(event) => setAssignmentSubjectInput(event.target.value)}><option value="">{assignmentClassId ? 'Select subject' : 'Select class first'}</option>{assignableSubjects.map((subject) => <option key={subject} value={subject}>{subject}</option>)}</select></label>
        <label className="admin-field"><span>Teacher <i>Required</i></span><select value={assignmentTeacherId} onChange={(event) => setAssignmentTeacherId(event.target.value)}><option value="">Select teacher</option>{availableTeachers.map((teacher: any) => <option key={teacher.user_id} value={teacher.user_id}>{formatAssignableTeacherLabel(teacher)}</option>)}</select></label>
      </div>
      {assignmentClassId && !assignableSubjects.length && <div className="admin-inline-warning" role="status"><strong>No subjects configured</strong><span>Choose subjects for this grade level in Curriculum &amp; Subjects first.</span></div>}
      {!availableTeachers.length && <div className="admin-inline-warning" role="status"><strong>No teaching staff available</strong><span>Register teaching staff in Staff &amp; Students before creating an assignment.</span></div>}
      <div className="admin-form-actions"><button className="admin-button-primary" onClick={handleAssignTeacher} disabled={assignmentSaving || !assignmentClassId || !assignmentTeacherId || !assignmentSubjectInput}>{assignmentSaving ? 'Assigning…' : 'Assign teacher'}</button></div>
    </section>}
  </div>;
};

export default TeachersTab;
