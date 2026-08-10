import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  approveAcademicIntelligenceGovernancePolicy,
  decideAcademicIntelligenceRelease,
  decideAcademicIntelligenceRetentionAction,
  evaluateAcademicIntelligenceReadiness,
  getAcademicIntelligenceAuditManifest,
  getAcademicIntelligenceGovernanceContext,
  requestAcademicIntelligenceRetentionAction,
  resolveAcademicReportCorrection,
  type AcademicIntelligenceGovernanceContext,
  type GovernanceCapability,
  type GovernancePolicyInput,
  type ReleaseDecision,
} from '../../services/academicIntelligenceGovernanceService';
import './AcademicIntelligenceGovernance.css';

interface Props { schoolId: string; onClose: () => void; }

const capabilityCopy: Record<GovernanceCapability, { title: string; description: string }> = {
  student_reports: { title: 'Student reports', description: 'Students may open their own final student-audience snapshots.' },
  family_reports: { title: 'Family reports', description: 'Staff may finalize and export family-audience snapshots.' },
  schoolwide_reporting: { title: 'School-wide reporting', description: 'The school may treat broad reports as released decision support.' },
  intervention_effectiveness: { title: 'Intervention effectiveness', description: 'Reviewed outcomes may be presented as school-wide effectiveness.' },
};

const blockerCopy: Record<string, string> = {
  no_enrolled_students: 'No students are enrolled in this academic year.',
  evidence_coverage_below_policy: 'Student evidence coverage is below the approved threshold.',
  curriculum_coverage_below_policy: 'Mapped curriculum coverage is below the approved threshold.',
  golden_validation_not_passed: 'The active confidence policy has not passed the golden journeys.',
  shadow_validation_not_completed: 'A completed shadow comparison is required.',
  shadow_review_below_policy: 'Teacher review of shadow differences is below the threshold.',
  high_risk_shadow_reviews_open: 'High-risk shadow differences still need teacher review.',
  intervention_review_below_policy: 'Measured intervention outcome review is below the threshold.',
  reproducible_report_samples_below_policy: 'Too few historical reports have been reproduced from identical sources.',
  no_final_reports: 'At least one reviewed Final report is required before release.',
};

const defaultPolicy = (schoolId: string, academicYearId: string): GovernancePolicyInput => ({
  schoolId,
  academicYearId,
  minEvidenceCoveragePercent: 70,
  minCurriculumCoveragePercent: 60,
  minShadowReviewPercent: 100,
  minInterventionReviewPercent: 100,
  minReproducibleReportSamples: 3,
  retentionMonths: 84,
  correctionResponseDays: 10,
  governanceAttestation: '',
});

const shortHash = (value?: string | null) => value ? `${value.slice(0, 10)}…${value.slice(-8)}` : '—';
const formatDate = (value?: string | null) => value ? new Date(value).toLocaleString() : '—';
const metric = (data: Record<string, number | boolean>, key: string) => {
  const value = data[key];
  return typeof value === 'boolean' ? (value ? 'Passed' : 'Not passed') : String(value ?? '—');
};

