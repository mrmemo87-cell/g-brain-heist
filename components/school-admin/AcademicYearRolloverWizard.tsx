import React, { useEffect, useMemo, useState } from 'react';
import {
  fetchAcademicYearContinuity,
  type AcademicYearContinuity,
  type AcademicYearContinuityYear,
} from '../../services/academicYearContinuityService';
import {
  commitYearRollover,
  fetchLatestYearRollover,
  fetchYearRolloverPreview,
  prepareYearRollover,
  saveYearRolloverClassRoute,
  saveYearRolloverStudentDecision,
  yearRolloverErrorMessage,
  type YearRolloverClassRoute,
  type YearRolloverOutcome,
  type YearRolloverPreview,
  type YearRolloverRouteOutcome,
  type YearRolloverStudentDecision,
} from '../../services/yearRolloverService';
import { useSchoolAdmin } from './SchoolAdminContext';
import './AcademicYearRolloverWizard.css';

type WizardStep = 1 | 2 | 3 | 4;
type StudentFilter = 'review' | 'all' | 'promote' | 'repeat' | 'exit';
type RouteDraft = { outcome: YearRolloverRouteOutcome; targetClassId: string };
type StudentDraft = { outcome: YearRolloverOutcome; targetClassId: string; reason: string };

const STEPS: Array<{ step: WizardStep; label: string; helper: string }> = [
  { step: 1, label: 'Bridge', helper: 'Choose the years' },
  { step: 2, label: 'Routes', helper: 'Map every class' },
  { step: 3, label: 'Exceptions', helper: 'Review special cases' },
  { step: 4, label: 'Rehearsal', helper: 'Preview and launch' },
];

const OUTCOME_LABEL: Record<YearRolloverOutcome, string> = {
  promote: 'Promote one grade',
  repeat: 'Repeat current grade',
  already_promoted: 'Already promoted',
  graduate: 'Graduate',
  leave: 'Leave school',
  manual: 'Needs a decision',
};

const ROUTE_LABEL: Record<YearRolloverRouteOutcome, string> = {
  promote: 'Promote class',
  repeat: 'Repeat grade',
  graduate: 'Graduate class',
  manual: 'Review individually',
};

const AUTHORITY_LABEL = {
  academic_enrolment: 'Confirmed year roster',
  historical_assignment: 'Previous-year assignment history',
  current_placement: 'Current class fallback',
  profile_fallback: 'Student profile fallback',
  unresolved: 'No reliable source',
} as const;

const gradeNumber = (value?: string | null) => {
  const match = String(value || '').match(/\d+/);
  return match ? Number(match[0]) : null;
};
const metric = (value?: number) => new Intl.NumberFormat().format(value || 0);
const formatDate = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
};
const yearLabel = (year: AcademicYearContinuityYear) => `${year.name} · ${
  year.status === 'closed' ? 'Finished' : year.status === 'current' ? 'Current' : 'Planned'
}`;

const StatusPill: React.FC<{
  tone: 'ready' | 'review' | 'history' | 'active';
  children: React.ReactNode;
}> = ({ tone, children }) => <span className={`year-bridge-pill is-${tone}`}>{children}</span>;

const SummaryMetric: React.FC<{ value?: number; label: string; note?: string }> = ({ value, label, note }) => (
  <div className="year-bridge-summary-metric">
    <strong>{metric(value)}</strong><span>{label}</span>{note ? <small>{note}</small> : null}
  </div>
);

