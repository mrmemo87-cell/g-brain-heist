import React from 'react';

interface BrainsMasterBadgeProps {
  showBadge?: boolean;
  until?: string | null;
}

/** Renders a small "🧠" badge if Brains Master is active and badge display is enabled. */
const BrainsMasterBadge: React.FC<BrainsMasterBadgeProps> = ({ showBadge, until }) => {
  if (!showBadge || !until) return null;
  if (new Date(until) <= new Date()) return null;
  return (
    <span
      className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 ml-1"
      title="Brains Master"
    >
      🧠
    </span>
  );
};

export default BrainsMasterBadge;
