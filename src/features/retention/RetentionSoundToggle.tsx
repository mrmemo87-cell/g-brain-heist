import React, { useEffect, useState } from 'react';
import { playRetentionSound, setSoundEnabled, soundEnabled } from './retentionSound';
export default function RetentionSoundToggle({ userId }: { userId: string }) {
  const [enabled, setEnabled] = useState(() => soundEnabled(userId));
  useEffect(() => {
    setEnabled(soundEnabled(userId));
    const update = (event: Event) => { if ((event as CustomEvent).detail?.userId === userId) setEnabled(soundEnabled(userId)); };
    const storage = () => setEnabled(soundEnabled(userId));
    window.addEventListener('bh:retention-sound', update); window.addEventListener('storage', storage);
    return () => { window.removeEventListener('bh:retention-sound', update); window.removeEventListener('storage', storage); };
  }, [userId]);
  return <button type="button" className="retention-sound-toggle" aria-pressed={enabled} aria-label={`Trial sound effects ${enabled ? 'on' : 'off'}`} onClick={() => {
    const next = !enabled;
    if (setSoundEnabled(userId, next)) { setEnabled(next); if (next) playRetentionSound(userId, 'tap'); }
  }}><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4Z"/>{enabled ? <><path d="M16 8a6 6 0 0 1 0 8M19 5a10 10 0 0 1 0 14"/></> : <path d="m17 9 5 6m0-6-5 6"/>}</svg>Sound {enabled ? 'on' : 'off'}</button>;
}
