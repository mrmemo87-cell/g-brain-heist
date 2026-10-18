import React, { useEffect, useRef, useState } from 'react';
import {
 reviewDraftPacks, reviewDraftPackBlob, recordReviewDecision,
 type ReviewDraftPack, type ReviewDecisionKind,
} from '../../../services/ieltsReviewDraftPacks';
import { downloadLessonFile } from '../../../services/ieltsLessonResources';
import { packKind, packNumber, packSkill, groupBy, kindLabel, type PackKind } from './ieltsPackCatalogue';

const contents: Record<PackKind, string> = {
 course: 'Slides, workbook, homework, teacher guide, keys and fresh check.',
 extension: 'Optional lesson: slides, workbook, homework, teacher guide, keys and fresh check.',
 mock: 'Papers, answer sheet, recording with timed control page, key, examiner script and feedback forms. Raw scores only.',
};
const current = (p: ReviewDraftPack) => (p.decision && p.decision.pack_sha256 === p.sha256 ? p.decision : null);
const statusOf = (p: ReviewDraftPack) => {
 const d = current(p);
 return !d ? { label: 'Awaiting review', tone: 'waiting' } : d.decision === 'approved' ? { label: 'Approved by owner', tone: 'approved' } : { label: 'Changes requested', tone: 'changes' };
};

