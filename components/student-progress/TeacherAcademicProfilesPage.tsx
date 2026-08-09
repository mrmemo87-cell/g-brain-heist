import React, { useEffect, useMemo, useState } from 'react';
import StudentAcademicProfile from './StudentAcademicProfile';
import {
  fetchTeacherAcademicProfileStudents,
  type TeacherAcademicProfileStudent,
} from '../../services/teacherAcademicProfileDirectoryService';
import {
  getAcademicProgressExperienceContext,
  type AcademicProgressExperienceContext,
} from '../../services/academicProgressExperienceService';
import {
  AcademicProgressHeader,
  AcademicStudentPicker,
  selectionFromStudent,
} from './AcademicProgressSuite';
import './StudentAcademicProfile.css';

const TeacherAcademicProfilesPage: React.FC = () => {
  const [students, setStudents] = useState<TeacherAcademicProfileStudent[]>([]);
  const [context, setContext] = useState<AcademicProgressExperienceContext | null>(null);
  const [grade, setGrade] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [profileOpen, setProfileOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [nextStudents, nextContext] = await Promise.all([
          fetchTeacherAcademicProfileStudents(),
          getAcademicProgressExperienceContext(),
        ]);
        if (cancelled) return;
        setStudents(nextStudents);
        setContext(nextContext);
        const params = new URLSearchParams(window.location.search);
        const requestedStudent = params.get('student') || '';
        if (requestedStudent) {
          const selection = selectionFromStudent(nextStudents, requestedStudent);
          if (selection) {
            setGrade(selection.grade);
            setClassFilter(selection.className);
            setSelectedStudentId(requestedStudent);
            setSubjectFilter(params.get('subject') || 'all');
          }
        }
      } catch (err) {
        console.error('Failed to load academic profile directory', err);
        if (!cancelled) setError('Student progress could not be loaded. Please check your school access and try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  const selected = useMemo(() => students.find((student) => student.student_id === selectedStudentId) || null, [students, selectedStudentId]);

  if (profileOpen && selectedStudentId) {
    return (
      <StudentAcademicProfile
        studentId={selectedStudentId}
        initialSubject={subjectFilter === 'all' ? null : subjectFilter}
        mode={context?.viewer.role === 'school_admin' ? 'school_admin' : 'teacher'}
        schoolName={context?.school.name}
        schoolLogoUrl={context?.school.logo_url}
        teacherName={context?.viewer.name}
        backLabel="Back to student selection"
        onClose={() => setProfileOpen(false)}
      />
    );
  }

  return <section className="sap-shell">
    <AcademicProgressHeader
      context={context}
      eyebrow="Student Progress"
      title="Student Progress & Reports"
      subtitle="Choose a grade, class and student to see attainment, strengths, areas for development and progress over time — then generate a school-ready report."
    />

    {loading ? <div className="aps-empty-state">Loading your authorised students…</div> : null}
    {error ? <div className="aps-empty-state">{error}</div> : null}

    {!loading && !error ? <>
      <AcademicStudentPicker
        students={students}
        grade={grade}
        className={classFilter}
        studentId={selectedStudentId}
        subject={subjectFilter}
        onGradeChange={(value) => { setGrade(value); setClassFilter(''); setSelectedStudentId(''); setSubjectFilter('all'); }}
        onClassChange={(value) => { setClassFilter(value); setSelectedStudentId(''); setSubjectFilter('all'); }}
        onStudentChange={(value) => { setSelectedStudentId(value); setSubjectFilter('all'); }}
        onSubjectChange={setSubjectFilter}
      />

      {selected ? <section className="aps-selection-summary">
        <div>
          <strong>{selected.student_name}</strong>
          <span>{selected.grade ? `Grade ${selected.grade} · ` : ''}Class {selected.class_name || '—'}{subjectFilter !== 'all' ? ` · ${subjectFilter}` : ''}</span>
        </div>
        <button type="button" className="aps-primary-button" onClick={() => setProfileOpen(true)}>Open student progress</button>
      </section> : <div className="aps-empty-state">Start with the grade above. The next step becomes available automatically.</div>}
    </> : null}
  </section>;
};

export default TeacherAcademicProfilesPage;
