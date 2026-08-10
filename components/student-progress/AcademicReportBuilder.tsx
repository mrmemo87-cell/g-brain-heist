import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  finalizeAcademicReportSnapshot,
  generateAcademicReportSnapshot,
  getAcademicReportingContext,
  getAcademicReportSnapshot,
  requestAcademicReportCorrection,
  type AcademicReportAudience,
  type AcademicReportSnapshot,
  type AcademicReportType,
  type AcademicReportingContext,
} from '../../services/academicReportingService';
import { createSchoolBrand } from '../../src/lib/schoolBranding';
import './AcademicReportBuilder.css';
import './AcademicReportBuilder.school-head-light.css';

interface Props {
  appearance?: 'default' | 'school-head-light';
  studentId?: string | null;
  studentName?: string | null;
  fixedReportType?: AcademicReportType;
  initialSubject?: string | null;
  schoolId?: string | null;
  schoolName?: string | null;
  schoolLogoUrl?: string | null;
  onClose: () => void;
}

const labels: Record<AcademicReportType, string> = { student: 'Student', class: 'Class', grade: 'Grade', subject: 'Subject', school: 'Whole school' };
const formatDate = (value?: string | null) => value ? new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
const formatPercent = (value?: number | null) => value == null ? 'Not assessed' : `${Math.round(value * 10) / 10}%`;
const shortHash = (value: string) => `${value.slice(0, 12)}…${value.slice(-8)}`;
const rolePermission: Record<AcademicReportType, keyof AcademicReportingContext['permissions']> = {
  student: 'canGenerateStudent', class: 'canGenerateClass', grade: 'canGenerateGrade', subject: 'canGenerateSubject', school: 'canGenerateSchool',
};

