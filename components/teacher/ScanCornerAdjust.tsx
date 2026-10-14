import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Point } from '../../src/lib/paperScan/omr';
type Props = { file: File; onClose: () => void; onUse: (points: Point[]) => void };
const names = ['Top left', 'Top right', 'Bottom right', 'Bottom left'];
export default function ScanCornerAdjust({ file, onClose, onUse }: Props) {
  const [url, setUrl] = useState('');
  const [points, setPoints] = useState<(Point | null)[]>([null, null, null, null]);
  const [selected, setSelected] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [opened, setOpened] = useState(false);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const original = URL.createObjectURL(file); setUrl(original); close.current?.focus();
    const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { URL.revokeObjectURL(original); document.body.style.overflow = overflow; previous?.focus(); };
  }, [file]);
  return createPortal(<div className="psc-camera-backdrop"><section className="psc-camera psc-align" role="dialog" aria-modal="true" aria-labelledby="psc-align-title" onKeyDown={e => {
    if (e.key === 'Escape' || e.key === 'Tab') e.stopPropagation();
    if (e.key === 'Escape') onClose();
    if (e.key === 'Tab') {
      const nodes = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)'));
      if (e.shiftKey && document.activeElement === nodes[0]) { e.preventDefault(); nodes[nodes.length - 1]?.focus(); }
      else if (!e.shiftKey && document.activeElement === nodes[nodes.length - 1]) { e.preventDefault(); nodes[0]?.focus(); }
    }
  }}>
    <header><h3 id="psc-align-title">Adjust this photo’s corners</h3><button ref={close} className="paw-button" onClick={onClose}>Close</button></header>
    <p>Tap the centre of each black corner square on the printed sheet, clockwise from its top left. Keep the QR code visible. Zoom in for a precise tap.</p>
    <div className="psc-align-targets">{names.map((name, index) => <button className="paw-button" key={name} aria-pressed={selected === index} onClick={() => setSelected(index)}>{index + 1} · {name}{points[index] ? ' ✓' : ''}</button>)}</div>
    <label className="psc-align-zoom">Photo zoom <input type="range" min="1" max="3" step="0.25" value={zoom} onChange={e => setZoom(Number(e.target.value))} /> {zoom}×</label>
    <p role="status">Choose {selected + 1}: {names[selected]} square. Tap a numbered button to adjust that corner.</p>
    <div className="psc-align-scroll"><div className="psc-align-image" style={{ width: `${zoom * 100}%` }}>
      <img src={url || undefined} alt="Original answer sheet; tap the black corner square centres" onLoad={() => setOpened(true)} onClick={e => {
        const rect = e.currentTarget.getBoundingClientRect();
        const point = { x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)) };
        setPoints(values => values.map((old, index) => index === selected ? point : old));
        setSelected(value => Math.min(3, value + 1));
      }} />
      {points.map((point, index) => point ? <button className="psc-align-point" key={index} aria-label={`Adjust ${names[index]} square`} style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }} onClick={() => setSelected(index)}>{index + 1}</button> : null)}
    </div></div>
    <p className="psc-hint">Your photo stays in the tray. The scanner still validates the QR and all four squares. After alignment, check every answer before confirming the result.</p>
    <footer><button className="psc-link" onClick={() => { setPoints([null, null, null, null]); setSelected(0); }}>Reset corners</button><button className="paw-button primary" disabled={!opened || points.some(point => !point)} onClick={() => onUse(points as Point[])}>Read adjusted photo</button></footer>
  </section></div>, document.body);
}
