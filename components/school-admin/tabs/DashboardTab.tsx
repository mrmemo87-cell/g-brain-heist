import React from 'react';
import { useSchoolAdmin } from '../SchoolAdminContext';

const DashboardTab: React.FC = () => {
  const context = useSchoolAdmin();
  const classes = Array.isArray(context.classes) ? context.classes : [];
  const subjects = Array.isArray(context.dbSubjects) ? context.dbSubjects : [];
  const students = Array.isArray(context.students) ? context.students : [];
  const teachers = Array.isArray(context.teachers) ? context.teachers : [];
  const schoolAdmins = Array.isArray(context.schoolAdmins) ? context.schoolAdmins : [];
  const teacherAssignments = Array.isArray(context.teacherAssignments) ? context.teacherAssignments : [];
  const studentAssignments = context.studentAssignments ?? {};
  const { setActiveTab, school } = context;

  const activeClasses = classes.filter((item: any) => item.is_active !== false);
  const activeClassIds = new Set(activeClasses.map((item: any) => item.id));
  const teachingStaffIds = new Set(teachers.map((item: any) => item.user_id));
  const activeAssignments = teacherAssignments.filter((item: any) => item.active !== false && activeClassIds.has(item.class_id) && teachingStaffIds.has(item.teacher_user_id));
  const assignedTeacherIds = new Set(activeAssignments.map((item: any) => item.teacher_user_id));
  const coveredClassIds = new Set(activeAssignments.map((item: any) => item.class_id));
  const assignedSubjectNames = new Set(activeAssignments.map((item: any) => String(item.subject || '').trim().toLowerCase()).filter(Boolean));
  const placedStudents = students.filter((student: any) => activeClassIds.has(studentAssignments[student.user_id]));

  const metrics = [
    { label: 'Classes', value: activeClasses.length, note: `${classes.length} total records`, tab: 'classes' },
    { label: 'Subjects', value: subjects.length, note: `${assignedSubjectNames.size} currently taught`, tab: 'subjects' },
    { label: 'Students', value: students.length, note: `${placedStudents.length} placed in classes`, tab: 'members' },
    { label: 'Teaching staff', value: teachers.length, note: `${assignedTeacherIds.size} currently assigned`, tab: 'teachers' },
    { label: 'Admins', value: schoolAdmins.length, note: `${schoolAdmins.filter((member: any) => member.is_owner).length} protected owner`, tab: 'members' },
  ];

  const grades = Array.from(new Set(activeClasses.map((item: any) => item.grade_level ?? 'Unassigned')))
    .sort((a: any, b: any) => {
      if (a === 'Unassigned') return 1;
      if (b === 'Unassigned') return -1;
      return Number(a) - Number(b);
    });

  const classRows = activeClasses
    .slice()
    .sort((a: any, b: any) => String(a.class_code).localeCompare(String(b.class_code), undefined, { numeric: true }))
    .map((schoolClass: any) => {
      const assignments = activeAssignments.filter((item: any) => item.class_id === schoolClass.id);
      const classStudents = students.filter((student: any) => studentAssignments[student.user_id] === schoolClass.id);
      return {
        ...schoolClass,
        studentCount: classStudents.length,
        teacherCount: new Set(assignments.map((item: any) => item.teacher_user_id)).size,
        subjects: Array.from(new Set(assignments.map((item: any) => String(item.subject || '').trim()).filter(Boolean))).sort(),
      };
    });

  const unassignedStudents = students.length - placedStudents.length;
  const unassignedTeachers = teachers.filter((teacher: any) => !assignedTeacherIds.has(teacher.user_id)).length;
  const uncoveredClasses = activeClasses.length - coveredClassIds.size;
  const unusedSubjects = subjects.filter((subject: any) => !assignedSubjectNames.has(String(subject.name || '').trim().toLowerCase())).length;

  return <div className="space-y-6">
    <section className="admin-hero">
      <div><p className="school-admin-eyebrow">School overview</p><h2>{school?.name}</h2><p>A whole-school view of classes, curriculum, staffing, enrolment and coverage.</p></div>
      <span className="admin-live-pill"><i /> Records synced</span>
    </section>

    <section aria-label="Whole-school totals" className="admin-metric-grid admin-metric-grid-five">
      {metrics.map((metric) => <button key={metric.label} type="button" className="admin-metric" onClick={() => setActiveTab(metric.tab)}>
        <div className="admin-metric-value">{metric.value}</div><div><strong>{metric.label}</strong><span>{metric.note}</span></div>
      </button>)}
    </section>

    <section className="admin-insight-grid admin-insight-grid-five" aria-label="Administration priorities">
      <article><span>Student placement</span><strong>{placedStudents.length}/{students.length}</strong><small>{unassignedStudents ? `${unassignedStudents} still need a class` : 'Every student is placed'}</small></article>
      <article><span>Class coverage</span><strong>{coveredClassIds.size}/{activeClasses.length}</strong><small>{uncoveredClasses ? `${uncoveredClasses} ${uncoveredClasses === 1 ? 'class needs' : 'classes need'} teaching coverage` : 'Every active class is covered'}</small></article>
      <article><span>Curriculum coverage</span><strong>{assignedSubjectNames.size}/{subjects.length}</strong><small>{unusedSubjects ? `${unusedSubjects} subjects not yet assigned` : 'All subjects are represented'}</small></article>
      <article><span>Teaching staff</span><strong>{assignedTeacherIds.size}/{teachers.length}</strong><small>{unassignedTeachers ? `${unassignedTeachers} active teaching staff without assignments` : 'All active teaching staff are assigned'}</small></article>
      <article><span>Teaching assignments</span><strong>{activeAssignments.length}</strong><small>Active class-subject-teacher links</small></article>
    </section>

    <section className="admin-table-card school-wide-angle" aria-labelledby="school-structure-title">
      <div className="admin-card-heading"><div><h3 id="school-structure-title">Grades, classes and teaching coverage</h3><p>Each grade is grouped with its classes, student population, assigned teachers and taught subjects.</p></div></div>
      {grades.length ? <div className="school-grade-groups">
        {grades.map((grade: any) => {
          const rows = classRows.filter((row: any) => (row.grade_level ?? 'Unassigned') === grade);
          const gradeStudents = rows.reduce((total: number, row: any) => total + row.studentCount, 0);
          const gradeTeachers = new Set(activeAssignments.filter((item: any) => rows.some((row: any) => row.id === item.class_id)).map((item: any) => item.teacher_user_id)).size;
          return <section key={String(grade)} className="school-grade-group">
            <header><div><p className="school-admin-eyebrow">{grade === 'Unassigned' ? 'Grade not set' : `Grade ${grade}`}</p><h4>{rows.length} {rows.length === 1 ? 'class' : 'classes'}</h4></div><div className="school-grade-totals"><span><strong>{gradeStudents}</strong> students</span><span><strong>{gradeTeachers}</strong> teachers</span></div></header>
            <div className="admin-table-scroll"><table>
              <thead><tr><th>Class</th><th>Students</th><th>Teachers</th><th>Subjects</th><th>Coverage</th></tr></thead>
              <tbody>{rows.map((row: any) => <tr key={row.id}>
                <td><strong>{row.class_code}</strong><span className="admin-table-subline">{row.class_name}</span></td>
                <td>{row.studentCount}</td><td>{row.teacherCount}</td>
                <td>{row.subjects.length ? <div className="admin-chip-list">{row.subjects.map((subject: string) => <span key={subject}>{subject}</span>)}</div> : <span className="admin-muted">No subjects assigned</span>}</td>
                <td><span className={`admin-coverage-badge ${row.studentCount && row.teacherCount && row.subjects.length ? 'is-covered' : 'needs-attention'}`}>{row.studentCount && row.teacherCount && row.subjects.length ? 'Covered' : 'Needs attention'}</span></td>
              </tr>)}</tbody>
            </table></div>
          </section>;
        })}
      </div> : <div className="admin-empty-state"><h3>No active classes yet</h3><p>Create classes to start building the whole-school overview.</p></div>}
    </section>

    <section className="admin-action-grid">
      <button onClick={() => setActiveTab('classes')}><span>01</span><strong>Classes &amp; registration</strong><small>Manage academic years, classes and student placement.</small></button>
      <button onClick={() => setActiveTab('teachers')}><span>02</span><strong>Teacher assignments</strong><small>Connect every class, subject and teacher.</small></button>
      <button onClick={() => setActiveTab('members')}><span>03</span><strong>Staff &amp; students</strong><small>Review people, access and account records.</small></button>
    </section>
  </div>;
};

export default DashboardTab;