const AcademicReportBuilder: React.FC<Props> = ({
  appearance = 'default', studentId, studentName, fixedReportType, initialSubject, schoolId, schoolName, schoolLogoUrl, onClose,
}) => {
  const [context, setContext] = useState<AcademicReportingContext | null>(null);
  const [reportType, setReportType] = useState<AcademicReportType>(fixedReportType || (studentId ? 'student' : 'school'));
  const [yearId, setYearId] = useState('');
  const [termId, setTermId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [classId, setClassId] = useState('');
  const [gradeLevel, setGradeLevel] = useState('');
  const [audience, setAudience] = useState<AcademicReportAudience>(studentId ? 'family' : 'school_head');
  const [snapshot, setSnapshot] = useState<AcademicReportSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [correctionDetail, setCorrectionDetail] = useState('');
  const [correctionSent, setCorrectionSent] = useState(false);
  const brand = useMemo(() => createSchoolBrand({ schoolId: schoolId || context?.schoolId, schoolName, schoolLogoUrl }), [context?.schoolId, schoolId, schoolLogoUrl, schoolName]);

  useEffect(() => {
    let cancelled = false;
    getAcademicReportingContext(studentId)
      .then((next) => {
        if (cancelled) return;
        setContext(next);
        const today = new Date().toISOString().slice(0, 10);
        const active = next.years.find((year) => year.startsOn <= today && year.endsOn >= today) || next.years[0];
        setYearId(active?.id || '');
        if (initialSubject) setSubjectId(next.subjects.find((item) => item.name === initialSubject || item.code === initialSubject)?.id || '');
      })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Reporting options could not be loaded.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [initialSubject, studentId]);

  useEffect(() => {
    if (termId && !context?.terms.some((term) => term.id === termId && term.academicYearId === yearId)) setTermId('');
    setSnapshot(null);
  }, [audience, classId, context?.terms, gradeLevel, reportType, subjectId, termId, yearId]);

  useEffect(() => {
    setCorrectionDetail('');
    setCorrectionSent(false);
  }, [snapshot?.id]);

  const terms = context?.terms.filter((term) => term.academicYearId === yearId) || [];
  const permittedTypes = (Object.keys(labels) as AcademicReportType[]).filter((type) => context?.permissions[rolePermission[type]]);
  const selectedClass = context?.classes.find((item) => item.id === classId);
  const selectedSubject = context?.subjects.find((item) => item.id === subjectId);
  const target = reportType === 'student' ? studentName || 'Selected student'
    : reportType === 'class' ? selectedClass?.name || 'Selected class'
    : reportType === 'grade' ? gradeLevel ? `Grade ${gradeLevel}` : 'Selected grade'
    : reportType === 'subject' ? selectedSubject?.name || 'Selected subject'
    : brand.name;
  const targetReady = reportType === 'student' ? Boolean(studentId) : reportType === 'class' ? Boolean(classId) : reportType === 'grade' ? Boolean(gradeLevel) : reportType === 'subject' ? Boolean(subjectId) : true;

  const generate = async () => {
    if (!yearId || !targetReady) return;
    setBusy(true); setError(null);
    try {
      const result = await generateAcademicReportSnapshot({
        reportType, academicYearId: yearId, academicTermId: termId || null,
        studentId: reportType === 'student' ? studentId : null,
        classId: reportType === 'class' ? classId : null,
        gradeLevel: reportType === 'grade' ? gradeLevel : null,
        academicSubjectId: subjectId || null, audience,
      });
      setSnapshot(await getAcademicReportSnapshot(result.reportId));
    } catch (err) { setError(err instanceof Error ? err.message : 'The report snapshot could not be generated.'); }
    finally { setBusy(false); }
  };

  const finalize = async () => {
    if (!snapshot || snapshot.status === 'final') return;
    if (!window.confirm('Finalize this exact evidence snapshot? The Final version cannot be edited or deleted.')) return;
    setBusy(true); setError(null);
    try {
      await finalizeAcademicReportSnapshot(snapshot.id);
      setSnapshot(await getAcademicReportSnapshot(snapshot.id));
    } catch (err) { setError(err instanceof Error ? err.message : 'The report could not be finalized.'); }
    finally { setBusy(false); }
  };

  const requestCorrection = async () => {
    if (!snapshot || snapshot.status !== 'final' || correctionDetail.trim().length < 20) return;
    setBusy(true); setError(null);
    try {
      await requestAcademicReportCorrection(snapshot.id, 'interpretation_concern', correctionDetail);
      setCorrectionSent(true); setCorrectionDetail('');
    } catch (err) { setError(err instanceof Error ? err.message : 'The correction request could not be submitted.'); }
    finally { setBusy(false); }
  };

  return createPortal(<div className={`arb-overlay${appearance === 'school-head-light' ? ' is-school-head-light' : ''}`} role="presentation"><section className="arb-shell" role="dialog" aria-modal="true" aria-label="Academic report builder">
    <header className="arb-toolbar arb-no-print"><div><strong>Reproducible academic reports</strong><span>Year- and term-scoped evidence · immutable versions · Draft → Final approval</span></div><div><button type="button" onClick={onClose}>Close</button><button type="button" className="primary" disabled={!snapshot || snapshot.status !== 'final'} onClick={() => window.print()}>Print / Save PDF</button></div></header>

    <div className="arb-controls arb-no-print">
      {loading ? <p>Loading authorised reporting scopes…</p> : null}
      {!fixedReportType ? <label>Report scope<select value={reportType} onChange={(event) => setReportType(event.target.value as AcademicReportType)}>{permittedTypes.map((type) => <option key={type} value={type}>{labels[type]}</option>)}</select></label> : null}
      <label>School year<select value={yearId} onChange={(event) => setYearId(event.target.value)}><option value="">Choose a school year</option>{context?.years.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}</select></label>
      <label>Reporting period<select value={termId} onChange={(event) => setTermId(event.target.value)}><option value="">Full academic year</option>{terms.map((term) => <option key={term.id} value={term.id}>{term.name}</option>)}</select></label>
      {reportType === 'class' ? <label>Class<select value={classId} onChange={(event) => setClassId(event.target.value)}><option value="">Choose a class</option>{context?.classes.map((item) => <option key={item.id} value={item.id}>{item.name}{item.gradeLevel ? ` · Grade ${item.gradeLevel}` : ''}</option>)}</select></label> : null}
      {reportType === 'grade' ? <label>Grade<select value={gradeLevel} onChange={(event) => setGradeLevel(event.target.value)}><option value="">Choose a grade</option>{context?.grades.map((grade) => <option key={grade}>{grade}</option>)}</select></label> : null}
      <label>Subject<select value={subjectId} onChange={(event) => setSubjectId(event.target.value)}><option value="">All authorised subjects</option>{context?.subjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Audience<select value={audience} onChange={(event) => setAudience(event.target.value as AcademicReportAudience)}>{reportType === 'student' ? <><option value="family">Family</option><option value="student">Student</option></> : null}<option value="teacher">Teacher</option><option value="school_head">School Head</option><option value="internal">Internal record</option></select></label>
      <button type="button" className="arb-generate" disabled={busy || loading || !yearId || !targetReady} onClick={generate}>{busy ? 'Working…' : snapshot ? 'Regenerate exact snapshot' : 'Generate Draft snapshot'}</button>
    </div>
    {error ? <div className="arb-error arb-no-print" role="alert">{error}</div> : null}
    {!snapshot ? <div className="arb-empty"><strong>No report snapshot yet</strong><span>Choose the school year and reporting scope. Missing evidence will be disclosed as “not assessed,” never converted into a weakness or zero.</span></div> : <article className="arb-report">
      <header className="arb-report-header"><div className="arb-brand">{brand.logoUrl ? <img src={brand.logoUrl} alt={`${brand.name} logo`} /> : <b>{brand.name.slice(0, 1)}</b>}<span><strong>{brand.name}</strong><small>Confidential academic report</small></span></div><div><span className={`arb-status is-${snapshot.status}`}>{snapshot.status}</span><small>Version {snapshot.version}</small></div></header>
      <section className="arb-title"><span>{labels[snapshot.reportType]} academic report · {snapshot.audience.replace('_', ' ')}</span><h1>{target}</h1><p>{snapshot.payload.reportingPeriod.academicYearName} · {snapshot.payload.reportingPeriod.academicTermName || 'Full academic year'} · evidence before {formatDate(snapshot.evidenceCutoffAt)}</p></section>
      <section className="arb-metadata"><div><span>Students in scope</span><strong>{snapshot.payload.summary.studentsInScope}</strong></div><div><span>With evidence</span><strong>{snapshot.payload.summary.studentsWithEvidence}</strong></div><div><span>Without evidence</span><strong>{snapshot.payload.summary.studentsWithoutEvidence}</strong></div><div><span>Attainment average</span><strong>{formatPercent(snapshot.payload.summary.attainmentAverage)}</strong></div><div><span>Evidence items</span><strong>{snapshot.payload.summary.evidenceItems}</strong></div></section>
      <section className="arb-section"><div className="arb-section-heading"><div><span>01 · Subject evidence</span><h2>Attainment, progress and evidence confidence</h2></div><p>Expected standards appear only when configured. Coverage and confidence qualify the evidence; they are not attainment or mastery.</p></div>{snapshot.payload.subjects.length ? <div className="arb-subjects">{snapshot.payload.subjects.map((item) => <article key={item.academicSubjectId}><header><div><h3>{item.subject}</h3><span className={`arb-evidence is-${item.evidenceStatus}`}>{item.evidenceStatus.replace('_', ' ')}</span></div><strong>{formatPercent(item.attainmentAverage)}</strong></header><dl><div><dt>Qualifying evidence</dt><dd>{item.qualifyingObservations}</dd></div><div><dt>Confidence</dt><dd>{item.confidence.averageScore == null ? 'Not assessed' : `${item.confidence.averageScore}%`}</dd></div><div><dt>Coverage</dt><dd>{formatPercent(item.coverage.averageQualifiedPercent)}</dd></div><div><dt>Expected standard</dt><dd>{item.expectedStandard == null ? 'Not configured' : `${item.expectedStandard}%`}</dd></div></dl><div className="arb-progress"><span>{item.progressStates.persistent} persistent</span><span>{item.progressStates.recurring} recurring</span><span>{item.progressStates.improving} improving</span><span>{item.progressStates.resolved} resolved</span><span>{item.progressStates.emergingStrength + item.progressStates.consistentStrength} strengths</span></div>{item.historicalProjectionUnavailable ? <p>{item.historicalProjectionUnavailable} historical state{item.historicalProjectionUnavailable === 1 ? '' : 's'} withheld because later evidence exists.</p> : null}</article>)}</div> : <p className="arb-not-assessed">No subject evidence exists in this reporting period. This is reported as not assessed—not as low attainment or weakness.</p>}</section>
      <section className="arb-section"><div className="arb-section-heading"><div><span>02 · Intervention outcomes</span><h2>Approved support and measured outcomes</h2></div><p>Activity volume is never presented as evidence that an intervention worked. Professional rationale and private notes are excluded.</p></div>{snapshot.payload.interventions.length ? <table><thead><tr><th>Subject</th><th>Skill</th><th>Intervention</th><th>Status</th><th>Outcome</th></tr></thead><tbody>{snapshot.payload.interventions.map((item) => <tr key={item.id}><td>{item.subject}</td><td>{item.skill}</td><td>{item.interventionType}</td><td>{item.approvalStatus} · {item.status}</td><td>{item.outcomeStatus || item.systemOutcomeStatus || 'Not yet evaluated'}</td></tr>)}</tbody></table> : <p className="arb-not-assessed">No approved interventions are included in this scope.</p>}</section>
      <section className="arb-disclosures"><strong>Reporting disclosures</strong><ul><li>Missing work is not zero; unassessed objectives are not weaknesses.</li><li>Coverage is academic-year-to-cutoff and is not mastery. Confidence is not attainment.</li><li>Private teacher notes and raw evidence JSON are excluded.</li><li>This snapshot did not mutate observations or learning states.</li></ul></section>
      <footer className="arb-footer"><div><span>Snapshot {snapshot.id}</span><span>Payload {shortHash(snapshot.payloadHash)}</span><span>Sources {shortHash(snapshot.sourceSnapshotHash)} · {snapshot.sourceReferences.length} exact references</span></div>{snapshot.status === 'draft' ? <div className="arb-approval arb-no-print"><p><strong>Draft review required</strong><span>Finalizing locks this exact evidence snapshot. Any later evidence creates a new version.</span></p><button type="button" disabled={busy} onClick={finalize}>{busy ? 'Finalizing…' : 'Approve & Finalize'}</button></div> : <><div className="arb-final"><strong>Final report</strong><span>Approved {formatDate(snapshot.finalizedAt)} · immutable version {snapshot.version}</span></div><div className="arb-correction arb-no-print"><label htmlFor={`correction-${snapshot.id}`}>Question something in this report</label><textarea id={`correction-${snapshot.id}`} value={correctionDetail} onChange={(event) => setCorrectionDetail(event.target.value)} placeholder="Describe the possible source, scope, identity, interpretation, or privacy issue. The original Final report will remain unchanged." /><button type="button" disabled={busy || correctionDetail.trim().length < 20} onClick={requestCorrection}>Request governed correction</button>{correctionSent ? <small role="status">Correction request recorded. Any accepted change will create a later report version.</small> : null}</div></>}</footer>
    </article>}
  </section></div>, document.body);
};

export default AcademicReportBuilder;
