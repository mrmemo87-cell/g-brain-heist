import React, { useEffect, useRef, useState } from 'react';
import { getCompanionSnapshot, saveCompanion, sendCrewSignal } from '../../../services/retentionTrialService';
import { companionError, CREW_MESSAGES, hideoutStage, MYSTERY_CHAPTERS, type CompanionPalette, type CompanionSnapshot, type CrewSignal } from './companionModel';
import { playRetentionSound, primeRetentionSound } from './retentionSound';
import EchoAvatar from './EchoAvatar';
import EchoFloating from './EchoFloating';
import { ECHO_ACTIVITY_EVENT, ECHO_POSES, ECHO_POSE_LABELS, readEchoPreference, saveEchoPreference, type EchoPose, type EchoPosition } from './echoModel';

function HideoutScene({ stage }: { stage: number }) {
 return <svg className="retention-hideout-scene" viewBox="0 0 480 260" fill="none" aria-hidden="true">
  <path d="m16 194 218-128 230 128-218 63Z" fill="#17283b" stroke="#36546c"/>
  <path d="M90 147V72l149-45 148 46v77l-148 83Z" fill="#182536" stroke="#537089" strokeWidth="2"/>
  <path d="m90 72 149 74 148-73M239 146v87" stroke="#00d0e8" strokeWidth="2"/>
  <path d="M110 85v44l102 51v-44Z" fill="#0e1827" stroke="#355a72"/>
  <path d="m265 142 98-49v43l-98 52Z" fill="#0e1827" stroke="#355a72"/>
  <g data-room="signal" opacity={stage >= 1 ? 1 : .18}><path d="m130 114 68 34v-15l-68-34Z" fill="#00d0e8"/><path d="m145 156 49 24 27-15-49-24Z" fill="#314158" stroke="#00d0e8"/><path d="M172 150v-22" stroke="#00d0e8" strokeWidth="3"/></g>
  <g data-room="studio" opacity={stage >= 2 ? 1 : .18}><path d="m278 155 70-34v18l-70 34Z" fill="#ff2d91"/><path d="m265 196 54-28 35 16-54 28Z" fill="#3d244a" stroke="#ff2d91"/><path d="M310 159v24" stroke="#ff2d91" strokeWidth="3"/><circle cx="309" cy="156" r="10" fill="#ff2d91"/></g>
  <g data-room="rooftop" opacity={stage >= 3 ? 1 : .18}><path d="m177 66 62-21 64 22-64 31Z" fill="#263951" stroke="#b58aff"/><path d="M239 64V14m-18 12q18-20 36 0m-26 9q8-10 16 0" stroke="#b58aff" strokeWidth="3" strokeLinecap="round"/><circle cx="239" cy="12" r="5" fill="#b58aff"/></g>
  <path d="m239 247-1-6m-15-3-5-4m34 4 5-4" stroke="#00d0e8" strokeWidth="2"/>
 </svg>;
}

/** One short, scoped GSAP sequence per deliberate interaction; no rendering loop. */
function useCompanionCelebration(root: { current: HTMLElement | null }, cue: number) {
 useEffect(() => {
  if (!cue || !root.current) return;
  const media = window.matchMedia('(prefers-reduced-motion: reduce)'); if (media.matches) return;
  let cancelled = false; let revert: (() => void) | undefined;
  const stop = () => { cancelled = true; revert?.(); };
  const hidden = () => { if (document.visibilityState === 'hidden') stop(); };
  void import('gsap').then(({ gsap }) => {
   if (cancelled || !root.current || media.matches) return;
   const context = gsap.context(() => {
    const timeline = gsap.timeline();
    timeline.to('.retention-companion-body', { y: -14, rotation: -7, scale: 1.04, duration: .2, ease: 'power2.out' })
     .to('.retention-companion-body', { y: 0, rotation: 5, scale: 1, duration: .2 })
     .to('.retention-companion-body', { rotation: 0, duration: .25, ease: 'back.out(2)', clearProps: 'transform' });
    gsap.fromTo('.retention-orbit-particle', { x: 0, y: 0, opacity: 1, scale: .4 }, {
     x: (index: number) => Math.cos(index * Math.PI / 6) * 100,
     y: (index: number) => Math.sin(index * Math.PI / 6) * 80,
     rotation: 110, opacity: 0, scale: 1.1, duration: .75, ease: 'power2.out', clearProps: 'transform',
    });
    gsap.fromTo('[data-room]', { y: 5 }, { y: 0, duration: .4, stagger: .07, clearProps: 'transform' });
   }, root.current);
   revert = () => context.revert();
  }).catch(() => {});
  media.addEventListener('change', stop); document.addEventListener('visibilitychange', hidden);
  return () => { stop(); media.removeEventListener('change', stop); document.removeEventListener('visibilitychange', hidden); };
 }, [root, cue]);
}

