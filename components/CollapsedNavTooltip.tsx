import React from 'react';
import { createPortal } from 'react-dom';

type Props = { label: string; anchor: HTMLElement | null };

const CollapsedNavTooltip: React.FC<Props> = ({ label, anchor }) => {
  if (typeof document === 'undefined' || !label || !anchor) return null;
  const rect = anchor.getBoundingClientRect();
  const direction = window.getComputedStyle(anchor).direction === 'rtl' ? 'rtl' : 'ltr';
  const language = anchor.closest('[lang]')?.getAttribute('lang') || undefined;
  return createPortal(
    <div role="tooltip" lang={language} dir={direction} className="pointer-events-none fixed z-[10000] w-max max-w-56 -translate-y-1/2 rounded-[0.65rem] border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-bold text-white shadow-2xl" style={{ ...(direction === 'rtl' ? { right: window.innerWidth - rect.left + 10 } : { left: rect.right + 10 }), top: rect.top + rect.height / 2 }}>
      {label}
    </div>,
    document.body,
  );
};

export default CollapsedNavTooltip;
