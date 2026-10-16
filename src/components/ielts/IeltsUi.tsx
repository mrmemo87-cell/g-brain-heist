import React, { useEffect, useId, useRef } from 'react';
import '../../styles/ielts-ui.css';

export function IeltsButton({ variant = 'secondary', className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }) {
  return <button type="button" className={`ix-button ix-button--${variant} ${className}`} {...props} />;
}

export function IeltsNotice({ children, error = false }: { children: React.ReactNode; error?: boolean }) {
  return <div className={`ix-notice${error ? ' ix-notice--error' : ''}`} role={error ? 'alert' : 'status'}>{children}</div>;
}

export function IeltsConfirm({ title, children, busy, onCancel, onConfirm, action }: { title: string; children: React.ReactNode; busy: boolean; onCancel: () => void; onConfirm: () => void; action: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const cancelRef = useRef(onCancel);
  const busyRef = useRef(busy);
  cancelRef.current = onCancel; busyRef.current = busy;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overlay = ref.current?.parentElement;
    const peers = Array.from(overlay?.parentElement?.children ?? []).filter(element => element !== overlay);
    const inertStates = peers.map(element => [element, element.hasAttribute('inert')] as const);
    peers.forEach(element => element.setAttribute('inert', ''));
    const focusable = () => Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input:not(:disabled), [tabindex="0"]') ?? []);
    (focusable()[0] ?? ref.current)?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); if (!busyRef.current) cancelRef.current(); }
      if (event.key !== 'Tab') return;
      const elements = focusable(), first = elements[0], last = elements.at(-1);
      if (!first) { event.preventDefault(); ref.current?.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      inertStates.forEach(([element, wasInert]) => { if (!wasInert) element.removeAttribute('inert'); });
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return <div className="ix-overlay"><div ref={ref} className="ix-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} tabIndex={-1}>
    <h3 id={titleId}>{title}</h3><div id={descriptionId}>{children}</div>
    <div className="ix-actions"><IeltsButton disabled={busy} onClick={onCancel}>Cancel</IeltsButton><IeltsButton variant="danger" disabled={busy} onClick={onConfirm}>{busy ? 'Working…' : action}</IeltsButton></div>
  </div></div>;
}
