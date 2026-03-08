import React from 'react';

const DeveloperBadge: React.FC = () => {
  return (
    <span
      className="ml-2 inline-flex items-center rounded-full border border-fuchsia-400/60 bg-fuchsia-500/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-fuchsia-200 shadow-[0_0_10px_rgba(217,70,239,0.35)]"
      title="Developer"
      aria-label="Developer badge"
    >
      DEV
    </span>
  );
};

export default DeveloperBadge;
