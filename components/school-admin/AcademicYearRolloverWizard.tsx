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
  type YearRolloverIssue,
  type YearRolloverOutcome,
  type YearRolloverPreview,
  type YearRolloverRouteOutcome,
  type YearRolloverStudentDecision,
} from '../../services/yearRolloverService';
import { useSchoolAdmin } from './SchoolAdminContext';
import './AcademicYearRolloverWizard.css';

type WizardStep = 1 | 2 | 3;
type StudentFilter = 'review' | 'all';
type RouteDraft = { outcome: YearRolloverRouteOutcome; targetClassId: string };
type StudentDraft = { outcome: YearRolloverOutcome; targetClassId: string; reason: string };

const STEPS: Array<{ step: WizardStep; label: string; helper: string }> = [
  { step: 1, label: 'Start', helper: 'Choose the new year' },
  { step: 2, label: 'Review', helper: 'Fix only what needs attention' },
  { step: 3, label: 'Launch', helper: 'Check and start' },
];

const OUTCOME_LABEL: Record<YearRolloverOutcome, string> = {
  promote: 'Move up one grade',
  repeat: 'Keep in current grade',
  already_promoted: 'Keep current placement',
  graduate: 'Mark as graduated',
  leave: 'Mark as left school',
  manual: 'Choose an action',
};

const ROUTE_LABEL: Record<YearRolloverRouteOutcome, string> = {
  promote: 'Move class up one grade',
  repeat: 'Keep class in same grade',
  graduate: 'Final grade / graduation',
  manual: 'Choose a route',
};

const AUTHORITY_LABEL = {
  academic_enrolment: 'Confirmed year roster',
  historical_assignment: 'Previous-year assignment history',
  current_placement: 'Current class used as fallback',
  profile_fallback: 'Student profile used as fallback',
  unresolved: 'No reliable previous class found',
} as const;

