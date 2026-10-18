import React, { useEffect, useRef, useState } from 'react';
import { mockSittings, openMockSitting, mockSitting, saveMockResult, normaliseMarks, marksSummary, type MockSitting, type MockSittingList, type MockSection, type MockResult } from '../../../services/ieltsMockResults';
import { IeltsButton, IeltsNotice } from '../../components/ielts/IeltsUi';
import IeltsOfficialResults from './IeltsOfficialResults';

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bishkek' });
const writingFields = [['t1', 'ta', 'T1 Task Achievement'], ['t1', 'cc', 'T1 Coherence'], ['t1', 'lr', 'T1 Lexical'], ['t1', 'gra', 'T1 Grammar'], ['t2', 'tr', 'T2 Task Response'], ['t2', 'cc', 'T2 Coherence'], ['t2', 'lr', 'T2 Lexical'], ['t2', 'gra', 'T2 Grammar']] as const;
const speakingFields = [['fc', 'Fluency & Coherence'], ['lr', 'Lexical Resource'], ['gra', 'Grammar'], ['p', 'Pronunciation']] as const;

function Range({ result }: { result?: MockResult }) {
  if (!result) return null;
  if (result.exposed) return <p className="ix-muted">Already sat this mock: practice only, no range.</p>;
  return <p>{result.raw !== null && <span>{result.raw}/40{result.answered !== null && result.answered < 40 ? ` (${40 - result.answered} blank)` : ''} · </span>}
    {result.indicative ? <><strong>Indicative band range {result.indicative.label}</strong> <span className="ix-muted">· Confidence: low · Not an official IELTS result</span></> : <span className="ix-muted">No indicative range (complete ratings, and audio for Speaking, are needed)</span>}</p>;
}

function ObjectiveRow({ section, result, onSave, busy }: { section: 'listening' | 'reading'; result?: MockResult; onSave: (marks: string) => void; busy: boolean }) {
  const [value, setValue] = useState(result?.marks ?? '');
  const s = marksSummary(value);
  return <div className="ix-field">
    <label>{section === 'listening' ? 'Listening' : 'Reading'} marks (1 correct · 0 wrong · - blank)
      <input value={value} inputMode="numeric" spellCheck={false} maxLength={60} style={{ fontFamily: 'monospace', letterSpacing: '0.08em' }}
        aria-invalid={value.length > 0 && !s.valid} onChange={e => setValue(normaliseMarks(e.target.value))} placeholder="1101111-01…" /></label>
    <span className="ix-muted" aria-live="polite">{s.valid ? `${s.length}/40 entered · ${s.correct} correct` : 'Use only 1, 0 and -'}</span>
    <IeltsButton disabled={busy || !s.complete || value === result?.marks} onClick={() => onSave(value)}>Save {section}</IeltsButton>
    <Range result={result} />
  </div>;
}

function BandInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <label className="ix-field" style={{ maxWidth: 150 }}>{label}<input type="number" min={0} max={9} step={0.5} value={value} onChange={e => onChange(e.target.value)} /></label>;
}
const band = (v: string) => v === '' ? null : Number(v);
const validBand = (v: string) => v !== '' && Number(v) >= 0 && Number(v) <= 9 && Number(v) * 2 === Math.floor(Number(v) * 2);

function WritingRow({ result, onSave, busy }: { result?: MockResult; onSave: (c: Record<string, unknown>) => void; busy: boolean }) {
  const c = (result?.criteria ?? {}) as Record<string, Record<string, number>>;
  const [v, setV] = useState<Record<string, string>>(Object.fromEntries(writingFields.map(([t, k]) => [`${t}.${k}`, c[t]?.[k] !== undefined ? String(c[t][k]) : ''])));
  const ok = writingFields.every(([t, k]) => validBand(v[`${t}.${k}`]));
  return <fieldset className="ix-row"><legend>Writing (Task 2 counts double)</legend>
    <div className="ix-actions">{writingFields.map(([t, k, l]) => <BandInput key={`${t}.${k}`} label={l} value={v[`${t}.${k}`]} onChange={x => setV(o => ({ ...o, [`${t}.${k}`]: x }))} />)}</div>
    <IeltsButton disabled={busy || !ok} onClick={() => onSave({ t1: { ta: band(v['t1.ta']), cc: band(v['t1.cc']), lr: band(v['t1.lr']), gra: band(v['t1.gra']) }, t2: { tr: band(v['t2.tr']), cc: band(v['t2.cc']), lr: band(v['t2.lr']), gra: band(v['t2.gra']) } })}>Save writing</IeltsButton>
    <Range result={result} />
  </fieldset>;
}

function SpeakingRow({ result, onSave, busy }: { result?: MockResult; onSave: (c: Record<string, unknown>) => void; busy: boolean }) {
  const c = (result?.criteria ?? {}) as Record<string, number | boolean>;
  const [v, setV] = useState<Record<string, string>>(Object.fromEntries(speakingFields.map(([k]) => [k, c[k] !== undefined ? String(c[k]) : ''])));
  const [audio, setAudio] = useState(Boolean(c.audio));
  const ok = speakingFields.every(([k]) => validBand(v[k]));
  return <fieldset className="ix-row"><legend>Speaking</legend>
    <div className="ix-actions">{speakingFields.map(([k, l]) => <BandInput key={k} label={l} value={v[k]} onChange={x => setV(o => ({ ...o, [k]: x }))} />)}</div>
    <label className="ix-check"><input type="checkbox" checked={audio} onChange={e => setAudio(e.target.checked)} /><span>I listened to the student's speech live or recorded (needed for Pronunciation and a range)</span></label>
    <IeltsButton disabled={busy || !ok} onClick={() => onSave({ fc: band(v.fc), lr: band(v.lr), gra: band(v.gra), p: band(v.p), audio })}>Save speaking</IeltsButton>
    <Range result={result} />
  </fieldset>;
}

