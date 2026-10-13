import React, { useEffect, useRef, useState } from 'react';
type Shot = { file: File; url: string; id: string };
type Props = { limit: number; onUse: (files: File[]) => void; onClose: () => void };
/** Capture a stack locally; no scanning starts until the teacher chooses Use photos. */
export default function ScanPhotoCapture({ limit, onUse, onClose }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const fallback = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const shotsRef = useRef<Shot[]>([]);
  const alive = useRef(true);
  const capturing = useRef(false);
  const [shots, setShots] = useState<Shot[]>([]);
  const [ready, setReady] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const stop = () => { stream.current?.getTracks().forEach(track => track.stop()); stream.current = null; };
  const add = (files: File[]) => {
    if (!alive.current) return;
    const available = limit - shotsRef.current.length;
    if (files.length > available) setError(`This tray holds ${limit} photos. Use these photos before adding more.`);
    const additions = files.slice(0, available).map(file => ({ file, url: URL.createObjectURL(file), id: crypto.randomUUID() }));
    shotsRef.current = [...shotsRef.current, ...additions]; setShots(shotsRef.current);
  };
  useEffect(() => {
    let active = true;
    alive.current = true;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; close.current?.focus();
    const background = () => { if (document.hidden) { stop(); setReady(false); setError('Camera paused. Close and reopen the camera to continue, or add existing photos.'); } };
    document.addEventListener('visibilitychange', background);
    void (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera unavailable');
        const next = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1920 } }, audio: false });
        if (!active || document.hidden) { next.getTracks().forEach(track => track.stop()); return; }
        stream.current = next;
        if (video.current) { video.current.srcObject = next; await video.current.play(); }
        if (active) setReady(true);
      } catch { if (!active) return; stop(); if (alive.current) setError('Live camera could not open. Allow camera access, or use the phone camera / existing photos below.'); }
    })();
    return () => {
      active = false; alive.current = false; stop();
      shotsRef.current.forEach(shot => URL.revokeObjectURL(shot.url));
      document.removeEventListener('visibilitychange', background);
      document.body.style.overflow = overflow; previous?.focus();
    };
  }, []);
  const take = async () => {
    const source = video.current;
    if (!ready || !source?.videoWidth || capturing.current || shotsRef.current.length >= limit) return;
    capturing.current = true; setWorking(true);
    try {
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 2600 / Math.max(source.videoWidth, source.videoHeight));
      canvas.width = Math.round(source.videoWidth * scale); canvas.height = Math.round(source.videoHeight * scale);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Could not capture photo.');
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Could not capture photo.')), 'image/jpeg', 0.95));
      add([new File([blob], `answer-sheet-${Date.now()}.jpg`, { type: 'image/jpeg' })]);
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : 'Could not capture photo.'); }
    finally { capturing.current = false; if (alive.current) setWorking(false); }
  };
  return <div className="psc-camera-backdrop"><section className="psc-camera" role="dialog" aria-modal="true" aria-labelledby="psc-camera-title" onKeyDown={e => {
    if (e.key === 'Escape' && !working) onClose();
    if (e.key === 'Tab') {
      const controls = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not([type="file"])')).filter(el => el.offsetParent !== null);
      const first = controls[0], last = controls[controls.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }
  }}>
    <header><div><span className="paw-eyebrow">Capture the whole stack</span><h3 id="psc-camera-title">One sheet. One shot. Keep going.</h3></div><button ref={close} className="paw-button" disabled={working} onClick={onClose}>Close</button></header>
    <p>Fit the whole page in view, including the QR code and four corner squares. Check each photo before using the stack.</p>
    <div className="psc-camera-view"><video ref={video} autoPlay playsInline muted aria-label="Live answer sheet camera" /><span className="psc-camera-guide" aria-hidden="true" /></div>
    {error ? <p role="status" className="psc-hint">{error}</p> : null}
    <div className="psc-camera-controls"><button className="paw-button primary" disabled={!ready || working || shots.length >= limit} onClick={() => void take()}>{working ? 'Capturing…' : 'Take photo'}</button><button className="paw-button" disabled={working || shots.length >= limit} onClick={() => fallback.current?.click()}>Phone camera</button><button className="psc-link" disabled={working || shots.length >= limit} onClick={() => gallery.current?.click()}>Add existing photos</button></div>
    <input ref={fallback} className="psc-file" type="file" accept="image/*" capture="environment" aria-label="Phone camera photo" onChange={e => { add(Array.from(e.target.files || [])); e.target.value = ''; }} />
    <input ref={gallery} className="psc-file" type="file" accept="image/*" multiple aria-label="Add photos to camera tray" onChange={e => { add(Array.from(e.target.files || [])); e.target.value = ''; }} />
    <div className="psc-camera-shots" aria-label="Captured photos">{shots.map((shot, index) => <figure key={shot.id}><img src={shot.url} alt={`Captured page ${index + 1}`} /><figcaption>{index + 1}<button className="psc-link" aria-label={`Remove photo ${index + 1}`} disabled={working} onClick={() => { URL.revokeObjectURL(shot.url); shotsRef.current = shotsRef.current.filter(item => item.id !== shot.id); setShots(shotsRef.current); }}>Remove</button></figcaption></figure>)}</div>
    <footer><span role="status">{shots.length}/{limit} photos · kept on this device</span><button className="paw-button primary" disabled={!shots.length || working} onClick={() => { stop(); onUse(shotsRef.current.map(shot => shot.file)); }}>Use {shots.length} {shots.length === 1 ? 'photo' : 'photos'}</button></footer>
  </section></div>;
}