const ISSUE_TITLE: Record<string, string> = {
  student_review_required: 'Student needs a decision',
  target_class_required: 'Destination class is missing',
  placement_changed_after_rehearsal: 'Student changed class',
  multiple_target_enrolments: 'Multiple new-year enrolments found',
  exit_has_target_year_evidence: 'New-year work already exists',
  source_year_still_open: 'Current school year is still open',
  target_year_not_available: 'New school year is not available',
  another_current_year_exists: 'Another current school year exists',
  rollover_has_no_students: 'No students found',
};

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
const issueTitle = (issue: YearRolloverIssue) => ISSUE_TITLE[issue.code]
  || issue.code.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase());

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
  const [step, setStep] = useState<WizardStep>(1);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [routeDrafts, setRouteDrafts] = useState<Record<string, RouteDraft>>({});
  const [studentDrafts, setStudentDrafts] = useState<Record<string, StudentDraft>>({});
  const [studentFilter, setStudentFilter] = useState<StudentFilter>('review');
  const [studentSearch, setStudentSearch] = useState('');
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
        setStep(latest.plan.status === 'completed' ? 3 : 2);
      } else {
        const target = nextContinuity.years.find((year) => year.status === 'planned')
          || nextContinuity.years.find((year) => year.status === 'current')
          || nextContinuity.years[0];
        const source = nextContinuity.years
          .filter((year) => year.status === 'closed' && (!target || year.endsOn < target.startsOn))
          .sort((left, right) => right.endsOn.localeCompare(left.endsOn))[0];
        setTargetYearId(target?.id || '');
        setSourceYearId(source?.id || '');
      }
    } catch (loadError) {
      console.error('Failed to load academic-year rollover', loadError);
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
  const reviewCount = summary?.needsReview || 0;

  const classOptionsFor = (sourceGrade: string | null, outcome: YearRolloverOutcome | YearRolloverRouteOutcome) => {
    const source = gradeNumber(sourceGrade);
    if (source === null) return preview?.classOptions || [];
    const target = outcome === 'repeat' ? source : source + 1;
    return (preview?.classOptions || []).filter((item) => gradeNumber(item.gradeLevel) === target);
  };

  const attentionRoutes = useMemo(() => (preview?.classRoutes || []).filter((route) => (
    route.outcome === 'manual' || route.confidence !== 'high' || !route.targetClassId || route.isOverridden
  )), [preview?.classRoutes]);

  const filteredStudents = useMemo(() => {
    const query = studentSearch.trim().toLowerCase();
    return (preview?.students || []).filter((student) => {
      const matches = !query || [student.studentName, student.sourceClassCode, student.currentClassCode, student.targetClassCode]
        .some((value) => String(value || '').toLowerCase().includes(query));
      if (!matches) return false;
      if (studentFilter === 'review') return student.reviewState === 'needs_review' || student.outcome === 'manual';
      return true;
    });
  }, [preview?.students, studentFilter, studentSearch]);

  const issueForStudent = (student: YearRolloverStudentDecision) => (preview?.blockers || [])
    .find((issue) => issue.studentId === student.studentId);

  const handlePrepare = async () => {
    if (!sourceYearId || !targetYearId) return;
    setBusyKey('prepare'); setError(null);
    try {
      const result = await prepareYearRollover({
        schoolId: school.id,
        sourceAcademicYearId: sourceYearId,
        targetAcademicYearId: targetYearId,
      });
      setPreview(result); setStep(2);
      addToast(`New school year check ready. ${result.summary?.needsReview || 0} students need attention.`, 'success');
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
      addToast('New-year check refreshed with the latest student placements.', 'success');
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
        reason: `Approved ${route.sourceClassCode} → ${destination} for ${preview.plan.targetYear.name}.`,
      }));
      addToast(`${route.sourceClassCode} is ready.`, 'success');
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
        reason: draft.reason.trim() || `${student.studentName}: reviewed for ${destination} for ${preview.plan.targetYear.name}.`,
      }));
      addToast(`${student.studentName} is ready.`, 'success');
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
        confirmation: preview.plan.targetYear.name,
      });
      setCompletion(result.summary || null);
      setPreview((current) => current ? {
        ...current,
        plan: current.plan ? { ...current.plan, status: 'completed' } : null,
        completionSummary: result.summary,
        canCommit: false,
      } : current);
      await loadAdminTools(school.id);
      addToast(`${result.summary?.targetYearName || 'The new school year'} is now active.`, 'success');
    } catch (commitError) {
      const message = yearRolloverErrorMessage(commitError);
      addToast(message, 'error');
      if (message.toLowerCase().includes('changed')) await handleRefresh();
    } finally { setBusyKey(''); }
  };

  if (loading) return <section className="year-bridge-card is-loading" aria-busy="true"><span /><span /><span /></section>;
  if (!continuity || years.length < 2) return (
    <section className="year-bridge-card is-unavailable">
      <p className="year-bridge-eyebrow">Start New School Year</p><h3>Create the next academic year first</h3>
      <p>Once the finished year and the new year both exist, you can move students forward here.</p>
    </section>
  );

  if (completed) {
    const result = completion || preview?.completionSummary || {};
    return (
      <section className="year-bridge-card is-complete" data-testid="year-rollover-command-center">
        <div className="year-bridge-complete-mark" aria-hidden="true"><span /></div>
        <div className="year-bridge-complete-copy">
          <p className="year-bridge-eyebrow">New school year started</p>
          <h3>{result.targetYearName || preview?.plan?.targetYear.name} is ready</h3>
          <p>{metric(result.studentsProcessed)} student records were processed safely. The previous school year remains available in history.</p>
          <div className="year-bridge-complete-stats">
            <span><strong>{metric((result.promoted || 0) + (result.alreadyPromoted || 0))}</strong> moved forward</span>
            <span><strong>{metric(result.repeating)}</strong> staying in grade</span>
            <span><strong>{metric(result.graduated)}</strong> graduated</span>
            <span><strong>{metric(result.schoolAccessReviewsRequired)}</strong> access follow-ups</span>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="year-bridge-card is-open" data-testid="year-rollover-command-center">
      <header className="year-bridge-hero">
        <div className="year-bridge-hero-copy">
          <p className="year-bridge-eyebrow">Start New School Year</p>
          <h3>Move students into the new school year in three simple steps.</h3>
          <p>We automatically handle the obvious moves. You only review students or classes where something is unclear.</p>
        </div>
        <div className="year-bridge-hero-actions">
          <StatusPill tone={reviewCount > 0 ? 'review' : preview ? 'ready' : 'history'}>
            {preview ? reviewCount > 0 ? `${metric(reviewCount)} students need attention` : 'Ready to check' : 'Nothing changes until launch'}
          </StatusPill>
        </div>
      </header>
      <div className="year-bridge-safety-strip" aria-label="New school year safeguards">
        <span>Previous-year records stay protected</span>
        <span>Automatic matches are handled for you</span>
        <span>Anything blocking launch is explained</span>
      </div>

      <div className="year-bridge-workspace">
        <nav className="year-bridge-stepper" aria-label="Start new school year steps">
          {STEPS.map((item) => (
            <button key={item.step} type="button" className={step === item.step ? 'is-current' : step > item.step ? 'is-complete' : ''}
              disabled={item.step > 1 && !preview} onClick={() => setStep(item.step)}>
              <span>{item.step}</span><div><strong>{item.label}</strong><small>{item.helper}</small></div>
            </button>
          ))}
        </nav>
        {error ? <div className="year-bridge-alert is-blocker" role="alert"><strong>We couldn't continue</strong><span>{error}</span></div> : null}

        {step === 1 ? (
          <div className="year-bridge-panel">
            <div className="year-bridge-panel-heading"><div><span>01 · Choose school year</span><h4>Which year are you starting?</h4><p>The system will compare the finished year with the new year and work out the student moves automatically.</p></div></div>
            <div className="year-bridge-year-grid">
              <label className="year-bridge-year-card"><span>Finished school year</span>
                <select value={sourceYearId} onChange={(event) => setSourceYearId(event.target.value)}><option value="">Choose finished year</option>{years.filter((year) => year.status !== 'planned').map((year) => <option key={year.id} value={year.id}>{yearLabel(year)}</option>)}</select>
                {sourceYear ? <small>{formatDate(sourceYear.startsOn)} – {formatDate(sourceYear.endsOn)} · kept safely in history</small> : null}
              </label>
              <div className="year-bridge-arc" aria-hidden="true"><span /><b>to</b><span /></div>
              <label className="year-bridge-year-card is-target"><span>New school year</span>
                <select value={targetYearId} onChange={(event) => setTargetYearId(event.target.value)}><option value="">Choose new year</option>{years.filter((year) => year.status !== 'closed').map((year) => <option key={year.id} value={year.id}>{yearLabel(year)}</option>)}</select>
                {targetYear ? <small>{formatDate(targetYear.startsOn)} – {formatDate(targetYear.endsOn)}</small> : null}
              </label>
            </div>
            <div className="year-bridge-value-grid">
              <article><strong>Automatic student moves</strong><p>Clear next-grade matches are prepared automatically.</p></article>
              <article><strong>Only exceptions need you</strong><p>Missing classes, unusual placements and final-grade students are clearly explained.</p></article>
              <article><strong>Safe final launch</strong><p>The previous year stays untouched and the final move remains protected.</p></article>
            </div>
            <div className="year-bridge-actions"><button type="button" className="admin-button-primary" disabled={!sourceYearId || !targetYearId || busyKey === 'prepare'} onClick={() => void handlePrepare()}>{busyKey === 'prepare' ? 'Checking students…' : preview ? 'Check again' : 'Continue'}</button></div>
          </div>
        ) : null}

        {step === 2 && preview ? (
          <div className="year-bridge-panel">
            <div className="year-bridge-panel-heading is-split"><div><span>02 · Review attention items</span><h4>{reviewCount || attentionRoutes.length ? 'A few things need your attention' : 'Everyone is ready'}</h4><p>{reviewCount || attentionRoutes.length ? 'Each item below shows exactly why it was flagged. Everything else is already prepared.' : 'No individual student or class decisions are needed.'}</p></div><div className="year-bridge-heading-stat"><strong>{metric(reviewCount)}</strong><span>students need attention</span><small>{metric(summary?.autoReady)} ready automatically</small></div></div>

            {attentionRoutes.length ? <>
              <div className="year-bridge-panel-heading"><div><span>Classes to check · {metric(attentionRoutes.length)}</span><h4>Confirm unclear class moves</h4><p>Automatically matched classes are hidden here so you only see the unusual ones.</p></div></div>
              <div className="year-bridge-route-list">
                {attentionRoutes.map((route) => {
                  const draft = routeDrafts[route.id] || { outcome: route.outcome, targetClassId: route.targetClassId || '' };
                  const options = classOptionsFor(route.sourceGrade, draft.outcome);
                  return (
                    <article key={route.id} className="year-bridge-route needs-review">
                      <div className="year-bridge-route-source"><small>Current class</small><strong>{route.sourceClassCode}</strong><span>Grade {route.sourceGrade || '—'} · {metric(route.studentCount)} students</span></div>
                      <div className="year-bridge-route-line" aria-hidden="true"><i /><b>check</b><i /></div>
                      <div className="year-bridge-route-controls">
                        <label><span>What should happen?</span><select value={draft.outcome} onChange={(event) => setRouteDrafts((current) => ({ ...current, [route.id]: { outcome: event.target.value as YearRolloverRouteOutcome, targetClassId: '' } }))}><option value="manual" disabled>Choose a route</option><option value="promote">Move class up one grade</option><option value="repeat">Keep class in same grade</option><option value="graduate">Final grade / graduation</option></select></label>
                        {['promote', 'repeat'].includes(draft.outcome) ? <label><span>Destination class</span><select value={draft.targetClassId} onChange={(event) => setRouteDrafts((current) => ({ ...current, [route.id]: { ...draft, targetClassId: event.target.value } }))}><option value="">Choose class</option>{options.map((item) => <option key={item.id} value={item.id}>{item.classCode} · Grade {item.gradeLevel}</option>)}</select></label> : <div className="year-bridge-route-destination"><span>Result</span><strong>{draft.outcome === 'graduate' ? 'Students handled as final-grade cases' : 'Choose a route above'}</strong></div>}
                      </div>
                      <div className="year-bridge-route-health"><StatusPill tone="review">Why?</StatusPill><p>{route.rationale}</p></div>
                      <button type="button" className="admin-button-primary admin-button-small" disabled={busyKey === `route:${route.id}` || draft.outcome === 'manual' || (['promote', 'repeat'].includes(draft.outcome) && !draft.targetClassId)} onClick={() => void handleSaveRoute(route)}>{busyKey === `route:${route.id}` ? 'Saving…' : 'Save class decision'}</button>
                    </article>
                  );
                })}
              </div>
            </> : null}

            <div className="year-bridge-student-toolbar"><div className="year-bridge-filter-tabs">{([
              ['review', `Needs attention · ${reviewCount}`], ['all', 'All students'],
            ] as Array<[StudentFilter, string]>).map(([value, label]) => <button key={value} type="button" className={studentFilter === value ? 'is-active' : ''} onClick={() => setStudentFilter(value)}>{label}</button>)}</div><label><span>Find student</span><input type="search" value={studentSearch} onChange={(event) => setStudentSearch(event.target.value)} placeholder="Name or class" /></label></div>

            {filteredStudents.length ? <div className="year-bridge-student-list">{filteredStudents.map((student) => {
              const draft = studentDrafts[student.id] || { outcome: student.outcome, targetClassId: student.targetClassId || '', reason: '' };
              const needsTarget = ['promote', 'repeat', 'already_promoted'].includes(draft.outcome);
              const options = draft.outcome === 'already_promoted' ? (preview.classOptions || []).filter((item) => item.id === student.liveCurrentClassId) : classOptionsFor(student.sourceGrade, draft.outcome);
              const blocker = issueForStudent(student);
              const needsReview = student.reviewState === 'needs_review' || student.outcome === 'manual';
              return (
                <article key={student.id} className={needsReview ? 'needs-review' : 'is-ready'}>
                  <div className="year-bridge-student-identity"><span>{student.studentName.slice(0, 1).toUpperCase()}</span><div><strong>{student.studentName}</strong><small>{AUTHORITY_LABEL[student.sourceAuthority]}</small></div></div>
                  <div className="year-bridge-student-path"><div><span>Previous</span><strong>{student.sourceClassCode || 'Unknown'}</strong></div><i aria-hidden="true" /><div><span>Current</span><strong>{student.liveCurrentClassCode || 'No class'}</strong></div><i aria-hidden="true" /><div><span>Suggested</span><strong>{student.targetClassCode || OUTCOME_LABEL[student.outcome]}</strong></div></div>
                  <div className="year-bridge-student-review">
                    <label><span>What should happen?</span><select value={draft.outcome} onChange={(event) => { const outcome = event.target.value as YearRolloverOutcome; setStudentDrafts((current) => ({ ...current, [student.id]: { ...draft, outcome, targetClassId: outcome === 'already_promoted' ? student.liveCurrentClassId || '' : '' } })); }}><option value="manual" disabled>Choose an action</option><option value="promote">Move up one grade</option><option value="repeat">Keep in current grade</option>{student.liveCurrentClassId ? <option value="already_promoted">Keep current placement</option> : null}<option value="graduate">Mark as graduated</option><option value="leave">Mark as left school</option></select></label>
                    {needsTarget ? <label><span>Destination class</span><select value={draft.targetClassId} onChange={(event) => setStudentDrafts((current) => ({ ...current, [student.id]: { ...draft, targetClassId: event.target.value } }))}><option value="">Choose class</option>{options.map((item) => <option key={item.id} value={item.id}>{item.classCode} · Grade {item.gradeLevel}</option>)}</select></label> : null}
                    <label className="is-reason"><span>Optional note</span><input value={draft.reason} onChange={(event) => setStudentDrafts((current) => ({ ...current, [student.id]: { ...draft, reason: event.target.value } }))} placeholder="Add a note if useful" /></label>
                    <button type="button" className="admin-button-primary admin-button-small" disabled={busyKey === `student:${student.id}` || (needsTarget && !draft.targetClassId) || draft.outcome === 'manual'} onClick={() => void handleSaveStudent(student)}>{busyKey === `student:${student.id}` ? 'Saving…' : 'Save student decision'}</button>
                  </div>
                  {needsReview ? <div className="year-bridge-alert is-warning"><strong>{blocker ? issueTitle(blocker) : 'Why this needs attention'}</strong><span>{blocker?.message || student.rationale}</span></div> : <p className="year-bridge-student-rationale">{student.rationale}</p>}
                </article>
              );
            })}</div> : <div className="year-bridge-clear-state"><span aria-hidden="true" /><strong>{studentFilter === 'review' ? 'No students need attention' : 'No students match this search'}</strong><p>{studentFilter === 'review' ? 'All student moves are ready. You can continue to launch.' : 'Try a different name or class.'}</p></div>}
            <div className="year-bridge-actions is-between"><button type="button" className="admin-button-ghost" onClick={() => setStep(1)}>Back</button><button type="button" className="admin-button-primary" onClick={() => setStep(3)}>Continue to launch</button></div>
          </div>
        ) : null}

        {step === 3 && preview ? (
          <div className="year-bridge-panel">
            <div className="year-bridge-panel-heading is-split"><div><span>03 · Launch</span><h4>{preview.canCommit ? `Ready to start ${preview.plan?.targetYear.name}` : `Can't start ${preview.plan?.targetYear.name} yet`}</h4><p>{preview.canCommit ? 'Everything required for launch is ready. No typing or hidden confirmation is needed.' : 'The exact reasons are listed below. Fix them, then refresh the check.'}</p></div><button type="button" className="admin-button-ghost admin-button-small" disabled={busyKey === 'refresh'} onClick={() => void handleRefresh()}>{busyKey === 'refresh' ? 'Refreshing…' : 'Refresh check'}</button></div>

            <div className="year-bridge-summary-grid"><SummaryMetric value={(summary?.promote || 0) + (summary?.alreadyPromoted || 0)} label="Moving forward" /><SummaryMetric value={summary?.repeat} label="Staying in grade" /><SummaryMetric value={summary?.graduate} label="Graduating" /><SummaryMetric value={summary?.leave} label="Leaving" /><SummaryMetric value={summary?.needsReview} label="Still needs attention" /></div>

            {(preview.blockers || []).length ? <div className="year-bridge-issue-column"><h5>Fix before launch <span>{metric(preview.blockers?.length)}</span></h5>{(preview.blockers || []).map((issue, index) => <div key={`${issue.code}:${issue.studentId || issue.classId || index}`} className="year-bridge-alert is-blocker"><strong>{issueTitle(issue)}</strong><span>{issue.message}</span>{issue.studentId ? <button type="button" className="admin-button-ghost admin-button-small" onClick={() => { setStudentFilter('review'); setStep(2); }}>Review students</button> : null}</div>)}</div> : <div className="year-bridge-alert is-clear"><strong>Everything required is ready</strong><span>The new school year can be started safely.</span></div>}

            {(preview.warnings || []).length ? <div className="year-bridge-issue-column"><h5>Can be handled later <span>{metric(preview.warnings?.length)}</span></h5>{(preview.warnings || []).slice(0, 8).map((issue, index) => <div key={`${issue.code}:${issue.studentId || issue.classId || index}`} className="year-bridge-alert is-warning"><strong>{issueTitle(issue)}</strong><span>{issue.message}</span></div>)}</div> : null}

            <div className="year-bridge-launch-note"><strong>What happens when you start the new year</strong><p>Student class placement and new-year enrolment are updated. Previous assignments, writing, scores, reports and closed-year enrolment records remain untouched. The live class roster updates immediately; the official placement date is {formatDate(preview.plan?.effectiveDate)}.</p></div>
            <div className="year-bridge-actions is-between"><button type="button" className="admin-button-ghost" onClick={() => setStep(2)}>Back to review</button><div>{!preview.canCommit ? <small>{metric(preview.blockers?.length)} item{preview.blockers?.length === 1 ? '' : 's'} must be fixed before launch.</small> : null}<button type="button" className="admin-button-primary year-bridge-launch-button" disabled={!preview.canCommit || busyKey === 'commit'} onClick={() => void handleCommit()}>{busyKey === 'commit' ? `Starting ${preview.plan?.targetYear.name}…` : `Start ${preview.plan?.targetYear.name}`}</button></div></div>
          </div>
        ) : null}
      </div>
    </section>
  );
};

export default AcademicYearRolloverWizard;
