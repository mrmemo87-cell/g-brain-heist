import React from 'react';
import InvitesTab from './InvitesTab';
import { useSchoolAdmin } from '../SchoolAdminContext';
import * as SchoolAdminService from '../../../services/schoolAdminService';
import { formatAdminDate, friendlySchoolAdminError } from '../../../src/lib/schoolAdminPresentation';
import { createSchoolDocumentId, escapeSchoolDocumentHtml, openSchoolDocumentPreview, schoolDocumentFileName } from '../../../src/lib/schoolDocument';
import { formatAllocatableTeacherLabel, getAllocatableTeachers } from '../../../src/lib/schoolAdminTeacherAllocations';
import { fetchSchoolAcademicSetup, type SchoolAcademicSetup } from '../../../services/schoolAcademicSetupService';

type AllocationSort = 'academic_year' | 'class' | 'subject' | 'teacher' | 'allocated_at';

const TeachersTab: React.FC = () => {
  const {
    addToast, allocationClassId, allocationPage, allocationPageSize, allocationSaving,
    allocationSubjectInput, allocationTeacherId, classById, classes,
    handleAllocateTeacher, loadAdminTools, school, setActiveTab, setAllocationClassId,
    setAllocationPage, setAllocationPageSize, setAllocationSubjectInput,
    setAllocationTeacherId, setConfirmDialog, setConfirmReason, teacherAllocations, teachers,
  } = useSchoolAdmin();
  const [isAllocationOpen, setIsAllocationOpen] = React.useState(false);
  const [allocationGradeLevel, setAllocationGradeLevel] = React.useState('');
  const [filterGradeLevel, setFilterGradeLevel] = React.useState('');
  const [filterClassId, setFilterClassId] = React.useState('');
  const [filterSubject, setFilterSubject] = React.useState('');
  const [filterTeacherId, setFilterTeacherId] = React.useState('');
  const [sortKey, setSortKey] = React.useState<AllocationSort>('class');
  const [sortDirection, setSortDirection] = React.useState<'asc' | 'desc'>('asc');
  const [academicSetup, setAcademicSetup] = React.useState<SchoolAcademicSetup | null>(null);

  React.useEffect(() => {
    let active = true;
    void fetchSchoolAcademicSetup(school.id).then((value) => { if (active) setAcademicSetup(value); }).catch(() => { if (active) setAcademicSetup(null); });
    return () => { active = false; };
  }, [school.id]);

  const activeClasses = React.useMemo(() => (classes || []).filter((schoolClass: any) => schoolClass.is_active), [classes]);
  const gradeLevels = React.useMemo(() => Array.from(new Set(activeClasses.map((schoolClass: any) => Number(schoolClass.grade_level)).filter(Number.isFinite))).sort((a, b) => a - b), [activeClasses]);
  const allocationClasses = React.useMemo(() => activeClasses.filter((schoolClass: any) => allocationGradeLevel && String(schoolClass.grade_level) === allocationGradeLevel), [activeClasses, allocationGradeLevel]);
  const filterClasses = React.useMemo(() => activeClasses.filter((schoolClass: any) => !filterGradeLevel || String(schoolClass.grade_level) === filterGradeLevel), [activeClasses, filterGradeLevel]);
  const availableTeachers = React.useMemo(() => getAllocatableTeachers(teachers || []), [teachers]);
  const teacherFilterOptions = React.useMemo(() => {
    const options = new Map<string, { user_id: string; username: string; email: string; can_teach: boolean; role_in_school: string; is_owner: boolean }>();
    availableTeachers.forEach((teacher: any) => options.set(teacher.user_id, teacher));
    (teacherAllocations || []).forEach((allocation: any) => {
      if (!allocation.teacher_user_id || options.has(allocation.teacher_user_id)) return;
      options.set(allocation.teacher_user_id, {
        user_id: allocation.teacher_user_id,
        username: allocation.teacher_name || allocation.teacher_username || 'Unknown teacher',
        email: allocation.teacher_email || '',
        can_teach: Boolean(allocation.teacher_can_teach),
        role_in_school: 'teacher',
        is_owner: false,
      });
    });
    return Array.from(options.values()).sort((left, right) => left.username.localeCompare(right.username));
  }, [availableTeachers, teacherAllocations]);
  const currentYear = academicSetup?.years.find((year) => year.status === 'current') || academicSetup?.years[0];
  const currentOfferings = React.useMemo(() => (academicSetup?.offerings || []).filter((offering) => !currentYear || offering.academicYearId === currentYear.id), [academicSetup?.offerings, currentYear]);
  const selectedClassGradeLevel = activeClasses.find((schoolClass: any) => schoolClass.id === allocationClassId)?.grade_level;
  const allocatableSubjects = React.useMemo(() => Array.from(new Set(currentOfferings
    .filter((offering) => selectedClassGradeLevel != null && Number(offering.gradeLevel) === Number(selectedClassGradeLevel))
    .map((offering) => offering.subjectName))).sort((a, b) => a.localeCompare(b)), [selectedClassGradeLevel, currentOfferings]);
  const selectedFilterGrade = filterClassId
    ? String(activeClasses.find((schoolClass: any) => schoolClass.id === filterClassId)?.grade_level ?? '')
    : filterGradeLevel;
  const subjectOptions = React.useMemo(() => Array.from(new Set([
    ...currentOfferings
      .filter((offering) => !selectedFilterGrade || String(offering.gradeLevel) === selectedFilterGrade)
      .map((offering) => offering.subjectName),
    ...(teacherAllocations || [])
      .filter((allocation: any) => {
        const schoolClass = classById[allocation.class_id];
        if (filterClassId && allocation.class_id !== filterClassId) return false;
        return !selectedFilterGrade || String(schoolClass?.grade_level ?? '') === selectedFilterGrade;
      })
      .map((allocation: any) => allocation.subject),
  ].filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b))), [classById, currentOfferings, filterClassId, selectedFilterGrade, teacherAllocations]);

  React.useEffect(() => {
    if (!allocationClassId) return;
    const selectedClass = activeClasses.find((schoolClass: any) => schoolClass.id === allocationClassId);
    if (selectedClass?.grade_level != null) setAllocationGradeLevel(String(selectedClass.grade_level));
  }, [activeClasses, allocationClassId]);

  React.useEffect(() => {
    if (filterSubject && !subjectOptions.includes(filterSubject)) setFilterSubject('');
  }, [filterSubject, subjectOptions]);

  const sortedAllocations = React.useMemo(() => {
    const rows = (teacherAllocations || []).filter((allocation: any) => {
      const schoolClass = classById[allocation.class_id];
      if (filterGradeLevel && String(schoolClass?.grade_level ?? allocation.grade_level ?? '') !== filterGradeLevel) return false;
      if (filterClassId && allocation.class_id !== filterClassId) return false;
      if (filterSubject && allocation.subject !== filterSubject) return false;
      if (filterTeacherId && allocation.teacher_user_id !== filterTeacherId) return false;
      return true;
    });
    const direction = sortDirection === 'asc' ? 1 : -1;
    return rows.slice().sort((left: any, right: any) => {
      const leftClass = classById[left.class_id];
      const rightClass = classById[right.class_id];
      const leftTeacher = teachers.find((teacher: any) => teacher.user_id === left.teacher_user_id);
      const rightTeacher = teachers.find((teacher: any) => teacher.user_id === right.teacher_user_id);
      const values: Record<AllocationSort, [string, string]> = {
        academic_year: [String(leftClass?.grade_level ?? ''), String(rightClass?.grade_level ?? '')],
        class: [leftClass?.class_code || '', rightClass?.class_code || ''],
        subject: [left.subject || '', right.subject || ''],
        teacher: [left.teacher_name || leftTeacher?.username || '', right.teacher_name || rightTeacher?.username || ''],
        allocated_at: [left.allocated_at || '', right.allocated_at || ''],
      };
      return values[sortKey][0].localeCompare(values[sortKey][1], undefined, { numeric: true }) * direction;
    });
  }, [classById, filterGradeLevel, filterClassId, filterSubject, filterTeacherId, sortDirection, sortKey, teacherAllocations, teachers]);

  React.useEffect(() => { setAllocationPage(1); }, [filterGradeLevel, filterClassId, filterSubject, filterTeacherId, allocationPageSize, setAllocationPage]);
  const totalPages = Math.max(1, Math.ceil(sortedAllocations.length / allocationPageSize));
  React.useEffect(() => { setAllocationPage((page: number) => Math.min(page, totalPages)); }, [setAllocationPage, totalPages]);
  const pagedAllocations = sortedAllocations.slice((allocationPage - 1) * allocationPageSize, allocationPage * allocationPageSize);

  const changeSort = (next: AllocationSort) => {
    if (sortKey === next) setSortDirection((current) => current === 'asc' ? 'desc' : 'asc');
    else { setSortKey(next); setSortDirection('asc'); }
  };
  const sortLabel = (label: string, key: AllocationSort) => `${label}${sortKey === key ? (sortDirection === 'asc' ? ' ↑' : ' ↓') : ''}`;

  const printTeacherAllocations = () => {
    if (!school) return;
    const rows = sortedAllocations.map((allocation: any, index: number) => {
      const schoolClass = classById[allocation.class_id];
      const teacher = teachers.find((item: any) => item.user_id === allocation.teacher_user_id);
      return `<tr><td>${index + 1}</td><td>${escapeSchoolDocumentHtml(schoolClass?.grade_level ?? allocation.grade_level ?? '—')}</td><td>${escapeSchoolDocumentHtml(schoolClass?.class_code || allocation.class_code || 'Unknown')}</td><td>${escapeSchoolDocumentHtml(schoolClass?.class_name || allocation.class_name || '—')}</td><td>${escapeSchoolDocumentHtml(allocation.subject)}</td><td>${escapeSchoolDocumentHtml(allocation.teacher_name || teacher?.username || 'Unknown teacher')}</td><td>${escapeSchoolDocumentHtml(formatAdminDate(allocation.allocated_at))}</td></tr>`;
    }).join('');
    try {
      openSchoolDocumentPreview({
        meta: { documentId: createSchoolDocumentId('teacher-allocation'), templateVersion: 'teacher-allocation-v1', title: 'Teacher Allocation Register', subtitle: `${sortedAllocations.length} current allocations`, schoolName: school.name, schoolLogoUrl: school.logo_url, audience: 'internal', status: 'final', confidentiality: 'confidential', generatedAt: new Date().toISOString(), schoolId: school.id, visibilityScope: 'school_staff', sourceType: 'teacher_allocations', sourceId: 'current' },
        bodyHtml: `<table><thead><tr><th>No.</th><th>Grade level</th><th>Class</th><th>Class name</th><th>Subject</th><th>Teacher</th><th>Allocated</th></tr></thead><tbody>${rows || '<tr><td colspan="7">No teacher allocations match the current filters.</td></tr>'}</tbody></table><div class="document-signatures"><div class="document-signature">Prepared by · Name / signature / date</div><div class="document-signature">Approved by · Name / signature / date</div></div>`,
        orientation: 'landscape', inkSaver: true, fileName: schoolDocumentFileName(school.name, 'Teacher_Allocation_Register'),
      });
    } catch (error) { addToast(error instanceof Error ? error.message : 'Unable to open the allocation register.', 'error'); }
  };

  return <div className="space-y-6">
    <section className="admin-section-heading"><div><p className="school-admin-eyebrow">Administration</p><h2>Teacher Allocation</h2><p>Invite teachers, review current teaching coverage, and allocate staff to classes and subjects.</p></div></section>

    <InvitesTab showRotate={false} />

    <section className="admin-table-card" aria-labelledby="current-allocations-title">
      <div className="admin-card-heading admin-assignment-heading"><div><h3 id="current-allocations-title">Current allocations</h3><p>{sortedAllocations.length} allocations match the current filters.</p></div><div className="admin-assignment-actions">
        <button type="button" className="admin-button-secondary admin-print-button" onClick={printTeacherAllocations} disabled={!sortedAllocations.length} title="Print the filtered current allocations as a landscape register">Print teacher allocation register</button>
        <button type="button" className="admin-button-primary" onClick={() => availableTeachers.length ? setIsAllocationOpen(true) : setActiveTab('members')} aria-expanded={isAllocationOpen} aria-controls="allocate-teacher-panel">{availableTeachers.length ? 'Allocate teacher' : 'Add teaching staff'}</button>
      </div></div>
      <div className="admin-assignment-filters admin-assignment-filters-bar">
        <label><span>Grade level</span><select aria-label="Filter allocations by grade level" value={filterGradeLevel} onChange={(event) => { setFilterGradeLevel(event.target.value); setFilterClassId(''); setFilterSubject(''); }}><option value="">All grade levels</option>{gradeLevels.map((grade) => <option key={grade} value={grade}>Grade {grade}</option>)}</select></label>
        <label><span>Class</span><select aria-label="Filter allocations by class" value={filterClassId} onChange={(event) => { setFilterClassId(event.target.value); setFilterSubject(''); }}><option value="">All classes</option>{filterClasses.map((schoolClass: any) => <option key={schoolClass.id} value={schoolClass.id}>{schoolClass.class_code}</option>)}</select></label>
        <label><span>Subject</span><select aria-label="Filter allocations by subject" value={filterSubject} onChange={(event) => setFilterSubject(event.target.value)}><option value="">All subjects</option>{subjectOptions.map((subject) => <option key={String(subject)} value={String(subject)}>{String(subject)}</option>)}</select></label>
        <label><span>Teacher</span><select aria-label="Filter allocations by teacher" value={filterTeacherId} onChange={(event) => setFilterTeacherId(event.target.value)}><option value="">All teachers</option>{teacherFilterOptions.map((teacher: any) => <option key={teacher.user_id} value={teacher.user_id}>{formatAllocatableTeacherLabel(teacher)}</option>)}</select></label>
        <label><span>Rows</span><select aria-label="Allocations per page" value={allocationPageSize} onChange={(event) => setAllocationPageSize(Number(event.target.value))}><option value={5}>5 rows</option><option value={10}>10 rows</option><option value={20}>20 rows</option></select></label>
      </div>
      {pagedAllocations.length ? <div className="admin-table-scroll"><table>
        <thead><tr><th><button className="admin-sort-button" onClick={() => changeSort('academic_year')}>{sortLabel('Grade level', 'academic_year')}</button></th><th><button className="admin-sort-button" onClick={() => changeSort('class')}>{sortLabel('Class', 'class')}</button></th><th><button className="admin-sort-button" onClick={() => changeSort('subject')}>{sortLabel('Subject', 'subject')}</button></th><th><button className="admin-sort-button" onClick={() => changeSort('teacher')}>{sortLabel('Teacher', 'teacher')}</button></th><th><button className="admin-sort-button" onClick={() => changeSort('allocated_at')}>{sortLabel('Date allocated', 'allocated_at')}</button></th><th className="admin-actions-column">Actions</th></tr></thead>
        <tbody>{pagedAllocations.map((allocation: any) => {
          const schoolClass = classById[allocation.class_id];
          const teacher = teachers.find((item: any) => item.user_id === allocation.teacher_user_id);
          const teacherName = allocation.teacher_name || teacher?.username || 'Unknown teacher';
          const teacherEmail = allocation.teacher_email || teacher?.email || '';
          const classCode = schoolClass?.class_code || allocation.class_code || 'Unknown class';
          const className = schoolClass?.class_name || allocation.class_name || 'Class record unavailable';
          const gradeLevel = schoolClass?.grade_level ?? allocation.grade_level;
          const teacherUnavailable = allocation.teacher_membership_status != null
            && (allocation.teacher_membership_status !== 'active' || !allocation.teacher_can_teach);
          return <tr key={allocation.id}><td>{gradeLevel != null ? `Grade ${gradeLevel}` : 'Not set'}</td><td><strong>{classCode}</strong><span className="admin-table-subline">{className}</span></td><td>{allocation.subject}</td><td><strong>{teacherName}</strong>{teacherEmail && <span className="admin-table-subline">{teacherEmail}</span>}{teacherUnavailable && <span className="admin-table-subline text-amber-700">Allocation needs staff-status review</span>}</td><td>{formatAdminDate(allocation.allocated_at)}</td><td className="admin-row-actions"><button className="admin-button-danger admin-button-small" onClick={() => {
            setConfirmReason(''); setConfirmDialog({ title: 'Delete teacher allocation?', description: `Remove ${teacherName} from ${allocation.subject} in ${classCode}? The class and user accounts will remain unchanged.`, confirmLabel: 'Delete allocation', cancelLabel: 'Keep allocation', isDestructive: true, onConfirm: async () => {
              const result = await SchoolAdminService.deleteTeacherAllocation(allocation.id, school?.id);
              if (result.success) { addToast('Teacher allocation deleted', 'success'); if (school) await loadAdminTools(school.id); }
              else addToast(friendlySchoolAdminError(result.error, 'The teacher allocation could not be deleted. Please try again.'), 'error');
            } });
          }}>Delete</button></td></tr>;
        })}</tbody>
      </table></div> : !availableTeachers.length
        ? <div className="admin-empty-state"><h3>No teaching staff registered yet</h3><p>Add a teacher or explicitly register an administrator who genuinely teaches. Administrative access alone does not create a teacher record.</p><button type="button" className="admin-button-primary" onClick={() => setActiveTab('members')}>Open Staff &amp; Students</button></div>
        : !teacherAllocations.length
          ? <div className="admin-empty-state"><h3>No teacher allocations yet</h3><p>Allocate a registered teacher to a class and one of that grade level’s saved subjects.</p><button type="button" className="admin-button-primary" onClick={() => setIsAllocationOpen(true)}>Create first allocation</button></div>
          : <div className="admin-empty-state"><h3>No allocations match these filters</h3><p>Change or clear a filter to view current teacher allocations.</p></div>}
      {sortedAllocations.length > 0 && <footer className="community-pagination"><span>Page {allocationPage} of {totalPages}</span><div><button disabled={allocationPage === 1} onClick={() => setAllocationPage((page: number) => Math.max(1, page - 1))}>Previous</button><button disabled={allocationPage >= totalPages} onClick={() => setAllocationPage((page: number) => Math.min(totalPages, page + 1))}>Next</button></div></footer>}
    </section>

    {isAllocationOpen && <section id="allocate-teacher-panel" className="admin-form-card" aria-labelledby="allocate-teacher-title">
      <div className="admin-card-heading"><div><h3 id="allocate-teacher-title">Allocate teacher to class and subject</h3><p>Select the grade level and class. Subject choices come from that grade's saved curriculum plan.</p></div><button type="button" className="admin-button-ghost admin-button-small" onClick={() => setIsAllocationOpen(false)}>Close</button></div>
      <div className="admin-form-grid admin-form-grid-four">
        <label className="admin-field"><span>Grade level <i>Required</i></span><select value={allocationGradeLevel} onChange={(event) => { setAllocationGradeLevel(event.target.value); setAllocationClassId(''); setAllocationSubjectInput(''); }}><option value="">Select grade level</option>{gradeLevels.map((grade) => <option key={grade} value={grade}>Grade {grade}</option>)}</select></label>
        <label className="admin-field"><span>Class <i>Required</i></span><select value={allocationClassId} disabled={!allocationGradeLevel} onChange={(event) => { setAllocationClassId(event.target.value); setAllocationSubjectInput(''); }}><option value="">{allocationGradeLevel ? 'Select class' : 'Select grade level first'}</option>{allocationClasses.map((schoolClass: any) => <option key={schoolClass.id} value={schoolClass.id}>{schoolClass.class_code} — {schoolClass.class_name}</option>)}</select></label>
        <label className="admin-field"><span>Subject <i>Required</i></span><select value={allocationSubjectInput} disabled={!allocationClassId} onChange={(event) => setAllocationSubjectInput(event.target.value)}><option value="">{allocationClassId ? 'Select subject' : 'Select class first'}</option>{allocatableSubjects.map((subject) => <option key={subject} value={subject}>{subject}</option>)}</select></label>
        <label className="admin-field"><span>Teacher <i>Required</i></span><select value={allocationTeacherId} onChange={(event) => setAllocationTeacherId(event.target.value)}><option value="">Select teacher</option>{availableTeachers.map((teacher: any) => <option key={teacher.user_id} value={teacher.user_id}>{formatAllocatableTeacherLabel(teacher)}</option>)}</select></label>
      </div>
      {allocationClassId && !allocatableSubjects.length && <div className="admin-inline-warning" role="status"><strong>No subjects configured</strong><span>Choose subjects for this grade level in Curriculum &amp; Subjects first.</span></div>}
      {!availableTeachers.length && <div className="admin-inline-warning" role="status"><strong>No teaching staff available</strong><span>Register teaching staff in Staff &amp; Students before creating an allocation.</span></div>}
      <div className="admin-form-actions"><button className="admin-button-primary" onClick={handleAllocateTeacher} disabled={allocationSaving || !allocationClassId || !allocationTeacherId || !allocationSubjectInput}>{allocationSaving ? 'Allocating…' : 'Allocate teacher'}</button></div>
    </section>}
  </div>;
};

export default TeachersTab;
