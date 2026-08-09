import React, { useEffect, useMemo, useState } from 'react';
import StudentAcademicProfile from './StudentAcademicProfile';
import {
  fetchTeacherAcademicProfileStudents,
  type TeacherAcademicProfileStudent,
} from '../../services/teacherAcademicProfileDirectoryService';
import './StudentAcademicProfile.css';

const TeacherAcademicProfilesPage: React.FC = () => {
  const [students, setStudents] = useState<TeacherAcademicProfileStudent[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [classFilter, setClassFilter] = useState('all');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const next = await fetchTeacherAcademicProfileStudents();
        if (!cancelled) setStudents(next);
      } catch (err) {
        console.error('Failed to load teacher academic profile directory', err);
        if (!cancelled) setError('Student profiles could not be loaded. Please verify your active class assignments.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  const classes = useMemo(() => [...new Set(students.map((student) => student.class_name || '—'))].sort(), [students]);
  const subjects = useMemo(() => [...new Set(students.flatMap((student) => student.subjects || []))].sort(), [students]);
  const visibleStudents = useMemo(() => students.filter((student) => {
    const text = `${student.student_name} ${student.username || ''}`.toLowerCase();
    if (query.trim() && !text.includes(query.trim().toLowerCase())) return false;
    if (classFilter !== 'all' && (student.class_name || '—') !== classFilter) return false;
    if (subjectFilter !== 'all' && !(student.subjects || []).includes(subjectFilter)) return false;
    return true;
  }), [students, query, classFilter, subjectFilter]);

  if (selectedStudentId) {
    const selected = students.find((student) => student.student_id === selectedStudentId);
    return <StudentAcademicProfile studentId={selectedStudentId} initialSubject={subjectFilter === 'all' ? null : subjectFilter} mode="teacher" onClose={() => setSelectedStudentId(null)} schoolName={undefined} teacherName={undefined} />;
  }

  return <section className="sap-shell">
    <header className="sap-hero">
      <div className="sap-identity"><div className="sap-school-mark">BH</div><div><span className="sap-eyebrow">Teacher Reports</span><h1>Student Academic Profiles</h1><p>Track attainment, strengths, recurring needs and progress over time for students within your active class and subject assignments.</p></div></div>
      <div className="sap-hero-actions"><button type="button" className="sap-btn sap-btn--secondary" onClick={() => window.history.length > 1 ? window.history.back() : window.location.assign('/')}>Back to teacher portal</button></div>
    </header>

    <div className="sap-filterbar">
      <label>Search<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Student name" /></label>
      <label>Class<select value={classFilter} onChange={(event) => setClassFilter(event.target.value)}><option value="all">All assigned classes</option>{classes.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      <label>Subject<select value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)}><option value="all">All assigned subjects</option>{subjects.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      <span className="sap-scope-note">Only students and subjects covered by your active teaching assignments are returned by the server.</span>
    </div>

    <section className="sap-panel">
      <div className="sap-panel-heading"><div><span>Authorised students</span><h2>Academic profile directory</h2></div><p>Select a student to open their longitudinal profile and generate an individual academic report.</p></div>
      {loading ? <div className="sap-empty">Loading authorised students…</div> : null}
      {error ? <div className="sap-empty">{error}</div> : null}
      {!loading && !error ? <div className="sap-directory-grid">{visibleStudents.map((student) => <button type="button" key={`${student.student_id}:${student.class_name || ''}`} className="sap-directory-card" onClick={() => setSelectedStudentId(student.student_id)}><span><strong>{student.student_name}</strong><small>{student.class_name ? `Class ${student.class_name}` : 'Class not set'}{student.grade ? ` · Grade ${student.grade}` : ''}</small></span><span className="sap-directory-subjects">{student.subjects.map((item) => <i key={item}>{item}</i>)}</span><b>Open academic profile →</b></button>)}{!visibleStudents.length ? <div className="sap-empty">No students match the selected filters.</div> : null}</div> : null}
    </section>
  </section>;
};

export default TeacherAcademicProfilesPage;
