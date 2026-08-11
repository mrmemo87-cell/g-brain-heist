import React, { useEffect, useMemo, useState } from 'react';
import {
  ensureGradeClass,
  fetchSchoolAcademicSetup,
  saveAcademicYear,
  saveSubjectOfferings,
  seedCurrentStudentEnrolments,
  setStudentElective,
  type AcademicFrameworkSetup,
  type SchoolAcademicSetup,
} from '../../services/schoolAcademicSetupService';
import { useSchoolAdmin } from './SchoolAdminContext';

const GRADES = Array.from({ length: 12 }, (_, index) => index + 1);

const academicYearSeed = () => {
  const today = new Date();
  const firstYear = today.getMonth() >= 6 ? today.getFullYear() : today.getFullYear() - 1;
  return {
    firstYear,
    current: `${firstYear}/${firstYear + 1}`,
    previous: `${firstYear - 1}/${firstYear}`,
    startsOn: `${firstYear}-08-01`,
    endsOn: `${firstYear + 1}-06-30`,
  };
};

const SCHOOL_SYSTEMS = [
  { key: 'cambridge', label: 'Cambridge International', matcher: /cambridge/i },
  { key: 'american', label: 'American Standards', matcher: /american|common core/i },
  { key: 'british', label: 'British National Curriculum', matcher: /british|england national/i },
  { key: 'ib', label: 'International Baccalaureate (IB)', matcher: /international baccalaureate|\bib\b/i },
  { key: 'national', label: 'National / ministry curriculum', matcher: /national|ministry/i },
] as const;

type Requirement = 'required' | 'elective';

