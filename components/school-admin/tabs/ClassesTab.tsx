import React from 'react';
import { useSchoolAdmin } from '../SchoolAdminContext';

const ClassesTab: React.FC = () => {
  const {
    classForm, classSaving, classes, handleEditClass, handleSaveClass, setClassForm,
    studentAssignments, students, teacherAssignments, teachers,
  } = useSchoolAdmin();
  const academicYears = React.useMemo(() => Array.from(new Set([
    ...Array.from({ length: 13 }, (_, index) => index + 1),
    ...classes.map((schoolClass: any) => Number(schoolClass.grade_level)).filter(Number.isFinite),
  ])).sort((a, b) => a - b), [classes]);
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

  return (
    <div className="space-y-6">
      <section className="admin-form-card">
        <div className="admin-card-heading"><div><h3>{classForm.id ? 'Edit class' : 'Create class'}</h3><p>Use a unique code and place the class in its correct grade.</p></div></div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-6">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Class Code</label>
            <input
              type="text"
              value={classForm.class_code}
              onChange={(e) => setClassForm((prev) => ({ ...prev, class_code: e.target.value }))}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
              placeholder="e.g. 9A"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-400 mb-1">Class Name</label>
            <input
              type="text"
              value={classForm.class_name}
              onChange={(e) => setClassForm((prev) => ({ ...prev, class_name: e.target.value }))}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
              placeholder="e.g. Grade 9 Blue"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Academic year (grade)</label>
            <select
              value={classForm.grade_level}
              onChange={(e) => setClassForm((prev) => ({ ...prev, grade_level: e.target.value }))}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
            >
              <option value="">Select academic year</option>
              {academicYears.map((grade) => <option key={grade} value={grade}>Grade {grade}</option>)}
            </select>
          </div>
        </div>
        <div className="flex items-center gap-4 px-6 pb-6">
          <button
            onClick={handleSaveClass}
            disabled={classSaving}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 rounded-lg transition-colors font-medium"
          >
            {classSaving ? 'Saving...' : classForm.id ? 'Update Class' : 'Create Class'}
          </button>
          {classForm.id && (
            <button
              onClick={() => setClassForm({ id: '', class_code: '', class_name: '', grade_level: '', is_active: true })}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors text-sm"
            >
              Cancel Edit
            </button>
          )}
        </div>
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
                  <td><button type="button" onClick={() => handleEditClass(row)} className="text-cyan-400 hover:text-cyan-300 text-sm" aria-label={`Edit ${row.class_code}`}>Edit</button></td>
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
