import React, { useEffect, useMemo, useState } from 'react';
import {
  ensureGradeClass,
  fetchSchoolAcademicSetup,
  fetchSchoolAcademicSystem,
  saveAcademicYear,
  saveSchoolAcademicSystem,
  saveSubjectOfferings,
  seedCurrentStudentEnrolments,
  setStudentElective,
  type AcademicFrameworkSetup,
  type SchoolAcademicSetup,
  type SchoolAcademicSystem,
} from '../../services/schoolAcademicSetupService';
import { useSchoolAdmin } from './SchoolAdminContext';

const GRADES = Array.from({ length: 12 }, (_, index) => index + 1);

const SCHOOL_SYSTEMS: Array<{ code: SchoolAcademicSystem; label: string; description: string }> = [
  { code: 'cambridge', label: 'Cambridge International', description: 'Cambridge-style grade and reporting structure.' },
  { code: 'american', label: 'American Standards', description: 'American grade-level and reporting structure.' },
];

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

const formatShortDate = (value: string) => new Intl.DateTimeFormat('en-GB', {
  day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
}).format(new Date(`${value}T00:00:00Z`));

type Requirement = 'required' | 'elective';
type SectionId = 'year' | 'system' | 'grades' | 'electives' | 'next';

interface SetupSectionProps {
  id: SectionId;
  number: number;
  title: string;
  description: string;
  summary: string;
  open: boolean;
  onToggle: (id: SectionId) => void;
  children: React.ReactNode;
}

const SetupSection: React.FC<SetupSectionProps> = ({
  id, number, title, description, summary, open, onToggle, children,
}) => (
  <section className={`admin-form-card academic-accordion ${open ? 'is-open' : ''}`}>
    <button type="button" className="academic-accordion-trigger" onClick={() => onToggle(id)} aria-expanded={open} aria-controls={`academic-section-${id}`}>
      <span className="academic-accordion-number">{number}</span>
      <span className="academic-accordion-heading"><strong>{title}</strong><small>{description}</small></span>
      <span className="academic-accordion-summary">{summary}</span>
      <span className="academic-accordion-chevron" aria-hidden="true" />
    </button>
    {open ? <div id={`academic-section-${id}`} className="academic-accordion-body">{children}</div> : null}
  </section>
);

