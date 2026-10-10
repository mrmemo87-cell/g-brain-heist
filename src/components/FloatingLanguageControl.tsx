import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { Language } from '../i18n/language';
import '../styles/floating-language-control.css';

type Dock = { side: 'left' | 'right'; ratio: number };
type Point = { x: number; y: number };
const SIZE = 54;
const STORAGE_KEY = 'brains-heist-language-dock-v1';
const labels: Record<Language, { short: string; name: string }> = {
  en: { short: 'EN', name: 'English' }, ar: { short: 'ع', name: 'العربية' }, ru: { short: 'RU', name: 'Русский' },
};
function readDock(): Dock {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (saved && ['left', 'right'].includes(saved.side) && Number.isFinite(saved.ratio) && saved.ratio >= 0 && saved.ratio <= 1) return saved;
  } catch { /* A blocked or old preference never blocks the control. */ }
  return { side: 'left', ratio: .5 };
}
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
function bounds(probe: HTMLElement | null) {
  const viewport = window.visualViewport;
  const width = viewport?.width ?? window.innerWidth, height = viewport?.height ?? window.innerHeight;
  const left = viewport?.offsetLeft ?? 0, top = viewport?.offsetTop ?? 0;
  const style = probe ? getComputedStyle(probe) : null;
  const inset = (key: 'left' | 'right' | 'top' | 'bottom') => Math.max(12, parseFloat(style?.[key] ?? '') || 0);
  const minX = left + inset('left'), minY = top + inset('top');
  return { minX, minY, maxX: Math.max(minX, left + width - SIZE - inset('right')), maxY: Math.max(minY, top + height - SIZE - inset('bottom')), middle: left + width / 2 };
}
function atDock(dock: Dock, b: ReturnType<typeof bounds>): Point {
  return { x: dock.side === 'left' ? b.minX : b.maxX, y: b.minY + dock.ratio * (b.maxY - b.minY) };
}

export default function FloatingLanguageControl({ language, setLanguage }: { language: Language; setLanguage: (language: Language) => void }) {
  const [dock, setDock] = useState<Dock>(readDock);
  const dockRef = useRef(dock);
  const [point, setPoint] = useState(() => atDock(dock, bounds(null)));
  const pointRef = useRef(point);
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const wrapper = useRef<HTMLDivElement>(null), probe = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null), panel = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; clientX: number; clientY: number; origin: Point; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const panelId = useId(), helpId = useId();
  const move = (next: Point) => { pointRef.current = next; setPoint(next); };
  const save = useCallback((next: Dock) => {
    dockRef.current = next; setDock(next);
    const nextPoint = atDock(next, bounds(probe.current)); pointRef.current = nextPoint; setPoint(nextPoint);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* Session movement still works. */ }
    setAnnouncement(`Language control docked to the ${next.side} edge.`);
  }, []);
  const finish = useCallback((cancelled = false) => {
    const current = drag.current;
    if (!current) return;
    drag.current = null;
    suppressClick.current = current.moved && !cancelled;
    setDragging(false);
    if (current.moved) {
      const b = bounds(probe.current), p = pointRef.current;
      save({ side: p.x + SIZE / 2 < b.middle ? 'left' : 'right', ratio: b.maxY > b.minY ? clamp((p.y - b.minY) / (b.maxY - b.minY), 0, 1) : .5 });
    }
  }, [save]);
  useLayoutEffect(() => {
    const reposition = () => {
      finish(true);
      const next = atDock(dockRef.current, bounds(probe.current)); pointRef.current = next; setPoint(next);
    };
    reposition();
    window.addEventListener('resize', reposition);
    window.addEventListener('blur', finishOnBlur);
    const viewport = window.visualViewport;
    viewport?.addEventListener('resize', reposition); viewport?.addEventListener('scroll', reposition);
    function finishOnBlur() { finish(true); }
    return () => {
      window.removeEventListener('resize', reposition); window.removeEventListener('blur', finishOnBlur);
      viewport?.removeEventListener('resize', reposition); viewport?.removeEventListener('scroll', reposition);
    };
  }, [finish]);
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus();
    const outside = (event: PointerEvent) => { if (!wrapper.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  const keyboardMove = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const b = bounds(probe.current), current = dockRef.current;
    let next = current;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') next = { ...current, side: event.key === 'ArrowLeft' ? 'left' : 'right' };
    else if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
      const y = event.key === 'Home' ? b.minY : event.key === 'End' ? b.maxY : pointRef.current.y + (event.key === 'ArrowUp' ? -24 : 24);
      next = { ...current, ratio: b.maxY > b.minY ? clamp((y - b.minY) / (b.maxY - b.minY), 0, 1) : .5 };
    } else return;
    event.preventDefault(); setOpen(false); save(next);
  };
  return <>
    <div ref={probe} className="language-dock-insets" aria-hidden="true" />
    <div ref={wrapper} data-global-language-control="true" dir="ltr" className={`language-dock is-${dock.side}${dragging ? ' is-dragging' : ''}`} style={{ transform: `translate3d(${point.x}px, ${point.y}px, 0)` }}
      onBlur={event => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false); }}
      onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus(); } }}>
      <button ref={trigger} type="button" className="language-dock-trigger" aria-label="Interface language" aria-expanded={open} aria-controls={panelId} aria-describedby={helpId} title="Change language · drag to move" onKeyDown={keyboardMove}
        onPointerDown={event => {
          if (event.button !== 0 || event.isPrimary === false) return;
          const rect = wrapper.current?.getBoundingClientRect();
          const origin = rect?.width ? { x: rect.left, y: rect.top } : pointRef.current;
          drag.current = { id: event.pointerId, clientX: event.clientX, clientY: event.clientY, origin, moved: false };
          suppressClick.current = false;
          event.currentTarget.setPointerCapture?.(event.pointerId);
        }}
        onPointerMove={event => {
          const current = drag.current;
          if (!current || current.id !== event.pointerId) return;
          const dx = event.clientX - current.clientX, dy = event.clientY - current.clientY;
          if (!current.moved && Math.hypot(dx, dy) < 6) return;
          if (!current.moved) { current.moved = true; setOpen(false); setDragging(true); }
          const b = bounds(probe.current);
          move({ x: clamp(current.origin.x + dx, b.minX, b.maxX), y: clamp(current.origin.y + dy, b.minY, b.maxY) });
        }}
        onPointerUp={event => { if (drag.current?.id === event.pointerId) finish(); }}
        onPointerCancel={event => { if (drag.current?.id === event.pointerId) finish(true); }}
        onLostPointerCapture={() => finish(true)}
        onClick={() => { if (suppressClick.current) { suppressClick.current = false; return; } setOpen(value => !value); }}>
        <span aria-hidden="true">🌐</span><span className="language-dock-grip" aria-hidden="true" />
      </button>
      {open && <div ref={panel} id={panelId} className="language-dock-panel" role="group" aria-label="Choose interface language">
        {(['en', 'ar', 'ru'] as Language[]).map(code => <button key={code} type="button" aria-label={labels[code].name} aria-pressed={language === code} title={labels[code].name} onClick={() => { setLanguage(code); setOpen(false); trigger.current?.focus(); }}>{labels[code].short}</button>)}
      </div>}
      <span id={helpId} className="language-dock-sr">Drag to move. Release to dock at the nearest edge. Use arrow keys to reposition, Home or End for the top or bottom, and Enter to choose a language.</span>
      <span className="language-dock-sr" role="status" aria-live="polite">{announcement}</span>
    </div>
  </>;
}
