import React, { useEffect, useState, useSyncExternalStore } from 'react';

/**
 * Floating player for Speaking recordings (Visual & UX Bible 13.9, 1.13.0). The recording that was last played
 * stays reachable in a small bar fixed to the bottom of the screen, so a teacher or student can pause, resume and
 * jump back or forward while reading the transcript and feedback further down the page. It controls the same
 * audio element as the clip's own player: no second copy of the audio is loaded and nothing plays by itself.
 */
type ActiveAudio = { element: HTMLAudioElement; label: string };

let active: ActiveAudio | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const snapshot = () => active;

/** Register a clip's audio element. Starting one recording pauses the one that was playing. */
export function registerSpeakingAudio(element: HTMLAudioElement, label: string): () => void {
  const onPlay = () => {
    if (active && active.element !== element) active.element.pause();
    if (!active || active.element !== element) { active = { element, label }; notify(); }
  };
  element.addEventListener('play', onPlay);
  return () => {
    element.removeEventListener('play', onPlay);
    if (active?.element === element) { active = null; notify(); }
  };
}

const clock = (seconds: number) => {
  const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};
const SPEEDS = [1, 0.75, 1.25] as const;

export default function SpeakingAudioDock() {
  const current = useSyncExternalStore(subscribe, snapshot, () => null);
  const [, refresh] = useState(0);
  const element = current?.element ?? null;

  useEffect(() => {
    if (!element) return;
    const tick = () => refresh((n) => n + 1);
    const events = ['timeupdate', 'play', 'pause', 'ended', 'durationchange', 'ratechange', 'seeked'];
    events.forEach((name) => element.addEventListener(name, tick));
    return () => events.forEach((name) => element.removeEventListener(name, tick));
  }, [element]);

  if (!current || !element) return null;
  const duration = Number.isFinite(element.duration) ? element.duration : 0;
  const time = Math.min(element.currentTime || 0, duration || element.currentTime || 0);
  const playing = !element.paused && !element.ended;
  const seek = (value: number) => { element.currentTime = Math.max(0, Math.min(duration || value, value)); };
  const toggle = () => { if (playing) element.pause(); else void element.play().catch(() => undefined); };
  const nextSpeed = () => { element.playbackRate = SPEEDS[(SPEEDS.indexOf(element.playbackRate as (typeof SPEEDS)[number]) + 1) % SPEEDS.length] ?? 1; };
  const close = () => { element.pause(); active = null; notify(); };

  return (
    <aside className="sp-dock" role="region" aria-label={`${current.label} recording player`}>
      <button type="button" className="sp-dock-play" onClick={toggle} aria-label={playing ? `Pause ${current.label}` : `Play ${current.label}`}>
        <svg viewBox="0 0 24 24" aria-hidden="true">{playing ? <path d="M7 5h4v14H7zM13 5h4v14h-4z" /> : <path d="M8 5v14l11-7z" />}</svg>
      </button>
      <button type="button" className="sp-dock-skip" onClick={() => seek(time - 5)} aria-label="Back 5 seconds">−5s</button>
      <div className="sp-dock-track">
        <strong>{current.label}</strong>
        <input
          type="range" min={0} max={duration || 0} step={0.1} value={time}
          onChange={(event) => seek(Number(event.target.value))}
          aria-label={`Position in ${current.label}`} aria-valuetext={`${clock(time)} of ${clock(duration)}`}
        />
        <span>{clock(time)} / {clock(duration)}</span>
      </div>
      <button type="button" className="sp-dock-skip" onClick={() => seek(time + 5)} aria-label="Forward 5 seconds">+5s</button>
      <button type="button" className="sp-dock-speed" onClick={nextSpeed} aria-label={`Playback speed ${element.playbackRate} times. Change speed`}>{element.playbackRate}×</button>
      <button type="button" className="sp-dock-close" onClick={close} aria-label="Close player">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </aside>
  );
}