const AcademicIntelligenceGovernance: React.FC<Props> = ({ schoolId, onClose }) => {
  const [context, setContext] = useState<AcademicIntelligenceGovernanceContext | null>(null);
  const [selectedYear, setSelectedYear] = useState<string | null>(null);
  const [policy, setPolicy] = useState<GovernancePolicyInput>(() => defaultPolicy(schoolId, ''));
  const [releaseRationale, setReleaseRationale] = useState('School Head approval after reviewing the exact readiness evidence and disclosures.');
  const [operationRationale, setOperationRationale] = useState('Reviewed against the immutable source report and the school governance policy.');
  const [retentionType, setRetentionType] = useState<'export' | 'restrict' | 'delete'>('export');
  const [retentionReason, setRetentionReason] = useState('School-governed request for the selected academic year, pending recorded review.');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (yearId?: string | null) => {
    setLoading(true); setError(null);
    try {
      const next = await getAcademicIntelligenceGovernanceContext(schoolId, yearId);
      setContext(next);
      setSelectedYear(next.academicYearId);
      const p = next.policy;
      setPolicy(p ? {
        schoolId,
        academicYearId: next.academicYearId,
        minEvidenceCoveragePercent: p.minEvidenceCoveragePercent,
        minCurriculumCoveragePercent: p.minCurriculumCoveragePercent,
        minShadowReviewPercent: p.minShadowReviewPercent,
        minInterventionReviewPercent: p.minInterventionReviewPercent,
        minReproducibleReportSamples: p.minReproducibleReportSamples,
        retentionMonths: p.retentionMonths,
        correctionResponseDays: p.correctionResponseDays,
        governanceAttestation: p.governanceAttestation,
      } : defaultPolicy(schoolId, next.academicYearId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Governance context could not be loaded.');
    } finally { setLoading(false); }
  }, [schoolId]);

  useEffect(() => { void load(); }, [load]);

  const run = useCallback(async (key: string, task: () => Promise<unknown>, success: string) => {
    setBusy(key); setError(null); setNotice(null);
    try { await task(); setNotice(success); await load(selectedYear); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The governance action failed.'); }
    finally { setBusy(null); }
  }, [load, selectedYear]);

  const releases = useMemo(() => new Map((context?.releases ?? []).map((item) => [item.capability, item])), [context]);
  const readiness = context?.readiness;
  const canRelease = context?.permissions.canDecideRelease && readiness?.status === 'ready';

  const updatePolicyNumber = (key: keyof GovernancePolicyInput, value: string) => {
    setPolicy((current) => ({ ...current, [key]: Number(value) }));
  };

  const decideRelease = (capability: GovernanceCapability, decision: ReleaseDecision) => run(
    `release:${capability}:${decision}`,
    () => decideAcademicIntelligenceRelease(readiness!.id, capability, decision, releaseRationale),
    `${capabilityCopy[capability].title} set to ${decision}.`,
  );

  const exportManifest = async () => {
    if (!selectedYear) return;
    setBusy('manifest'); setError(null);
    try {
      const result = await getAcademicIntelligenceAuditManifest(schoolId, selectedYear);
      const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = `academic-intelligence-audit-${selectedYear}.json`; anchor.click();
      URL.revokeObjectURL(url); setNotice(`Audit manifest exported · ${shortHash(result.manifestHash)}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Audit manifest could not be exported.'); }
    finally { setBusy(null); }
  };

  return <div className="aig-overlay" role="dialog" aria-modal="true" aria-labelledby="aig-title">
    <div className="aig-modal">
      <header className="aig-header">
        <div><span>Part 9 · Controlled release</span><h2 id="aig-title">Academic Intelligence Governance</h2><p>Approve the rules, prove readiness, release deliberately, and preserve every correction and retention decision.</p></div>
        <button onClick={onClose} aria-label="Close academic intelligence governance">Close</button>
      </header>

      {loading && !context ? <div className="aig-state">Loading governed rollout evidence…</div> : null}
      {error ? <div className="aig-message is-error" role="alert">{error}</div> : null}
      {notice ? <div className="aig-message is-success" role="status">{notice}</div> : null}

      {context ? <>
        <nav className="aig-toolbar" aria-label="Governance period and audit controls">
          <label>Academic year<select value={selectedYear ?? ''} onChange={(event) => { const id = event.target.value; setSelectedYear(id); void load(id); }}>{context.years.map((year) => <option key={year.id} value={year.id}>{year.name} · {year.status}</option>)}</select></label>
          <div><span className={`aig-status is-${readiness?.status ?? 'unconfigured'}`}>{readiness?.status === 'ready' ? 'Ready for controlled release' : readiness ? 'Release blocked' : 'Policy not evaluated'}</span><button onClick={() => void exportManifest()} disabled={!context.permissions.canDecideRelease || busy !== null}>{busy === 'manifest' ? 'Building manifest…' : 'Export audit manifest'}</button></div>
        </nav>

        <section className="aig-section">
          <header><div><span>1 · School-approved rules</span><h3>Governance policy</h3></div>{context.policy ? <small>Version {context.policy.version} · {shortHash(context.policy.policyHash)} · {formatDate(context.policy.approvedAt)}</small> : <small>No approved policy</small>}</header>
          <div className="aig-policy-grid">
            <label>Student evidence coverage %<input type="number" min="0" max="100" value={policy.minEvidenceCoveragePercent} onChange={(e) => updatePolicyNumber('minEvidenceCoveragePercent', e.target.value)} /></label>
            <label>Curriculum coverage %<input type="number" min="0" max="100" value={policy.minCurriculumCoveragePercent} onChange={(e) => updatePolicyNumber('minCurriculumCoveragePercent', e.target.value)} /></label>
            <label>Shadow review %<input type="number" min="0" max="100" value={policy.minShadowReviewPercent} onChange={(e) => updatePolicyNumber('minShadowReviewPercent', e.target.value)} /></label>
            <label>Intervention review %<input type="number" min="0" max="100" value={policy.minInterventionReviewPercent} onChange={(e) => updatePolicyNumber('minInterventionReviewPercent', e.target.value)} /></label>
            <label>Reproduced reports<input type="number" min="1" max="1000" value={policy.minReproducibleReportSamples} onChange={(e) => updatePolicyNumber('minReproducibleReportSamples', e.target.value)} /></label>
            <label>Retention months<input type="number" min="12" max="180" value={policy.retentionMonths} onChange={(e) => updatePolicyNumber('retentionMonths', e.target.value)} /></label>
            <label>Correction response days<input type="number" min="1" max="90" value={policy.correctionResponseDays} onChange={(e) => updatePolicyNumber('correctionResponseDays', e.target.value)} /></label>
          </div>
          <label className="aig-wide-label">School Head attestation<textarea value={policy.governanceAttestation} onChange={(e) => setPolicy((current) => ({ ...current, governanceAttestation: e.target.value }))} placeholder="Record why these thresholds, retention terms, correction process, and rollout controls are appropriate for this school." /></label>
          <div className="aig-row-actions"><button className="is-primary" disabled={!context.permissions.canApprovePolicy || policy.governanceAttestation.trim().length < 40 || busy !== null} onClick={() => void run('policy', () => approveAcademicIntelligenceGovernancePolicy({ ...policy, academicYearId: selectedYear! }), 'A new immutable governance policy version was approved.')}>{busy === 'policy' ? 'Approving…' : context.policy ? 'Approve new policy version' : 'Approve policy'}</button><small>Only the School Head can approve. Existing versions remain immutable.</small></div>
        </section>

        <section className="aig-section">
          <header><div><span>2 · Evidence-based gate</span><h3>Readiness snapshot</h3></div><button className="is-primary" disabled={!context.policy || busy !== null} onClick={() => void run('readiness', () => evaluateAcademicIntelligenceReadiness(schoolId, selectedYear!), 'Readiness was re-evaluated from current source records.')}>{busy === 'readiness' ? 'Evaluating…' : 'Evaluate readiness'}</button></header>
          {readiness ? <>
            <div className="aig-metrics">
              <article><span>Evidence coverage</span><strong>{metric(readiness.metrics, 'evidenceCoveragePercent')}%</strong></article>
              <article><span>Curriculum coverage</span><strong>{metric(readiness.metrics, 'curriculumCoveragePercent')}%</strong></article>
              <article><span>Shadow review</span><strong>{metric(readiness.metrics, 'shadowReviewPercent')}%</strong></article>
              <article><span>Intervention review</span><strong>{metric(readiness.metrics, 'interventionReviewPercent')}%</strong></article>
              <article><span>Reproduced reports</span><strong>{metric(readiness.metrics, 'reproducibleReportSamples')}</strong></article>
              <article><span>Golden journeys</span><strong>{metric(readiness.metrics, 'goldenValidationPassed')}</strong></article>
            </div>
            <div className="aig-hashes"><span>Readiness {shortHash(readiness.readinessHash)}</span><span>Sources {shortHash(readiness.sourceSnapshotHash)}</span><span>{formatDate(readiness.evaluatedAt)}</span></div>
            {readiness.blockers.length ? <div className="aig-blockers"><strong>Release blockers</strong><ul>{readiness.blockers.map((code) => <li key={code}>{blockerCopy[code] ?? code.replaceAll('_', ' ')}</li>)}</ul></div> : <div className="aig-clear">All approved release gates passed for this exact snapshot.</div>}
          </> : <div className="aig-empty">Approve a policy, then evaluate the selected year. Readiness is a frozen evidence snapshot—not a live badge that can silently change.</div>}
        </section>

        <section className="aig-section">
          <header><div><span>3 · Explicit authority</span><h3>Release capabilities</h3></div><small>Latest append-only decision wins</small></header>
          <label className="aig-wide-label">School Head release rationale<textarea value={releaseRationale} onChange={(e) => setReleaseRationale(e.target.value)} /></label>
          <div className="aig-capabilities">{(Object.keys(capabilityCopy) as GovernanceCapability[]).map((capability) => { const current = releases.get(capability); return <article key={capability}><div><span className={`aig-pill is-${current?.decision ?? 'disabled'}`}>{current?.decision ?? 'disabled'}</span><h4>{capabilityCopy[capability].title}</h4><p>{capabilityCopy[capability].description}</p>{current ? <small>{formatDate(current.decidedAt)} · {current.rationale}</small> : <small>No release decision recorded.</small>}</div><div><button className="is-primary" disabled={!canRelease || releaseRationale.trim().length < 20 || busy !== null} onClick={() => void decideRelease(capability, 'enabled')}>Enable</button><button disabled={!context.permissions.canDecideRelease || !readiness || releaseRationale.trim().length < 20 || busy !== null} onClick={() => void decideRelease(capability, 'paused')}>Pause</button></div></article>; })}</div>
        </section>

        <div className="aig-two-columns">
          <section className="aig-section">
            <header><div><span>4 · Correct without rewriting</span><h3>Correction queue</h3></div><small>{context.corrections.length} recent</small></header>
            <label className="aig-wide-label">Decision note<textarea value={operationRationale} onChange={(e) => setOperationRationale(e.target.value)} /></label>
            <div className="aig-list">{context.corrections.map((item) => <article key={item.id}><div><strong>{item.reasonCode.replaceAll('_', ' ')}</strong><small>Report {shortHash(item.reportId)} · {formatDate(item.requestedAt)}</small><p>{item.detail}</p><span>{item.latestEvent}</span></div><div><button disabled={busy !== null || operationRationale.trim().length < 10} onClick={() => void run(`correction:${item.id}`, () => resolveAcademicReportCorrection(item.id, 'acknowledged', operationRationale), 'Correction acknowledged without changing the original report.')}>Acknowledge</button><button disabled={busy !== null || operationRationale.trim().length < 10} onClick={() => void run(`correction:${item.id}`, () => resolveAcademicReportCorrection(item.id, 'rejected', operationRationale), 'Correction decision recorded.')}>Reject</button></div></article>)}{context.corrections.length === 0 ? <div className="aig-empty">No correction requests. Final reports remain immutable; accepted corrections require a later final version.</div> : null}</div>
          </section>

          <section className="aig-section">
            <header><div><span>5 · Retention with review</span><h3>Retention requests</h3></div><small>Never auto-deletes</small></header>
            <div className="aig-retention-form"><label>Action<select value={retentionType} onChange={(e) => setRetentionType(e.target.value as typeof retentionType)}><option value="export">Export</option><option value="restrict">Restrict</option><option value="delete">Delete review</option></select></label><label>Reason<textarea value={retentionReason} onChange={(e) => setRetentionReason(e.target.value)} /></label><button className="is-primary" disabled={busy !== null || retentionReason.trim().length < 20} onClick={() => void run('retention-request', () => requestAcademicIntelligenceRetentionAction({ schoolId, requestType: retentionType, scopeType: 'academic_year', reason: retentionReason, academicYearId: selectedYear }), 'Retention request recorded for review.')}>Request for selected year</button></div>
            <div className="aig-list">{context.retentionRequests.map((item) => <article key={item.id}><div><strong>{item.requestType} · {item.scopeType.replaceAll('_', ' ')}</strong><small>{formatDate(item.requestedAt)}</small><p>{item.reason}</p><span>{item.latestDecision ?? 'awaiting review'}</span></div>{context.permissions.canDecideRetention ? <button disabled={busy !== null || operationRationale.trim().length < 20} onClick={() => void run(`retention:${item.id}`, () => decideAcademicIntelligenceRetentionAction(item.id, 'needs_legal_review', operationRationale), 'Retention request marked for legal review.')}>Require legal review</button> : null}</article>)}{context.retentionRequests.length === 0 ? <div className="aig-empty">No retention requests. Export, restriction, and deletion are recorded separately from execution.</div> : null}</div>
          </section>
        </div>

        <footer className="aig-footer">Staff pilot reports remain available for review. Student and family finalization fails closed until its capability is enabled; pausing also blocks later student access.</footer>
      </> : null}
    </div>
  </div>;
};

export default AcademicIntelligenceGovernance;
