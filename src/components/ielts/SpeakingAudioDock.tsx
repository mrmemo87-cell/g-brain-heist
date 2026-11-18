import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';

/**
 * Floating player for Speaking recordings (Visual & UX Bible 13.9, 1.13.0). The recording that was last played
 * stays reachable in a small bar fixed to the bottom of the screen, so a teacher or student can pause, resume and
 * jump back or forward while reading the transcript and feedback further down the page. It controls the same
 * audio element as the clip's own player: no second copy of the audio is loaded and nothing plays by itself.
 */
type ActiveAudio = { element: HTMLAudioElement; label: string; clipId?: string };

let active: ActiveAudio | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const snapshot = () => active;

// Recordings by clip id, so a transcript can start its own recording from a chosen word.
const elements = new Map<string, HTMLAudioElement>();
const loaders = new Map<string, () => void>();
let pending: { clipId: string; seconds: number } | null = null;

const startAt = (element: HTMLAudioElement, seconds: number) => {
  const go = () => {
    element.currentTime = Math.max(0, seconds);
    // Some browsers refuse to start audio that was opened a moment ago; the player then shows it ready to play.
    void element.play().catch(() => undefined);
  };
  if (element.readyState >= 1) go(); else element.addEventListener('loadedmetadata', go, { once: true });
};

/** Register a clip's audio element. Starting one recording pauses the one that was playing. */
export function registerSpeakingAudio(element: HTMLAudioElement, label: string, clipId?: string): () => void {
  const onPlay = () => {
    if (active && active.element !== element) active.element.pause();
    if (!active || active.element !== element) { active = { element, label, clipId }; notify(); }
  };
  element.addEventListener('play', onPlay);
  if (clipId) {
    elements.set(clipId, element);
    if (pending?.clipId === clipId) {
      const { seconds } = pending;
      pending = null;
      active = { element, label, clipId };
      notify();
      startAt(element, seconds);
    }
  }
  return () => {
    element.removeEventListener('play', onPlay);
    if (clipId && elements.get(clipId) === element) elements.delete(clipId);
    if (active?.element === element) { active = null; notify(); }
  };
}

/** A clip that has not been opened yet registers how to open it, so "play from here" can load it on demand. */
export function registerSpeakingClipLoader(clipId: string, load: () => void): () => void {
  loaders.set(clipId, load);
  return () => { if (loaders.get(clipId) === load) loaders.delete(clipId); };
}

/** True when this recording can be started from the transcript (it is open, or can be opened on this page). */
export const canPlaySpeakingClip = (clipId: string) => elements.has(clipId) || loaders.has(clipId);

/** Start a recording at a given second, opening it first when needed. Only ever called from a tap or key press. */
export function playSpeakingClipFrom(clipId: string, seconds: number): boolean {
  const element = elements.get(clipId);
  if (element) { startAt(element, seconds); return true; }
  const load = loaders.get(clipId);
  if (!load) return false;
  pending = { clipId, seconds };
  load();
  return true;
}

/**
 * A value derived from a recording's position while it is the one in the player; null otherwise. `map` turns the
 * position in seconds into what the caller shows (for example the index of the word being spoken), so the caller
 * re-renders only when that value changes, not on every animation frame.
 */
export function useSpeakingClipPosition(clipId: string | undefined, map: (seconds: number) => number): number | null {
  const current = useSyncExternalStore(subscribe, snapshot, () => null);
  const element = clipId && current?.clipId === clipId ? current.element : null;
  const [time, setTime] = useState<number | null>(null);
  const mapRef = useRef(map);
  mapRef.current = map;
  useEffect(() => {
    if (!element) { setTime(null); return; }
    let frame = 0;
    const read = () => setTime(mapRef.current(element.currentTime));
    const loop = () => { read(); if (!element.paused && !element.ended) frame = requestAnimationFrame(loop); };
    const onPlay = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(loop); };
    read();
    if (!element.paused) onPlay();
    element.addEventListener('play', onPlay);
    element.addEventListener('seeked', read);
    element.addEventListener('pause', read);
    return () => {
      cancelAnimationFrame(frame);
      element.removeEventListener('play', onPlay);
      element.removeEventListener('seeked', read);
      element.removeEventListener('pause', read);
    };
  }, [element]);
  return time;
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
