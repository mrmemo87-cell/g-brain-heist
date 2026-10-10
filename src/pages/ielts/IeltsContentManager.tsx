import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../services/supabaseClient';
import IeltsMaterialOriginalityReview, { type MaterialReviewTarget } from './IeltsMaterialOriginalityReview';

type SkillTab = 'reading' | 'listening' | 'writing' | 'speaking';
type Q = { question_order:number; question_type:string; body:string; options:string; correct_answer:string; explanation:string };
type ReadingDraft = { id?:string; title:string; slug:string; description:string; level:string; est_band_min:string; est_band_max:string; duration_minutes:string; passage_text:string; is_active:boolean; questions:Q[] };
type ListeningDraft = { id?:string; title:string; slug:string; description:string; level:string; est_band_min:string; est_band_max:string; duration_minutes:string; audio_url:string; transcript:string; is_active:boolean; instructions:string; example_prompt:string; example_answer:string; section_label:string; question_range_label:string; questions:Q[] };
type WritingDraft = { id?:string; slug:string; task_type:string; title:string; prompt:string; bands_target:string; sample_answer:string; is_active:boolean };
type SpeakingDraft = { id?:string; slug:string; part:string; prompt:string; follow_ups:string; is_active:boolean };
type ContentItem = { id:string; title:string; skill:SkillTab; is_active:boolean; difficulty?:string|null; created_at?:string|null; ready_to_assign?:boolean; warnings?:string[] };

const tabs: SkillTab[] = ['reading', 'listening', 'writing', 'speaking'];
const qBlank = (n:number):Q => ({
  question_order: n,
  question_type: 'fill_blank',
  body: '',
  options: '',
  correct_answer: '[]',
  explanation: '',
});
const blankReading = ():ReadingDraft => ({ title: '', slug: '', description: '', level: '', est_band_min: '', est_band_max: '', duration_minutes: '60', passage_text: '', is_active: false, questions: [] });
const blankListening = ():ListeningDraft => ({ title: '', slug: '', description: '', level: '', est_band_min: '', est_band_max: '', duration_minutes: '30', audio_url: '', transcript: '', is_active: false, instructions: '', example_prompt: '', example_answer: '', section_label: '', question_range_label: '', questions: [] });
const blankWriting = ():WritingDraft => ({ slug: '', task_type: '', title: '', prompt: '', bands_target: '', sample_answer: '', is_active: false });
const blankSpeaking = ():SpeakingDraft => ({ slug: '', part: '1', prompt: '', follow_ups: '', is_active: false });
const isValidHttpUrl = (value: string): boolean => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

