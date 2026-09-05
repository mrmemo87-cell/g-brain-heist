import React, { useEffect, useMemo, useState } from 'react';
import {
  ensureGradeClass,
  fetchAcademicRosterReadiness,
  confirmAcademicRoster,
  fetchSchoolAcademicSetup,
  fetchSchoolAcademicSystem,
  saveAcademicTerm,
  saveAcademicYear,
  saveSchoolAcademicSystem,
  saveSubjectOfferings,
  seedCurrentStudentEnrolments,
  setStudentElective,
  type AcademicFrameworkSetup,
  type AcademicRosterReadiness,
  type SchoolAcademicSetup,
  type SchoolAcademicSystem,
} from '../../services/schoolAcademicSetupService';
import { useSchoolAdmin } from './SchoolAdminContext';

const GRADES = Array.from({ length: 12 }, (_, index) => index + 1);
const DAY_MS = 24 * 60 * 60 * 1000;

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

const parseIsoDate = (value: string) => new Date(`${value}T00:00:00Z`);
const toIsoDate = (value: Date) => value.toISOString().slice(0, 10);
const addDays = (value: string, days: number) => {
  const date = parseIsoDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return toIsoDate(date);
};

type Requirement = 'required' | 'elective';
type SectionId = 'year' | 'terms' | 'system' | 'grades' | 'electives' | 'roster' | 'next';

type AcademicTermDraft = {
  id: string | null;
  name: string;
  sequence: number;
  startsOn: string;
  endsOn: string;
};

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

const buildBalancedTerms = (startsOn: string, endsOn: string, count: number, label: 'Term' | 'Semester'): AcademicTermDraft[] => {
  const start = parseIsoDate(startsOn).getTime();
  const end = parseIsoDate(endsOn).getTime();
  const totalDays = Math.floor((end - start) / DAY_MS) + 1;
  const baseLength = Math.floor(totalDays / count);
  let cursor = startsOn;

  return Array.from({ length: count }, (_, index) => {
    const remainingExtraDay = index < (totalDays % count) ? 1 : 0;
    const length = baseLength + remainingExtraDay;
    const termStart = cursor;
    const termEnd = index === count - 1 ? endsOn : addDays(termStart, length - 1);
    cursor = addDays(termEnd, 1);
    return {
      id: null,
      name: `${label} ${index + 1}`,
      sequence: index + 1,
      startsOn: termStart,
      endsOn: termEnd,
    };
  });
};