export default function RetentionCompanion({ userId, teacher = false, runs = 0, contributions = 0 }: { userId: string; teacher?: boolean; runs?: number; contributions?: number }) {
 const root = useRef<HTMLElement>(null); const lock = useRef(false); const mounted = useRef(true);
 const [data, setData] = useState<CompanionSnapshot | null>(null); const [error, setError] = useState('');
 const [editing, setEditing] = useState(false); const [draft, setDraft] = useState('Echo'); const [palette, setPalette] = useState<CompanionPalette>('cyan');
 const [busy, setBusy] = useState(false); const [cue, setCue] = useState(0); const [message, setMessage] = useState('Ready when you are. Let’s follow one good clue.');
 const [selected, setSelected] = useState(''); const [scrapbook, setScrapbook] = useState(false);
 const [refreshAt, setRefreshAt] = useState(0);
 const [pose, setPose] = useState<EchoPose>('greeting');
 const [floatPreference, setFloatPreference] = useState(() => readEchoPreference(userId));
 const [practicing, setPracticing] = useState(false);
 const greetingIndex = useRef(0);
 const poseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
 const respond = (next: EchoPose) => { if (poseTimer.current) clearTimeout(poseTimer.current); setPose(next); if (next !== 'greeting' && next !== 'thinking') poseTimer.current = setTimeout(() => { setPose('greeting'); poseTimer.current = null; }, 6500); };
 const rememberFloat = (changes: Partial<typeof floatPreference>) => setFloatPreference(current => { const next = { ...current, ...changes }; saveEchoPreference(userId, next); return next; });
 useEffect(() => {
  const activity = (event: Event) => { const detail = (event as CustomEvent).detail; if (detail?.userId !== userId) return; if (typeof detail.practicing === 'boolean') setPracticing(detail.practicing); if (ECHO_POSES.includes(detail.pose)) respond(detail.pose); };
  window.addEventListener(ECHO_ACTIVITY_EVENT, activity);
  return () => { window.removeEventListener(ECHO_ACTIVITY_EVENT, activity); if (poseTimer.current) clearTimeout(poseTimer.current); };
 }, [userId]);
 useEffect(() => { mounted.current = true; let active = true;
  getCompanionSnapshot(userId).then(snapshot => { if (active) { setData(snapshot); setDraft(snapshot.companion?.name ?? 'Echo'); setPalette(snapshot.companion?.palette ?? 'cyan'); } }).catch(() => { if (active) setError('Your companion could not connect. Your learning tools are still ready.'); });
  return () => { active = false; mounted.current = false; };
 }, [userId]);
 useCompanionCelebration(root, cue);
 const companionName = data?.companion?.name ?? 'Echo';
 const room = data?.crews.find(item => item.id === selected) ?? data?.crews[0];
 const stage = hideoutStage(room); const chapter = MYSTERY_CHAPTERS[Math.min(3, Math.max(0, runs))];
 const celebrate = (text: string, sound: 'tap' | 'unlock' | 'complete' | 'thanks' = 'unlock', nextPose: EchoPose = 'curious') => {
  primeRetentionSound(userId); playRetentionSound(userId, sound); setMessage(text); setCue(value => value + 1); respond(nextPose);
 };
 const greet = () => { const lines = [`${companionName}, reporting for curiosity.`, 'Detective ears: on. What’s our next clue?', 'Tiny clue. Big possibility.']; const line = lines[greetingIndex.current++ % lines.length]; celebrate(line, 'tap', 'greeting'); };
 const save = async (event: { preventDefault(): void }) => {
  event.preventDefault(); if (lock.current) return; lock.current = true; setBusy(true); setError('');
  primeRetentionSound(userId);
  try { const profile = await saveCompanion(userId, { name: draft.trim(), palette });
   if (mounted.current) { setData(current => current ? { ...current, companion: profile } : current); setEditing(false); celebrate(`It’s official. I’m ${profile.name}, your partner in curiosity!`, 'complete', 'celebrate'); }
  } catch (e) { if (mounted.current) setError(companionError(e)); } finally { lock.current = false; if (mounted.current) setBusy(false); }
 };
 const signal = async (kind: CrewSignal) => {
  if (!room || room.sent_today || lock.current) return; lock.current = true; setBusy(true); setError(''); primeRetentionSound(userId);
  try { await sendCrewSignal(userId, room.id, kind);
   if (mounted.current) { setData(current => current ? { ...current, crews: current.crews.map(item => item.id === room.id ? { ...item, sent_today: true } : item) } : current); celebrate(teacher ? 'Your encouragement is saved for this crew.' : 'Your cheer is saved for the crew. Small gestures count.', 'thanks', teacher ? 'keepsake' : 'cheer'); }
  } catch (e) { if (mounted.current) setError(companionError(e)); } finally { lock.current = false; if (mounted.current) setBusy(false); }
 };
 const refresh = async () => {
  if (lock.current || Date.now() < refreshAt) return; lock.current = true; setBusy(true); setError('');
  try { const snapshot = await getCompanionSnapshot(userId, true); if (mounted.current) { setData(snapshot); setRefreshAt(Date.now() + 60000); } }
  catch { if (mounted.current) setError('Could not refresh the crew just now. Try again.'); }
  finally { lock.current = false; if (mounted.current) setBusy(false); }
 };
 if (data && !data.enabled) return null;
 return <section ref={root} className={`retention-companion-world retention-palette-${data?.companion?.palette ?? 'cyan'}`} aria-label={teacher ? 'Your crew connections' : 'Your companion and crew hideout'} data-retention-reveal>
  {!teacher ? <div className={`retention-companion-hero ${floatPreference.enabled ? 'is-floating-mode' : ''}`}>
   {!floatPreference.enabled ? <div className="retention-companion-stage"><div className="retention-companion-halo" aria-hidden="true"/>
    <button type="button" className="retention-companion-touch" aria-label={`Greet ${data?.companion?.name ?? 'Echo'}`} onClick={greet}>
     <span className="retention-companion-body"><EchoAvatar pose={pose}/></span>
    </button>
    <div className="retention-orbit" aria-hidden="true">{Array.from({ length: 12 }, (_, index) => <span className="retention-orbit-particle" key={index}><svg viewBox="0 0 12 12"><path d="m6 0 2 4 4 2-4 2-2 4-2-4-4-2 4-2Z" fill={index % 2 ? '#ff2d91' : '#00d0e8'}/></svg></span>)}</div>
   </div> : null}
   <div className="retention-companion-intro"><span className="retention-eyebrow">Your partner in curiosity</span><h2>{data?.companion?.name ?? 'Echo'} <span className="retention-tag">Cyber-fox · Agent 01</span></h2><p role="status" className="retention-companion-message">{floatPreference.enabled ? (floatPreference.tucked ? `${companionName} is tucked away. Bring them back whenever you like.` : 'Floating nearby · tap your companion to interact.') : message}</p>
    <details className="echo-companion-menu"><summary>Companion options</summary><div className="retention-actions"><button type="button" disabled={!data} aria-expanded={editing} onClick={() => { setDraft(data?.companion?.name ?? 'Echo'); setPalette(data?.companion?.palette ?? 'cyan'); setEditing(value => !value); }}>Name & personalise</button><button type="button" aria-expanded={scrapbook} onClick={() => { setScrapbook(value => !value); respond('keepsake'); }}>Our keepsakes ♡</button></div>
    <div className="retention-actions echo-mode-actions"><button type="button" aria-pressed={floatPreference.enabled} onClick={() => rememberFloat({ enabled: !floatPreference.enabled, tucked: false })}>{floatPreference.enabled ? `Dock ${companionName} in the card` : `Let ${companionName} float ✦`}</button><span className="retention-note">Drag your companion · tuck away anytime</span></div><details className="echo-pose-picker"><summary>Meet {companionName}’s expressions</summary><div className="retention-actions">{ECHO_POSES.map(item => <button type="button" key={item} aria-pressed={pose === item} onClick={() => { respond(item); setMessage(ECHO_POSE_LABELS[item]); }}>{item === 'keepsake' ? 'Teacher keepsake' : item.charAt(0).toUpperCase() + item.slice(1)}</button>)}</div></details></details>
    <p className="retention-note">Always happy to see you. Your companion never loses progress when you take a break.</p>
   </div>
  </div> : <div className="retention-crew-heading"><span className="retention-eyebrow">Your teaching story</span><h2>A crew remembers who cheered them on.</h2><p>Leave a small encouragement with your class’s work. Their private keepsakes remember it.</p></div>}
  {editing && !teacher ? <form className="retention-companion-editor" onSubmit={save}><label>Companion name<input value={draft} maxLength={24} required onChange={event => setDraft(event.target.value)} autoComplete="off"/></label><fieldset><legend>Choose an aura</legend>{(['cyan', 'pink', 'violet'] as const).map(colour => <button key={colour} type="button" aria-pressed={palette === colour} className={`retention-aura retention-aura-${colour}`} onClick={() => setPalette(colour)}>{colour}</button>)}</fieldset><button type="submit" disabled={busy || !draft.trim()}>{busy ? 'Saving…' : 'Save my companion'}</button><button type="button" disabled={busy} onClick={() => setEditing(false)}>Cancel</button><p className="retention-note">Name and aura are private to your account, saved across devices.</p></form> : null}
  {error ? <p className="retention-error" role="status">{error}<button type="button" disabled={busy} onClick={() => void refresh()}>Retry connection</button></p> : null}
  <div className="retention-hideout-grid"><article className="retention-hideout-room"><div className="retention-card-top"><span className="retention-eyebrow">Our crew hideout</span><span className="retention-tag">{['Base camp', 'Signal desk', 'Creative studio', 'Rooftop connection'][stage]}</span></div>
   {data?.crews.length ? <label className="retention-crew-select">Class mission<select value={room?.id ?? ''} onChange={event => setSelected(event.target.value)}>{data.crews.map(item => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label> : null}
   <div className="retention-hideout-art"><HideoutScene stage={stage}/><button type="button" onClick={() => celebrate(stage ? 'The crew built this together. Every completed piece of work lights up our hideout.' : 'This is our base camp. A shared assignment will bring it to life.', 'unlock')}>Explore our hideout ✦</button></div>
   {room ? <><p><strong>{room.completed} / {room.total}</strong> class submissions complete</p><progress value={room.completed} max={Math.max(1, room.total)} aria-label="Crew hideout class progress"/><p className="retention-note">First completion: signal desk · 50%: studio · 100%: rooftop. Confirmed paper work counts too.</p>
    <div className="retention-crew-cheers" aria-label="Recent crew cheers">{room.cheers.length ? room.cheers.map(cheer => <span className="retention-tag" key={cheer.kind}>{CREW_MESSAGES[cheer.kind]} · {cheer.count}</span>) : <span>Your crew’s first cheer can start here.</span>}</div>
    {room.encouragement ? <blockquote className="retention-crew-note"><p>“{CREW_MESSAGES[room.encouragement.kind]}”</p><cite>From {room.encouragement.teacher_name}</cite></blockquote> : null}
    <div className="retention-actions">{(teacher ? ['keep_going', 'proud', 'curiosity'] : ['cheer', 'together', 'nice_work']).map(kind => <button key={kind} type="button" disabled={busy || room.sent_today} onClick={() => void signal(kind as CrewSignal)}>{CREW_MESSAGES[kind as CrewSignal]}</button>)}</div>
    <p className="retention-note" role="status">{room.sent_today ? 'Your message for this mission is saved today.' : teacher ? 'Choose one encouragement for this mission today.' : 'One optional crew cheer per mission today. No names or rankings.'}</p>
   </> : <p>{data ? 'Your crew room starts with a published class assignment. Explore base camp while it gets ready.' : 'Connecting your crew…'}</p>}
   <button type="button" className="retention-text-button" disabled={busy} onClick={() => void refresh()}>{busy ? 'Refreshing…' : 'Refresh crew →'}</button><p className="retention-note">Crew updates appear on refresh, at most once a minute.</p>
  </article>
  {!teacher ? <article className="retention-mystery"><span className="retention-eyebrow">Echo’s case file</span><h3>{chapter.title}</h3><p>{chapter.line}</p><div className="retention-case-track" aria-label={`Chapter ${Math.min(4, runs + 1)} of 4`}>{MYSTERY_CHAPTERS.map((item, index) => <span key={item.title} className={runs >= index ? 'is-found' : ''}>{index + 1}</span>)}</div><button type="button" onClick={() => celebrate(chapter.clue, 'unlock')}>Reveal this clue ◎</button><p className="retention-note">A new chapter after each saved practice round, up to four. The story stays here whenever you return.</p><div className="retention-companion-milestone"><strong>{runs}</strong><span>practice rounds together</span><strong>{contributions}</strong><span>assignments completed this month</span></div></article> : <article className="retention-teaching-keepsakes"><span className="retention-eyebrow">A little teaching history</span><h3>Encouragement that stays.</h3>{data?.memories.length ? data.memories.slice(0, 4).map((memory, index) => <blockquote key={`${memory.created_at}:${index}`}><p>“{CREW_MESSAGES[memory.kind]}”</p><cite>{memory.title} · {new Date(memory.created_at).toLocaleDateString('en', { timeZone: 'Asia/Bishkek', month: 'short', day: 'numeric' })}</cite></blockquote>) : <p>Your saved encouragements will appear here. Your students’ thank-yous are kept in your appreciation card.</p>}</article>}
  </div>
  {scrapbook && !teacher ? <div className="retention-scrapbook"><h3>Our keepsakes</h3><p>{runs ? `${runs} practice rounds explored together. Each saved round is part of your story.` : 'The first page is yours to write. One short practice round is enough to begin.'}</p>{data?.memories.length ? data.memories.map((memory, index) => <blockquote key={`${memory.created_at}:${index}`}><p>“{CREW_MESSAGES[memory.kind]}”</p><cite>{memory.teacher_name} · {memory.title}</cite></blockquote>) : <p>Teacher encouragements from your class missions will be saved here.</p>}</div> : null}
 {!teacher && data?.enabled && floatPreference.enabled ? <EchoFloating name={data.companion?.name ?? 'Echo'} palette={data.companion?.palette ?? 'cyan'} pose={pose} position={floatPreference.position} tucked={floatPreference.tucked} practicing={practicing} onPosition={(position: EchoPosition) => rememberFloat({ position })} onTuck={tucked => rememberFloat({ tucked })} onStop={() => rememberFloat({ enabled: false })} onGreet={greet} onPersonalise={() => { setDraft(companionName); setPalette(data.companion?.palette ?? 'cyan'); setEditing(true); requestAnimationFrame(() => root.current?.querySelector<HTMLInputElement>('.retention-companion-editor input')?.focus()); }} onKeepsakes={() => { setScrapbook(true); respond('keepsake'); requestAnimationFrame(() => root.current?.querySelector<HTMLElement>('.retention-scrapbook')?.scrollIntoView?.({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' })); }} message={message}/> : null}
 </section>;
}


