import React from 'react';
import { useSchoolAdmin } from '../SchoolAdminContext';

const DashboardTab: React.FC = () => {
  const { classes, dbSubjects, setActiveTab, stats, studentAssignments, students, teacherAssignments, teachers, school } = useSchoolAdmin();
  const activeClasses = classes.filter((item: any) => item.is_active);
  const placedStudents = students.filter((student: any) => studentAssignments[student.user_id]);
  const assignedTeachers = new Set(teacherAssignments.filter((item: any) => item.is_active !== false).map((item: any) => item.teacher_id));
  const mappedSubjects = new Set(teacherAssignments.map((item: any) => (item.subject || '').trim().toLowerCase()).filter(Boolean));
  const metrics = [
    { label: 'Students on roll', value: stats.students, note: 'Current enrolment', tone: 'blue' },
    { label: 'Teaching staff', value: stats.teachers, note: 'Staff accounts', tone: 'emerald' },
    { label: 'Administrators', value: stats.admins, note: 'Authorised users', tone: 'amber' },
    { label: 'School community', value: stats.total, note: 'All active records', tone: 'slate' },
  ];
  const mapItems = [
    { label: 'Classes', value: activeClasses.length, detail: `${classes.length - activeClasses.length} archived`, assigned: activeClasses.length, total: Math.max(classes.length, 1) },
    { label: 'Students', value: students.length, detail: `${students.length - placedStudents.length} not assigned`, assigned: placedStudents.length, total: Math.max(students.length, 1) },
    { label: 'Teachers', value: teachers.length, detail: `${teachers.length - assignedTeachers.size} not assigned`, assigned: assignedTeachers.size, total: Math.max(teachers.length, 1) },
    { label: 'Subjects', value: dbSubjects.length, detail: `${dbSubjects.filter((subject: any) => !mappedSubjects.has(subject.subject_name?.toLowerCase())).length} not assigned`, assigned: dbSubjects.filter((subject: any) => mappedSubjects.has(subject.subject_name?.toLowerCase())).length, total: Math.max(dbSubjects.length, 1) },
  ];

  return <div className="space-y-6">
    <section className="admin-hero">
      <div><p className="school-admin-eyebrow">Executive overview</p><h2>Everything at {school?.name}, in one view.</h2><p>Your live operational picture, from enrolment to curriculum coverage.</p></div>
      <span className="admin-live-pill"><i /> Records synced</span>
    </section>

    <section aria-label="School population summary" className="admin-metric-grid">
      {metrics.map((metric) => <article key={metric.label} className={`admin-metric admin-metric-${metric.tone}`}>
        <div className="admin-metric-value">{metric.value}</div><div><strong>{metric.label}</strong><span>{metric.note}</span></div>
      </article>)}
    </section>

    <section className="school-map-card">
      <div className="school-map-heading"><div><p className="school-admin-eyebrow">School map</p><h3>Operational coverage</h3><p>See where records are connected and where attention is needed.</p></div><button onClick={() => setActiveTab('classes')}>Open organisation →</button></div>
      <div className="school-map-flow">
        {mapItems.map((item, index) => <React.Fragment key={item.label}>
          <article className="school-map-node"><div className="school-map-orbit"><span>{item.value}</span></div><strong>{item.label}</strong><small className={item.detail.startsWith('0 ') ? 'is-clear' : ''}>{item.detail}</small><div className="coverage-track"><i style={{ width: `${Math.round(item.assigned / item.total * 100)}%` }} /></div></article>
          {index < mapItems.length - 1 && <div className="school-map-connector" aria-hidden="true">→</div>}
        </React.Fragment>)}
      </div>
    </section>

    <section className="admin-action-grid">
      <button onClick={() => setActiveTab('members')}><span>01</span><strong>Community management</strong><small>Review administrators, teachers and students.</small></button>
      <button onClick={() => setActiveTab('classes')}><span>02</span><strong>Organisation & register</strong><small>Manage classes, year groups and placements.</small></button>
      <button onClick={() => setActiveTab('settings')}><span>03</span><strong>Access controls</strong><small>Manage the school code and joining policy.</small></button>
    </section>
  </div>;
};
export default DashboardTab;
