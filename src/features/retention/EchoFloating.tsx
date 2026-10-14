import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import EchoAvatar from './EchoAvatar';
import { clampEchoPosition, dockEchoPosition, ECHO_POSE_LABELS, type EchoPose, type EchoPosition } from './echoModel';
import type { CompanionPalette } from './companionModel';

export default function EchoFloating({ name, palette, pose, position, tucked, practicing, onPosition, onTuck, onStop, onGreet }: {
 name: string; palette: CompanionPalette; pose: EchoPose; position: EchoPosition | null; tucked: boolean; practicing: boolean;
 onPosition: (position: EchoPosition) => void; onTuck: (value: boolean) => void; onStop: () => void; onGreet: () => void;
}) {
 const [point, setPoint] = useState<EchoPosition>(() => clampEchoPosition(position ?? { x: 8, y: window.innerHeight - 300 }, window.innerWidth, window.innerHeight));
 const [dragging, setDragging] = useState(false); const current = useRef(point);
 const drag = useRef<{ id: number; startX: number; startY: number; start: EchoPosition } | null>(null);
 const update = (next: EchoPosition) => { current.current = next; setPoint(next); };
 useEffect(() => {
  const fit = () => { const next = clampEchoPosition(current.current, window.innerWidth, window.innerHeight); update(next); };
  window.addEventListener('resize', fit); window.visualViewport?.addEventListener('resize', fit); return () => { window.removeEventListener('resize', fit); window.visualViewport?.removeEventListener('resize', fit); };
 }, []);
 const end = (event: { pointerId: number; currentTarget: HTMLElement }) => {
  if (drag.current?.id !== event.pointerId) return; drag.current = null; setDragging(false);
  const next = dockEchoPosition(current.current, window.innerWidth, window.innerHeight); update(next); onPosition(next);
  if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
 };
 // Native dialogs own the top layer; remove the floating surface entirely while practising.
 if (practicing) return null;
 return createPortal(tucked ? <div className="echo-floating-dock" lang="en" dir="ltr"><button type="button" onClick={() => onTuck(false)} aria-label={`Bring ${name} back`}>✦ {name}</button><button type="button" onClick={onStop} aria-label="Turn off floating companion">×</button></div> :
  <aside className={`echo-floating echo-palette-${palette} ${dragging ? 'is-dragging' : ''}`} style={{ left: point.x, top: point.y }} aria-label={`${name}, floating companion`} lang="en" dir="ltr">
   <div className="echo-floating-controls"><button type="button" className="echo-drag-handle" aria-label={`Move ${name}. Drag, or use arrow keys. Home docks at the left edge; End docks at the right edge.`}
    onPointerDown={event => { if (event.button !== 0) return; drag.current = { id: event.pointerId, startX: event.clientX, startY: event.clientY, start: current.current }; event.currentTarget.setPointerCapture?.(event.pointerId); setDragging(true); }}
    onPointerMove={event => { const active = drag.current; if (!active || active.id !== event.pointerId) return; update(clampEchoPosition({ x: active.start.x + event.clientX - active.startX, y: active.start.y + event.clientY - active.startY }, window.innerWidth, window.innerHeight)); }}
    onPointerUp={end} onPointerCancel={end}
    onKeyDown={event => { const step = event.shiftKey ? 40 : 16; const offsets: Record<string, EchoPosition> = { ArrowLeft: { x: -step, y: 0 }, ArrowRight: { x: step, y: 0 }, ArrowUp: { x: 0, y: -step }, ArrowDown: { x: 0, y: step } };
     const offset = offsets[event.key]; if (!offset && event.key !== 'Home' && event.key !== 'End') return; event.preventDefault();
     const next = clampEchoPosition({ x: event.key === 'Home' ? 8 : event.key === 'End' ? window.innerWidth - 160 : current.current.x + (offset?.x ?? 0), y: current.current.y + (offset?.y ?? 0) }, window.innerWidth, window.innerHeight); update(next); onPosition(next);
    }}>⠿</button><button type="button" onClick={() => onTuck(true)} aria-label={`Tuck ${name} away`}>−</button><button type="button" onClick={onStop} aria-label="Turn off floating companion">×</button></div>
   <button type="button" className="echo-floating-greet" aria-label={`Greet ${name}`} onClick={onGreet}><EchoAvatar pose={pose} floating motion={!dragging}/></button>
   <div className="echo-floating-caption"><strong>{name}</strong><span>{ECHO_POSE_LABELS[pose]}</span></div>
  </aside>, document.body);
}
