import React, { useEffect, useRef, useState } from 'react';
import {
 reviewDraftPacks, reviewDraftPackBlob, recordReviewDecision,
 type ReviewDraftPack, type ReviewDecisionKind,
} from '../../../services/ieltsReviewDraftPacks';
import { downloadLessonFile } from '../../../services/ieltsLessonResources';
import IeltsTeacherDisclosure from '../../components/ielts/IeltsTeacherDisclosure';

const decisionLabel = (p: ReviewDraftPack) => {
 const d = p.decision;
 if (!d || d.pack_sha256 !== p.sha256) return 'Awaiting review';
 return d.decision === 'approved' ? 'Approved by owner' : 'Changes requested';
};

export default function IeltsReviewDraftPacks({ schoolId }: { schoolId: string }) {
 const [packs, setPacks] = useState<ReviewDraftPack[]>([]), [canDecide, setCanDecide] = useState(false);
 const [error, setError] = useState(''), [loading, setLoading] = useState(true), [busy, setBusy] = useState(''), [retry, setRetry] = useState(0);
 const [notes, setNotes] = useState<Record<string, string>>({}), [saved, setSaved] = useState('');
 const epoch = useRef(0), lock = useRef(false);
 useEffect(() => {
  const run = ++epoch.current; setPacks([]); setCanDecide(false); setError(''); setLoading(true); setBusy(''); setSaved(''); lock.current = false;
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
   setSaved(`${pack.lesson_code}: ${decision === 'approved' ? 'approval recorded' : 'change request recorded'}.`);
  } catch (e) { if (epoch.current === run) setError(e instanceof Error && e.message ? e.message : 'The decision could not be saved. Please retry.'); }
  finally { if (epoch.current === run) { lock.current = false; setBusy(''); } }
 }

 if (!loading && !error && packs.length === 0) return null;
 const reviewed = packs.filter(p => p.decision && p.decision.pack_sha256 === p.sha256 && p.decision.decision === 'approved').length;
 return <section aria-label="Lesson review drafts" className="lesson-library-content">
  <h3>Review drafts: Lessons 5–24</h3>
  <p className="lesson-muted">Not approved for classroom use. Download a draft, review it, then record your decision. Recording an approval does not release a lesson to teachers or students; release stays a separate step.</p>
  {loading && <p role="status">Opening review drafts…</p>}
  {error && <div role="alert" className="lesson-alert"><p>{error}</p><button type="button" className="sp-secondary" disabled={!!busy} onClick={() => setRetry(n => n + 1)}>Retry review drafts</button></div>}
  {saved && <p role="status">{saved}</p>}
  {!loading && packs.length > 0 && <p className="lesson-muted">{reviewed} of {packs.length} approved.</p>}
  {packs.map(pack => {
   const label = decisionLabel(pack);
   const note = notes[pack.lesson_code] ?? '';
   return <IeltsTeacherDisclosure key={pack.object_path} title={`${pack.lesson_code} · ${pack.title}`} hint={`Review draft v${pack.version} · not approved for classroom use`} marker={label} defaultExpanded={false}>
    <p>Complete private pack: start guide, slides (PowerPoint and HTML), student workbook and homework, teacher guide, keys, scripts and models, withheld fresh check and review record.</p>
    {pack.recordings.length > 0 && <ul aria-label={`${pack.lesson_code} recordings`}>
     {pack.recordings.map(r => <li key={r.id}>{r.id}: {r.status}</li>)}
    </ul>}
    {pack.decision && pack.decision.pack_sha256 === pack.sha256 && <p className="lesson-muted">
     {label} on {new Date(pack.decision.decided_at).toLocaleString()}{pack.decision.notes ? `: ${pack.decision.notes}` : ''}
    </p>}
    <div className="lesson-primary-actions">
     <button type="button" className="sp-primary" disabled={!!busy} onClick={() => void download(pack)}>{busy === pack.lesson_code ? 'Working…' : 'Download review draft'}</button>
    </div>
    {canDecide && <div>
     <label htmlFor={`notes-${pack.lesson_code}`}>Review notes (required when requesting changes)</label>
     <textarea id={`notes-${pack.lesson_code}`} rows={3} maxLength={4000} value={note} disabled={!!busy}
      onChange={e => setNotes(n => ({ ...n, [pack.lesson_code]: e.target.value }))} style={{ width: '100%' }} />
     <div className="lesson-primary-actions">
      <button type="button" className="sp-primary" disabled={!!busy} onClick={() => void decide(pack, 'approved')}>Approve this version</button>
      <button type="button" className="sp-secondary" disabled={!!busy || !note.trim()} onClick={() => void decide(pack, 'changes_requested')}>Request changes</button>
     </div>
    </div>}
    <p className="lesson-muted">Teacher-only: keep scripts, keys, recordings of withheld checks and fresh checks private. Version fingerprint {pack.sha256.slice(0, 12)}.</p>
   </IeltsTeacherDisclosure>;
  })}
 </section>;
}