const AcademicYearRolloverWizard: React.FC = () => {
  const { school, addToast, loadAdminTools } = useSchoolAdmin();
  const [continuity, setContinuity] = useState<AcademicYearContinuity | null>(null);
  const [preview, setPreview] = useState<YearRolloverPreview | null>(null);
  const [sourceYearId, setSourceYearId] = useState('');
  const [targetYearId, setTargetYearId] = useState('');
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<WizardStep>(1);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [routeDrafts, setRouteDrafts] = useState<Record<string, RouteDraft>>({});
  const [studentDrafts, setStudentDrafts] = useState<Record<string, StudentDraft>>({});
  const [studentFilter, setStudentFilter] = useState<StudentFilter>('review');
  const [studentSearch, setStudentSearch] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [completion, setCompletion] = useState<YearRolloverPreview['completionSummary'] | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextContinuity, latest] = await Promise.all([
        fetchAcademicYearContinuity(school.id),
        fetchLatestYearRollover(school.id),
      ]);
      setContinuity(nextContinuity);
      setPreview(latest);
      if (latest?.plan) {
        setSourceYearId(latest.plan.sourceYear.id);
        setTargetYearId(latest.plan.targetYear.id);
        setCompletion(latest.plan.status === 'completed' ? latest.completionSummary || null : null);
      } else {
        const target = nextContinuity.years.find((year) => year.status === 'current')
          || nextContinuity.years.find((year) => year.status === 'planned')
          || nextContinuity.years[0];
        const source = nextContinuity.years
          .filter((year) => year.status === 'closed' && (!target || year.endsOn < target.startsOn))
          .sort((left, right) => right.endsOn.localeCompare(left.endsOn))[0];
        setTargetYearId(target?.id || '');
        setSourceYearId(source?.id || '');
      }
    } catch (loadError) {
      console.error('Failed to load Year Bridge', loadError);
      setError(yearRolloverErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [school.id]);
  useEffect(() => {
    if (!preview) return;
    setRouteDrafts(Object.fromEntries((preview.classRoutes || []).map((route) => [route.id, {
      outcome: route.outcome,
      targetClassId: route.targetClassId || '',
    }])));
    setStudentDrafts(Object.fromEntries((preview.students || []).map((student) => [student.id, {
      outcome: student.outcome,
      targetClassId: student.targetClassId || '',
      reason: student.overrideReason || '',
    }])));
  }, [preview]);

  const years = continuity?.years || [];
  const sourceYear = years.find((year) => year.id === sourceYearId) || null;
  const targetYear = years.find((year) => year.id === targetYearId) || null;
  const summary = preview?.summary;
  const completed = preview?.plan?.status === 'completed' || Boolean(completion);

  const classOptionsFor = (sourceGrade: string | null, outcome: YearRolloverOutcome | YearRolloverRouteOutcome) => {
    const source = gradeNumber(sourceGrade);
    if (source === null) return preview?.classOptions || [];
    const target = outcome === 'repeat' ? source : source + 1;
    return (preview?.classOptions || []).filter((item) => gradeNumber(item.gradeLevel) === target);
  };

  const filteredStudents = useMemo(() => {
    const query = studentSearch.trim().toLowerCase();
    return (preview?.students || []).filter((student) => {
      const matches = !query || [student.studentName, student.sourceClassCode, student.currentClassCode, student.targetClassCode]
        .some((value) => String(value || '').toLowerCase().includes(query));
      if (!matches) return false;
      if (studentFilter === 'review') return student.reviewState === 'needs_review' || student.outcome === 'manual';
      if (studentFilter === 'promote') return ['promote', 'already_promoted'].includes(student.outcome);
      if (studentFilter === 'repeat') return student.outcome === 'repeat';
      if (studentFilter === 'exit') return ['graduate', 'leave'].includes(student.outcome);
      return true;
    });
  }, [preview?.students, studentFilter, studentSearch]);

  const handlePrepare = async () => {
    if (!sourceYearId || !targetYearId) return;
    setBusyKey('prepare'); setError(null);
    try {
      const result = await prepareYearRollover({
        schoolId: school.id,
        sourceAcademicYearId: sourceYearId,
        targetAcademicYearId: targetYearId,
      });
      setPreview(result); setStep(2); setOpen(true); setConfirmation('');
      addToast('Year Bridge rehearsal prepared. Review the class routes next.', 'success');
    } catch (prepareError) {
      const message = yearRolloverErrorMessage(prepareError);
      setError(message); addToast(message, 'error');
    } finally { setBusyKey(''); }
  };

  const handleRefresh = async () => {
    if (!preview?.plan?.id) return;
    setBusyKey('refresh');
    try {
      setPreview(await fetchYearRolloverPreview(preview.plan.id));
      setConfirmation('');
      addToast('Rollover rehearsal refreshed against the live roster.', 'success');
    } catch (refreshError) { addToast(yearRolloverErrorMessage(refreshError), 'error'); }
    finally { setBusyKey(''); }
  };

  const handleSaveRoute = async (route: YearRolloverClassRoute) => {
    if (!preview?.plan?.id) return;
    const draft = routeDrafts[route.id];
    if (!draft) return;
    const destination = draft.outcome === 'graduate' ? 'graduation' : draft.outcome === 'manual'
      ? 'individual review'
      : preview.classOptions?.find((item) => item.id === draft.targetClassId)?.classCode || 'the selected class';
    setBusyKey(`route:${route.id}`);
    try {
      setPreview(await saveYearRolloverClassRoute({
        planId: preview.plan.id,
        sourceClassId: route.sourceClassId,
        outcome: draft.outcome,
        targetClassId: ['promote', 'repeat'].includes(draft.outcome) ? draft.targetClassId : null,
        reason: `Approved ${route.sourceClassCode} → ${destination} for the ${preview.plan.sourceYear.name} to ${preview.plan.targetYear.name} rollover.`,
      }));
      setConfirmation(''); addToast(`${route.sourceClassCode} route approved.`, 'success');
    } catch (routeError) { addToast(yearRolloverErrorMessage(routeError), 'error'); }
    finally { setBusyKey(''); }
  };

  const handleSaveStudent = async (student: YearRolloverStudentDecision) => {
    if (!preview?.plan?.id) return;
    const draft = studentDrafts[student.id];
    if (!draft) return;
    const destination = draft.outcome === 'graduate' ? 'graduation' : draft.outcome === 'leave' ? 'leaving school'
      : preview.classOptions?.find((item) => item.id === draft.targetClassId)?.classCode || OUTCOME_LABEL[draft.outcome];
    setBusyKey(`student:${student.id}`);
    try {
      setPreview(await saveYearRolloverStudentDecision({
        planId: preview.plan.id,
        studentId: student.studentId,
        outcome: draft.outcome,
        targetClassId: ['promote', 'repeat', 'already_promoted'].includes(draft.outcome) ? draft.targetClassId : null,
        reason: draft.reason.trim() || `${student.studentName}: reviewed for ${destination} during the ${preview.plan.targetYear.name} rollover.`,
      }));
      setConfirmation(''); addToast(`${student.studentName} reviewed.`, 'success');
    } catch (studentError) { addToast(yearRolloverErrorMessage(studentError), 'error'); }
    finally { setBusyKey(''); }
  };

  const handleCommit = async () => {
    if (!preview?.plan?.id || !preview.previewHash) return;
    setBusyKey('commit');
    try {
      const result = await commitYearRollover({
        planId: preview.plan.id,
        previewHash: preview.previewHash,
        confirmation,
      });
      setCompletion(result.summary || null);
      setPreview((current) => current ? {
        ...current,
        plan: current.plan ? { ...current.plan, status: 'completed' } : null,
        completionSummary: result.summary,
        canCommit: false,
      } : current);
      await loadAdminTools(school.id);
      addToast(`${result.summary?.studentsProcessed || 0} student records moved safely into ${result.summary?.targetYearName || 'the new year'}.`, 'success');
    } catch (commitError) {
      const message = yearRolloverErrorMessage(commitError);
      addToast(message, 'error');
      if (message.toLowerCase().includes('changed')) await handleRefresh();
    } finally { setBusyKey(''); }
  };

  if (loading) return <section className="year-bridge-card is-loading" aria-busy="true"><span /><span /><span /></section>;
  if (!continuity || years.length < 2) return (
    <section className="year-bridge-card is-unavailable">
      <p className="year-bridge-eyebrow">Year Bridge</p><h3>Create the next academic year first</h3>
      <p>The rollover studio becomes available after the finished and incoming academic years both exist.</p>
    </section>
  );

  if (completed) {
    const result = completion || preview?.completionSummary || {};
    return (
      <section className="year-bridge-card is-complete" data-testid="year-rollover-command-center">
        <div className="year-bridge-complete-mark" aria-hidden="true"><span /></div>
        <div className="year-bridge-complete-copy">
          <p className="year-bridge-eyebrow">Year Bridge · Launch complete</p>
          <h3>{result.targetYearName || preview?.plan?.targetYear.name} is ready</h3>
          <p>{metric(result.studentsProcessed)} student records were processed atomically. The finished year remains protected and fully available in history.</p>
          <div className="year-bridge-complete-stats">
            <span><strong>{metric((result.promoted || 0) + (result.alreadyPromoted || 0))}</strong> moved forward</span>
            <span><strong>{metric(result.repeating)}</strong> repeating</span>
            <span><strong>{metric(result.graduated)}</strong> graduated</span>
            <span><strong>{metric(result.schoolAccessReviewsRequired)}</strong> access reviews</span>
          </div>
        </div>
      </section>
    );
  }

  const reviewCount = summary?.needsReview || 0;
  const routeReviewCount = (preview?.classRoutes || []).filter((route) => (
    route.outcome === 'manual' || route.confidence !== 'high' || !route.targetClassId
  )).length;

  return (
    <section className={`year-bridge-card ${open ? 'is-open' : ''}`} data-testid="year-rollover-command-center">
      <header className="year-bridge-hero">
        <div className="year-bridge-hero-copy">
          <p className="year-bridge-eyebrow">Year Bridge · Promotion Command Center</p>
          <h3>Move every learner forward without losing a single chapter.</h3>
          <p>Build a class map, review exceptions, run a live rehearsal, then launch the new year in one protected transaction.</p>
        </div>
        <div className="year-bridge-hero-actions">
          <StatusPill tone={preview ? 'active' : 'history'}>{preview ? 'Rehearsal saved' : 'No changes until launch'}</StatusPill>
          <button type="button" className="admin-button-primary" onClick={() => setOpen((value) => !value)}>
            {open ? 'Close Year Bridge' : preview ? 'Continue rollover' : 'Open Year Bridge'}
          </button>
        </div>
      </header>
      <div className="year-bridge-safety-strip" aria-label="Rollover safeguards">
        <span>Finished-year records stay read-only</span><span>Exceptions stop the launch</span>
        <span>Final rehearsal is drift protected</span><span>Launch is atomic</span>
      </div>

      {!open ? (
        <div className="year-bridge-collapsed-summary">
          <div><strong>{sourceYear?.name || 'Finished year'}</strong><span>protected history</span></div><i aria-hidden="true" />
          <div><strong>{targetYear?.name || 'New year'}</strong><span>clean destination</span></div>
          {summary ? <small>{metric(summary.totalStudents)} students · {metric(summary.needsReview)} need review</small> : null}
        </div>
      ) : (
        <div className="year-bridge-workspace">
          <nav className="year-bridge-stepper" aria-label="Year rollover steps">
            {STEPS.map((item) => (
              <button key={item.step} type="button" className={step === item.step ? 'is-current' : step > item.step ? 'is-complete' : ''}
                disabled={item.step > 1 && !preview} onClick={() => setStep(item.step)}>
                <span>{item.step}</span><div><strong>{item.label}</strong><small>{item.helper}</small></div>
              </button>
            ))}
          </nav>
          {error ? <div className="year-bridge-alert is-blocker" role="alert"><strong>Year Bridge needs attention</strong><span>{error}</span></div> : null}

          {step === 1 ? (
            <div className="year-bridge-panel">
              <div className="year-bridge-panel-heading"><div><span>01 · Build the bridge</span><h4>Choose the finished year and its clean destination</h4><p>Nothing moves during this step. The system only prepares a rehearsal from the latest reliable roster evidence.</p></div></div>
              <div className="year-bridge-year-grid">
                <label className="year-bridge-year-card"><span>Finished academic year</span>
                  <select value={sourceYearId} onChange={(event) => setSourceYearId(event.target.value)}><option value="">Choose finished year</option>{years.filter((year) => year.status !== 'planned').map((year) => <option key={year.id} value={year.id}>{yearLabel(year)}</option>)}</select>
                  {sourceYear ? <small>{formatDate(sourceYear.startsOn)} – {formatDate(sourceYear.endsOn)} · history remains read-only</small> : null}
                </label>
                <div className="year-bridge-arc" aria-hidden="true"><span /><b>Rehearse</b><span /></div>
                <label className="year-bridge-year-card is-target"><span>Incoming academic year</span>
                  <select value={targetYearId} onChange={(event) => setTargetYearId(event.target.value)}><option value="">Choose incoming year</option>{years.filter((year) => year.status !== 'closed').map((year) => <option key={year.id} value={year.id}>{yearLabel(year)}</option>)}</select>
                  {targetYear ? <small>{formatDate(targetYear.startsOn)} – {formatDate(targetYear.endsOn)} · new results begin from zero</small> : null}
                </label>
              </div>
              <div className="year-bridge-value-grid">
                <article><strong>Smart class matching</strong><p>Sections such as 8A → 9A are suggested automatically, while merges and missing classes are flagged.</p></article>
                <article><strong>Student-by-student exceptions</strong><p>Repeaters, graduates, leavers, new joiners and changed placements stay visible for review.</p></article>
                <article><strong>One safe launch</strong><p>No partial promotion. Every placement and new-year enrolment succeeds together or nothing changes.</p></article>
              </div>
              <div className="year-bridge-actions"><button type="button" className="admin-button-primary" disabled={!sourceYearId || !targetYearId || busyKey === 'prepare'} onClick={() => void handlePrepare()}>{busyKey === 'prepare' ? 'Building rehearsal…' : preview ? 'Rebuild live rehearsal' : 'Build rollover rehearsal'}</button></div>
            </div>
          ) : null}

          {step === 2 && preview ? (
            <div className="year-bridge-panel">
              <div className="year-bridge-panel-heading is-split"><div><span>02 · Class routes</span><h4>Approve the route each class will take</h4><p>High-confidence section matches are ready. Merges, missing classes and final grades remain visible.</p></div><div className="year-bridge-heading-stat"><strong>{metric(preview.classRoutes?.length)}</strong><span>class routes</span><small>{metric(routeReviewCount)} need review</small></div></div>
              <div className="year-bridge-route-list">
                {(preview.classRoutes || []).map((route) => {
                  const draft = routeDrafts[route.id] || { outcome: route.outcome, targetClassId: route.targetClassId || '' };
                  const routeStudentReviewCount = (preview.students || []).filter((student) => student.sourceClassId === route.sourceClassId && (student.reviewState === 'needs_review' || student.outcome === 'manual')).length;
                  const needsApproval = route.confidence !== 'high' || route.outcome === 'manual' || !route.targetClassId || route.isOverridden || routeStudentReviewCount > 0;
                  const options = classOptionsFor(route.sourceGrade, draft.outcome);
                  return (
                    <article key={route.id} className={`year-bridge-route ${needsApproval ? 'needs-review' : 'is-ready'}`}>
                      <div className="year-bridge-route-source"><small>From</small><strong>{route.sourceClassCode}</strong><span>Grade {route.sourceGrade || '—'} · {metric(route.studentCount)} students</span></div>
                      <div className="year-bridge-route-line" aria-hidden="true"><i /><b>{route.confidence}</b><i /></div>
                      <div className="year-bridge-route-controls">
                        <label><span>Outcome</span><select value={draft.outcome} onChange={(event) => setRouteDrafts((current) => ({ ...current, [route.id]: { outcome: event.target.value as YearRolloverRouteOutcome, targetClassId: '' } }))}>{(Object.keys(ROUTE_LABEL) as YearRolloverRouteOutcome[]).map((value) => <option key={value} value={value}>{ROUTE_LABEL[value]}</option>)}</select></label>
                        {['promote', 'repeat'].includes(draft.outcome) ? <label><span>Destination class</span><select value={draft.targetClassId} onChange={(event) => setRouteDrafts((current) => ({ ...current, [route.id]: { ...draft, targetClassId: event.target.value } }))}><option value="">Choose class</option>{options.map((item) => <option key={item.id} value={item.id}>{item.classCode} · Grade {item.gradeLevel} · {item.studentCount} now</option>)}</select></label> : <div className="year-bridge-route-destination"><span>Destination</span><strong>{draft.outcome === 'graduate' ? 'Graduation review' : 'Student review queue'}</strong></div>}
                      </div>
                      <div className="year-bridge-route-health"><StatusPill tone={needsApproval ? 'review' : 'ready'}>{needsApproval ? routeStudentReviewCount ? `${routeStudentReviewCount} student${routeStudentReviewCount === 1 ? '' : 's'} to confirm` : 'Review route' : 'Smart match'}</StatusPill><p>{route.rationale}</p><div><span>{metric(route.projectedTargetCount)} projected</span><span className={route.teacherCount ? '' : 'is-warning'}>{route.teacherCount ? `${route.teacherCount} teachers` : 'Staffing needed'}</span><span className={route.subjectOfferingCount ? '' : 'is-warning'}>{route.subjectOfferingCount ? `${route.subjectOfferingCount} subjects` : 'Subject plan needed'}</span></div></div>
                      <button type="button" className="admin-button-ghost admin-button-small" disabled={busyKey === `route:${route.id}` || (['promote', 'repeat'].includes(draft.outcome) && !draft.targetClassId)} onClick={() => void handleSaveRoute(route)}>{busyKey === `route:${route.id}` ? 'Saving…' : routeStudentReviewCount ? `Approve route + ${routeStudentReviewCount}` : needsApproval ? 'Approve route' : 'Save adjustment'}</button>
                    </article>
                  );
                })}
              </div>
              <div className="year-bridge-actions is-between"><button type="button" className="admin-button-ghost" onClick={() => setStep(1)}>Back</button><button type="button" className="admin-button-primary" onClick={() => setStep(3)}>Review student exceptions</button></div>
            </div>
          ) : null}

          {step === 3 && preview ? (
            <div className="year-bridge-panel">
              <div className="year-bridge-panel-heading is-split"><div><span>03 · Student exceptions</span><h4>Give every special case a human decision</h4><p>Smart suggestions stay grouped. Only uncertain or overridden records need individual attention.</p></div><div className="year-bridge-heading-stat"><strong>{metric(reviewCount)}</strong><span>need review</span><small>{metric(summary?.autoReady)} smart-ready</small></div></div>
              <div className="year-bridge-student-toolbar"><div className="year-bridge-filter-tabs">{([
                ['review', `Needs review · ${reviewCount}`], ['all', 'All students'], ['promote', 'Moving forward'], ['repeat', 'Repeating'], ['exit', 'Graduating / leaving'],
              ] as Array<[StudentFilter, string]>).map(([value, label]) => <button key={value} type="button" className={studentFilter === value ? 'is-active' : ''} onClick={() => setStudentFilter(value)}>{label}</button>)}</div><label><span>Find student</span><input type="search" value={studentSearch} onChange={(event) => setStudentSearch(event.target.value)} placeholder="Name or class" /></label></div>
              {filteredStudents.length ? <div className="year-bridge-student-list">{filteredStudents.map((student) => {
                const draft = studentDrafts[student.id] || { outcome: student.outcome, targetClassId: student.targetClassId || '', reason: '' };
                const needsTarget = ['promote', 'repeat', 'already_promoted'].includes(draft.outcome);
                const options = draft.outcome === 'already_promoted' ? (preview.classOptions || []).filter((item) => item.id === student.liveCurrentClassId) : classOptionsFor(student.sourceGrade, draft.outcome);
                return (
                  <article key={student.id} className={student.reviewState === 'needs_review' ? 'needs-review' : 'is-ready'}>
                    <div className="year-bridge-student-identity"><span>{student.studentName.slice(0, 1).toUpperCase()}</span><div><strong>{student.studentName}</strong><small>{AUTHORITY_LABEL[student.sourceAuthority]}</small></div></div>
                    <div className="year-bridge-student-path"><div><span>Previous</span><strong>{student.sourceClassCode || 'Unresolved'}</strong></div><i aria-hidden="true" /><div><span>Live placement</span><strong>{student.liveCurrentClassCode || 'Unplaced'}</strong></div><i aria-hidden="true" /><div><span>Proposed</span><strong>{student.targetClassCode || OUTCOME_LABEL[student.outcome]}</strong></div></div>
                    <div className="year-bridge-student-review">
                      <label><span>Decision</span><select value={draft.outcome} onChange={(event) => { const outcome = event.target.value as YearRolloverOutcome; setStudentDrafts((current) => ({ ...current, [student.id]: { ...draft, outcome, targetClassId: outcome === 'already_promoted' ? student.liveCurrentClassId || '' : '' } })); }}><option value="promote">Promote one grade</option><option value="repeat">Repeat current grade</option>{student.liveCurrentClassId ? <option value="already_promoted">Confirm current placement</option> : null}<option value="graduate">Graduate</option><option value="leave">Leave school</option><option value="manual">Decide later</option></select></label>
                      {needsTarget ? <label><span>Destination</span><select value={draft.targetClassId} onChange={(event) => setStudentDrafts((current) => ({ ...current, [student.id]: { ...draft, targetClassId: event.target.value } }))}><option value="">Choose class</option>{options.map((item) => <option key={item.id} value={item.id}>{item.classCode} · Grade {item.gradeLevel}</option>)}</select></label> : null}
                      <label className="is-reason"><span>Review note</span><input value={draft.reason} onChange={(event) => setStudentDrafts((current) => ({ ...current, [student.id]: { ...draft, reason: event.target.value } }))} placeholder="Optional — a clear audit note will be generated" /></label>
                      <button type="button" className="admin-button-primary admin-button-small" disabled={busyKey === `student:${student.id}` || (needsTarget && !draft.targetClassId) || draft.outcome === 'manual'} onClick={() => void handleSaveStudent(student)}>{busyKey === `student:${student.id}` ? 'Saving…' : 'Save decision'}</button>
                    </div><p className="year-bridge-student-rationale">{student.rationale}</p>
                  </article>
                );
              })}</div> : <div className="year-bridge-clear-state"><span aria-hidden="true" /><strong>{studentFilter === 'review' ? 'Every student has a route' : 'No students match this view'}</strong><p>{studentFilter === 'review' ? 'The exception queue is clear. Continue to the final rehearsal.' : 'Change the filter or search term.'}</p></div>}
              <div className="year-bridge-actions is-between"><button type="button" className="admin-button-ghost" onClick={() => setStep(2)}>Back to routes</button><button type="button" className="admin-button-primary" onClick={() => setStep(4)}>Open final rehearsal</button></div>
            </div>
          ) : null}

          {step === 4 && preview ? (
            <div className="year-bridge-panel">
              <div className="year-bridge-panel-heading is-split"><div><span>04 · Final rehearsal</span><h4>See the whole move before anything changes</h4><p>This is a live, drift-protected preview. Refresh if another administrator changes a placement.</p></div><button type="button" className="admin-button-ghost admin-button-small" disabled={busyKey === 'refresh'} onClick={() => void handleRefresh()}>{busyKey === 'refresh' ? 'Refreshing…' : 'Refresh live rehearsal'}</button></div>
              <div className="year-bridge-summary-grid"><SummaryMetric value={(summary?.promote || 0) + (summary?.alreadyPromoted || 0)} label="Moving forward" note={`${metric(summary?.alreadyPromoted)} already placed`} /><SummaryMetric value={summary?.repeat} label="Repeating" /><SummaryMetric value={summary?.graduate} label="Graduating" /><SummaryMetric value={summary?.leave} label="Leaving" /><SummaryMetric value={summary?.needsReview} label="Unresolved" /></div>
              <div className="year-bridge-rehearsal-grid">
                <div className="year-bridge-issue-column"><h5>Launch blockers <span>{metric(preview.blockers?.length)}</span></h5>{(preview.blockers || []).length ? (preview.blockers || []).slice(0, 12).map((issue, index) => <div key={`${issue.code}:${issue.studentId || issue.classId || index}`} className="year-bridge-alert is-blocker"><strong>{issue.code.replaceAll('_', ' ')}</strong><span>{issue.message}</span></div>) : <div className="year-bridge-alert is-clear"><strong>No blockers</strong><span>Every student has a reviewed route and the live roster still matches the rehearsal.</span></div>}</div>
                <div className="year-bridge-issue-column"><h5>Follow-up notes <span>{metric(preview.warnings?.length)}</span></h5>{(preview.warnings || []).length ? (preview.warnings || []).slice(0, 12).map((issue, index) => <div key={`${issue.code}:${issue.studentId || issue.classId || index}`} className="year-bridge-alert is-warning"><strong>{issue.code.replaceAll('_', ' ')}</strong><span>{issue.message}</span></div>) : <div className="year-bridge-alert is-clear"><strong>Everything is covered</strong><span>No staffing, curriculum or roster follow-ups were detected.</span></div>}</div>
              </div>
              <div className="year-bridge-launch-seal"><div className="year-bridge-seal-mark" aria-hidden="true"><span /><b>Verified rehearsal</b></div><div><small>Rehearsal fingerprint</small><code>{preview.previewHash?.slice(0, 18)}…</code><p>If the roster changes, this fingerprint expires and the launch stops safely.</p></div><label><span>Type <strong>{preview.plan?.targetYear.name}</strong> to launch</span><input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder={preview.plan?.targetYear.name} /></label></div>
              <div className="year-bridge-launch-note"><strong>What launch changes</strong><p>Current class placement and target-year enrolment only. Previous assignments, writing, scores, reports and closed-year enrolment records remain untouched. The live class roster updates immediately; the official placement date is {formatDate(preview.plan?.effectiveDate)}.</p></div>
              <div className="year-bridge-actions is-between"><button type="button" className="admin-button-ghost" onClick={() => setStep(3)}>Back to exceptions</button><button type="button" className="admin-button-primary year-bridge-launch-button" disabled={!preview.canCommit || confirmation.trim().toLowerCase() !== preview.plan?.targetYear.name.toLowerCase() || busyKey === 'commit'} onClick={() => void handleCommit()}>{busyKey === 'commit' ? 'Launching Year Bridge…' : `Launch ${preview.plan?.targetYear.name}`}</button></div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
};

export default AcademicYearRolloverWizard;