const AcademicSetupPanel: React.FC = () => {
  const { school, students, classes = [], addToast, loadAdminTools } = useSchoolAdmin();
  const seed = useMemo(academicYearSeed, []);
  const [setup, setSetup] = useState<SchoolAcademicSetup | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingTermIndex, setSavingTermIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openSection, setOpenSection] = useState<SectionId | null>('year');
  const [yearName, setYearName] = useState(seed.current);
  const [startsOn, setStartsOn] = useState(seed.startsOn);
  const [endsOn, setEndsOn] = useState(seed.endsOn);
  const [yearId, setYearId] = useState('');
  const [yearError, setYearError] = useState('');
  const [termDrafts, setTermDrafts] = useState<AcademicTermDraft[]>([]);
  const [termErrors, setTermErrors] = useState<Record<number, string>>({});
  const [academicSystem, setAcademicSystem] = useState<SchoolAcademicSystem | null>(null);
  const [activeGrade, setActiveGrade] = useState(6);
  const [requirements, setRequirements] = useState<Record<string, Requirement>>({});
  const [electiveGrade, setElectiveGrade] = useState(6);
  const [electiveSearch, setElectiveSearch] = useState('');
  const [electiveStudentId, setElectiveStudentId] = useState('');
  const [electiveSubjectId, setElectiveSubjectId] = useState('');
  const [rosterReadiness, setRosterReadiness] = useState<AcademicRosterReadiness | null>(null);
  const [rosterLoading, setRosterLoading] = useState(false);

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
        const currentTerms = next.terms
          .filter((term) => term.academicYearId === currentYear.id)
          .sort((left, right) => left.sequence - right.sequence)
          .map((term) => ({
            id: term.id,
            name: term.name,
            sequence: term.sequence,
            startsOn: term.startsOn,
            endsOn: term.endsOn,
          }));
        setTermDrafts(currentTerms);
        setTermErrors({});
        setOpenSection((section) => section === 'year' ? (currentTerms.length ? null : 'terms') : section);
      } else {
        setTermDrafts([]);
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

  useEffect(() => {
    if (!yearId) {
      setRosterReadiness(null);
      return;
    }
    let cancelled = false;
    setRosterLoading(true);
    void fetchAcademicRosterReadiness(school.id, yearId)
      .then((next) => { if (!cancelled) setRosterReadiness(next); })
      .catch((readinessError) => {
        console.error('Failed to load academic roster readiness', readinessError);
        if (!cancelled) setRosterReadiness(null);
      })
      .finally(() => { if (!cancelled) setRosterLoading(false); });
    return () => { cancelled = true; };
  }, [classes, school.id, students, yearId]);

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
    setTermDrafts([]);
    setTermErrors({});
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
      setOpenSection('terms');
      addToast('Academic year saved. Now define the reporting terms.', 'success');
      await load();
    } catch (saveError) {
      addToast(saveError instanceof Error ? saveError.message : 'Academic year could not be saved.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const validateTerm = (draft: AcademicTermDraft, index: number) => {
    const name = draft.name.trim();
    if (!yearId) return 'Save the academic year before configuring terms.';
    if (!name) return 'Enter a term name.';
    if (!draft.startsOn || !draft.endsOn) return 'Choose both a start and end date.';
    if (draft.startsOn < startsOn || draft.endsOn > endsOn) return `Keep the term inside ${formatShortDate(startsOn)}–${formatShortDate(endsOn)}.`;
    if (draft.endsOn < draft.startsOn) return 'The end date must be on or after the start date.';
    if (draft.sequence < 1) return 'Sequence must start at 1.';

    const conflict = termDrafts.find((other, otherIndex) => {
      if (otherIndex === index) return false;
      if (other.sequence === draft.sequence) return true;
      if (other.name.trim().toLowerCase() === name.toLowerCase()) return true;
      return draft.startsOn <= other.endsOn && draft.endsOn >= other.startsOn;
    });
    if (!conflict) return '';
    if (conflict.sequence === draft.sequence) return `Sequence ${draft.sequence} is already used.`;
    if (conflict.name.trim().toLowerCase() === name.toLowerCase()) return `“${name}” is already used.`;
    return `Dates overlap with ${conflict.name}.`;
  };

  const updateTermDraft = (index: number, patch: Partial<AcademicTermDraft>) => {
    setTermDrafts((current) => current.map((term, termIndex) => termIndex === index ? { ...term, ...patch } : term));
    setTermErrors((current) => {
      const next = { ...current };
      delete next[index];
      return next;
    });
  };

  const applyTermTemplate = (count: number, label: 'Term' | 'Semester') => {
    if (!yearId) {
      addToast('Save the academic year first.', 'info');
      return;
    }
    if (termDrafts.some((term) => term.id)) {
      addToast('A saved term calendar already exists. Edit those dates directly to preserve reporting history.', 'info');
      return;
    }
    setTermDrafts(buildBalancedTerms(startsOn, endsOn, count, label));
    setTermErrors({});
  };

  const addTermDraft = () => {
    if (!yearId) {
      addToast('Save the academic year first.', 'info');
      return;
    }
    const sequence = termDrafts.reduce((highest, term) => Math.max(highest, term.sequence), 0) + 1;
    const ordered = [...termDrafts].sort((left, right) => left.sequence - right.sequence);
    const previousEnd = ordered.at(-1)?.endsOn;
    const nextStart = previousEnd && previousEnd < endsOn ? addDays(previousEnd, 1) : startsOn;
    setTermDrafts((current) => [...current, {
      id: null,
      name: `Term ${sequence}`,
      sequence,
      startsOn: nextStart,
      endsOn,
    }]);
  };

  const removeUnsavedTerm = (index: number) => {
    setTermDrafts((current) => current.filter((_, termIndex) => termIndex !== index));
    setTermErrors({});
  };

  const handleSaveTerm = async (index: number) => {
    const draft = termDrafts[index];
    if (!draft) return;
    const validationMessage = validateTerm(draft, index);
    setTermErrors((current) => ({ ...current, [index]: validationMessage }));
    if (validationMessage) return;

    setSavingTermIndex(index);
    try {
      await saveAcademicTerm({
        schoolId: school.id,
        academicYearId: yearId,
        termId: draft.id,
        name: draft.name.trim(),
        sequence: draft.sequence,
        startsOn: draft.startsOn,
        endsOn: draft.endsOn,
      });
      const refreshedSetup = await fetchSchoolAcademicSetup(school.id);
      const savedTerm = refreshedSetup.terms.find((term) => (
        term.academicYearId === yearId
        && term.sequence === draft.sequence
        && term.name.trim().toLowerCase() === draft.name.trim().toLowerCase()
      ));
      setSetup(refreshedSetup);
      setTermDrafts((current) => current.map((term, termIndex) => (
        termIndex === index ? { ...term, id: savedTerm?.id || term.id, name: draft.name.trim() } : term
      )));
      addToast(`${draft.name.trim()} saved.`, 'success');
    } catch (saveError) {
      addToast(saveError instanceof Error ? saveError.message : 'Academic term could not be saved.', 'error');
    } finally {
      setSavingTermIndex(null);
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

  const rosterStudentLabel = (studentId: string) => {
    const student = (students || []).find((item: { user_id?: string; id?: string }) => item.user_id === studentId || item.id === studentId) as { full_name?: string | null; username?: string; email?: string } | undefined;
    return student?.full_name || student?.username || student?.email || `${studentId.slice(0, 8)}…`;
  };

  const handleConfirmRoster = async () => {
    if (!yearId || !rosterReadiness?.ready) return;
    setSaving(true);
    try {
      const result = await confirmAcademicRoster(school.id, yearId);
      addToast(`${result.confirmedEnrolments ?? 0} current-year student enrolments confirmed.`, 'success');
      const next = await fetchAcademicRosterReadiness(school.id, yearId);
      setRosterReadiness(next);
      await loadAdminTools(school.id);
    } catch (confirmError) {
      addToast(confirmError instanceof Error ? confirmError.message : 'The academic roster could not be confirmed.', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <section className="admin-form-card"><p>Loading academic setup…</p></section>;
  if (error || !setup) return <section className="admin-form-card"><h3>Academic setup unavailable</h3><p>{error}</p><button type="button" className="admin-button-primary" onClick={() => void load()}>Try again</button></section>;

  const savedTerms = setup.terms.filter((term) => term.academicYearId === yearId).sort((left, right) => left.sequence - right.sequence);
  const yearSummary = selectedYear ? `${selectedYear.name} · ${formatShortDate(selectedYear.startsOn)}–${formatShortDate(selectedYear.endsOn)}` : 'Not configured';
  const termSummary = !yearId ? 'Save academic year first' : savedTerms.length ? `${savedTerms.length} reporting period${savedTerms.length === 1 ? '' : 's'} · ${savedTerms.map((term) => term.name).join(' · ')}` : 'Not configured';
  const gradeSummary = configuredGrades.length ? `${configuredGrades.length} grade levels · ${configuredSubjectNames.size} subjects` : 'No grade levels configured';
  const electiveSummary = `${setup.electiveEnrolments.length} active student enrolment${setup.electiveEnrolments.length === 1 ? '' : 's'}`;
  const rosterConfirmed = Boolean(rosterReadiness?.ready && rosterReadiness.estimatedEnrolments === 0 && rosterReadiness.confirmedEnrolments === rosterReadiness.activeStudentMembers);
  const rosterSummary = rosterLoading
    ? 'Checking roster…'
    : rosterConfirmed
      ? `${rosterReadiness?.confirmedEnrolments ?? 0} students confirmed`
      : rosterReadiness?.ready
        ? 'Ready to confirm'
        : rosterReadiness
          ? `${rosterReadiness.placedStudents}/${rosterReadiness.activeStudentMembers} students placed · review needed`
          : 'Roster check unavailable';

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

    <SetupSection id="terms" number={2} title="Terms & reporting periods" description="Define exactly when each term starts and ends for reporting." summary={termSummary} open={openSection === 'terms'} onToggle={toggleSection}>
      {!yearId ? <div className="admin-empty-state"><h3>Save the academic year first</h3><p>Terms are tied to one academic year so reports, assignments and academic evidence resolve to the correct period.</p></div> : <>
        <div className="admin-access-note"><strong>Reporting calendar</strong><span>Use terms, semesters or custom reporting periods. Dates cannot overlap and must stay inside {yearName}. Existing saved periods can be edited without recreating them.</span></div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '.75rem', padding: '0 1.25rem 1rem' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem' }}>
            <button type="button" className="admin-button-ghost admin-button-small" onClick={() => applyTermTemplate(3, 'Term')} disabled={termDrafts.some((term) => Boolean(term.id))}>3-term template</button>
            <button type="button" className="admin-button-ghost admin-button-small" onClick={() => applyTermTemplate(2, 'Semester')} disabled={termDrafts.some((term) => Boolean(term.id))}>2-semester template</button>
          </div>
          <button type="button" className="admin-button-ghost admin-button-small" onClick={addTermDraft}>+ Add reporting period</button>
        </div>
        {termDrafts.length ? <div style={{ display: 'grid', gap: '.85rem', padding: '0 1.25rem 1.25rem' }}>
          {termDrafts.map((term, index) => {
            const isSaved = Boolean(term.id);
            const validation = termErrors[index];
            return <article key={term.id || `term-draft-${index}`} style={{ overflow: 'hidden', border: '1px solid #dbe4ee', borderRadius: '.85rem', background: '#fff' }}>
              <div className="admin-card-heading" style={{ alignItems: 'center' }}>
                <div><h3 style={{ marginBottom: '.15rem' }}>{term.name || `Reporting period ${index + 1}`}</h3><p>{isSaved ? 'Saved reporting period' : 'Draft — review the dates before saving'}</p></div>
                <span style={{ display: 'inline-flex', alignItems: 'center', minHeight: '2rem', padding: '.3rem .65rem', borderRadius: '999px', background: isSaved ? '#ecfdf3' : '#eff6ff', color: isSaved ? '#166534' : '#1e3a8a', fontSize: '.68rem', fontWeight: 800 }}>{isSaved ? 'Configured' : 'Draft'}</span>
              </div>
              <div className="admin-form-grid" style={{ gridTemplateColumns: 'minmax(0,1.4fr) minmax(7rem,.55fr) minmax(10rem,1fr) minmax(10rem,1fr)' }}>
                <label className="admin-field"><span>Name <i>Required</i></span><input value={term.name} maxLength={60} onChange={(event) => updateTermDraft(index, { name: event.target.value })} placeholder="e.g. Term 1" /></label>
                <label className="admin-field"><span>Order</span><input type="number" min={1} max={12} value={term.sequence} onChange={(event) => updateTermDraft(index, { sequence: Math.max(1, Number(event.target.value) || 1) })} /></label>
                <label className="admin-field"><span>Start date</span><input type="date" min={startsOn} max={endsOn} value={term.startsOn} onChange={(event) => updateTermDraft(index, { startsOn: event.target.value })} /></label>
                <label className="admin-field"><span>End date</span><input type="date" min={startsOn} max={endsOn} value={term.endsOn} onChange={(event) => updateTermDraft(index, { endsOn: event.target.value })} /></label>
              </div>
              {validation ? <p className="admin-field-error" role="alert" style={{ margin: '-.35rem 1.25rem 1rem' }}>{validation}</p> : null}
              <div className="admin-form-actions" style={{ justifyContent: isSaved ? 'flex-end' : 'space-between' }}>
                {!isSaved ? <button type="button" className="admin-button-ghost" onClick={() => removeUnsavedTerm(index)}>Remove draft</button> : null}
                <button type="button" className="admin-button-primary" disabled={savingTermIndex !== null} onClick={() => void handleSaveTerm(index)}>{savingTermIndex === index ? 'Saving…' : isSaved ? 'Save changes' : 'Save reporting period'}</button>
              </div>
            </article>;
          })}
        </div> : <div className="admin-empty-state" style={{ paddingTop: '2.25rem' }}><h3>No reporting periods yet</h3><p>Start with a ready-made template or add a custom reporting period. Templates are only a starting point — every date remains editable.</p></div>}
        <p className="admin-field-help" style={{ padding: '0 1.25rem 1.25rem', marginTop: 0 }}>Tip: short holidays can sit between reporting periods. The system only prevents periods from overlapping.</p>
      </>}
    </SetupSection>

    <SetupSection id="system" number={3} title="School system" description="Choose the standards structure used by this school." summary={selectedSystemLabel} open={openSection === 'system'} onToggle={toggleSection}>
      <div className="school-system-grid" role="radiogroup" aria-label="Available school systems">
        {SCHOOL_SYSTEMS.map((system) => <label key={system.code} className={academicSystem === system.code ? 'is-selected' : ''}><input type="radio" name="school-system" value={system.code} checked={academicSystem === system.code} onChange={() => setAcademicSystem(system.code)} /><span><strong>{system.label}</strong><small>{system.description}</small><b>Available</b></span></label>)}
      </div>
      <p className="admin-field-help">Subject and question availability below comes from the reviewed Brains Heist content currently published for each grade level.</p>
      <div className="admin-form-actions"><button type="button" className="admin-button-primary" disabled={saving || !academicSystem} onClick={handleSaveSystem}>{saving ? 'Saving…' : 'Save school system'}</button></div>
    </SetupSection>

    <SetupSection id="grades" number={4} title="Grade levels and subjects" description="Define what each grade level teaches." summary={gradeSummary} open={openSection === 'grades'} onToggle={toggleSection}>
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

    <SetupSection id="electives" number={5} title="Elective enrolment" description="Give registered students access to elective subjects." summary={electiveSummary} open={openSection === 'electives'} onToggle={toggleSection}>
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

    <SetupSection id="roster" number={6} title="Confirm current-year roster" description="Verify current class placement before academic reporting treats it as confirmed." summary={rosterSummary} open={openSection === 'roster'} onToggle={toggleSection}>
      {rosterLoading ? <div className="admin-empty-state"><p>Checking current student placement…</p></div> : rosterReadiness ? <>
        <div className="admin-form-grid">
          <div className="admin-access-note"><strong>{rosterReadiness.placedStudents}/{rosterReadiness.activeStudentMembers} placed</strong><span>Active student memberships with a current class.</span></div>
          <div className="admin-access-note"><strong>{rosterReadiness.confirmedEnrolments} confirmed · {rosterReadiness.estimatedEnrolments} estimated</strong><span>Only confirmed placement should drive the new academic year.</span></div>
        </div>
        {rosterReadiness.ready ? <div className="admin-access-note"><strong>{rosterConfirmed ? 'Roster confirmed' : 'Ready to confirm'}</strong><span>{rosterConfirmed ? 'Current-year academic enrolments match the active class roster.' : 'No placement blockers remain. Confirming will update only current-year academic enrolments; historical assignments and results stay unchanged.'}</span></div> : <div className="admin-empty-state">
          <h3>Resolve roster blockers first</h3>
          <p>Confirmation is locked until every active student membership has one valid class placement and role data is consistent.</p>
          <div className="mt-3 space-y-2 text-left">
            {rosterReadiness.unplacedStudentIds.map((id) => <p key={`unplaced:${id}`}><strong>{rosterStudentLabel(id)}</strong> · no active class placement</p>)}
            {rosterReadiness.roleMismatchStudentIds.map((id) => <p key={`role:${id}`}><strong>{rosterStudentLabel(id)}</strong> · school student membership conflicts with account role</p>)}
            {rosterReadiness.multipleEnrolmentStudentIds.map((id) => <p key={`multiple:${id}`}><strong>{rosterStudentLabel(id)}</strong> · multiple current-year academic enrolments</p>)}
            {rosterReadiness.confirmedPlacementMismatchStudentIds.map((id) => <p key={`mismatch:${id}`}><strong>{rosterStudentLabel(id)}</strong> · confirmed academic enrolment does not match current class</p>)}
          </div>
        </div>}
        <div className="admin-form-actions"><button type="button" className="admin-button-primary" disabled={saving || !rosterReadiness.ready || rosterConfirmed} onClick={handleConfirmRoster}>{saving ? 'Confirming…' : rosterConfirmed ? 'Roster confirmed' : 'Confirm current-year roster'}</button></div>
      </> : <div className="admin-empty-state"><h3>Roster check unavailable</h3><p>Reload Academic Setup before confirming student placement.</p></div>}
    </SetupSection>

    <SetupSection id="next" number={7} title="Classes and teaching" description="Continue with student placement and teacher allocation." summary={`${classes.length} active class${classes.length === 1 ? '' : 'es'}`} open={openSection === 'next'} onToggle={toggleSection}>
      <div className="admin-access-note"><strong>Next step</strong><span>Use Classes &amp; Registration for student placement, then allocate teachers to the subjects selected for each grade level. Return here to confirm the roster once placement is complete.</span></div>
    </SetupSection>
  </div>;
};

export default AcademicSetupPanel;