const IeltsContentManager: React.FC = () => {
  const [activeTab, setActiveTab] = useState<SkillTab>('reading');
  const [items, setItems] = useState<ContentItem[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [targetedQueue, setTargetedQueue] = useState<MaterialReviewTarget[]>([]);
  const [reviewTarget, setReviewTarget] = useState<MaterialReviewTarget | null>(null);
  const [saving, setSaving] = useState(false);
  const [listeningValidationErrors, setListeningValidationErrors] = useState<string[]>([]);

  const [editingListening, setEditingListening] = useState<ListeningDraft | null>(null);
  const [editingReading, setEditingReading] = useState<ReadingDraft | null>(null);
  const [editingWriting, setEditingWriting] = useState<WritingDraft | null>(null);
  const [editingSpeaking, setEditingSpeaking] = useState<SpeakingDraft | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    const [{ data, error: rpcError },{data:queue,error:qe}] = await Promise.all([supabase.rpc('rpc_ielts_content_list'),supabase.rpc('rpc_ielts_material_originality_queue')]);
    if (rpcError) {
      setError(rpcError.message);
      setLoading(false);
      return;
    }
    setItems(Array.isArray(data) ? data : []);
    if(qe) setError(qe.message);
    setTargetedQueue(Array.isArray(queue)?queue:[]);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);
  const hasDraft = Boolean(editingListening || editingReading || editingWriting || editingSpeaking);
  const filtered = useMemo(() => items.filter(i => i.skill === activeTab && i.title.toLowerCase().includes(query.toLowerCase())), [items, activeTab, query]);

  const saveWriting = async () => { if (!editingWriting) return; setSaving(true); setError(null); try { const { data:r, error:e } = await supabase.rpc('rpc_ielts_content_upsert_writing_task', { p_id: editingWriting.id ? Number(editingWriting.id) : null, p_slug: editingWriting.slug || null, p_task_type: editingWriting.task_type || null, p_title: editingWriting.title, p_prompt: editingWriting.prompt, p_bands_target: editingWriting.bands_target || null, p_sample_answer: editingWriting.sample_answer || null, p_is_active: false }); if (e) { setError(e.message); setSaving(false); return; } setEditingWriting(null); setReviewTarget({type:'ielts_writing_task',id:String(r.id),title:editingWriting.title}); setSaving(false); await load(); } catch(e) {setError(e instanceof Error?e.message:'Could not save draft.');} finally {setSaving(false);} };
  const saveSpeaking = async () => { if (!editingSpeaking) return; setSaving(true); setError(null); try { const { data:r, error:e } = await supabase.rpc('rpc_ielts_content_upsert_speaking_task', { p_id: editingSpeaking.id ? Number(editingSpeaking.id) : null, p_slug: editingSpeaking.slug || null, p_part: Number(editingSpeaking.part), p_prompt: editingSpeaking.prompt, p_follow_ups: editingSpeaking.follow_ups ? JSON.parse(editingSpeaking.follow_ups) : null, p_is_active: false }); if (e) { setError(e.message); setSaving(false); return; } setEditingSpeaking(null); setReviewTarget({type:'ielts_speaking_task',id:String(r.id),title:editingSpeaking.prompt}); setSaving(false); await load(); } catch(e) {setError(e instanceof Error?e.message:'Could not save draft.');} finally {setSaving(false);} };

  // Parent and questions save separately. Keep the material unavailable until final originality review.
  const realSaveReading = async () => {
    if (!editingReading) return;
    setSaving(true); setError(null);
    try {
    const qs = editingReading.questions.map(q => ({ question_order: q.question_order, question_type: q.question_type, body: q.body, options: q.options ? JSON.parse(q.options) : null, correct_answer: q.correct_answer ? JSON.parse(q.correct_answer) : null, explanation: q.explanation || null }));
    const { data:r, error:e } = await supabase.rpc('rpc_ielts_content_upsert_reading_set', { p_id: editingReading.id ? Number(editingReading.id) : null, p_title: editingReading.title, p_slug: editingReading.slug || null, p_description: editingReading.description || null, p_level: editingReading.level, p_est_band_min: editingReading.est_band_min ? Number(editingReading.est_band_min) : null, p_est_band_max: editingReading.est_band_max ? Number(editingReading.est_band_max) : null, p_duration_minutes: Number(editingReading.duration_minutes), p_passage_text: editingReading.passage_text || null, p_is_active: false });
    if (e) { setError(e.message); setSaving(false); return; }
    const setId = Number(r?.id);
    setEditingReading({...editingReading,id:String(setId),is_active:false});
    const { error:qe } = await supabase.rpc('rpc_ielts_content_replace_reading_questions', { p_reading_set_id: setId, p_questions: qs });
    if (qe) { setError(qe.message); setSaving(false); return; }
    setEditingReading(null); setReviewTarget({type:'ielts_reading_set',id:String(setId),title:editingReading.title}); setSaving(false); await load();
    } catch(e) {setError(e instanceof Error?e.message:'Could not save reading draft.');} finally {setSaving(false);}
  };

  const saveListening = async () => {
    if (!editingListening) return;
    setListeningValidationErrors([]);
    setError(null);

    const issues:string[] = [];
    if (editingListening.is_active) {
      if (!editingListening.audio_url.trim()) {
        issues.push('Audio URL is required when Active is checked.');
      } else if (!isValidHttpUrl(editingListening.audio_url.trim())) {
        issues.push('Audio URL must start with http:// or https:// and be a valid URL.');
      }
      if (editingListening.questions.length === 0) issues.push('At least one question is required when Active is checked.');
    }

    editingListening.questions.forEach((q, idx) => {
      if (editingListening.is_active && !q.body.trim()) issues.push(`Question ${idx + 1}: Question body is required.`);
      let parsed: unknown = null;
      try {
        parsed = q.correct_answer ? JSON.parse(q.correct_answer) : null;
      } catch {
        issues.push(`Question ${idx + 1}: Correct answer must be valid JSON, example: ["Yes"]`);
        return;
      }
      if (!Array.isArray(parsed)) {
        issues.push(`Question ${idx + 1}: Correct answer must be valid JSON, example: ["Yes"]`);
        return;
      }
      if (editingListening.is_active && parsed.length === 0) {
        issues.push(`Question ${idx + 1}: Correct answer must be a non-empty JSON array.`);
      }
    });

    if (issues.length > 0) {
      setListeningValidationErrors(issues);
      setError(issues.join(' '));
      return;
    }

    setSaving(true);
    try {
      const { data:r, error:e } = await supabase.rpc('rpc_ielts_content_upsert_listening_set', {
        p_id: editingListening.id ? Number(editingListening.id) : null,
        p_title: editingListening.title,
        p_slug: editingListening.slug || null,
        p_description: editingListening.description || null,
        p_level: editingListening.level,
        p_est_band_min: editingListening.est_band_min ? Number(editingListening.est_band_min) : null,
        p_est_band_max: editingListening.est_band_max ? Number(editingListening.est_band_max) : null,
        p_duration_minutes: Number(editingListening.duration_minutes),
        p_audio_url: editingListening.audio_url || null,
        p_is_active: false,
        p_instructions: editingListening.instructions || null,
        p_example_prompt: editingListening.example_prompt || null,
        p_example_answer: editingListening.example_answer || null,
        p_section_label: editingListening.section_label || null,
        p_question_range_label: editingListening.question_range_label || null,
      });
      if (e) throw new Error(e.message);
      const setId = Number(r?.id);
      setEditingListening({...editingListening,id:String(setId),is_active:false});
      const {error:te} = await supabase.rpc('rpc_ielts_material_set_transcript',{p_id:String(setId),p_transcript:editingListening.transcript});
      if(te) throw new Error(te.message);
      const qs = editingListening.questions.map(q => ({
        question_order: q.question_order,
        question_type: q.question_type,
        body: q.body,
        options: q.options ? JSON.parse(q.options) : null,
        correct_answer: q.correct_answer ? JSON.parse(q.correct_answer) : [],
        explanation: q.explanation || null,
      }));
      const { error:qe } = await supabase.rpc('rpc_ielts_content_replace_listening_questions', { p_listening_set_id: setId, p_questions: qs });
      if (qe) throw new Error(qe.message);
      setEditingListening(null);
      setReviewTarget({type:'ielts_listening_set',id:String(setId),title:editingListening.title});
      await load();
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : 'Failed to save listening task.';
      setError(message);
      setListeningValidationErrors(prev => prev.length > 0 ? prev : [message]);
    } finally {
      setSaving(false);
    }
  };

  const loadReading = async (id:string) => { const { data:s, error } = await supabase.from('ielts_reading_sets').select('*').eq('id', Number(id)).single(); if (error) { setError(error.message); return; } const { data:q } = await supabase.from('ielts_reading_questions').select('question_order,question_type,body,options,correct_answer,explanation').eq('set_id', Number(id)).order('question_order'); setEditingReading({ id, title:s.title ?? '', slug:s.slug ?? '', description:s.description ?? '', level:s.level ?? '', est_band_min:s.est_band_min?.toString() ?? '', est_band_max:s.est_band_max?.toString() ?? '', duration_minutes:String(s.duration_minutes ?? 60), passage_text:s.passage_text ?? '', is_active:Boolean(s.is_active), questions:(q ?? []).map((x:any) => ({ question_order:x.question_order, question_type:x.question_type ?? 'short_answer', body:x.body ?? '', options:x.options ? JSON.stringify(x.options) : '', correct_answer:x.correct_answer ? JSON.stringify(x.correct_answer) : '', explanation:x.explanation ?? '' })) }); };
  const loadWriting = async (id:string) => { const { data:s, error } = await supabase.from('ielts_writing_tasks').select('id,slug,task_type,title,prompt,bands_target,sample_answer,is_active').eq('id', Number(id)).single(); if (error) { setError(error.message); return; } setEditingWriting({ id, slug:s.slug ?? '', task_type:s.task_type ?? '', title:s.title ?? '', prompt:s.prompt ?? '', bands_target:s.bands_target ?? '', sample_answer:s.sample_answer ?? '', is_active:Boolean(s.is_active) }); };
  const loadSpeaking = async (id:string) => { const { data:s, error } = await supabase.from('ielts_speaking_tasks').select('id,slug,part,prompt,follow_ups,is_active').eq('id', Number(id)).single(); if (error) { setError(error.message); return; } setEditingSpeaking({ id, slug:s.slug ?? '', part:String(s.part ?? 1), prompt:s.prompt ?? '', follow_ups:s.follow_ups ? JSON.stringify(s.follow_ups) : '', is_active:Boolean(s.is_active) }); };
  const loadListening = async (id:string) => { const {data:review,error:re}=await supabase.rpc('rpc_ielts_material_originality_check',{p_type:'ielts_listening_set',p_id:id}); if(re){setError(re.message);return;}
    const { data:s, error } = await supabase.from('ielts_listening_sets').select('*').eq('id', Number(id)).single();
    if (error) { setError(error.message); return; }
    const { data:q } = await supabase.from('ielts_listening_questions').select('question_order,question_type,body,options,correct_answer,explanation').eq('set_id', Number(id)).order('question_order');
    setListeningValidationErrors([]);
    setEditingListening({ id, title:s.title ?? '', slug:s.slug ?? '', description:s.description ?? '', level:s.level ?? '', est_band_min:s.est_band_min?.toString() ?? '', est_band_max:s.est_band_max?.toString() ?? '', duration_minutes:String(s.duration_minutes ?? 30), audio_url:s.audio_url ?? '', transcript:review?.transcript ?? '', is_active:Boolean(s.is_active), instructions:s.instructions ?? '', example_prompt:s.example_prompt ?? '', example_answer:s.example_answer ?? '', section_label:s.section_label ?? '', question_range_label:s.question_range_label ?? '', questions:(q ?? []).map((x:any) => ({ question_order:x.question_order, question_type:x.question_type ?? 'fill_blank', body:x.body ?? '', options:x.options ? JSON.stringify(x.options) : '', correct_answer:x.correct_answer ? JSON.stringify(x.correct_answer) : '[]', explanation:x.explanation ?? '' })) });
  };

  const updateListeningQuestion = (idx:number, patch:Partial<Q>) => {
    if (!editingListening) return;
    const next = [...editingListening.questions];
    next[idx] = { ...next[idx], ...patch };
    setEditingListening({ ...editingListening, questions: next });
  };

  return <div className="bh-ielts-admin space-y-4 rounded-xl border border-emerald-400/40 bg-slate-950/70 p-4">{/* existing UI omitted for brevity in style parity */}
    <div className="flex items-center justify-between"><h2 className="text-xl font-bold text-emerald-300">IELTS Content</h2><input className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" placeholder="Search title" value={query} onChange={e=>setQuery(e.target.value)} /></div>
    <div className="flex gap-2">{tabs.map(t=><button key={t} onClick={()=>setActiveTab(t)} className={`rounded px-3 py-1 text-sm ${t===activeTab?'bg-emerald-500 text-black':'bg-slate-800 text-slate-200'}`}>{t[0].toUpperCase()+t.slice(1)}</button>)}</div>
    {activeTab==='reading'&&<button onClick={()=>setEditingReading(blankReading())} className="rounded bg-cyan-500 px-3 py-1 text-sm font-semibold text-black">New Reading Task</button>}
    {activeTab==='listening'&&<button onClick={()=>{setListeningValidationErrors([]); setEditingListening(blankListening());}} className="rounded bg-cyan-500 px-3 py-1 text-sm font-semibold text-black">New Listening Task</button>}
    {activeTab==='writing'&&<button onClick={()=>setEditingWriting(blankWriting())} className="rounded bg-cyan-500 px-3 py-1 text-sm font-semibold text-black">New Writing Task</button>}
    {activeTab==='speaking'&&<button onClick={()=>setEditingSpeaking(blankSpeaking())} className="rounded bg-cyan-500 px-3 py-1 text-sm font-semibold text-black">New Speaking Task</button>}
    {targetedQueue.length>0&&<section className="rounded border border-amber-800 p-3"><h2 className="font-semibold">Targeted drafts awaiting originality review</h2>{targetedQueue.map(t=><button className="mt-2 block text-cyan-200" key={t.id} onClick={()=>setReviewTarget(t)}>{t.title} · Review originality</button>)}</section>}
    {reviewTarget&&!hasDraft&&<IeltsMaterialOriginalityReview key={reviewTarget.type+reviewTarget.id} target={reviewTarget} onClose={()=>setReviewTarget(null)} onDone={()=>{setReviewTarget(null);void load();}} />}
    {editingReading&&<section className="space-y-3 rounded border border-slate-700 p-4">
      <h2 className="font-semibold text-white">Reading draft</h2>
      <label className="block">Title<input className="mt-1 w-full rounded bg-slate-900 p-2" value={editingReading.title} onChange={e=>setEditingReading({...editingReading,title:e.target.value})}/></label>
      <label className="block">Level<input className="mt-1 w-full rounded bg-slate-900 p-2" value={editingReading.level} onChange={e=>setEditingReading({...editingReading,level:e.target.value})}/></label>
      <label className="block">Passage<textarea className="mt-1 w-full rounded bg-slate-900 p-2" rows={6} value={editingReading.passage_text} onChange={e=>setEditingReading({...editingReading,passage_text:e.target.value})}/></label>
      {editingReading.questions.map((q,idx)=><div className="space-y-2 rounded border border-slate-700 p-2" key={idx}>
        <label className="block">Question {idx+1}<textarea className="mt-1 w-full rounded bg-slate-900 p-2" value={q.body} onChange={e=>setEditingReading({...editingReading,questions:editingReading.questions.map((x,i)=>i===idx?{...x,body:e.target.value}:x)})}/></label>
        <label className="block">Answer JSON<input className="mt-1 w-full rounded bg-slate-900 p-2" value={q.correct_answer} onChange={e=>setEditingReading({...editingReading,questions:editingReading.questions.map((x,i)=>i===idx?{...x,correct_answer:e.target.value}:x)})}/></label>
        <button onClick={()=>setEditingReading({...editingReading,questions:editingReading.questions.filter((_,i)=>i!==idx).map((x,i)=>({...x,question_order:i+1}))})}>Remove question</button>
      </div>)}
      <div className="flex flex-wrap gap-3"><button onClick={()=>setEditingReading({...editingReading,questions:[...editingReading.questions,qBlank(editingReading.questions.length+1)]})}>Add Question</button><button disabled={saving} onClick={()=>void realSaveReading()}>Save reading draft and review</button><button onClick={()=>setEditingReading(null)}>Cancel</button></div>
    </section>}
    {editingWriting&&<section className="space-y-3 rounded border border-slate-700 p-4">
      <h2 className="font-semibold text-white">Writing draft</h2>
      <label className="block">Title<input className="mt-1 w-full rounded bg-slate-900 p-2" value={editingWriting.title} onChange={e=>setEditingWriting({...editingWriting,title:e.target.value})}/></label>
      <label className="block">Task type<select className="mt-1 w-full rounded bg-slate-900 p-2" value={editingWriting.task_type} onChange={e=>setEditingWriting({...editingWriting,task_type:e.target.value})}><option value="">Choose task type</option><option value="Task 1 Academic">Task 1 Academic</option><option value="Task 1 General">Task 1 General</option><option value="Task 2">Task 2</option>{editingWriting.task_type&&!["Task 1 Academic","Task 1 General","Task 2"].includes(editingWriting.task_type)&&<option value={editingWriting.task_type}>{editingWriting.task_type}</option>}</select></label>
      <label className="block">Prompt<textarea className="mt-1 w-full rounded bg-slate-900 p-2" rows={5} value={editingWriting.prompt} onChange={e=>setEditingWriting({...editingWriting,prompt:e.target.value})}/></label>
      <button disabled={saving} onClick={()=>void saveWriting()}>Save writing draft and review</button><button className="ml-3" onClick={()=>setEditingWriting(null)}>Cancel</button>
    </section>}
    {editingSpeaking&&<section className="space-y-3 rounded border border-slate-700 p-4">
      <h2 className="font-semibold text-white">Speaking draft</h2>
      <label className="block">Part<select className="mt-1 w-full rounded bg-slate-900 p-2" value={editingSpeaking.part} onChange={e=>setEditingSpeaking({...editingSpeaking,part:e.target.value})}>{[1,2,3].map(n=><option key={n} value={n}>Part {n}</option>)}</select></label>
      <label className="block">Prompt<textarea className="mt-1 w-full rounded bg-slate-900 p-2" rows={5} value={editingSpeaking.prompt} onChange={e=>setEditingSpeaking({...editingSpeaking,prompt:e.target.value})}/></label>
      <label className="block">Follow-up prompts (JSON)<textarea className="mt-1 w-full rounded bg-slate-900 p-2" value={editingSpeaking.follow_ups} onChange={e=>setEditingSpeaking({...editingSpeaking,follow_ups:e.target.value})}/></label>
      <button disabled={saving} onClick={()=>void saveSpeaking()}>Save speaking draft and review</button><button className="ml-3" onClick={()=>setEditingSpeaking(null)}>Cancel</button>
    </section>}

    {editingListening && <div className="space-y-3 rounded border border-cyan-500/40 p-3">
      <p className="font-semibold text-cyan-300">Listening Editor</p>
      {listeningValidationErrors.length > 0 && <div className="rounded border border-red-400/60 bg-red-950/40 p-3 text-sm text-red-200"><p className="font-semibold">Please fix the following before continuing:</p><ul className="list-disc pl-5">{listeningValidationErrors.map(err => <li key={err}>{err}</li>)}</ul></div>}
      <label className="block text-sm text-slate-200">Title<input className="mt-1 w-full rounded bg-slate-900 p-2" placeholder="Listening set title" value={editingListening.title} onChange={e=>setEditingListening({...editingListening,title:e.target.value})} /></label>
      <label className="block text-sm text-slate-200">Level<input className="mt-1 w-full rounded bg-slate-900 p-2" placeholder="e.g. B2" value={editingListening.level} onChange={e=>setEditingListening({...editingListening,level:e.target.value})} /></label>
      <label className="block text-sm text-slate-200">Duration minutes<input className="mt-1 w-full rounded bg-slate-900 p-2" placeholder="30" value={editingListening.duration_minutes} onChange={e=>setEditingListening({...editingListening,duration_minutes:e.target.value})} /></label>
      <label className="block text-sm text-slate-200">Audio URL<input className="mt-1 w-full rounded bg-slate-900 p-2" placeholder="https://...mp3" value={editingListening.audio_url} onChange={e=>setEditingListening({...editingListening,audio_url:e.target.value})} /></label>
      <label className="block text-sm text-slate-200">Description<textarea className="mt-1 w-full rounded bg-slate-900 p-2" placeholder="Short description" value={editingListening.description} onChange={e=>setEditingListening({...editingListening,description:e.target.value})} /></label>
      <label className="block text-sm text-slate-200">Instructions<textarea className="mt-1 w-full rounded bg-slate-900 p-2" placeholder="Answer while listening..." value={editingListening.instructions} onChange={e=>setEditingListening({...editingListening,instructions:e.target.value})} /></label>
      <label className="block text-sm text-slate-200">Example prompt<input className="mt-1 w-full rounded bg-slate-900 p-2" placeholder="Example question" value={editingListening.example_prompt} onChange={e=>setEditingListening({...editingListening,example_prompt:e.target.value})} /></label>
      <label className="block text-sm text-slate-200">Example answer<input className="mt-1 w-full rounded bg-slate-900 p-2" placeholder="Example answer" value={editingListening.example_answer} onChange={e=>setEditingListening({...editingListening,example_answer:e.target.value})} /></label>
      <label className="block text-sm text-slate-200">Section label<input className="mt-1 w-full rounded bg-slate-900 p-2" placeholder="Section 1" value={editingListening.section_label} onChange={e=>setEditingListening({...editingListening,section_label:e.target.value})} /></label>
      <label className="block text-sm text-slate-200">Question range label<input className="mt-1 w-full rounded bg-slate-900 p-2" placeholder="Questions 1-10" value={editingListening.question_range_label} onChange={e=>setEditingListening({...editingListening,question_range_label:e.target.value})} /></label>
      <label className="text-sm text-slate-200"><input type="checkbox" checked={editingListening.is_active} onChange={e=>setEditingListening({...editingListening,is_active:e.target.checked})} /> Validate for publication</label>

      <div className="space-y-2">
        <label className="block text-sm text-slate-300">Private transcript for originality review<textarea className="mt-1 w-full rounded bg-slate-900 p-2" rows={5} value={editingListening.transcript} onChange={e=>setEditingListening({...editingListening,transcript:e.target.value})} /></label>
        <p className="text-xs text-slate-400">The transcript stays private. Save a draft, then compare and approve the complete task before publication.</p>
        <h3 className="text-lg font-semibold text-cyan-200">Questions</h3>
        {editingListening.questions.length === 0 && <p className="text-sm text-slate-300">0 questions added</p>}
        {editingListening.questions.map((q, idx) => <div key={`${q.question_order}-${idx}`} className="rounded border border-slate-700 p-2 space-y-2">
          <label className="block text-xs text-slate-300">Order<input className="mt-1 w-full rounded bg-slate-900 p-1" value={q.question_order} onChange={e=>updateListeningQuestion(idx,{question_order:Number(e.target.value)||idx+1})} /></label>
          <label className="block text-xs text-slate-300">Type<input className="mt-1 w-full rounded bg-slate-900 p-1" value={q.question_type} onChange={e=>updateListeningQuestion(idx,{question_type:e.target.value})} /></label>
          <label className="block text-xs text-slate-300">Question body<textarea className="mt-1 w-full rounded bg-slate-900 p-1" value={q.body} onChange={e=>updateListeningQuestion(idx,{body:e.target.value})} /></label>
          <label className="block text-xs text-slate-300">Correct answer JSON<input className="mt-1 w-full rounded bg-slate-900 p-1" value={q.correct_answer} onChange={e=>updateListeningQuestion(idx,{correct_answer:e.target.value})} /></label>
          <p className="text-xs text-slate-400">Use JSON array, example: ["September", "september"]</p>
          <label className="block text-xs text-slate-300">Explanation<textarea className="mt-1 w-full rounded bg-slate-900 p-1" value={q.explanation} onChange={e=>updateListeningQuestion(idx,{explanation:e.target.value})} /></label>
          <button className="rounded bg-slate-700 px-2 py-1 text-xs" onClick={()=>setEditingListening({...editingListening,questions:editingListening.questions.filter((_,i)=>i!==idx).map((x,i)=>({...x,question_order:i+1}))})}>Remove</button>
        </div>)}
      </div>

      <div className="flex gap-2"><button className="rounded bg-cyan-500 px-3 py-1 text-sm font-semibold text-black" onClick={()=>setEditingListening({...editingListening,questions:[...editingListening.questions,qBlank(editingListening.questions.length+1)]})}>Add Question</button><button className="rounded bg-emerald-500 px-2 py-1 text-xs font-semibold text-black" onClick={()=>void saveListening()} disabled={saving}>{saving?'Saving…':'Save draft and review'}</button></div>
    </div>}

    {loading&&<p className="text-slate-300">Loading…</p>}{error&&<p className="text-red-300">{error}</p>}
    <div className="space-y-2">{filtered.map(item=><div key={`${item.skill}-${item.id}`} className="rounded border border-slate-700 bg-slate-900/60 p-3"><div className="flex items-center justify-between"><div><p className="font-semibold text-white">{item.title}</p><p className="text-xs text-slate-400">{item.skill} · {item.difficulty??'—'} · {item.created_at?new Date(item.created_at).toLocaleDateString():'—'}</p></div><div className="flex flex-wrap items-center gap-2"><button className="rounded bg-cyan-900 px-2 py-1 text-xs disabled:opacity-50" disabled={saving||hasDraft} onClick={()=>setReviewTarget({type:`ielts_${item.skill}_${item.skill==='reading'||item.skill==='listening'?'set':'task'}`,id:String(item.id),title:item.title})}>Review originality</button>{item.skill==='listening'&&<button className="rounded bg-slate-700 px-2 py-1 text-xs" onClick={()=>void loadListening(item.id)}>Edit</button>}{item.skill==='reading'&&<button className="rounded bg-slate-700 px-2 py-1 text-xs" onClick={()=>void loadReading(item.id)}>Edit</button>}{item.skill==='writing'&&<button className="rounded bg-slate-700 px-2 py-1 text-xs" onClick={()=>void loadWriting(item.id)}>Edit</button>}{item.skill==='speaking'&&<button className="rounded bg-slate-700 px-2 py-1 text-xs" onClick={()=>void loadSpeaking(item.id)}>Edit</button>}<span className={`text-xs ${item.is_active?'text-emerald-300':'text-amber-300'}`}>{item.is_active?'Active':'Inactive'}</span></div></div></div>)}</div>
  </div>;
};

export default IeltsContentManager;
