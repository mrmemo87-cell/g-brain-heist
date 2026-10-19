import React, { useEffect, useRef, useState } from 'react';
import { practiceContentQueue, decidePracticeContent, randomSample, type PracticeContentBatch, type PracticeContentItem } from '../../../services/ieltsConstructMapping';
import { IeltsButton, IeltsNotice } from '../../components/ielts/IeltsUi';

const kind = (t: string) => t === 'ielts_reading_set' ? 'Reading' : t === 'ielts_writing_task' ? 'Writing' : t === 'ielts_speaking_task' ? 'Speaking' : 'Listening';
const answer = (a: unknown) => Array.isArray(a) ? a.join(' / ') : String(a);

function Preview({ item }: { item: PracticeContentItem }) {
  const p = item.preview;
  if (!p) return <p className="ix-muted">Preview unavailable.</p>;
  return <div>
    {p.passage && <div style={{ whiteSpace: 'pre-wrap' }}>{p.passage}</div>}
    {p.prompt && <p style={{ whiteSpace: 'pre-wrap' }}>{p.prompt}</p>}
    {p.follow_ups && <ul>{p.follow_ups.map(f => <li key={f}>{f}</li>)}</ul>}
    {p.questions && <ol>{p.questions.map(q => <li key={q.n}><p>{q.question}{q.options ? ` (${q.options.join(' · ')})` : ''}</p>
      <p><strong>Answer:</strong> {answer(q.answer)} · <span className="ix-muted">Evidence: {q.evidence}</span></p>
      <p className="ix-muted">{item.constructs.filter(c => c.item_key === String(q.n)).map(c => `${c.role === 'primary' ? 'Skill' : 'Also'}: ${c.name}`).join(' · ')}</p></li>)}</ol>}
    {!p.questions && <p className="ix-muted">{item.constructs.map(c => `${c.role === 'primary' ? 'Skill' : 'Also'}: ${c.name}`).join(' · ')}</p>}
  </div>;
}

/** Batch sample review of AI-drafted practice materials (Diagnostic Bible 2.0.0 section 15E.2A). */
export default function IeltsPracticeBankReview() {
  const [batches, setBatches] = useState<PracticeContentBatch[] | null>(null);
  const [open, setOpen] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const [sample, setSample] = useState<string[]>([]), [rejected, setRejected] = useState<string[]>([]), [notes, setNotes] = useState(''), [reload, setReload] = useState(0);
  const lock = useRef(false);
  useEffect(() => { let alive = true; practiceContentQueue().then(b => { if (alive) setBatches(b); }).catch(e => { if (alive) { setBatches([]); setError(e.message); } }); return () => { alive = false; }; }, [reload]);
  if (batches === null || (!batches.length && !error)) return null;
  const batch = batches.find(b => b.status === 'pending') ?? null;
  const flagged = batch?.items.filter(i => i.matches.length > 0).map(i => i.ref) ?? [];
  const toggle = (list: string[], id: string, on: boolean) => on ? [...new Set([...list, id])] : list.filter(x => x !== id);
  const enough = batch ? sample.length >= Math.min(batch.minimum_sample, batch.items.length) && flagged.every(f => sample.includes(f)) : false;
  const decide = async (decision: 'approved' | 'changes_requested') => {
    if (!batch || lock.current) return; lock.current = true; setBusy(true); setError(''); setMessage('');
    try {
      const r = await decidePracticeContent(batch, decision, sample, rejected, notes.trim());
      setMessage(decision === 'approved' ? `Released ${r.approved} of ${r.total} materials to students; their skill mappings are approved.` : 'Changes requested. The drafts stay unavailable to students.');
      setSample([]); setRejected([]); setNotes(''); setReload(n => n + 1);
    } catch (e) { setError((e as Error).message); } finally { lock.current = false; setBusy(false); }
  };
  return <section className="ix-panel" aria-labelledby="practice-bank-title">
    <div className="ix-header"><div><p className="ix-eyebrow">Practice bank · New materials</p><h2 id="practice-bank-title">Practice bank review{batch ? ` · ${batch.items.length} drafts waiting` : ''}</h2></div>
      <IeltsButton aria-expanded={open} onClick={() => setOpen(o => !o)}>{open ? 'Hide drafts' : 'Review drafts'}</IeltsButton></div>
    {message && <p role="status">{message}</p>}{error && <IeltsNotice error>{error}</IeltsNotice>}
    {open && !batch && <p className="ix-muted">No practice batch is waiting.</p>}
    {open && batch && <>
      <article className="ix-row"><h3>{batch.title}</h3><p>{batch.proposed_by}. {batch.proposal_basis}</p>
        <p className="ix-muted">Check at least {batch.minimum_sample} materials (20%, minimum 3) in full: passage or prompt, every answer and its evidence, and the skill tags. Items with an originality flag must be checked. Reject any material with a problem; approving releases the rest to students.</p>
        <div className="ix-actions"><IeltsButton disabled={busy} onClick={() => setSample([...new Set([...flagged, ...randomSample(batch.items.filter(i => !flagged.includes(i.ref)), Math.max(0, batch.minimum_sample - flagged.length)).map(i => i.ref)])])}>Pick a random sample</IeltsButton>
          <span role="status" aria-live="polite">{sample.length} checked · {rejected.length} rejected{flagged.length ? ` · ${flagged.length} flagged` : ''}</span></div></article>
      {batch.items.map(item => <details key={item.ref} className={`ix-row${sample.includes(item.ref) ? ' ix-row--selected' : ''}`}>
        <summary><strong>{item.display_code ?? item.item_key}</strong> · {kind(item.material_type)} · {item.preview?.title ?? item.item_key}{item.matches.length ? ` · ⚠ similar to ${item.matches.map(m => m.display_code).join(', ')}` : ''}{sample.includes(item.ref) ? ' · in sample' : ''}</summary>
        <Preview item={item} />
        <div className="ix-actions">
          <label className="ix-check"><input type="checkbox" checked={sample.includes(item.ref)} disabled={busy} onChange={e => setSample(s => toggle(s, item.ref, e.target.checked))} /><span>I checked this material in full</span></label>
          <label className="ix-check"><input type="checkbox" checked={rejected.includes(item.ref)} disabled={busy} onChange={e => { setRejected(r => toggle(r, item.ref, e.target.checked)); if (e.target.checked) setSample(s => toggle(s, item.ref, true)); }} /><span>Reject</span></label>
        </div>
      </details>)}
      <label className="ix-field">What did you check?<textarea value={notes} maxLength={2000} onChange={e => setNotes(e.target.value)} placeholder="For example: read 5 materials in full, checked every key against its evidence and the skill tags; rejected one prompt." /></label>
      <div className="ix-actions">
        <IeltsButton variant="primary" disabled={busy || !enough || notes.trim().length < 20} onClick={() => void decide('approved')}>{busy ? 'Saving…' : `Approve and release ${batch.items.length - rejected.length} materials`}</IeltsButton>
        <IeltsButton disabled={busy || notes.trim().length < 20} onClick={() => void decide('changes_requested')}>Request changes</IeltsButton>
      </div>
      <p className="ix-muted">Your name, the batch version and an originality review for each material are recorded. AI never approves content.</p>
    </>}
  </section>;
}