const AcademicSetupPanel: React.FC = () => {
  const { school, students, classes = [], addToast, loadAdminTools } = useSchoolAdmin();
  const seed = useMemo(academicYearSeed, []);
  const [setup, setSetup] = useState<SchoolAcademicSetup | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openSection, setOpenSection] = useState<SectionId | null>('year');
  const [yearName, setYearName] = useState(seed.current);
  const [startsOn, setStartsOn] = useState(seed.startsOn);
  const [endsOn, setEndsOn] = useState(seed.endsOn);
  const [yearId, setYearId] = useState('');
  const [yearError, setYearError] = useState('');
  const [academicSystem, setAcademicSystem] = useState<SchoolAcademicSystem | null>(null);
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
      const [next, savedSystem] = await Promise.all([
        fetchSchoolAcademicSetup(school.id),
        fetchSchoolAcademicSystem(school.id),
      ]);
      setSetup(next);
      setAcademicSystem(savedSystem);
      const currentYear = next.years.find((year) => year.status === 'current') || next.years[0];
      if (currentYear) {
        setYearId(currentYear.id);
        setYearName(currentYear.name);
        setStartsOn(currentYear.startsOn);
        setEndsOn(currentYear.endsOn);
        setOpenSection((section) => section === 'year' ? null : section);
      }
      const existing: Record<string, Requirement> = {};
      next.offerings.forEach((offering) => {
        existing[`${offering.gradeLevel}:${offering.academicSubjectId}`] = offering.subjectRequirement;
      });
      setRequirements(existing);
      const firstConfiguredGrade = next.offerings
        .filter((offering) => !currentYear || offering.academicYearId === currentYear.id)
        .map((offering) => Number(offering.gradeLevel))
        .find(Number.isFinite);
      if (firstConfiguredGrade) {
        setActiveGrade(firstConfiguredGrade);
        setElectiveGrade(firstConfiguredGrade);
      }
    } catch (loadError) {
      console.error('Failed to load school academic setup', loadError);
      setError(loadError instanceof Error ? loadError.message : 'Academic setup is unavailable.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [school.id]);

  const framework: AcademicFrameworkSetup | undefined = useMemo(() => {
    const available = setup?.frameworks || [];
    return available.find((item) => /brains?-heist-international/i.test(item.code) && !/qa/i.test(item.code))
      || available.find((item) => !/qa/i.test(`${item.code} ${item.name}`))
      || available[0];
  }, [setup?.frameworks]);
  const selectedYear = setup?.years.find((year) => year.id === yearId);
  const currentOfferings = useMemo(() => (setup?.offerings || []).filter((offering) => offering.academicYearId === yearId), [setup?.offerings, yearId]);
  const configuredGrades = useMemo(() => Array.from(new Set(currentOfferings.map((offering) => Number(offering.gradeLevel)).filter(Number.isFinite))).sort((a, b) => a - b), [currentOfferings]);
  const configuredSubjectNames = useMemo(() => new Set(currentOfferings.map((offering) => offering.subjectName)), [currentOfferings]);
  const subjectsForGrade = useMemo(() => (framework?.subjects || []).filter((subject) => subject.scopes.some((scope) => scope.gradeLevel === activeGrade)), [activeGrade, framework?.subjects]);
  const selectedCount = subjectsForGrade.filter((subject) => requirements[`${activeGrade}:${subject.academicSubjectId}`]).length;
  const selectedSystemLabel = SCHOOL_SYSTEMS.find((system) => system.code === academicSystem)?.label || 'Not selected';
  const electiveOfferings = currentOfferings.filter((offering) => offering.subjectRequirement === 'elective' && Number(offering.gradeLevel) === electiveGrade);
  const electiveStudents = useMemo(() => {
    const term = electiveSearch.trim().toLowerCase();
    return (students || [])
      .filter((student: { grade?: number | string | null }) => Number(student.grade) === electiveGrade)
      .filter((student: { username: string; full_name?: string | null; email?: string }) => {
        if (!term) return true;
        return [student.full_name, student.username, student.email].some((value) => String(value || '').toLowerCase().includes(term));
      })
      .sort((left: { full_name?: string | null; username: string }, right: { full_name?: string | null; username: string }) => String(left.full_name || left.username).localeCompare(String(right.full_name || right.username)));
  }, [electiveGrade, electiveSearch, students]);

  const toggleSection = (id: SectionId) => setOpenSection((current) => current === id ? null : id);
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
    if (!startsOn || startsOn < `${firstYear}-01-01` || startsOn > `${firstYear}-12-31`) return `The start date must fall in ${firstYear}.`;
    if (!endsOn || endsOn < `${firstYear + 1}-01-01` || endsOn > `${firstYear + 1}-12-31`) return `The end date must fall in ${firstYear + 1}.`;
    if (endsOn <= startsOn) return 'The end date must be later than the start date.';
    return '';
  };

  const handleSaveYear = async () => {
    const validationMessage = validateYear();
    setYearError(validationMessage);
    if (validationMessage) return;
    setSaving(true);
    try {
      const savedYearId = await saveAcademicYear({ schoolId: school.id, yearId: yearId || null, name: yearName, startsOn, endsOn, status: 'current' });
      setYearId(savedYearId);
      setOpenSection('system');
      addToast('Academic year saved.', 'success');
      await load();
    } catch (saveError) {
      addToast(saveError instanceof Error ? saveError.message : 'Academic year could not be saved.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSystem = async () => {
    if (!academicSystem) return;
    setSaving(true);
    try {
      await saveSchoolAcademicSystem(school.id, academicSystem);
      setOpenSection('grades');
      addToast(`${selectedSystemLabel} saved as the school system.`, 'success');
    } catch (saveError) {
      addToast(saveError instanceof Error ? saveError.message : 'School system could not be saved.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleSubject = (subjectId: string) => {
    const key = `${activeGrade}:${subjectId}`;
    setRequirements((current) => {
      const next = { ...current };
      if (next[key]) delete next[key]; else next[key] = 'required';
      return next;
    });
  };

  const handleSaveGrade = async () => {
    if (!yearId || !framework) return;
    const offerings = subjectsForGrade.flatMap((subject) => {
      const requirement = requirements[`${activeGrade}:${subject.academicSubjectId}`];
      const scope = subject.scopes.find((item) => item.gradeLevel === activeGrade);
      return requirement && scope ? [{ gradeLevel: String(activeGrade), academicSubjectId: subject.academicSubjectId, scopeId: scope.scopeId, subjectRequirement: requirement }] : [];
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
      setOpenSection(null);
      addToast(`Grade ${activeGrade} saved with ${saved} subjects${defaultClass.created ? ' and its default class' : ''}. ${enrolled} student enrolments added.`, 'success');
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
      await setStudentElective({ schoolId: school.id, academicYearId: yearId, studentId: electiveStudentId, academicSubjectId: electiveSubjectId });
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

  const yearSummary = selectedYear ? `${selectedYear.name} · ${formatShortDate(selectedYear.startsOn)}–${formatShortDate(selectedYear.endsOn)}` : 'Not configured';
  const gradeSummary = configuredGrades.length ? `${configuredGrades.length} grade levels · ${configuredSubjectNames.size} subjects` : 'No grade levels configured';
  const electiveSummary = `${setup.electiveEnrolments.length} active student enrolment${setup.electiveEnrolments.length === 1 ? '' : 's'}`;

  return <div className="space-y-4 academic-setup-flow">
    <SetupSection id="year" number={1} title="Academic year" description="The school calendar used across classes and reporting." summary={yearSummary} open={openSection === 'year'} onToggle={toggleSection}>
      <div className="academic-year-editor">
        <label className="admin-field admin-field-wide"><span>Academic year <i>Required</i></span><select value={yearName} onChange={(event) => selectYear(event.target.value)}><option value={seed.previous} disabled>{seed.previous} — closed</option><option value={seed.current}>{seed.current} — available</option></select></label>
        <div className="academic-date-row">
          <label className="admin-field"><span>Start date</span><input type="date" min={`${seed.firstYear}-01-01`} max={`${seed.firstYear}-12-31`} value={startsOn} onChange={(event) => { setStartsOn(event.target.value); setYearError(''); }} /></label>
          <label className="admin-field"><span>End date</span><input type="date" min={`${seed.firstYear + 1}-01-01`} max={`${seed.firstYear + 1}-12-31`} value={endsOn} onChange={(event) => { setEndsOn(event.target.value); setYearError(''); }} /></label>
        </div>
        {yearError ? <p className="admin-field-error" role="alert">{yearError}</p> : <p className="admin-field-help">Dates must stay inside the selected academic year, and the end date must be later than the start date.</p>}
      </div>
      <div className="admin-form-actions"><button type="button" className="admin-button-primary" disabled={saving || !yearName || !startsOn || !endsOn} onClick={handleSaveYear}>{saving ? 'Saving…' : 'Save academic year'}</button></div>
    </SetupSection>

    <SetupSection id="system" number={2} title="School system" description="Choose the standards structure used by this school." summary={selectedSystemLabel} open={openSection === 'system'} onToggle={toggleSection}>
      <div className="school-system-grid" role="radiogroup" aria-label="Available school systems">
        {SCHOOL_SYSTEMS.map((system) => <label key={system.code} className={academicSystem === system.code ? 'is-selected' : ''}><input type="radio" name="school-system" value={system.code} checked={academicSystem === system.code} onChange={() => setAcademicSystem(system.code)} /><span><strong>{system.label}</strong><small>{system.description}</small><b>Available</b></span></label>)}
      </div>
      <p className="admin-field-help">Subject and question availability below comes from the reviewed Brains Heist content currently published for each grade level.</p>
      <div className="admin-form-actions"><button type="button" className="admin-button-primary" disabled={saving || !academicSystem} onClick={handleSaveSystem}>{saving ? 'Saving…' : 'Save school system'}</button></div>
    </SetupSection>

    <SetupSection id="grades" number={3} title="Grade levels and subjects" description="Define what each grade level teaches." summary={gradeSummary} open={openSection === 'grades'} onToggle={toggleSection}>
      <div className="grade-plan-toolbar"><label className="admin-field"><span>Grade level</span><select value={activeGrade} onChange={(event) => setActiveGrade(Number(event.target.value))}>{GRADES.map((grade) => <option key={grade} value={grade}>Grade {grade}{configuredGrades.includes(grade) ? ' · configured' : ''}</option>)}</select></label><div className="grade-plan-status">{configuredGrades.includes(activeGrade) ? <span className="is-complete">Grade plan saved</span> : <span>Not configured yet</span>}</div></div>
      {framework && subjectsForGrade.length ? <div className="subject-choice-grid">{subjectsForGrade.map((subject) => {
        const key = `${activeGrade}:${subject.academicSubjectId}`;
        const requirement = requirements[key];
        const scope = subject.scopes.find((item) => item.gradeLevel === activeGrade);
        return <article key={subject.academicSubjectId} className={`subject-choice-card ${requirement ? 'is-selected' : ''}`}><label><input type="checkbox" checked={Boolean(requirement)} onChange={() => toggleSubject(subject.academicSubjectId)} /><span><strong>{subject.name}</strong><small>{scope?.approvedQuestionCount ?? 0} approved questions · {scope?.objectiveCount ?? 0} objectives</small></span></label>{requirement ? <label className="subject-requirement"><span>Student access</span><select value={requirement} onChange={(event) => setRequirements((current) => ({ ...current, [key]: event.target.value as Requirement }))}><option value="required">Required for whole grade</option><option value="elective">Elective — selected students</option></select></label> : null}</article>;
      })}</div> : <div className="admin-empty-state"><h3>No published subjects for Grade {activeGrade}</h3><p>Choose another grade level or publish reviewed content before configuring this grade.</p></div>}
      <div className="admin-form-actions"><button type="button" className="admin-button-primary" disabled={saving || !yearId || !framework || selectedCount === 0} onClick={handleSaveGrade}>{saving ? 'Saving…' : `Save Grade ${activeGrade} plan`}</button></div>
      {!yearId ? <p className="admin-muted">Save the academic year before configuring grade levels.</p> : null}
    </SetupSection>

    <SetupSection id="electives" number={4} title="Elective enrolment" description="Give registered students access to elective subjects." summary={electiveSummary} open={openSection === 'electives'} onToggle={toggleSection}>
      <div className="admin-access-note"><strong>Existing students only</strong><span>This does not create student accounts. Required subjects already reach every student in the grade level.</span></div>
      <div className="elective-filter-grid">
        <label className="admin-field"><span>Grade level</span><select value={configuredGrades.length ? electiveGrade : ''} disabled={!configuredGrades.length} onChange={(event) => { setElectiveGrade(Number(event.target.value)); setElectiveStudentId(''); setElectiveSubjectId(''); }}><option value="">No configured grade levels</option>{configuredGrades.map((grade) => <option key={grade} value={grade}>Grade {grade}</option>)}</select></label>
        <label className="admin-field admin-field-wide"><span>Find registered student</span><input type="search" value={electiveSearch} onChange={(event) => { setElectiveSearch(event.target.value); setElectiveStudentId(''); }} placeholder="Search by name, username or email" /></label>
      </div>
      <div className="admin-form-grid">
        <label className="admin-field admin-field-wide"><span>Student</span><select value={electiveStudentId} onChange={(event) => setElectiveStudentId(event.target.value)}><option value="">{electiveStudents.length ? 'Choose matching student' : `No Grade ${electiveGrade} students match`}</option>{electiveStudents.map((student: { user_id: string; username: string; full_name?: string | null }) => <option key={student.user_id} value={student.user_id}>{student.full_name || student.username}</option>)}</select></label>
        <label className="admin-field admin-field-wide"><span>Elective subject</span><select value={electiveSubjectId} onChange={(event) => setElectiveSubjectId(event.target.value)}><option value="">{electiveOfferings.length ? 'Choose elective' : 'No electives configured for this grade level'}</option>{electiveOfferings.map((offering) => <option key={`${offering.gradeLevel}:${offering.academicSubjectId}`} value={offering.academicSubjectId}>{offering.subjectName}</option>)}</select></label>
      </div>
      <div className="admin-form-actions"><button type="button" className="admin-button-primary" disabled={saving || !electiveStudentId || !electiveSubjectId} onClick={handleAddElective}>Add elective access</button></div>
    </SetupSection>

    <SetupSection id="next" number={5} title="Classes and teaching" description="Continue with student placement and teacher assignments." summary={`${classes.length} active class${classes.length === 1 ? '' : 'es'}`} open={openSection === 'next'} onToggle={toggleSection}>
      <div className="admin-access-note"><strong>Next step</strong><span>Each saved grade plan creates its first class. Use Classes &amp; Registration for extra class sections and student placement, then assign teachers to the subjects selected for each grade level.</span></div>
    </SetupSection>
  </div>;
};

export default AcademicSetupPanel;
