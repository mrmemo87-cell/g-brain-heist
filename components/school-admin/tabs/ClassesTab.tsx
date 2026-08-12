import React from 'react';
import { fetchSchoolAcademicSetup, type SchoolAcademicSetup } from '../../../services/schoolAcademicSetupService';
import * as SchoolAdminService from '../../../services/schoolAdminService';
import { friendlySchoolAdminError } from '../../../src/lib/schoolAdminPresentation';
import { useSchoolAdmin } from '../SchoolAdminContext';

const ClassesTab: React.FC = () => {
  const {
    addToast, classForm, classSaving, classes, handleEditClass, handleSaveClass, loadAdminTools,
    setClassForm, setConfirmDialog, setConfirmReason, studentAssignments, students,
    teacherAssignments, teachers, school, setActiveTab,
  } = useSchoolAdmin();
  const [academicSetup, setAcademicSetup] = React.useState<SchoolAcademicSetup | null>(null);
  const [wizardStep, setWizardStep] = React.useState<1 | 2 | 3>(1);
  const [showWizard, setShowWizard] = React.useState(false);
  const wasSaving = React.useRef(false);
  const wizardRef = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    let active = true;
    void fetchSchoolAcademicSetup(school.id).then((setup) => {
      if (!active) return;
      setAcademicSetup(setup);
    }).catch(() => { if (active) setAcademicSetup(null); });
    return () => { active = false; };
  }, [school.id]);

  React.useEffect(() => {
    if (wasSaving.current && !classSaving && !classForm.id && !classForm.class_code) { setWizardStep(1); setShowWizard(false); }
    wasSaving.current = classSaving;
  }, [classForm.class_code, classForm.id, classSaving]);

  const currentYear = academicSetup?.years.find((year) => year.status === 'current') || academicSetup?.years[0];
  const currentOfferings = React.useMemo(() => (academicSetup?.offerings || []).filter((offering) => !currentYear || offering.academicYearId === currentYear.id), [academicSetup?.offerings, currentYear]);
  const configuredGrades = React.useMemo(() => Array.from(new Set(currentOfferings.map((offering) => Number(offering.gradeLevel)).filter(Number.isFinite))).sort((a, b) => a - b), [currentOfferings]);
  const gradeLevels = React.useMemo(() => Array.from(new Set([
    ...configuredGrades,
    ...classes.map((schoolClass: any) => Number(schoolClass.grade_level)).filter(Number.isFinite),
  ])).sort((a, b) => a - b), [classes, configuredGrades]);
  const activeClasses = classes.filter((schoolClass: any) => schoolClass.is_active !== false);
  const activeClassIds = new Set(activeClasses.map((schoolClass: any) => schoolClass.id));
  const teachingStaffIds = new Set(teachers.map((teacher: any) => teacher.user_id));
  const activeAssignments = teacherAssignments.filter((assignment: any) => assignment.active !== false && activeClassIds.has(assignment.class_id) && teachingStaffIds.has(assignment.teacher_user_id));
  const grades = Array.from(new Set(activeClasses.map((schoolClass: any) => schoolClass.grade_level ?? 'Unassigned')))
    .sort((a: any, b: any) => {
      if (a === 'Unassigned') return 1;
      if (b === 'Unassigned') return -1;
      return Number(a) - Number(b);
    });
  const classRows = activeClasses
    .slice()
    .sort((a: any, b: any) => String(a.class_code).localeCompare(String(b.class_code), undefined, { numeric: true }))
    .map((schoolClass: any) => {
      const assignments = activeAssignments.filter((assignment: any) => assignment.class_id === schoolClass.id);
      const classStudents = students.filter((student: any) => studentAssignments[student.user_id] === schoolClass.id);
      return {
        ...schoolClass,
        studentCount: classStudents.length,
        assignmentCount: assignments.length,
        teacherCount: new Set(assignments.map((assignment: any) => assignment.teacher_user_id)).size,
        subjects: Array.from(new Set(currentOfferings.filter((offering) => Number(offering.gradeLevel) === Number(schoolClass.grade_level)).map((offering) => offering.subjectName))).sort(),
      };
    });

  const suggestClassDetails = React.useCallback((gradeLevel: string) => {
    const sameGrade = classes.filter((item: any) => String(item.grade_level) === gradeLevel && item.is_active !== false);
    const usedCodes = new Set(sameGrade.map((item: any) => String(item.class_code || '').toUpperCase().replace(/[^A-Z0-9]/g, '')));
    const base = `G${gradeLevel}`;
    if (!sameGrade.length && !usedCodes.has(base.toUpperCase())) {
      return { classCode: base, className: `Grade ${gradeLevel}` };
    }
    for (let index = 1; index < 26; index += 1) {
      const section = String.fromCharCode(65 + index);
      if (!usedCodes.has(`${base}${section}`.toUpperCase())) {
        return { classCode: `${base}-${section}`, className: `Grade ${gradeLevel} ${section}` };
      }
    }
    const sectionNumber = sameGrade.length + 1;
    return { classCode: `${base}-${sectionNumber}`, className: `Grade ${gradeLevel} Section ${sectionNumber}` };
  }, [classes]);

  const resetWizard = React.useCallback(() => {
    setClassForm({ id: '', class_code: '', class_name: '', grade_level: '', is_active: true });
    setWizardStep(1);
    setShowWizard(false);
  }, [setClassForm]);

  const focusWizard = () => {
    window.requestAnimationFrame(() => wizardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const selectGrade = (gradeLevel: string) => {
    const suggestion = gradeLevel ? suggestClassDetails(gradeLevel) : { classCode: '', className: '' };
    setClassForm((previous: any) => ({
      ...previous,
      grade_level: gradeLevel,
      class_code: previous.id ? previous.class_code : suggestion.classCode,
      class_name: previous.id ? previous.class_name : suggestion.className,
    }));
  };

  const startAddForGrade = (gradeLevel: string) => {
    const suggestion = suggestClassDetails(gradeLevel);
    setClassForm({
      id: '',
      grade_level: gradeLevel,
      class_code: suggestion.classCode,
      class_name: suggestion.className,
      is_active: true,
    });
    setWizardStep(2);
    setShowWizard(true);
    focusWizard();
  };

  const startEdit = (row: any) => {
    handleEditClass(row);
    setWizardStep(2);
    setShowWizard(true);
    focusWizard();
  };

  const requestClassRemoval = (row: any, gradeClassCount: number) => {
    if (row.studentCount > 0 || row.assignmentCount > 0) {
      const studentPart = `${row.studentCount} ${row.studentCount === 1 ? 'student' : 'students'}`;
      const teacherPart = `${row.assignmentCount} active ${row.assignmentCount === 1 ? 'teacher assignment' : 'teacher assignments'}`;
      addToast(`Move ${studentPart} and remove ${teacherPart} before removing ${row.class_code}.`, 'warning');
      return;
    }
    if (row.grade_level != null && gradeClassCount === 1) {
      addToast(`Grade ${row.grade_level} must keep one active class. Add a replacement class first.`, 'warning');
      return;
    }

    setConfirmReason('');
    setConfirmDialog({
      title: `Remove ${row.class_code}?`,
      description: `${row.class_name} will be removed from current class lists. Historical reports and school records will remain intact.`,
      confirmLabel: 'Remove class',
      cancelLabel: 'Keep class',
      isDestructive: true,
      onConfirm: async () => {
        const result = await SchoolAdminService.archiveSchoolClass(school.id, row.id);
        if (!result.success) {
          addToast(friendlySchoolAdminError(result.error, 'The class could not be removed. Refresh the page and try again.'), 'error');
          return;
        }
        addToast(`${row.class_code} removed from current classes`, 'success');
        resetWizard();
        await loadAdminTools(school.id);
      },
    });
  };

  return (
    <div className="space-y-6">
      <section ref={wizardRef} className="admin-form-card class-creation-wizard">
        <div className="admin-card-heading"><div><h3>{classForm.id ? 'Edit class' : classForm.grade_level ? `Add class to Grade ${classForm.grade_level}` : 'Add another class'}</h3><p>Saving a grade plan creates its first class automatically. Add another class only when a grade level needs sections such as 7A and 7B.</p></div><button type="button" className="admin-button-ghost admin-button-small" aria-expanded={showWizard} onClick={() => showWizard ? resetWizard() : setShowWizard(true)}>{showWizard ? 'Close' : 'Add class'}</button></div>
        {showWizard ? <>
        <ol className="class-wizard-steps" aria-label="Class creation steps">
          {['Choose grade', 'Class details', 'Review'].map((label, index) => <li key={label} className={wizardStep === index + 1 ? 'is-current' : wizardStep > index + 1 ? 'is-complete' : ''}><span>{index + 1}</span>{label}</li>)}
        </ol>
        {!gradeLevels.length ? <div className="admin-inline-warning"><strong>No configured grade levels</strong><span>Save a grade level and its subjects before creating classes.</span><button type="button" className="admin-button-ghost admin-button-small" onClick={() => setActiveTab('subjects')}>Open Curriculum &amp; Subjects</button></div> : null}
        {wizardStep === 1 && !classForm.id ? <div className="class-wizard-panel"><label className="admin-field admin-field-wide"><span>Grade level</span><select value={classForm.grade_level} onChange={(event) => selectGrade(event.target.value)}><option value="">Select grade level</option>{gradeLevels.map((grade) => <option key={grade} value={grade}>Grade {grade}</option>)}</select><small>Only grade levels configured in Curriculum &amp; Subjects are shown.</small></label><div className="admin-form-actions"><button type="button" className="admin-button-primary" disabled={!classForm.grade_level} onClick={() => setWizardStep(2)}>Continue to class details</button></div></div> : null}
        {(wizardStep === 2 || classForm.id) ? <div className="class-wizard-panel"><div className="admin-form-grid admin-form-grid-three"><label className="admin-field"><span>Grade level</span><select value={classForm.grade_level} onChange={(event) => selectGrade(event.target.value)}><option value="">Select grade level</option>{gradeLevels.map((grade) => <option key={grade} value={grade}>Grade {grade}</option>)}</select></label><label className="admin-field"><span>Class code <i>Required</i></span><input type="text" value={classForm.class_code} onChange={(event) => setClassForm((previous: any) => ({ ...previous, class_code: event.target.value }))} placeholder="For example, G9-B" /></label><label className="admin-field"><span>Class name <i>Required</i></span><input type="text" value={classForm.class_name} onChange={(event) => setClassForm((previous: any) => ({ ...previous, class_name: event.target.value }))} placeholder="For example, Grade 9 B" /></label></div><div className="admin-form-actions"><button type="button" className="admin-button-ghost" onClick={resetWizard}>Cancel</button><button type="button" className="admin-button-primary" disabled={!classForm.grade_level || !classForm.class_code.trim() || !classForm.class_name.trim()} onClick={() => classForm.id ? void handleSaveClass() : setWizardStep(3)}>{classForm.id ? 'Update class' : 'Review class'}</button></div></div> : null}
        {wizardStep === 3 && !classForm.id ? <div className="class-wizard-panel"><div className="class-review-card"><span>Ready to create</span><strong>{classForm.class_code} — {classForm.class_name}</strong><small>Grade {classForm.grade_level} · active class</small></div><div className="admin-form-actions"><button type="button" className="admin-button-ghost" onClick={() => setWizardStep(2)}>Back</button><button type="button" className="admin-button-primary" disabled={classSaving} onClick={() => void handleSaveClass()}>{classSaving ? 'Creating class…' : 'Create class'}</button></div></div> : null}
        </> : null}
      </section>

      <section className="admin-table-card school-wide-angle" aria-labelledby="school-structure-title">
        <div className="admin-card-heading"><div><h3 id="school-structure-title">Grades, classes and teaching coverage</h3><p>Each grade is grouped with its classes, student population, assigned teachers and taught subjects.</p></div></div>
        {grades.length ? <div className="school-grade-groups">
          {grades.map((grade: any) => {
            const rows = classRows.filter((row: any) => (row.grade_level ?? 'Unassigned') === grade);
            const gradeStudents = rows.reduce((total: number, row: any) => total + row.studentCount, 0);
            const gradeTeachers = new Set(activeAssignments.filter((assignment: any) => rows.some((row: any) => row.id === assignment.class_id)).map((assignment: any) => assignment.teacher_user_id)).size;
            return <section key={String(grade)} className="school-grade-group">
              <header><div><h4>{grade === 'Unassigned' ? 'Grade level not set' : `Grade ${grade}`}</h4><p>{rows.length} {rows.length === 1 ? 'class' : 'classes'}</p></div><div className="school-grade-header-actions"><div className="school-grade-totals"><span><strong>{gradeStudents}</strong> students</span><span><strong>{gradeTeachers}</strong> teachers</span></div>{grade !== 'Unassigned' ? <button type="button" className="admin-button-primary admin-button-small" onClick={() => startAddForGrade(String(grade))} aria-label={`Add another class to Grade ${grade}`}>Add class</button> : null}</div></header>
              <div className="admin-table-scroll" role="region" aria-label={`${grade === 'Unassigned' ? 'Unassigned grade' : `Grade ${grade}`} classes table`} tabIndex={0}><table className="min-w-[760px] w-full">
                <thead><tr><th>Class</th><th>Students</th><th>Teachers</th><th>Subjects</th><th>Coverage</th><th>Actions</th></tr></thead>
                <tbody>{rows.map((row: any) => <tr key={row.id}>
                  <td><strong>{row.class_code}</strong><span className="admin-table-subline">{row.class_name}</span></td>
                  <td>{row.studentCount}</td><td>{row.teacherCount}</td>
                  <td>{row.subjects.length ? <div className="admin-chip-list">{row.subjects.map((subject: string) => <span key={subject}>{subject}</span>)}</div> : <span className="admin-muted">No grade subjects selected</span>}</td>
                  <td><span className={`admin-coverage-badge ${row.studentCount && row.teacherCount && row.subjects.length ? 'is-covered' : row.studentCount ? 'needs-attention' : 'is-ready'}`}>{row.studentCount && row.teacherCount && row.subjects.length ? 'Covered' : row.studentCount ? 'Needs staffing' : 'Ready for enrolment'}</span></td>
                  <td className="admin-row-actions"><button type="button" onClick={() => startEdit(row)} className="admin-button-ghost admin-button-small" aria-label={`Edit ${row.class_code}`}>Edit</button><button type="button" onClick={() => requestClassRemoval(row, rows.length)} className="admin-button-danger admin-button-small" aria-label={`Remove ${row.class_code}`}>Remove</button></td>
                </tr>)}</tbody>
              </table></div>
            </section>;
          })}
        </div> : <div className="admin-empty-state"><h3>No active classes yet</h3><p>Create classes to start building the whole-school overview.</p></div>}
      </section>
    </div>
  );
};

export default ClassesTab;
