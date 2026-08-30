import React, { useEffect, useMemo, useState } from 'react';
import StudentAcademicProfile from './StudentAcademicProfile';
import {
  fetchTeacherAcademicProfileStudents,
  type TeacherAcademicProfileStudent,
} from '../../services/teacherAcademicProfileDirectoryService';
import {
  academicProgressBackDestination,
  getAcademicProgressExperienceContext,
  type AcademicProgressExperienceContext,
} from '../../services/academicProgressExperienceService';
import {
  getAcademicReportingContext,
  type AcademicReportingYear,
} from '../../services/academicReportingService';
import {
  AcademicProgressHeader,
  AcademicStudentPicker,
  selectionFromStudent,
} from './AcademicProgressSuite';
import './StudentAcademicProfile.css';

interface TeacherAcademicProfilesPageProps {
  onBack?: () => void;
}

const utcToday = () => new Date().toISOString().slice(0, 10);
const isDateEffectiveYear = (year: AcademicReportingYear, date = utcToday()) => (
  year.startsOn <= date && date <= year.endsOn
);

const TeacherAcademicProfilesPage: React.FC<TeacherAcademicProfilesPageProps> = ({ onBack }) => {
  const [students, setStudents] = useState<TeacherAcademicProfileStudent[]>([]);
  const [context, setContext] = useState<AcademicProgressExperienceContext | null>(null);
  const [academicYears, setAcademicYears] = useState<AcademicReportingYear[]>([]);
  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState('');
  const [grade, setGrade] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [profileOpen, setProfileOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadContext = async () => {
      try {
        const [nextContext, reportingContext] = await Promise.all([
          getAcademicProgressExperienceContext(),
          getAcademicReportingContext(),
        ]);
        if (cancelled) return;
        setContext(nextContext);
        setAcademicYears(reportingContext.years);
        const currentYear = reportingContext.years.find((year) => year.status === 'current')
          || reportingContext.years.find((year) => year.status !== 'closed' && isDateEffectiveYear(year))
          || reportingContext.years[0]
          || null;
        if (!currentYear) throw new Error('No academic year is configured for this school.');
        setSelectedAcademicYearId(currentYear.id);
      } catch (err) {
        console.error('Failed to load academic profile context', err);
        if (!cancelled) {
          setError('Student progress could not be loaded. Please check the school academic year setup and try again.');
          setLoading(false);
        }
      }
    };
    void loadContext();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!selectedAcademicYearId) return;
    let cancelled = false;
    const loadStudents = async () => {
      setLoading(true);
      setError(null);
      try {
        const nextStudents = await fetchTeacherAcademicProfileStudents(selectedAcademicYearId);
        if (cancelled) return;
        setStudents(nextStudents);
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
        if (!cancelled) setError('Student progress could not be loaded for this academic year. Please try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void loadStudents();
    return () => { cancelled = true; };
  }, [selectedAcademicYearId]);

  const selected = useMemo(() => students.find((student) => student.student_id === selectedStudentId) || null, [students, selectedStudentId]);
  const selectedAcademicYear = academicYears.find((year) => year.id === selectedAcademicYearId) || null;
  const selectedYearIsConfiguredCurrent = selectedAcademicYear?.status === 'current';
  const archivedYear = selectedAcademicYear?.status === 'closed';
  const selectedYearIsActivePeriod = Boolean(selectedAcademicYear && !archivedYear && isDateEffectiveYear(selectedAcademicYear));
  const viewerRole = context?.viewer.role || 'teacher';
  const profileMode = viewerRole === 'school_admin' || viewerRole === 'school_head' ? viewerRole : 'teacher';
  const scopeNote = viewerRole === 'teacher'
    ? 'Only students and subjects covered by your authorised teacher allocations for the selected academic year are shown here.'
    : 'Only students in your school are shown here. Access remains school-scoped and role-authorised.';
  const emptyRosterMessage = viewerRole === 'teacher'
    ? 'No eligible students are currently rostered to your authorised class allocations for this academic year. Ask a school administrator to review student membership and academic-year placement.'
    : 'No active students are currently rostered for this academic year. Review school membership and academic-year placement before opening a profile.';

  if (profileOpen && selectedStudentId) {
    return (
      <StudentAcademicProfile
        studentId={selectedStudentId}
        initialSubject={subjectFilter === 'all' ? null : subjectFilter}
        academicYearId={selectedAcademicYearId}
        academicYearName={selectedAcademicYear?.name}
        mode={profileMode}
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
      title="Student Academic Profiles"
      subtitle="Choose an academic year, grade, class and student to see the correct historical or current attainment record."
      onBack={onBack}
      backLabel={onBack ? academicProgressBackDestination(viewerRole).label : undefined}
    />

    <section className="aps-selection-summary" style={{ alignItems: 'flex-end', gap: 16 }}>
      <label style={{ display: 'grid', gap: 6, minWidth: 220 }}>
        <strong>Academic Year</strong>
        <select
          value={selectedAcademicYearId}
          onChange={(event) => {
            setSelectedAcademicYearId(event.target.value);
            setGrade('');
            setClassFilter('');
            setSelectedStudentId('');
            setSubjectFilter('all');
            setProfileOpen(false);
          }}
        >
          {academicYears.map((year) => <option key={year.id} value={year.id}>
            {year.name} {year.status === 'current' ? '(Current)' : year.status === 'closed' ? '(Archived)' : isDateEffectiveYear(year) ? '(Active period)' : '(Planned)'}
          </option>)}
        </select>
      </label>
      <div>
        <strong>{selectedAcademicYear?.name || 'Academic year'}</strong>
        <span>{selectedYearIsConfiguredCurrent ? 'Configured current · live roster and curriculum' : selectedYearIsActivePeriod ? 'Active academic period · live evidence' : archivedYear ? 'Archived · read only' : 'Upcoming academic year · roster pending'}</span>
      </div>
    </section>

    <p className="aps-scope-note">{scopeNote}</p>

    {loading ? <div className="aps-empty-state">Loading the selected academic year…</div> : null}
    {error ? <div className="aps-empty-state">{error}</div> : null}
    {!loading && !error && students.length === 0 ? <div className="aps-empty-state">{emptyRosterMessage}</div> : null}

    {!loading && !error && students.length > 0 ? <>
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
        <button type="button" className="aps-primary-button" onClick={() => setProfileOpen(true)}>Open academic profile</button>
      </section> : <div className="aps-empty-state">Start with the grade above. The next step becomes available automatically.</div>}
    </> : null}
  </section>;
};

export default TeacherAcademicProfilesPage;