const AcademicSetupPanel: React.FC = () => {
  const { school, students, classes = [], addToast, loadAdminTools } = useSchoolAdmin();
  const seed = useMemo(academicYearSeed, []);
  const [setup, setSetup] = useState<SchoolAcademicSetup | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [yearName, setYearName] = useState(seed.current);
  const [startsOn, setStartsOn] = useState(seed.startsOn);
  const [endsOn, setEndsOn] = useState(seed.endsOn);
  const [yearId, setYearId] = useState('');
  const [yearCollapsed, setYearCollapsed] = useState(false);
  const [yearError, setYearError] = useState('');
  const [frameworkVersionId, setFrameworkVersionId] = useState('');
  const [activeGrade, setActiveGrade] = useState(6);
  const [requirements, setRequirements] = useState<Record<string, Requirement>>({});
  const [electiveGrade, setElectiveGrade] = useState(6);
  const [electiveSearch, setElectiveSearch] = useState('');
  const [electiveStudentId, setElectiveStudentId] = useState('');
  const [electiveSubjectId, setElectiveSubjectId] = useState('');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await fetchSchoolAcademicSetup(school.id);
      setSetup(next);
      const currentYear = next.years.find((year) => year.status === 'current') || next.years[0];
      if (currentYear) {
        setYearId(currentYear.id);
        setYearName(currentYear.name);
        setStartsOn(currentYear.startsOn);
        setEndsOn(currentYear.endsOn);
        setYearCollapsed(true);
      }
      if (next.frameworks[0]) setFrameworkVersionId((value) => value || next.frameworks[0].versionId);
      const existing: Record<string, Requirement> = {};
      next.offerings.forEach((offering) => {
        existing[`${offering.gradeLevel}:${offering.academicSubjectId}`] = offering.subjectRequirement;
      });
      setRequirements(existing);
    } catch (loadError) {
      console.error('Failed to load school academic setup', loadError);
      setError(loadError instanceof Error ? loadError.message : 'Academic setup is unavailable.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [school.id]);

  const framework: AcademicFrameworkSetup | undefined = setup?.frameworks.find(
    (item) => item.versionId === frameworkVersionId,
  );
  const selectedYear = setup?.years.find((year) => year.id === yearId);
  const configuredGrades = useMemo(() => new Set(
    (setup?.offerings || []).filter((offering) => offering.academicYearId === yearId).map((offering) => Number(offering.gradeLevel)),
  ), [setup?.offerings, yearId]);
  const selectedCount = framework?.subjects.filter((subject) => requirements[`${activeGrade}:${subject.academicSubjectId}`]).length ?? 0;
  const electiveOfferings = (setup?.offerings || []).filter((offering) => (
    offering.academicYearId === yearId
    && offering.subjectRequirement === 'elective'
    && Number(offering.gradeLevel) === electiveGrade
  ));
  const electiveStudents = useMemo(() => {
    const term = electiveSearch.trim().toLowerCase();
    return (students || [])
      .filter((student: { grade?: number | string | null }) => Number(student.grade) === electiveGrade)
      .filter((student: { username: string; full_name?: string | null; email?: string }) => {
        if (!term) return true;
        return [student.full_name, student.username, student.email].some((value) => String(value || '').toLowerCase().includes(term));
      })
      .sort((left: { full_name?: string | null; username: string }, right: { full_name?: string | null; username: string }) => (
        String(left.full_name || left.username).localeCompare(String(right.full_name || right.username))
      ));
  }, [electiveGrade, electiveSearch, students]);

  const frameworkOptions = useMemo(() => {
    const matchedVersionIds = new Set<string>();
    const known = SCHOOL_SYSTEMS.map((system) => {
      const match = setup?.frameworks.find((item) => system.matcher.test(`${item.name} ${item.providerName} ${item.code}`));
      if (match) matchedVersionIds.add(match.versionId);
      return { ...system, framework: match };
    });
    const additional = (setup?.frameworks || []).filter((item) => !matchedVersionIds.has(item.versionId));
    return { known, additional };
  }, [setup?.frameworks]);

  const selectYear = (name: string) => {
    if (name !== seed.current) return;
    setYearName(name);
    setStartsOn(seed.startsOn);
    setEndsOn(seed.endsOn);
    setYearError('');
  };

  const validateYear = () => {
    if (yearName !== seed.current) return `Choose ${seed.current}; ${seed.previous} is closed and cannot be selected.`;
    const firstYear = Number(yearName.slice(0, 4));
    const earliestStart = `${firstYear}-01-01`;
    const latestStart = `${firstYear}-12-31`;
    const earliestEnd = `${firstYear + 1}-01-01`;
    const latestEnd = `${firstYear + 1}-12-31`;
    if (!startsOn || startsOn < earliestStart || startsOn > latestStart) return `The start date must fall in ${firstYear}.`;
    if (!endsOn || endsOn < earliestEnd || endsOn > latestEnd) return `The end date must fall in ${firstYear + 1}.`;
    if (endsOn <= startsOn) return 'The end date must be later than the start date.';
    return '';
  };

  const handleSaveYear = async () => {
    const validationMessage = validateYear();
    setYearError(validationMessage);
    if (validationMessage) return;
    setSaving(true);
    try {
      const savedYearId = await saveAcademicYear({
        schoolId: school.id,
        yearId: yearId || null,
        name: yearName,
        startsOn,
        endsOn,
        status: 'current',
      });
      setYearId(savedYearId);
      setYearCollapsed(true);
      addToast('Current academic year saved.', 'success');
      await load();
    } catch (saveError) {
      addToast(saveError instanceof Error ? saveError.message : 'Academic year could not be saved.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleSubject = (subjectId: string) => {
    const key = `${activeGrade}:${subjectId}`;
    setRequirements((current) => {
      const next = { ...current };
      if (next[key]) delete next[key];
      else next[key] = 'required';
      return next;
    });
  };

  const handleSaveGrade = async () => {
    if (!yearId || !framework) return;
    const offerings = framework.subjects.flatMap((subject) => {
      const requirement = requirements[`${activeGrade}:${subject.academicSubjectId}`];
      const scope = subject.scopes.find((item) => item.gradeLevel === activeGrade);
      return requirement && scope ? [{
        gradeLevel: String(activeGrade),
        academicSubjectId: subject.academicSubjectId,
        scopeId: scope.scopeId,
        subjectRequirement: requirement,
      }] : [];
    });
    if (!offerings.length) {
      addToast(`Choose at least one subject for Grade ${activeGrade}.`, 'info');
      return;
    }
    setSaving(true);
    try {
      const saved = await saveSubjectOfferings({ schoolId: school.id, academicYearId: yearId, offerings });
      const defaultClass = await ensureGradeClass({ schoolId: school.id, gradeLevel: activeGrade, existingClasses: classes });
      const enrolled = await seedCurrentStudentEnrolments(school.id, yearId);
      await loadAdminTools(school.id);
      setElectiveGrade(activeGrade);
      addToast(`Grade ${activeGrade} saved with ${saved} subjects${defaultClass.created ? ' and a default class' : ''}. ${enrolled} current student enrolments added.`, 'success');
      await load();
    } catch (saveError) {
      addToast(saveError instanceof Error ? saveError.message : 'Grade subject plan could not be saved.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleAddElective = async () => {
    if (!yearId || !electiveStudentId || !electiveSubjectId) return;
    setSaving(true);
    try {
      await setStudentElective({
        schoolId: school.id,
        academicYearId: yearId,
        studentId: electiveStudentId,
        academicSubjectId: electiveSubjectId,
      });
      addToast('Student elective enrolment saved.', 'success');
      setElectiveStudentId('');
      setElectiveSubjectId('');
      await load();
    } catch (saveError) {
      addToast(saveError instanceof Error ? saveError.message : 'Student elective could not be saved.', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <section className="admin-form-card"><p>Loading academic setup…</p></section>;
  if (error || !setup) return <section className="admin-form-card"><h3>Academic setup unavailable</h3><p>{error}</p><button type="button" className="admin-button-primary" onClick={() => void load()}>Try again</button></section>;

  return <div className="space-y-6 academic-setup-flow">
    <ol className="academic-setup-steps" aria-label="Academic setup steps">
      <li className={yearId ? 'is-complete' : 'is-current'}><span>1</span><div><strong>Academic year</strong><small>Set the active calendar</small></div></li>
      <li className={framework ? 'is-complete' : ''}><span>2</span><div><strong>School system</strong><small>Choose a published framework</small></div></li>
      <li className={configuredGrades.size ? 'is-complete' : ''}><span>3</span><div><strong>Grades &amp; subjects</strong><small>Create the teaching structure</small></div></li>
    </ol>

    <section className="admin-form-card" aria-labelledby="academic-year-heading">
      <div className="admin-card-heading"><div><h3 id="academic-year-heading">1. Academic year</h3><p>This calendar anchors every class, assignment and progress record.</p></div>{selectedYear ? <span className="admin-live-pill"><i /> {selectedYear.name}</span> : null}</div>
      {yearCollapsed && selectedYear ? <div className="academic-year-summary"><div><strong>{selectedYear.name}</strong><span>{selectedYear.startsOn} → {selectedYear.endsOn}</span></div><button type="button" className="admin-button-ghost admin-button-small" onClick={() => setYearCollapsed(false)}>Edit dates</button></div> : <>
        <div className="academic-year-editor">
          <label className="admin-field admin-field-wide"><span>Academic year <i>Required</i></span><select value={yearName} onChange={(event) => selectYear(event.target.value)}><option value={seed.previous} disabled>{seed.previous} — closed</option><option value={seed.current}>{seed.current} — available</option></select></label>
          <div className="academic-date-row">
            <label className="admin-field"><span>Start date</span><input type="date" min={`${seed.firstYear}-01-01`} max={`${seed.firstYear}-12-31`} value={startsOn} onChange={(event) => { setStartsOn(event.target.value); setYearError(''); }} /></label>
            <label className="admin-field"><span>End date</span><input type="date" min={`${seed.firstYear + 1}-01-01`} max={`${seed.firstYear + 1}-12-31`} value={endsOn} onChange={(event) => { setEndsOn(event.target.value); setYearError(''); }} /></label>
          </div>
          {yearError ? <p className="admin-field-error" role="alert">{yearError}</p> : <p className="admin-field-help">Dates must stay inside the selected academic year, and the end date must be later than the start date.</p>}
        </div>
        <div className="admin-form-actions"><button type="button" className="admin-button-primary" disabled={saving || !yearName || !startsOn || !endsOn} onClick={handleSaveYear}>{saving ? 'Saving…' : 'Save academic year'}</button></div>
      </>}
    </section>

    <section className="admin-form-card" aria-labelledby="framework-heading">
      <div className="admin-card-heading"><div><h3 id="framework-heading">2. Published academic framework</h3><p>Choose from recognised school systems. A system becomes selectable only when its reviewed package is published.</p></div></div>
      <label className="admin-field admin-field-wide"><span>School system and framework version</span><select value={frameworkVersionId} onChange={(event) => setFrameworkVersionId(event.target.value)}>
        {frameworkOptions.known.map((option) => <option key={option.key} value={option.framework?.versionId || `unavailable:${option.key}`} disabled={!option.framework}>{option.label} — {option.framework ? `Available · ${option.framework.versionName}` : 'Not published yet'}</option>)}
        {frameworkOptions.additional.map((item) => <option key={item.versionId} value={item.versionId}>{item.name} — Available · {item.versionName}</option>)}
      </select></label>
      {framework ? <div className="admin-access-note"><strong>{framework.name}</strong><span>{framework.providerName} · version {framework.versionCode}. Only published, reviewed objectives and questions are exposed through this selection.</span></div> : <div className="admin-empty-state"><h3>No selectable framework</h3><p>A governed framework must be published before the school can offer subjects.</p></div>}
    </section>

    <section className="admin-table-card" aria-labelledby="grade-subject-heading">
      <div className="admin-card-heading"><div><h3 id="grade-subject-heading">3. Subjects by grade</h3><p>Select a grade, choose its required and elective subjects, then save. The first saved plan for a grade automatically creates its default class.</p></div><span>{selectedCount} selected for Grade {activeGrade}</span></div>
      <div className="grade-plan-toolbar"><label className="admin-field"><span>Grade</span><select value={activeGrade} onChange={(event) => setActiveGrade(Number(event.target.value))}>{GRADES.map((grade) => <option key={grade} value={grade}>Grade {grade}{configuredGrades.has(grade) ? ' · configured' : ''}</option>)}</select></label><div className="grade-plan-status">{configuredGrades.has(activeGrade) ? <span className="is-complete">✓ Grade plan saved</span> : <span>Not configured yet</span>}</div></div>
      {framework ? <div className="subject-choice-grid">{framework.subjects.map((subject) => {
        const key = `${activeGrade}:${subject.academicSubjectId}`;
        const requirement = requirements[key];
        const scope = subject.scopes.find((item) => item.gradeLevel === activeGrade);
        return <article key={subject.academicSubjectId} className={`subject-choice-card ${requirement ? 'is-selected' : ''} ${!scope ? 'is-unavailable' : ''}`}><label><input type="checkbox" checked={Boolean(requirement)} disabled={!scope} onChange={() => toggleSubject(subject.academicSubjectId)} /><span><strong>{subject.name}</strong><small>{scope ? `${scope.approvedQuestionCount} approved questions · ${scope.objectiveCount} objectives` : `Not published for Grade ${activeGrade}`}</small></span></label>{requirement ? <label className="subject-requirement"><span>Student access</span><select value={requirement} onChange={(event) => setRequirements((current) => ({ ...current, [key]: event.target.value as Requirement }))}><option value="required">Required for whole grade</option><option value="elective">Elective — selected students</option></select></label> : null}</article>;
      })}</div> : null}
      <div className="admin-form-actions"><button type="button" className="admin-button-primary" disabled={saving || !yearId || !framework || selectedCount === 0} onClick={handleSaveGrade}>{saving ? 'Saving…' : `Save Grade ${activeGrade} & create class`}</button></div>
      {!yearId ? <p className="admin-muted">Save the current academic year before configuring grades.</p> : null}
    </section>

    <section className="admin-form-card" aria-labelledby="elective-heading">
      <div className="admin-card-heading"><div><h3 id="elective-heading">4. Elective students</h3><p>Students still create or join their own school accounts. Use this only to give an existing student access to an elective offered for their grade.</p></div><span>{setup.electiveEnrolments.length} active</span></div>
      <div className="admin-access-note"><strong>This does not create students</strong><span>It connects one registered student to one elective. Required subjects already reach every student in the grade automatically.</span></div>
      <div className="elective-filter-grid">
        <label className="admin-field"><span>Grade filter</span><select value={electiveGrade} onChange={(event) => { setElectiveGrade(Number(event.target.value)); setElectiveStudentId(''); setElectiveSubjectId(''); }}>{GRADES.filter((grade) => configuredGrades.has(grade)).map((grade) => <option key={grade} value={grade}>Grade {grade}</option>)}</select></label>
        <label className="admin-field admin-field-wide"><span>Find registered student</span><input type="search" value={electiveSearch} onChange={(event) => { setElectiveSearch(event.target.value); setElectiveStudentId(''); }} placeholder="Search by name, username or email" /></label>
      </div>
      <div className="admin-form-grid">
        <label className="admin-field admin-field-wide"><span>Student</span><select value={electiveStudentId} onChange={(event) => setElectiveStudentId(event.target.value)}><option value="">{electiveStudents.length ? 'Choose matching student' : `No Grade ${electiveGrade} students match`}</option>{electiveStudents.map((student: { user_id: string; username: string; full_name?: string | null }) => <option key={student.user_id} value={student.user_id}>{student.full_name || student.username}</option>)}</select></label>
        <label className="admin-field admin-field-wide"><span>Elective offered to Grade {electiveGrade}</span><select value={electiveSubjectId} onChange={(event) => setElectiveSubjectId(event.target.value)}><option value="">{electiveOfferings.length ? 'Choose elective' : 'No electives configured for this grade'}</option>{electiveOfferings.map((offering) => <option key={`${offering.gradeLevel}:${offering.academicSubjectId}`} value={offering.academicSubjectId}>{offering.subjectName}</option>)}</select></label>
      </div>
      <div className="admin-form-actions"><button type="button" className="admin-button-primary" disabled={saving || !electiveStudentId || !electiveSubjectId} onClick={handleAddElective}>Add elective access</button></div>
    </section>

    <section className="admin-form-card"><div className="admin-card-heading"><div><h3>5. Place students and assign teachers</h3><p>Open Classes &amp; Registration to place students, then Teacher Assignments to connect each class, subject and teacher.</p></div></div><div className="admin-access-note"><strong>Student visibility rule</strong><span>Current year + framework version + grade + subject. Class or named-student scope is added when a teacher publishes an assignment.</span></div></section>
  </div>;
};

export default AcademicSetupPanel;
