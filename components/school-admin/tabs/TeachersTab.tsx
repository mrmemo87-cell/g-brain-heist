import React from 'react';
import InvitesTab from './InvitesTab';
import { useSchoolAdmin } from '../SchoolAdminContext';
import { formatAdminDate, friendlySchoolAdminError } from '../../../src/lib/schoolAdminPresentation';
import { createSchoolDocumentId, escapeSchoolDocumentHtml, openSchoolDocumentPreview, schoolDocumentFileName } from '../../../src/lib/schoolDocument';
import { formatAllocatableTeacherLabel, getAllocatableTeachers } from '../../../src/lib/schoolAdminTeacherAllocations';
import {
  fetchSchoolSubjectGroups,
  setSchoolSubjectGroupTeacher,
  type SchoolSubjectGroup,
} from '../../../services/schoolSubjectGroupService';

type SortKey = 'grade' | 'group' | 'subject' | 'teacher';

const TeachersTab: React.FC = () => {
  const {
    addToast,
    school,
    setActiveTab,
    setConfirmDialog,
    setConfirmReason,
    teachers = [],
  } = useSchoolAdmin();

  const [groups, setGroups] = React.useState<SchoolSubjectGroup[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [isAllocationOpen, setIsAllocationOpen] = React.useState(false);
  const [gradeFilter, setGradeFilter] = React.useState('');
  const [subjectFilter, setSubjectFilter] = React.useState('');
  const [teacherFilter, setTeacherFilter] = React.useState('');
  const [sortKey, setSortKey] = React.useState<SortKey>('grade');
  const [sortDirection, setSortDirection] = React.useState<'asc' | 'desc'>('asc');

  const [allocationGrade, setAllocationGrade] = React.useState('');
  const [allocationSubjectId, setAllocationSubjectId] = React.useState('');
  const [allocationGroupId, setAllocationGroupId] = React.useState('');
  const [allocationTeacherId, setAllocationTeacherId] = React.useState('');

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      setGroups(await fetchSchoolSubjectGroups(school.id));
    } catch (error) {
      console.error('Failed to load teaching groups', error);
      setGroups([]);
      addToast(friendlySchoolAdminError(error instanceof Error ? error.message : undefined, 'Teaching groups could not be loaded.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast, school.id]);

  React.useEffect(() => { void load(); }, [load]);

  const availableTeachers = React.useMemo(() => getAllocatableTeachers(teachers || []), [teachers]);
  const grades = React.useMemo(() => Array.from(new Set(groups.map((group) => Number(group.gradeLevel)).filter(Number.isFinite))).sort((a, b) => a - b), [groups]);
  const subjects = React.useMemo(() => {
    const map = new Map<string, string>();
    groups.forEach((group) => map.set(group.schoolSubjectId, group.schoolSubjectName));
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [groups]);

  const filteredGroups = React.useMemo(() => groups.filter((group) => {
    if (gradeFilter && String(group.gradeLevel) !== gradeFilter) return false;
    if (subjectFilter && group.schoolSubjectId !== subjectFilter) return false;
    if (teacherFilter && !group.teachers.some((teacher) => teacher.userId === teacherFilter)) return false;
    return true;
  }), [gradeFilter, groups, subjectFilter, teacherFilter]);

  const rows = React.useMemo(() => {
    const result = filteredGroups.flatMap((group) => {
      if (!group.teachers.length) return [{ group, teacher: null }];
      return group.teachers.map((teacher) => ({ group, teacher }));
    });
    const direction = sortDirection === 'asc' ? 1 : -1;
    return result.sort((left, right) => {
      const values: Record<SortKey, [string, string]> = {
        grade: [left.group.gradeLevel, right.group.gradeLevel],
        group: [left.group.name, right.group.name],
        subject: [left.group.schoolSubjectName, right.group.schoolSubjectName],
        teacher: [left.teacher?.name || '', right.teacher?.name || ''],
      };
      return values[sortKey][0].localeCompare(values[sortKey][1], undefined, { numeric: true }) * direction;
    });
  }, [filteredGroups, sortDirection, sortKey]);

  const allocationGroups = React.useMemo(() => groups.filter((group) => (
    (!allocationGrade || String(group.gradeLevel) === allocationGrade)
    && (!allocationSubjectId || group.schoolSubjectId === allocationSubjectId)
  )), [allocationGrade, allocationSubjectId, groups]);

  const allocationSubjects = React.useMemo(() => {
    const map = new Map<string, { id: string; name: string; academic: string | null }>();
    groups.filter((group) => !allocationGrade || String(group.gradeLevel) === allocationGrade).forEach((group) => {
      map.set(group.schoolSubjectId, { id: group.schoolSubjectId, name: group.schoolSubjectName, academic: group.academicSubjectName });
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [allocationGrade, groups]);

  const selectedGroup = groups.find((group) => group.id === allocationGroupId) || null;

  const allocate = async () => {
    if (!allocationGroupId || !allocationTeacherId) return;
    setSaving(true);
    try {
      await setSchoolSubjectGroupTeacher({
        schoolId: school.id,
        groupId: allocationGroupId,
        teacherUserId: allocationTeacherId,
        active: true,
        canCreate: true,
        canGrade: true,
      });
      addToast(`Teacher allocated to ${selectedGroup?.name || 'teaching group'}.`, 'success');
      setAllocationTeacherId('');
      setIsAllocationOpen(false);
      await load();
    } catch (error) {
      console.error('Failed to allocate teacher', error);
      addToast(friendlySchoolAdminError(error instanceof Error ? error.message : undefined, 'The teacher allocation could not be saved.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const removeAllocation = (group: SchoolSubjectGroup, teacher: { userId: string; name: string }) => {
    setConfirmReason('');
    setConfirmDialog({
      title: 'Remove teacher allocation?',
      description: `Remove ${teacher.name} from ${group.name} · ${group.schoolSubjectName}? Students, the teaching group and historical assignments remain unchanged.`,
      confirmLabel: 'Remove allocation',
      cancelLabel: 'Keep allocation',
      isDestructive: true,
      onConfirm: async () => {
        try {
          await setSchoolSubjectGroupTeacher({
            schoolId: school.id,
            groupId: group.id,
            teacherUserId: teacher.userId,
            active: false,
            canCreate: true,
            canGrade: true,
          });
          addToast('Teacher allocation removed.', 'success');
          await load();
        } catch (error) {
          addToast(friendlySchoolAdminError(error instanceof Error ? error.message : undefined, 'The teacher allocation could not be removed.'), 'error');
        }
      },
    });
  };

  const changeSort = (next: SortKey) => {
    if (sortKey === next) setSortDirection((current) => current === 'asc' ? 'desc' : 'asc');
    else { setSortKey(next); setSortDirection('asc'); }
  };
  const sortLabel = (label: string, key: SortKey) => `${label}${sortKey === key ? (sortDirection === 'asc' ? ' ↑' : ' ↓') : ''}`;

  const printRegister = () => {
    const body = rows.map(({ group, teacher }, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>Grade ${escapeSchoolDocumentHtml(group.gradeLevel)}</td>
        <td>${escapeSchoolDocumentHtml(group.name)}</td>
        <td>${escapeSchoolDocumentHtml(group.schoolSubjectName)}</td>
        <td>${escapeSchoolDocumentHtml(group.academicSubjectName || 'No academic map')}</td>
        <td>${escapeSchoolDocumentHtml(teacher?.name || 'Unallocated')}</td>
        <td>${group.studentCount}</td>
      </tr>`).join('');
    try {
      openSchoolDocumentPreview({
        meta: {
          documentId: createSchoolDocumentId('teaching-group-allocation'),
          templateVersion: 'teaching-group-allocation-v1',
          title: 'Teacher Allocation Register',
          subtitle: `${rows.length} teaching-group allocation row${rows.length === 1 ? '' : 's'}`,
          schoolName: school.name,
          schoolLogoUrl: school.logo_url,
          audience: 'internal',
          status: 'final',
          confidentiality: 'confidential',
          generatedAt: new Date().toISOString(),
          schoolId: school.id,
          visibilityScope: 'school_staff',
          sourceType: 'subject_group_teacher_allocations',
          sourceId: 'current',
        },
        bodyHtml: `<table><thead><tr><th>No.</th><th>Grade</th><th>Teaching group</th><th>School subject</th><th>Academic map</th><th>Teacher</th><th>Students</th></tr></thead><tbody>${body || '<tr><td colspan="7">No teaching groups match the current filters.</td></tr>'}</tbody></table>`,
        orientation: 'landscape',
        inkSaver: true,
        fileName: schoolDocumentFileName(school.name, 'Teacher_Allocation_Register'),
      });
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Unable to open the allocation register.', 'error');
    }
  };

  return <div className="space-y-6">
    <section className="admin-section-heading"><div><p className="school-admin-eyebrow">Administration</p><h2>Teacher Allocation</h2><p>Allocate teachers to the exact teaching groups they are responsible for. Registration classes and elective groups stay independent.</p></div></section>

    <InvitesTab showRotate={false} />

    <section className="admin-table-card" aria-labelledby="current-allocations-title">
      <div className="admin-card-heading admin-assignment-heading">
        <div><h3 id="current-allocations-title">Teaching-group allocations</h3><p>{groups.length} active teaching group{groups.length === 1 ? '' : 's'} · {rows.filter((row) => row.teacher).length} teacher allocation{rows.filter((row) => row.teacher).length === 1 ? '' : 's'}.</p></div>
        <div className="admin-assignment-actions">
          <button type="button" className="admin-button-secondary admin-print-button" onClick={printRegister} disabled={!rows.length}>Print register</button>
          <button type="button" className="admin-button-primary" onClick={() => availableTeachers.length ? setIsAllocationOpen(true) : setActiveTab('members')}>{availableTeachers.length ? 'Allocate teacher' : 'Add teaching staff'}</button>
        </div>
      </div>

      <div className="admin-assignment-filters admin-assignment-filters-bar">
        <label><span>Grade level</span><select value={gradeFilter} onChange={(event) => { setGradeFilter(event.target.value); setSubjectFilter(''); }}><option value="">All grade levels</option>{grades.map((grade) => <option key={grade} value={grade}>Grade {grade}</option>)}</select></label>
        <label><span>School subject</span><select value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)}><option value="">All subjects</option>{subjects.filter((subject) => !gradeFilter || groups.some((group) => group.schoolSubjectId === subject.id && String(group.gradeLevel) === gradeFilter)).map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label>
        <label><span>Teacher</span><select value={teacherFilter} onChange={(event) => setTeacherFilter(event.target.value)}><option value="">All teachers</option>{availableTeachers.map((teacher: any) => <option key={teacher.user_id} value={teacher.user_id}>{formatAllocatableTeacherLabel(teacher)}</option>)}</select></label>
      </div>

      {loading ? <div className="admin-empty-state"><h3>Loading teaching groups…</h3></div> : rows.length ? <div className="admin-table-scroll"><table>
        <thead><tr>
          <th><button className="admin-sort-button" onClick={() => changeSort('grade')}>{sortLabel('Grade', 'grade')}</button></th>
          <th><button className="admin-sort-button" onClick={() => changeSort('group')}>{sortLabel('Teaching group', 'group')}</button></th>
          <th><button className="admin-sort-button" onClick={() => changeSort('subject')}>{sortLabel('School subject', 'subject')}</button></th>
          <th>Academic map</th>
          <th>Students</th>
          <th><button className="admin-sort-button" onClick={() => changeSort('teacher')}>{sortLabel('Teacher', 'teacher')}</button></th>
          <th className="admin-actions-column">Actions</th>
        </tr></thead>
        <tbody>{rows.map(({ group, teacher }) => <tr key={`${group.id}:${teacher?.userId || 'unallocated'}`}>
          <td>Grade {group.gradeLevel}</td>
          <td><strong>{group.name}</strong><span className="admin-table-subline">{group.groupType === 'class' ? 'Registration-class group' : group.groupType === 'whole_grade' ? 'Whole-grade group' : 'Custom group'}</span></td>
          <td><strong>{group.schoolSubjectName}</strong></td>
          <td>{group.academicSubjectName ? <><strong>{group.academicSubjectName}</strong>{group.academicSubjectName !== group.schoolSubjectName ? <span className="admin-table-subline">Shared academic resources</span> : null}</> : <span className="text-amber-700">No academic map</span>}</td>
          <td>{group.studentCount}</td>
          <td>{teacher ? <strong>{teacher.name}</strong> : <span className="text-amber-700">Not allocated</span>}</td>
          <td className="admin-row-actions">{teacher ? <button className="admin-button-danger admin-button-small" onClick={() => removeAllocation(group, teacher)}>Remove</button> : <button className="admin-button-secondary admin-button-small" onClick={() => { setAllocationGrade(String(group.gradeLevel)); setAllocationSubjectId(group.schoolSubjectId); setAllocationGroupId(group.id); setIsAllocationOpen(true); }}>Allocate</button>}</td>
        </tr>)}</tbody>
      </table></div> : (
        <div className="admin-empty-state">
          <h3>{groups.length ? 'No teaching groups match these filters' : 'No teaching groups yet'}</h3>
          <p>{groups.length ? 'Change or clear the filters.' : 'Open Curriculum & Subjects → School Subjects, edit an offering, and create its teaching groups first.'}</p>
          {!groups.length ? <button type="button" className="admin-button-primary" onClick={() => setActiveTab('subjects')}>Open School Subjects</button> : null}
        </div>
      )}
    </section>

    {isAllocationOpen ? <section id="allocate-teacher-panel" className="admin-form-card" aria-labelledby="allocate-teacher-title">
      <div className="admin-card-heading"><div><h3 id="allocate-teacher-title">Allocate teacher to teaching group</h3><p>Choose the exact school subject and group. Academic mapping only controls curriculum and question resources.</p></div><button type="button" className="admin-button-ghost admin-button-small" onClick={() => setIsAllocationOpen(false)}>Close</button></div>
      <div className="admin-form-grid admin-form-grid-four">
        <label className="admin-field"><span>Grade level <i>Required</i></span><select value={allocationGrade} onChange={(event) => { setAllocationGrade(event.target.value); setAllocationSubjectId(''); setAllocationGroupId(''); }}><option value="">Select grade level</option>{grades.map((grade) => <option key={grade} value={grade}>Grade {grade}</option>)}</select></label>
        <label className="admin-field"><span>School subject <i>Required</i></span><select value={allocationSubjectId} disabled={!allocationGrade} onChange={(event) => { setAllocationSubjectId(event.target.value); setAllocationGroupId(''); }}><option value="">{allocationGrade ? 'Select subject' : 'Select grade first'}</option>{allocationSubjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}{subject.academic && subject.academic !== subject.name ? ` — mapped to ${subject.academic}` : ''}</option>)}</select></label>
        <label className="admin-field"><span>Teaching group <i>Required</i></span><select value={allocationGroupId} disabled={!allocationSubjectId} onChange={(event) => setAllocationGroupId(event.target.value)}><option value="">{allocationSubjectId ? 'Select teaching group' : 'Select subject first'}</option>{allocationGroups.map((group) => <option key={group.id} value={group.id}>{group.name} · {group.studentCount} student{group.studentCount === 1 ? '' : 's'}</option>)}</select></label>
        <label className="admin-field"><span>Teacher <i>Required</i></span><select value={allocationTeacherId} onChange={(event) => setAllocationTeacherId(event.target.value)}><option value="">Select teacher</option>{availableTeachers.filter((teacher: any) => !selectedGroup?.teachers.some((allocated) => allocated.userId === teacher.user_id)).map((teacher: any) => <option key={teacher.user_id} value={teacher.user_id}>{formatAllocatableTeacherLabel(teacher)}</option>)}</select></label>
      </div>
      {allocationSubjectId && !allocationGroups.length ? <div className="admin-inline-warning" role="status"><strong>No teaching groups for this subject</strong><span>Create the delivery groups in School Subjects before allocating teachers.</span></div> : null}
      {!availableTeachers.length ? <div className="admin-inline-warning" role="status"><strong>No teaching staff available</strong><span>Register teaching staff in Staff &amp; Students first.</span></div> : null}
      <div className="admin-form-actions"><button className="admin-button-primary" onClick={() => void allocate()} disabled={saving || !allocationGroupId || !allocationTeacherId}>{saving ? 'Allocating…' : 'Allocate teacher'}</button></div>
    </section> : null}
  </div>;
};

export default TeachersTab;
