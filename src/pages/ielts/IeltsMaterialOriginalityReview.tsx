import React, { useEffect, useState } from 'react';
import { supabase } from '../../../services/supabaseClient';

export type MaterialReviewTarget = { type: string; id: string; title: string };
type Preview = { passage_or_prompt?: string; questions?: unknown; recording_reference?: string; audio_preview_url?: string | null };
type Match = { preview?: Preview | null; material_type: string; material_id: string; content_hash: string; display_code: string; reason: string; similarity: number };
type Check = { preview?: Preview; display_code: string; skill: string; content_hash: string; match_hash: string; matches: Match[]; label: string | null; transcript: string | null };
const reasonLabels: Record<string, string> = { exact_copy: 'Exact copy', shared_text: 'Same passage or prompt', shared_questions: 'Same questions', shared_recording: 'Same recording reference', shared_script: 'Same script', similar_content: 'Similar wording — compare the learning task' };

export default function IeltsMaterialOriginalityReview({ target, onDone, onClose }: { target: MaterialReviewTarget; onDone: () => void; onClose: () => void }) {
  const [check, setCheck] = useState<Check | null>(null);
  const [decision, setDecision] = useState('fresh');
  const [parent, setParent] = useState('');
  const [rationale, setRationale] = useState('');
  const [contentChecked, setContentChecked] = useState(false);
  const [recordingChecked, setRecordingChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const refresh = async () => {
    setBusy(true); setError(''); setContentChecked(false); setRecordingChecked(false);
    try {
      const { data, error: e } = await supabase.rpc('rpc_ielts_material_originality_check', { p_type: target.type, p_id: target.id });
      if (e) throw new Error(e.message);
      setCheck(data as Check);
      if ((data as Check).matches.some(m => m.reason.startsWith('shared_'))) setDecision('variant');
    } catch (e) { setError(e instanceof Error ? e.message : 'The comparison could not load.'); }
    finally { setBusy(false); }
  };
  useEffect(() => { void refresh(); }, [target.type, target.id]);
  const exact = check?.matches.some(m => m.reason === 'exact_copy');
  const save = async () => {
    if (!check) return;
    const selected = check.matches.find(m => `${m.material_type}:${m.material_id}:${m.content_hash}` === parent);
    setBusy(true); setError('');
    try {
      const { error: e } = await supabase.rpc('rpc_ielts_material_originality_review', {
        p_type: target.type, p_id: target.id, p_content_hash: check.content_hash, p_match_hash: check.match_hash,
        p_decision: decision, p_parent_type: decision === 'variant' ? selected?.material_type ?? null : null,
        p_parent_id: decision === 'variant' ? selected?.material_id ?? null : null,
        p_parent_hash: decision === 'variant' ? selected?.content_hash ?? null : null,
        p_rationale: rationale, p_content_checked: contentChecked, p_recording_checked: recordingChecked, p_publish: target.type !== 'targeted',
      });
      if (e) throw new Error(e.message);
      onDone();
    } catch (e) { setError(e instanceof Error ? e.message : 'The review could not be saved.'); }
    finally { setBusy(false); }
  };
  return <section aria-label="Material originality review" className="space-y-4 rounded-xl border border-cyan-800 bg-slate-900 p-5 text-slate-100">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-semibold">Originality review · {check?.display_code ?? target.title}</h2><button onClick={onClose} disabled={busy}>Close review</button></div>
    <p className="text-sm text-slate-300">Compare the actual task with earlier materials. A different title or code does not make a new task. Wording checks help you review; they cannot establish independence or comparable difficulty.</p>
    {check && <>
      <p className="text-sm">{check.label ?? 'Draft — originality approval required'}</p>{check.preview&&<details className="text-sm"><summary>Inspect this saved task</summary><p className="mt-2 whitespace-pre-wrap">{check.preview.passage_or_prompt}</p><pre className="mt-2 whitespace-pre-wrap break-words">{JSON.stringify(check.preview.questions,null,2)}</pre>{check.preview.audio_preview_url&&/^https?:\/\//i.test(check.preview.audio_preview_url)&&<audio className="mt-2 w-full" controls preload="none" src={check.preview.audio_preview_url}>Recording preview</audio>}</details>}
      {check.matches.length === 0 ? <p>No matching wording or source references flagged. Human review is still required.</p> : <ul className="space-y-2">{check.matches.map(m => <li key={`${m.material_type}:${m.material_id}:${m.content_hash}`} className="rounded bg-slate-800 p-3"><strong>{m.display_code}</strong>{check.matches.filter(v=>v.display_code===m.display_code).length>1&&<span className="ml-2 text-xs">Content {m.content_hash.slice(0,8)}</span>} · {reasonLabels[m.reason] ?? m.reason}{m.preview ? <details className="mt-2 text-sm"><summary>Compare saved material</summary><p className="mt-2 whitespace-pre-wrap">{m.preview.passage_or_prompt}</p><pre className="mt-2 whitespace-pre-wrap break-words">{JSON.stringify(m.preview.questions, null, 2)}</pre>{m.preview.audio_preview_url&&/^https?:\/\//i.test(m.preview.audio_preview_url)&&<audio className="mt-2 w-full" controls preload="none" src={m.preview.audio_preview_url}>Earlier recording preview</audio>}{m.preview.recording_reference&&<p className="break-all">Recording reference: {m.preview.recording_reference}</p>}</details> : <p className="mt-2 text-sm">Protected targeted material — a platform content administrator must compare it.</p>}</li>)}</ul>}
      {exact ? <p role="alert" className="text-amber-200">This is an exact copy. Reuse the existing material; it cannot be approved under another code.</p> : <>
        <label className="block">Review decision<select className="mt-1 w-full rounded bg-slate-800 p-2" value={decision} onChange={e => setDecision(e.target.value)}><option value="fresh">New task with substantively different content</option><option value="variant">Intentional variant · repeat practice</option></select></label>
        {decision === 'variant' && <label className="block">Original material<select className="mt-1 w-full rounded bg-slate-800 p-2" value={parent} onChange={e => setParent(e.target.value)}><option value="">Choose the matching original</option>{check.matches.map(m => <option key={m.content_hash + m.material_id} value={`${m.material_type}:${m.material_id}:${m.content_hash}`}>{m.display_code}{check.matches.filter(v=>v.display_code===m.display_code).length>1?` · content ${m.content_hash.slice(0,8)}`:""} · {reasonLabels[m.reason]}</option>)}</select></label>}
        <label className="block">What makes this task different?<textarea className="mt-1 w-full rounded bg-slate-800 p-2" rows={3} value={rationale} onChange={e => setRationale(e.target.value)} placeholder="Explain the new passage, evidence, answer logic or response demand. For a variant, explain what is reused and why." /></label>
        <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={contentChecked} onChange={e => setContentChecked(e.target.checked)} />I compared the task content, questions and answer logic with related earlier material.</label>
        {check.skill === 'listening' && <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={recordingChecked} onChange={e => setRecordingChecked(e.target.checked)} />I listened to the actual recording and compared its script and answers.</label>}
        <button className="rounded bg-emerald-500 px-4 py-2 font-semibold text-black disabled:opacity-50" disabled={busy || !contentChecked || rationale.trim().length < 20 || (check.skill === 'listening' && !recordingChecked) || (decision === 'variant' && !parent)} onClick={() => void save()}>{busy ? 'Saving review…' : target.type === 'targeted' ? 'Confirm originality review' : 'Confirm review and publish'}</button>
      </>}
    </>}
    {error && <p role="alert" className="text-red-300">{error}</p>}
    <button className="text-sm text-cyan-200" disabled={busy} onClick={() => void refresh()}>{busy ? 'Checking…' : 'Refresh comparison'}</button>
  </section>;
}