/** Mock results: record a sitting, enter each student's marks or ratings, and see indicative band ranges. */
export default function IeltsMockCapture({ batchId }: { batchId: string }) {
  const [list, setList] = useState<MockSittingList | null>(null);
  const [sitting, setSitting] = useState<MockSitting | null>(null);
  const [mock, setMock] = useState('IELTS-M1'), [satOn, setSatOn] = useState(today()), [delivery, setDelivery] = useState<'paper' | 'computer'>('paper');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const lock = useRef(false);
  const loadList = () => mockSittings(batchId).then(setList).catch(e => setError(e.message));
  useEffect(() => { void loadList(); }, [batchId]);
  const open = async (id: string) => { setError(''); setMessage(''); try { setSitting(await mockSitting(id)); } catch (e) { setError((e as Error).message); } };
  const create = async () => {
    if (lock.current) return; lock.current = true; setBusy(true); setError('');
    try { const id = await openMockSitting(batchId, mock, satOn, delivery); await loadList(); await open(id); } catch (e) { setError((e as Error).message); }
    finally { lock.current = false; setBusy(false); }
  };
  const save = async (student: string, section: MockSection, marks: string | null, criteria: Record<string, unknown> | null) => {
    if (!sitting || lock.current) return; lock.current = true; setBusy(true); setError(''); setMessage('');
    const current = sitting.students.find(s => s.id === student)?.results[section];
    try {
      const saved = await saveMockResult(sitting.sitting.id, student, section, marks, criteria, current?.revision ?? null);
      setSitting(s => s && ({ ...s, students: s.students.map(x => x.id === student ? { ...x, results: { ...x.results, [section]: saved } } : x) }));
      setMessage(`Saved ${section} for ${sitting.students.find(s => s.id === student)?.name}.`);
    } catch (e) { setError((e as Error).message); }
    finally { lock.current = false; setBusy(false); }
  };

  return <section className="ix-list" aria-label="Mock results">
    <IeltsNotice>Record each student's marks from the paper answer sheet (or computer sitting). Results feed each student's learning record. A full, first sitting of a mock gives an <strong>indicative band range</strong> based on IELTS's published average marks — always a range, confidence low, not an official IELTS result.</IeltsNotice>
    {error && <IeltsNotice error>{error}</IeltsNotice>}{message && <p role="status">{message}</p>}
    {!sitting && <>
      <article className="ix-row"><h3>Record a mock sitting</h3>
        <div className="ix-actions">
          <label className="ix-field">Mock<select value={mock} onChange={e => setMock(e.target.value)}>{(list?.forms ?? [{ code: 'IELTS-M1', title: 'Mock Test 1' }]).map(f => <option key={f.code} value={f.code}>{f.code.replace('IELTS-', '')} · {f.title}</option>)}</select></label>
          <label className="ix-field">Date taken<input type="date" value={satOn} max={today()} onChange={e => setSatOn(e.target.value)} /></label>
          <label className="ix-field">Delivery<select value={delivery} onChange={e => setDelivery(e.target.value as 'paper' | 'computer')}><option value="paper">Paper</option><option value="computer">Computer</option></select></label>
        </div>
        <IeltsButton variant="primary" disabled={busy || !satOn} onClick={() => void create()}>{busy ? 'Opening…' : 'Open results sheet'}</IeltsButton>
      </article>
      {list && list.sittings.length > 0 && <article className="ix-row"><h3>Recorded sittings</h3>
        {list.sittings.map(s => <p key={s.id}><IeltsButton onClick={() => void open(s.id)}>{s.mock_code.replace('IELTS-', '')} · {s.sat_on} · {s.delivery} · {s.results} students</IeltsButton></p>)}
      </article>}
      <IeltsOfficialResults batchId={batchId} />
    </>}
    {sitting && <>
      <div className="ix-header"><h3>{sitting.form.title} · {sitting.sitting.sat_on} · {sitting.sitting.delivery}</h3><IeltsButton disabled={busy} onClick={() => { setSitting(null); void loadList(); }}>All sittings</IeltsButton></div>
      {sitting.students.map(s => <details key={s.id} className="ix-row">
        <summary><strong>{s.name}</strong>{s.exposed ? ' · repeat sitting (practice)' : ''} · {Object.keys(s.results).length}/4 sections saved</summary>
        <ObjectiveRow section="listening" result={s.results.listening} busy={busy} onSave={m => void save(s.id, 'listening', m, null)} />
        <ObjectiveRow section="reading" result={s.results.reading} busy={busy} onSave={m => void save(s.id, 'reading', m, null)} />
        <WritingRow result={s.results.writing} busy={busy} onSave={c => void save(s.id, 'writing', null, c)} />
        <SpeakingRow result={s.results.speaking} busy={busy} onSave={c => void save(s.id, 'speaking', null, c)} />
      </details>)}
      <p className="ix-muted">Every save is kept in the history. Indicative ranges use policy {sitting.policy}; they become calibrated only as students report real IELTS results.</p>
    </>}
  </section>;
}
