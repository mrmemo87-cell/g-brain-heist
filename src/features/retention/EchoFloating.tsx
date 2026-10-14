import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import EchoAvatar from './EchoAvatar';
import { clampEchoViewport, dockEchoViewport, echoFloatGeometry, ECHO_POSE_LABELS, type EchoPose, type EchoPosition, type EchoViewport } from './echoModel';
import type { CompanionPalette } from './companionModel';
const viewport = (): EchoViewport => { const v = window.visualViewport; return { width: v?.width ?? window.innerWidth, height: v?.height ?? window.innerHeight, left: v?.offsetLeft ?? 0, top: v?.offsetTop ?? 0 }; };
export default function EchoFloating({ name, palette, pose, position, tucked, practicing, onPosition, onTuck, onStop, onGreet, message }: {
 message?: string; name: string; palette: CompanionPalette; pose: EchoPose; position: EchoPosition | null; tucked: boolean; practicing: boolean;
 onPosition: (position: EchoPosition) => void; onTuck: (value: boolean) => void; onStop: () => void; onGreet: () => void;
}) {
 const [view, setView] = useState(viewport); const geometry = echoFloatGeometry(view.width); const limited = view.height < 400 || view.width < 240;
 const [point, setPoint] = useState<EchoPosition>(() => { const v = viewport(); return clampEchoViewport(position ?? { x: v.left + 8, y: v.top + v.height - 240 }, v); });
 const [expanded, setExpanded] = useState(false); const [dragging, setDragging] = useState(false);
 const current = useRef(point); const root = useRef<HTMLElement>(null); const trigger = useRef<HTMLButtonElement>(null);
 const drag = useRef<{ id: number; startX: number; startY: number; start: EchoPosition } | null>(null);
 const update = (next: EchoPosition) => { if (current.current.x === next.x && current.current.y === next.y) return; current.current = next; setPoint(next); };
 useEffect(() => {
  const fit = () => { const v = viewport(); setView(before => before.width === v.width && before.height === v.height && before.left === v.left && before.top === v.top ? before : v); update(clampEchoViewport(current.current, v, expanded)); };
  fit(); window.addEventListener('resize', fit); window.visualViewport?.addEventListener('resize', fit); window.visualViewport?.addEventListener('scroll', fit);
  return () => { window.removeEventListener('resize', fit); window.visualViewport?.removeEventListener('resize', fit); window.visualViewport?.removeEventListener('scroll', fit); };
 }, [expanded]);
 useEffect(() => {
  if (!expanded) return;
  const outside = (event: Event) => { if (event.target instanceof window.Node && !root.current?.contains(event.target)) setExpanded(false); };
  const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setExpanded(false); trigger.current?.focus(); } };
  document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape);
  return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
 }, [expanded]);
 useEffect(() => { if (practicing || tucked || limited) { setExpanded(false); drag.current = null; setDragging(false); } }, [practicing, tucked, limited]);
 const end = (event: { pointerId: number; currentTarget: HTMLElement }) => {
  if (drag.current?.id !== event.pointerId) return; drag.current = null; setDragging(false);
  const next = dockEchoViewport(current.current, viewport(), expanded); update(next); onPosition(next);
  if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
 };
 if (practicing) return null;
 const menuLeft = Math.max(view.left + 8, Math.min(point.x + geometry.width / 2 - 91, view.left + view.width - 190)) - point.x;
 return createPortal(tucked || limited ? <div className="echo-floating-dock" style={{ left: view.left + 8, top: view.top + Math.max(8, view.height - 144), bottom: 'auto' }} lang="en" dir="ltr"><button type="button" disabled={limited} onClick={() => onTuck(false)} aria-label={`Bring ${name} back`}>✦ {name}</button><button type="button" onClick={onStop} aria-label="Turn off floating companion">×</button></div> :
  <aside ref={root} className={`echo-floating echo-palette-${palette} ${dragging ? 'is-dragging' : ''} ${expanded ? 'is-expanded' : ''}`} style={{ left: point.x, top: point.y, width: geometry.width, height: geometry.height }} aria-label={`${name}, floating companion`} lang="en" dir="ltr">
   {expanded ? <div className="echo-floating-popover" style={{ left: menuLeft }}><div className="echo-floating-caption"><strong title={name}>{name}</strong><span>{message ?? ECHO_POSE_LABELS[pose]}</span></div>
   <div className="echo-floating-controls"><button type="button" className="echo-drag-handle" aria-label={`Move ${name}. Drag, or use arrow keys. Home docks at the left edge; End docks at the right edge.`}
    onPointerDown={event => { if (event.button !== 0) return; drag.current = { id: event.pointerId, startX: event.clientX, startY: event.clientY, start: current.current }; event.currentTarget.setPointerCapture?.(event.pointerId); setDragging(true); }}
    onPointerMove={event => { const active = drag.current; if (!active || active.id !== event.pointerId) return; update(clampEchoViewport({ x: active.start.x + event.clientX - active.startX, y: active.start.y + event.clientY - active.startY }, viewport(), true)); }}
    onPointerUp={end} onPointerCancel={end}
    onKeyDown={event => { const step = event.shiftKey ? 40 : 16; const offsets: Record<string, EchoPosition> = { ArrowLeft: { x: -step, y: 0 }, ArrowRight: { x: step, y: 0 }, ArrowUp: { x: 0, y: -step }, ArrowDown: { x: 0, y: step } };
     const offset = offsets[event.key]; if (!offset && event.key !== 'Home' && event.key !== 'End') return; event.preventDefault(); const v = viewport();
     const next = clampEchoViewport({ x: event.key === 'Home' ? v.left + 8 : event.key === 'End' ? v.left + v.width - echoFloatGeometry(v.width).width - 8 : current.current.x + (offset?.x ?? 0), y: current.current.y + (offset?.y ?? 0) }, v, true); update(next); onPosition(next);
    }}>⠿</button><button type="button" onClick={() => onTuck(true)} aria-label={`Tuck ${name} away`}>−</button><button type="button" onClick={onStop} aria-label="Turn off floating companion">×</button></div><small>Drag the grip · Esc closes</small></div> : null}
   <button ref={trigger} type="button" className="echo-floating-greet" style={{ width: geometry.avatar, height: geometry.avatar }} aria-label={`Greet ${name}`} aria-expanded={expanded} onClick={() => { setExpanded(value => !value); if (!expanded) onGreet(); }}><EchoAvatar pose={pose} floating motion={!dragging}/><span className="echo-floating-touch-hint" aria-hidden="true">···</span></button>
  </aside>, document.body);
}
