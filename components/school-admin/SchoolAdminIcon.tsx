import type { ReactNode } from 'react';

/**
 * General line icons for staff screens, drawn like SchoolAdminNavIcon (24px grid, 1.8 stroke, current colour).
 * Use these instead of emoji so every device shows the same interface.
 */
const ICON_PATHS = {
  overview: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  results: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  refresh: <><path d="M20 11a8 8 0 0 0-14.3-4.3L3 9.5" /><path d="M3 4.5v5h5" /><path d="M4 13a8 8 0 0 0 14.3 4.3L21 14.5" /><path d="M21 19.5v-5h-5" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  sliders: <><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></>,
  file: <><path d="M6 2h8l4 4v16H6z" /><path d="M14 2v5h5M9 12h6M9 16h6" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7.5V12l3 2" /></>,
  link: <><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3A4.5 4.5 0 0 0 13 4.6l-1.2 1.2" /><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3A4.5 4.5 0 0 0 11 19.4l1.2-1.2" /></>,
  activity: <path d="M3 12h4l3-8 4 16 3-8h4" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  edit: <><path d="M4 20h4.5L20 8.5 15.5 4 4 15.5z" /><path d="m13 6.5 4.5 4.5" /></>,
  'check-circle': <><circle cx="12" cy="12" r="9" /><path d="m8 12.5 3 3 5-6" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>,
  alert: <><path d="M12 3.5 2.5 20h19z" /><path d="M12 10v4.5M12 17.5h.01" /></>,
  trash: <><path d="M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13" /><path d="M10 11v5.5M14 11v5.5" /></>,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  folder: <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z" />,
  building: <><path d="M3 21h18" /><path d="M5 21V9l7-5 7 5v12" /><path d="M9 21v-6h6v6" /></>,
  'chevron-up': <path d="m6 15 6-6 6 6" />,
  'chevron-down': <path d="m6 9 6 6 6-6" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.5h.01" /></>,
  book: <><path d="M12 6.5V20" /><path d="M3 4.5h4.5a4.5 4.5 0 0 1 4.5 2 4.5 4.5 0 0 1 4.5-2H21V18h-4.5a4.5 4.5 0 0 0-4.5 2 4.5 4.5 0 0 0-4.5-2H3z" /></>,
  hash: <path d="M9 3 7 21M17 3l-2 18M4 9h17M3 15h17" />,
  flask: <><path d="M9.5 3h5M10 3v6.5L4.5 19a1.5 1.5 0 0 0 1.3 2.2h12.4A1.5 1.5 0 0 0 19.5 19L14 9.5V3" /><path d="M7.5 15h9" /></>,
  upload: <><path d="M12 16V4M7 8.5 12 4l5 4.5" /><path d="M4 16v3.5h16V16" /></>,
} satisfies Record<string, ReactNode>;

export type SchoolAdminIconName = keyof typeof ICON_PATHS;

const SchoolAdminIcon = ({ name, className = 'h-4 w-4' }: { name: SchoolAdminIconName; className?: string }) => (
  <svg className={`shrink-0 ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" focusable="false" aria-hidden="true">
    {ICON_PATHS[name]}
  </svg>
);

export default SchoolAdminIcon;
