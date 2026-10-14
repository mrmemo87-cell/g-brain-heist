import React, { useEffect, useState } from 'react';
import { playRetentionSound, setSoundEnabled, soundEnabled, soundVolume, setSoundVolume } from './retentionSound';
export default function RetentionSoundToggle({ userId }: { userId: string }) {
 const [enabled, setEnabled] = useState(() => soundEnabled(userId));
 const [volume, setVolume] = useState(() => soundVolume(userId));
 useEffect(() => {
  const sync = () => { setEnabled(soundEnabled(userId)); setVolume(soundVolume(userId)); };
  sync(); const update = (event: Event) => { if ((event as CustomEvent).detail?.userId === userId) sync(); };
  window.addEventListener('bh:retention-sound', update); window.addEventListener('storage', sync);
  return () => { window.removeEventListener('bh:retention-sound', update); window.removeEventListener('storage', sync); };
 }, [userId]);
 return <div className="retention-audio-controls"><button type="button" className="retention-sound-toggle" aria-pressed={enabled} aria-label={`Trial sound effects ${enabled ? 'on' : 'off'}`} onClick={() => {
  const next = !enabled; if (setSoundEnabled(userId, next)) { setEnabled(next); if (next) playRetentionSound(userId, 'tap'); }
 }}><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4Z"/>{enabled ? <><path d="M16 8a6 6 0 0 1 0 8M19 5a10 10 0 0 1 0 14"/></> : <path d="m17 9 5 6m0-6-5 6"/>}</svg>Sound {enabled ? 'on' : 'off'}</button>
 {enabled ? <label className="retention-volume">Volume <input type="range" min="0" max="100" step="5" value={Math.round(volume * 100)} aria-label="Trial sound volume" onChange={event => { const next = Number(event.target.value) / 100; if (setSoundVolume(userId, next)) setVolume(next); }}/><span>{Math.round(volume * 100)}%</span><button type="button" onClick={() => playRetentionSound(userId, 'unlock')}>Test sound</button></label> : null}</div>;
}
