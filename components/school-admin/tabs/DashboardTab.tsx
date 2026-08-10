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

    <section className="admin-action-grid">
      <button onClick={() => setActiveTab('classes')}><span>01</span><strong>Classes &amp; registration</strong><small>Manage academic years, classes and student placement.</small></button>
      <button onClick={() => setActiveTab('teachers')}><span>02</span><strong>Teacher assignments</strong><small>Connect every class, subject and teacher.</small></button>
      <button onClick={() => setActiveTab('members')}><span>03</span><strong>Staff &amp; students</strong><small>Review people, access and account records.</small></button>
    </section>
  </div>;
};

export default DashboardTab;
