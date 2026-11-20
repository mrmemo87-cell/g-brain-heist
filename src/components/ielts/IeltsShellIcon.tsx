import React from 'react';

/**
 * One line-icon set for the IELTS shell (navigation, shortcut tiles, empty and locked states), drawn in the same
 * style as IeltsSkillIcon: 24px grid, 1.7 stroke, round joins, current colour. Emoji are not used for interface
 * icons because each device draws them differently, so the same screen looked different for every user.
 */
const PATHS = {
  home: 'M3 11l9-7 9 7M5.5 9.5V20h4.5v-5.5h4V20h4.5V9.5',
  review: 'M4 20h4.5L20 8.5 15.5 4 4 15.5V20M13 6.5l4.5 4.5',
  students: 'M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7M2.5 20v-.5A6.5 6.5 0 019 13a6.5 6.5 0 016.5 6.5v.5M16 4.3a3.5 3.5 0 010 6.4M18 13.6a6.5 6.5 0 013.5 5.9v.5',
  batches: 'M12 3.5l9 4.75-9 4.75-9-4.75zM3 12.5l9 4.75 9-4.75M3 16.75l9 4.75 9-4.75',
  lessons: 'M12 6.5V20M3 4.5h4.5A4.5 4.5 0 0112 6.5a4.5 4.5 0 014.5-2H21v13.5h-4.5A4.5 4.5 0 0012 20a4.5 4.5 0 00-4.5-2H3z',
  practice: 'M9 4.5H6.5A1.5 1.5 0 005 6v13.5A1.5 1.5 0 006.5 21h11a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H15M9 3h6v3.5H9zM8.5 11.5h7M8.5 15.5h4.5',
  exams: 'M12 21a8 8 0 100-16 8 8 0 000 16M12 9v4l2.5 2M9.5 2.5h5M12 2.5V5',
  team: 'M12 3l7.5 3v5.5c0 4.4-3 8-7.5 9.5-4.5-1.5-7.5-5.1-7.5-9.5V6zM9 12l2.2 2.2L15.2 10',
  target: 'M12 21a9 9 0 100-18 9 9 0 000 18M12 16.5a4.5 4.5 0 100-9 4.5 4.5 0 000 9M12 12h.01',
  journey: 'M12 21a9 9 0 100-18 9 9 0 000 18M15.5 8.5l-2 5-5 2 2-5z',
  plus: 'M12 5v14M5 12h14',
  more: 'M4 7h16M4 12h16M4 17h16',
  lock: 'M6.5 11h11A1.5 1.5 0 0119 12.5v7a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 015 19.5v-7A1.5 1.5 0 016.5 11M8 11V8a4 4 0 018 0v3',
} as const;

export type IeltsShellIconName = keyof typeof PATHS;

export default function IeltsShellIcon({ name, size = 20 }: { name: IeltsShellIconName; size?: number }) {
  return (
    <svg className="isn-svg" aria-hidden="true" focusable="false" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d={PATHS[name]} />
    </svg>
  );
}
