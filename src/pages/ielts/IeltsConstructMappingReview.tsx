import React, { useEffect, useMemo, useRef, useState } from 'react';
import { constructMappingQueue, decideConstructMappingBatch, randomSample, type ConstructMappingBatch } from '../../../services/ieltsConstructMapping';
import { IeltsButton, IeltsNotice } from '../../components/ielts/IeltsUi';

const statusLabel: Record<ConstructMappingBatch['status'], string> = {
  pending: 'Waiting for review', approved: 'Approved', changes_requested: 'Changes requested', superseded: 'Superseded',
};

/** Batch sample review of AI-proposed construct mappings (Diagnostic Bible 2.0.0 sections 7.5 and 15E.2A). */
export default function IeltsConstructMappingReview() {
  const [batches, setBatches] = useState<ConstructMappingBatch[] | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [sample, setSample] = useState<string[]>([]);
  const [rejected, setRejected] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [reload, setReload] = useState(0);
  const lock = useRef(false);

  useEffect(() => {
    let alive = true;
    setError('');
    constructMappingQueue().then(b => { if (alive) setBatches(b); }).catch(e => { if (alive) { setBatches([]); setError(e.message); } });
    return () => { alive = false; };
  }, [reload]);

  const batch = batches?.find(b => b.status === 'pending') ?? null;
  const pending = batches?.filter(b => b.status === 'pending').length ?? 0;
  const groups = useMemo(() => {
    const map = new Map<string, ConstructMappingBatch['items']>();
    for (const item of batch?.items ?? []) {
      const key = `${item.display_code} · ${item.title}`;
      map.set(key, [...(map.get(key) ?? []), item]);
    }
    return [...map.entries()];
  }, [batch]);

  if (batches === null) return null;
  if (!batches.length && !error) return null;

  const toggle = (list: string[], id: string, on: boolean) => on ? [...new Set([...list, id])] : list.filter(x => x !== id);
  const enough = batch ? sample.length >= Math.min(batch.minimum_sample, batch.items.length) : false;
  const decide = async (decision: 'approved' | 'changes_requested') => {
    if (!batch || lock.current) return;
    lock.current = true; setBusy(true); setError(''); setMessage('');
    try {
      const result = await decideConstructMappingBatch(batch, decision, sample, rejected, notes.trim());
      setMessage(decision === 'approved'
        ? `Approved ${result.approved} mappings${rejected.length ? `; ${rejected.length} rejected` : ''}. Matched practice can now use them.`
        : 'Changes requested. The mappings stay unavailable for matching until a revised batch is approved.');
      setSample([]); setRejected([]); setNotes(''); setReload(n => n + 1);
    } catch (e) { setError(e instanceof Error ? e.message : 'The review could not be saved.'); }
    finally { lock.current = false; setBusy(false); }
  };

  return <section className="ix-panel" aria-labelledby="construct-mapping-title">
    <div className="ix-header">
      <div><p className="ix-eyebrow">Practice bank · Skill mapping</p><h2 id="construct-mapping-title">Construct mappings{pending ? ` · ${pending} batch waiting` : ''}</h2></div>
      <IeltsButton aria-expanded={open} onClick={() => setOpen(o => !o)}>{open ? 'Hide mappings' : 'Review mappings'}</IeltsButton>
    </div>
    {message && <p role="status">{message}</p>}
    {error && <IeltsNotice error>{error}</IeltsNotice>}
    {open && <>
      {!batch && <p className="ix-muted">No batch is waiting. {batches[0] && `Latest: ${statusLabel[batches[0].status]}${batches[0].reviewer ? ` by ${batches[0].reviewer}` : ''}.`}</p>}
      {batch && <>
        <article className="ix-row">
          <h3>{batch.title}</h3>
          <p>Proposed by {batch.proposed_by}. {batch.proposal_basis}</p>
          <p className="ix-muted">Each mapping says which skill a question trains, so the system can match practice to each student's targets. Check at least {batch.minimum_sample} mappings (20%, minimum 3). Tick <strong>Reject</strong> for any mapping that is wrong; if several are wrong, request changes instead.</p>
          <div className="ix-actions">
            <IeltsButton disabled={busy} onClick={() => setSample(randomSample(batch.items, batch.minimum_sample).map(i => i.id))}>Pick a random sample of {batch.minimum_sample}</IeltsButton>
            <span role="status" aria-live="polite">{sample.length} checked · {rejected.length} rejected</span>
          </div>
        </article>
        {groups.map(([material, items]) => <details key={material} className="ix-row" open={items.some(i => sample.includes(i.id))}>
          <summary><strong>{material}</strong> · {items.length} mappings{items.some(i => sample.includes(i.id)) ? ' · in sample' : ''}</summary>
          <ul className="ix-list" style={{ listStyle: 'none', padding: 0 }}>
            {items.map(item => <li key={item.id} className={`ix-row${sample.includes(item.id) ? ' ix-row--selected' : ''}`}>
              <p>{item.item_key ? <><strong>Question {item.item_key}</strong>{item.item_text ? ` · ${item.item_text}` : ''}</> : <strong>Whole task</strong>}</p>
              <p><strong>{item.role === 'primary' ? 'Main skill' : 'Also trains'}:</strong> {item.node_name} <span className="ix-muted">({item.node_code})</span></p>
              <p className="ix-muted">{item.rationale}</p>
              <div className="ix-actions">
                <label className="ix-check"><input type="checkbox" checked={sample.includes(item.id)} disabled={busy} onChange={e => setSample(s => toggle(s, item.id, e.target.checked))} /><span>I checked this mapping</span></label>
                <label className="ix-check"><input type="checkbox" checked={rejected.includes(item.id)} disabled={busy} onChange={e => { setRejected(r => toggle(r, item.id, e.target.checked)); if (e.target.checked) setSample(s => toggle(s, item.id, true)); }} /><span>Reject</span></label>
              </div>
            </li>)}
          </ul>
        </details>)}
        <label className="ix-field">What did you check?<textarea value={notes} maxLength={2000} onChange={e => setNotes(e.target.value)} placeholder="For example: checked 23 mappings against the questions and keys; rejected one TFNG supporting skill." /></label>
        <div className="ix-actions">
          <IeltsButton variant="primary" disabled={busy || !enough || notes.trim().length < 10} onClick={() => void decide('approved')}>{busy ? 'Saving…' : `Approve batch (${batch.items.length - rejected.length} mappings)`}</IeltsButton>
          <IeltsButton disabled={busy || notes.trim().length < 10} onClick={() => void decide('changes_requested')}>Request changes</IeltsButton>
        </div>
        <p className="ix-muted">Your name and the exact batch version are recorded. Approving a mapping does not change any student's results.</p>
      </>}
    </>}
  </section>;
}
