import React from 'react';
import { fetchSchoolAcademicSetup } from '../../../services/schoolAcademicSetupService';
import { useSchoolAdmin } from '../SchoolAdminContext';

const ClassesTab: React.FC = () => {
  const {
    classForm, classSaving, classes, handleEditClass, handleSaveClass, setClassForm,
    studentAssignments, students, teacherAssignments, teachers, school, setActiveTab,
  } = useSchoolAdmin();
  const [configuredGrades, setConfiguredGrades] = React.useState<number[]>([]);
  const [wizardStep, setWizardStep] = React.useState<1 | 2 | 3>(1);
  const wasSaving = React.useRef(false);

  React.useEffect(() => {
    let active = true;
    void fetchSchoolAcademicSetup(school.id).then((setup) => {
      if (!active) return;
      const currentYear = setup.years.find((year) => year.status === 'current') || setup.years[0];
      const grades = setup.offerings
        .filter((offering) => !currentYear || offering.academicYearId === currentYear.id)
        .map((offering) => Number(offering.gradeLevel))
        .filter(Number.isFinite);
      setConfiguredGrades(Array.from(new Set(grades)).sort((a, b) => a - b));
    }).catch(() => { if (active) setConfiguredGrades([]); });
    return () => { active = false; };
  }, [school.id]);

  React.useEffect(() => {
    if (wasSaving.current && !classSaving && !classForm.id && !classForm.class_code) setWizardStep(1);
    wasSaving.current = classSaving;
  }, [classForm.class_code, classForm.id, classSaving]);

  const academicYears = React.useMemo(() => Array.from(new Set([
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
        teacherCount: new Set(assignments.map((assignment: any) => assignment.teacher_user_id)).size,
        subjects: Array.from(new Set(assignments.map((assignment: any) => String(assignment.subject || '').trim()).filter(Boolean))).sort(),
      };
    });

  const selectGrade = (gradeLevel: string) => {
    const sameGradeCount = classes.filter((item: any) => String(item.grade_level) === gradeLevel && item.is_active !== false).length;
    const suffix = String.fromCharCode(65 + Math.min(sameGradeCount, 25));
    setClassForm((previous: any) => ({
      ...previous,
      grade_level: gradeLevel,
      class_code: previous.class_code || `${gradeLevel}${suffix}`,
      class_name: previous.class_name || `Grade ${gradeLevel} ${suffix}`,
    }));
  };

  const startEdit = (row: any) => {
    handleEditClass(row);
    setWizardStep(2);
  };

  return (
    <div className="space-y-6">
      <section className="admin-form-card class-creation-wizard">
        <div className="admin-card-heading"><div><h3>{classForm.id ? 'Edit class' : 'Create another class'}</h3><p>Grades come from Curriculum &amp; Subjects. Saving a grade plan already creates its first default class; use this wizard for extra sections such as 7A and 7B.</p></div></div>
        <ol className="class-wizard-steps" aria-label="Class creation steps">
          {['Choose grade', 'Class details', 'Review'].map((label, index) => <li key={label} className={wizardStep === index + 1 ? 'is-current' : wizardStep > index + 1 ? 'is-complete' : ''}><span>{index + 1}</span>{label}</li>)}
        </ol>
        {!academicYears.length ? <div className="admin-inline-warning"><strong>No configured grades</strong><span>Save a grade and its subjects before creating classes.</span><button type="button" className="admin-button-ghost admin-button-small" onClick={() => setActiveTab('subjects')}>Open Curriculum &amp; Subjects</button></div> : null}
        {wizardStep === 1 && !classForm.id ? <div className="class-wizard-panel"><label className="admin-field admin-field-wide"><span>Academic year (grade)</span><select value={classForm.grade_level} onChange={(event) => selectGrade(event.target.value)}><option value="">Select academic year</option>{academicYears.map((grade) => <option key={grade} value={grade}>Grade {grade}</option>)}</select><small>Only grades already configured in Curriculum &amp; Subjects are offered.</small></label><div className="admin-form-actions"><button type="button" className="admin-button-primary" disabled={!classForm.grade_level} onClick={() => setWizardStep(2)}>Continue to class details</button></div></div> : null}
        {(wizardStep === 2 || classForm.id) ? <div className="class-wizard-panel"><div className="admin-form-grid admin-form-grid-three"><label className="admin-field"><span>Academic year (grade)</span><select value={classForm.grade_level} onChange={(event) => selectGrade(event.target.value)}><option value="">Select academic year</option>{academicYears.map((grade) => <option key={grade} value={grade}>Grade {grade}</option>)}</select></label><label className="admin-field"><span>Class code <i>Required</i></span><input type="text" value={classForm.class_code} onChange={(event) => setClassForm((previous: any) => ({ ...previous, class_code: event.target.value }))} placeholder="For example, 9A" /></label><label className="admin-field"><span>Class name <i>Required</i></span><input type="text" value={classForm.class_name} onChange={(event) => setClassForm((previous: any) => ({ ...previous, class_name: event.target.value }))} placeholder="For example, Grade 9 A" /></label></div><div className="admin-form-actions"><button type="button" className="admin-button-ghost" onClick={() => classForm.id ? setClassForm({ id: '', class_code: '', class_name: '', grade_level: '', is_active: true }) : setWizardStep(1)}>Cancel</button><button type="button" className="admin-button-primary" disabled={!classForm.grade_level || !classForm.class_code.trim() || !classForm.class_name.trim()} onClick={() => classForm.id ? void handleSaveClass() : setWizardStep(3)}>{classForm.id ? 'Update Class' : 'Review class'}</button></div></div> : null}
        {wizardStep === 3 && !classForm.id ? <div className="class-wizard-panel"><div className="class-review-card"><span>Ready to create</span><strong>{classForm.class_code} — {classForm.class_name}</strong><small>Grade {classForm.grade_level} · active class</small></div><div className="admin-form-actions"><button type="button" className="admin-button-ghost" onClick={() => setWizardStep(2)}>Back</button><button type="button" className="admin-button-primary" disabled={classSaving} onClick={() => void handleSaveClass()}>{classSaving ? 'Creating class…' : 'Create Class'}</button></div></div> : null}
      </section>

      <section className="admin-table-card school-wide-angle" aria-labelledby="school-structure-title">
        <div className="admin-card-heading"><div><h3 id="school-structure-title">Grades, classes and teaching coverage</h3><p>Each grade is grouped with its classes, student population, assigned teachers and taught subjects.</p></div></div>
        {grades.length ? <div className="school-grade-groups">
          {grades.map((grade: any) => {
            const rows = classRows.filter((row: any) => (row.grade_level ?? 'Unassigned') === grade);
            const gradeStudents = rows.reduce((total: number, row: any) => total + row.studentCount, 0);
            const gradeTeachers = new Set(activeAssignments.filter((assignment: any) => rows.some((row: any) => row.id === assignment.class_id)).map((assignment: any) => assignment.teacher_user_id)).size;
            return <section key={String(grade)} className="school-grade-group">
              <header><div><p className="school-admin-eyebrow">{grade === 'Unassigned' ? 'Grade not set' : `Grade ${grade}`}</p><h4>{rows.length} {rows.length === 1 ? 'class' : 'classes'}</h4></div><div className="school-grade-totals"><span><strong>{gradeStudents}</strong> students</span><span><strong>{gradeTeachers}</strong> teachers</span></div></header>
              <div className="admin-table-scroll" role="region" aria-label={`${grade === 'Unassigned' ? 'Unassigned grade' : `Grade ${grade}`} classes table`} tabIndex={0}><table className="min-w-[760px] w-full">
                <thead><tr><th>Class</th><th>Students</th><th>Teachers</th><th>Subjects</th><th>Coverage</th><th>Action</th></tr></thead>
                <tbody>{rows.map((row: any) => <tr key={row.id}>
                  <td><strong>{row.class_code}</strong><span className="admin-table-subline">{row.class_name}</span></td>
                  <td>{row.studentCount}</td><td>{row.teacherCount}</td>
                  <td>{row.subjects.length ? <div className="admin-chip-list">{row.subjects.map((subject: string) => <span key={subject}>{subject}</span>)}</div> : <span className="admin-muted">No subjects assigned</span>}</td>
                  <td><span className={`admin-coverage-badge ${row.studentCount && row.teacherCount && row.subjects.length ? 'is-covered' : 'needs-attention'}`}>{row.studentCount && row.teacherCount && row.subjects.length ? 'Covered' : 'Needs attention'}</span></td>
                  <td><button type="button" onClick={() => startEdit(row)} className="text-cyan-400 hover:text-cyan-300 text-sm" aria-label={`Edit ${row.class_code}`}>Edit</button></td>
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
