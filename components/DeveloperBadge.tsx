import React from 'react';

const DEVELOPER_USER_IDS = new Set([
  // Add user IDs here to show a visual "DEV" badge next to their name.
  'a45aa76c-52a0-419d-be98-d6c87b80fe69',
]);

export const isDeveloperBadgeUser = (userId?: string | null): boolean => {
  if (!userId) return false;
  return DEVELOPER_USER_IDS.has(userId.trim().toLowerCase());
};

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
