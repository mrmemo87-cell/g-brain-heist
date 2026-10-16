import React from 'react';
import type { StartingPointSkill } from '../../../services/ieltsStartingPointService';
const paths = {
  listening: 'M4 13v-2a8 8 0 0116 0v2M4 12h3v8H4zM17 12h3v8h-3z',
  reading:
    'M12 6v15M3 4h4a6 6 0 015 2 6 6 0 015-2h4v15h-4a6 6 0 00-5 2 6 6 0 00-5-2H3z',
  writing: 'M4 20h5L21 8l-5-5L4 15v5M13 6l5 5M4 20h16',
  speaking:
    'M9 4a3 3 0 016 0v9a3 3 0 01-6 0V4M5 11v2a7 7 0 0014 0v-2M12 20v3M8 23h8',
};
export default function IeltsSkillIcon({
  skill,
}: {
  skill: StartingPointSkill;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 26"
      width="26"
      height="26"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[skill]} />
    </svg>
  );
}