/** Owner review queue for unreleased drafts; shown first in the library and only to programme managers. */
export default function IeltsReviewDraftPacks({ schoolId }: { schoolId: string }) {
 const [packs, setPacks] = useState<ReviewDraftPack[]>([]), [canDecide, setCanDecide] = useState(false);
 const [error, setError] = useState(''), [loading, setLoading] = useState(true), [busy, setBusy] = useState(''), [retry, setRetry] = useState(0);
 const [notes, setNotes] = useState<Record<string, string>>({}), [asking, setAsking] = useState(''), [saved, setSaved] = useState('');
 const epoch = useRef(0), lock = useRef(false);
 useEffect(() => {
  const run = ++epoch.current; setPacks([]); setCanDecide(false); setError(''); setLoading(true); setBusy(''); setSaved(''); setAsking(''); lock.current = false;
  reviewDraftPacks(schoolId).then(c => { if (epoch.current === run) { setPacks(c.packs); setCanDecide(c.canDecide); } })
   .catch(() => { if (epoch.current === run) setError('Review drafts could not load. Check your programme access and retry.'); })
   .finally(() => { if (epoch.current === run) setLoading(false); });
  return () => { epoch.current++; };
 }, [schoolId, retry]);

 async function download(pack: ReviewDraftPack) {
  if (lock.current) return; lock.current = true; const run = epoch.current; setBusy(pack.lesson_code); setError(''); setSaved('');
  try {
   const blob = await reviewDraftPackBlob(pack);
   if (epoch.current === run) downloadLessonFile(blob, `${pack.lesson_code}-Review-Draft-v${pack.version}.zip`);
  } catch { if (epoch.current === run) setError('The download could not finish or verify. Please retry.'); }
  finally { if (epoch.current === run) { lock.current = false; setBusy(''); } }
 }

 async function decide(pack: ReviewDraftPack, decision: ReviewDecisionKind) {
  if (lock.current) return; lock.current = true; const run = epoch.current; setBusy(pack.lesson_code); setError(''); setSaved('');
  try {
   const result = await recordReviewDecision(schoolId, pack, decision, notes[pack.lesson_code] ?? '');
   if (epoch.current !== run) return;
   setPacks(list => list.map(p => p.lesson_code === pack.lesson_code && p.version === pack.version ? { ...p, decision: result } : p));
   setAsking('');
   setSaved(`${pack.lesson_code}: ${decision === 'approved' ? 'approval recorded' : 'change request recorded'}.`);
  } catch (e) { if (epoch.current === run) setError(e instanceof Error && e.message ? e.message : 'The decision could not be saved. Please retry.'); }
  finally { if (epoch.current === run) { lock.current = false; setBusy(''); } }
 }

 if (!loading && !error && packs.length === 0) return null;
 const approved = packs.filter(p => current(p)?.decision === 'approved').length;
 const waiting = packs.filter(p => !current(p)).length;
 const order: PackKind[] = ['mock', 'extension', 'course'];
 const groups = groupBy([...packs].sort((a, b) => order.indexOf(packKind(a.lesson_code)) - order.indexOf(packKind(b.lesson_code))), p => packKind(p.lesson_code));

 return <section aria-labelledby="review-queue-title" className="review-queue">
  <div className="review-queue-head">
   <div>
    <h3 id="review-queue-title">Waiting for your review</h3>
    <p className="lesson-muted">Not approved for classroom use. Download a draft, check it, then approve it or request changes. Approving does not release anything; release to schools is a separate step.</p>
   </div>
   {!loading && packs.length > 0 && <p className="review-count" aria-label={`${approved} of ${packs.length} approved`}><strong>{waiting}</strong> waiting · {approved} of {packs.length} approved</p>}
  </div>
  {loading && <p role="status">Opening review drafts…</p>}
  {error && <div className="lesson-alert"><p role="status">{error}</p><button type="button" className="sp-secondary" disabled={!!busy} onClick={() => setRetry(n => n + 1)}>Retry review drafts</button></div>}
  {saved && <p role="status" className="review-saved">{saved}</p>}
  {groups.map(([kind, list]) => <section key={kind} className="pack-week" aria-label={kindLabel[kind as PackKind]}>
   <h4 className="pack-week-title">{kindLabel[kind as PackKind]} <span>{list.length}</span></h4>
   <div className="pack-list">
    {list.map(pack => {
     const status = statusOf(pack), d = current(pack), note = notes[pack.lesson_code] ?? '', working = busy === pack.lesson_code;
     return <article key={pack.object_path} className="pack-row review-row" aria-label={`${pack.lesson_code} ${pack.title}`}>
      <span className="pack-num" aria-hidden="true">{packNumber(pack.lesson_code)}</span>
      <div className="pack-main">
       <h5>{pack.title}</h5>
       <p className="pack-meta"><span className={`review-status is-${status.tone}`}>{status.label}</span><span className="pack-chip">{packSkill(packKind(pack.lesson_code) === 'mock' ? 'mock test' : pack.title)}</span><span>Draft v{pack.version}</span></p>
       <p className="pack-note">{contents[packKind(pack.lesson_code)]}{pack.recordings.length > 0 && ` Recordings: ${pack.recordings.length} (owner listening review pending).`}</p>
       {d && <p className="pack-note">{status.label} on {new Date(d.decided_at).toLocaleString()}{d.notes ? `: ${d.notes}` : ''}</p>}
      </div>
      <div className="pack-actions">
       <button type="button" className="sp-secondary" disabled={!!busy} onClick={() => void download(pack)}>{working ? 'Working…' : 'Download review draft'}</button>
       {canDecide && <>
        {d?.decision !== 'approved' && <button type="button" className="sp-primary" disabled={!!busy} onClick={() => void decide(pack, 'approved')}>Approve this version</button>}
        <button type="button" className="sp-secondary" disabled={!!busy} aria-expanded={asking === pack.lesson_code} onClick={() => setAsking(a => a === pack.lesson_code ? '' : pack.lesson_code)}>Request changes</button>
       </>}
      </div>
      {canDecide && asking === pack.lesson_code && <div className="review-notes">
       <label htmlFor={`notes-${pack.lesson_code}`}>What should change in {pack.lesson_code}?</label>
       <textarea id={`notes-${pack.lesson_code}`} rows={3} maxLength={4000} value={note} disabled={!!busy}
        onChange={e => setNotes(n => ({ ...n, [pack.lesson_code]: e.target.value }))} />
       <div className="pack-actions">
        <button type="button" className="sp-primary" disabled={!!busy || !note.trim()} onClick={() => void decide(pack, 'changes_requested')}>Send change request</button>
        <button type="button" className="sp-secondary" disabled={!!busy} onClick={() => setAsking('')}>Cancel</button>
       </div>
      </div>}
     </article>;
    })}
   </div>
  </section>)}
 </section>;
}
