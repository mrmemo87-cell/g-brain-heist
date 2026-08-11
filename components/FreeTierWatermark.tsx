import React, { useState, useEffect } from 'react';
import { fetchLockdownLimits } from '../services/tierService';

/**
 * Semi-transparent "Powered by Brains Heist" watermark overlay.
 * Self-contained: fetches lockdown limits on mount.
 * Shows for free-tier schools, hides for paid plans.
 */
export const FreeTierWatermark: React.FC = () => {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let mounted = true;
    fetchLockdownLimits()
      .then((limits) => {
        if (mounted) setShow(limits.watermark);
      })
      .catch(() => {
        // If we can't determine tier, default to showing watermark
        if (mounted) setShow(true);
      });
    return () => { mounted = false; };
  }, []);

  if (!show) return null;

  return (
    <div
      className="fixed bottom-3 right-3 z-50 pointer-events-none select-none"
      aria-hidden="true"
    >
      <div className="flex items-center gap-1.5 rounded-lg bg-black/40 backdrop-blur-sm border border-white/10 px-3 py-1.5 shadow-lg">
        <span className="text-[10px] font-medium tracking-wide text-white/40">
          Powered by
        </span>
        <span className="text-[10px] font-bold tracking-wider text-white/50 uppercase">
          Brains Heist
        </span>
      </div>
    </div>
  );
};
