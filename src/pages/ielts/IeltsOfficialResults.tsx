import React, { useEffect, useRef, useState } from 'react';
import { batchOutcomes, recordOfficialResult, verifyOfficialResult, officialOverall, type BatchOutcomes } from '../../../services/ieltsMockResults';
import { IeltsButton, IeltsNotice } from '../../components/ielts/IeltsUi';

const blank = { test_date: '', test_type: 'academic', delivery: 'computer', listening: '', reading: '', writing: '', speaking: '', centre_country: '', trf_reference: '', consent: false };
const ok = (v: string) => v !== '' && Number(v) >= 0 && Number(v) <= 9 && Number(v) * 2 === Math.floor(Number(v) * 2);

/** Real IELTS results beside each student's mock ranges (Diagnostic Bible 2.0.0 section 18A). */
export default function IeltsOfficialResults({ batchId }: { batchId: string }) {
  const [data, setData] = useState<BatchOutcomes | null>(null);
  const [student, setStudent] = useState(''), [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const lock = useRef(false);
  const load = () => batchOutcomes(batchId).then(setData).catch(e => setError(e.message));
  useEffect(() => { void load(); }, [batchId]);
  const bands = [form.listening, form.reading, form.writing, form.speaking];
  const overall = bands.every(ok) ? officialOverall(...(bands.map(Number) as [number, number, number, number])) : null;
  const run = async (f: () => Promise<unknown>, done: string) => {
    if (lock.current) return; lock.current = true; setBusy(true); setError(''); setMessage('');
    try { await f(); setMessage(done); await load(); } catch (e) { setError((e as Error).message); } finally { lock.current = false; setBusy(false); }
  };
  const save = () => overall !== null && run(() => recordOfficialResult(student, { ...form, listening: +form.listening, reading: +form.reading, writing: +form.writing, speaking: +form.speaking, overall }), 'Result recorded. Verify it once you have seen the Test Report Form.').then(() => { setForm(blank); setStudent(''); });
  const field = (k: keyof typeof blank, label: string, type = 'number') => <label className="ix-field" style={{ maxWidth: type === 'number' ? 120 : 220 }}>{label}
    <input type={type} {...(type === 'number' ? { min: 0, max: 9, step: 0.5 } : {})} value={String(form[k])} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} /></label>;

  return <section className="ix-row" aria-labelledby="official-results-title">
    <h3 id="official-results-title">Real IELTS results</h3>
    <p className="ix-muted">Record students' official results after their test, with their agreement. Verified results calibrate the indicative ranges and are the only results that may be used in outcome claims.</p>
    {error && <IeltsNotice error>{error}</IeltsNotice>}{message && <p role="status">{message}</p>}
    {data?.students.map(s => <article key={s.id} className="ix-row">
      <strong>{s.name}</strong>
      {s.mock_ranges.length > 0 && <p className="ix-muted">Mock ranges: {s.mock_ranges.map(r => `${r.mock.replace('IELTS-', '')} ${r.section} ${r.indicative.label}`).join(' · ')}</p>}
      {s.official.map(o => <p key={o.id}>IELTS {o.test_type === 'academic' ? 'Academic' : 'General Training'} {o.test_date}: L {o.listening} · R {o.reading} · W {o.writing} · S {o.speaking} · <strong>Overall {o.overall}</strong> · {o.verified ? 'Verified' : <>Student-reported <IeltsButton disabled={busy} onClick={() => void run(() => verifyOfficialResult(o.id), 'Result verified.')}>I checked the Test Report Form</IeltsButton></>}</p>)}
      {student !== s.id && <IeltsButton disabled={busy} onClick={() => { setStudent(s.id); setForm(blank); }}>Add official result</IeltsButton>}
      {student === s.id && <fieldset className="ix-row"><legend>Official result for {s.name}</legend>
        <div className="ix-actions">{field('test_date', 'Test date', 'date')}
          <label className="ix-field">Test<select value={form.test_type} onChange={e => setForm(f => ({ ...f, test_type: e.target.value }))}><option value="academic">Academic</option><option value="general_training">General Training</option></select></label>
          <label className="ix-field">Delivery<select value={form.delivery} onChange={e => setForm(f => ({ ...f, delivery: e.target.value }))}><option value="computer">Computer</option><option value="paper">Paper</option></select></label></div>
        <div className="ix-actions">{field('listening', 'Listening')}{field('reading', 'Reading')}{field('writing', 'Writing')}{field('speaking', 'Speaking')}<p>Overall: <strong>{overall ?? '—'}</strong></p></div>
        <div className="ix-actions">{field('centre_country', 'Test centre country', 'text')}{field('trf_reference', 'TRF number (optional)', 'text')}</div>
        <label className="ix-check"><input type="checkbox" checked={form.consent} onChange={e => setForm(f => ({ ...f, consent: e.target.checked }))} /><span>The student (and guardian where required) agreed to share this result with the school.</span></label>
        <div className="ix-actions"><IeltsButton variant="primary" disabled={busy || overall === null || !form.test_date || !form.consent} onClick={() => void save()}>Save result</IeltsButton><IeltsButton disabled={busy} onClick={() => setStudent('')}>Cancel</IeltsButton></div>
      </fieldset>}
    </article>)}
  </section>;
}
