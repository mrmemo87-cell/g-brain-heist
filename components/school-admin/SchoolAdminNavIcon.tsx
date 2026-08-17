import type { ReactNode } from 'react';

export type SchoolAdminNavIconName =
  | 'overview'
  | 'curriculum'
  | 'classes'
  | 'teacher-allocation'
  | 'people'
  | 'documents'
  | 'billing'
  | 'settings'
  | 'admissions'
  | 'cambridge'
  | 'ielts'
  | 'academic-profiles'
  | 'interventions'
  | 'guardians'
  | 'exams'
  | 'assignments'
  | 'reviews'
  | 'results'
  | 'student-progress'
  | 'more';

const ICON_PATHS: Record<SchoolAdminNavIconName, ReactNode> = {
  overview: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  curriculum: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v17H6.5A2.5 2.5 0 0 0 4 22.5z" /><path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v17h4.5a2.5 2.5 0 0 1 2.5 2.5z" /></>,
  classes: <><path d="M3 21h18" /><path d="M5 21V9l7-5 7 5v12" /><path d="M9 21v-6h6v6" /><path d="M8 10h.01M12 10h.01M16 10h.01" /></>,
  'teacher-allocation': <><circle cx="9" cy="8" r="3" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0" /><path d="m16 13 2 2 4-4" /></>,
  people: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
  documents: <><path d="M6 2h8l4 4v16H6z" /><path d="M14 2v5h5M9 12h6M9 16h6" /></>,
  billing: <><rect x="2.5" y="5" width="19" height="14" rx="2" /><path d="M2.5 10h19M6 15h4" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.1A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.5-1H3v-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.5V3h4v.1A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 1.5 1h.1v4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
  admissions: <><circle cx="9" cy="8" r="3" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0M18 8v6M15 11h6" /></>,
  cambridge: <><path d="M8 4h8M9 2h6v4H9z" /><rect x="5" y="4" width="14" height="18" rx="2" /><path d="m9 14 2 2 4-5" /></>,
  ielts: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>,
  'academic-profiles': <><circle cx="8" cy="8" r="3" /><path d="M3 20a5 5 0 0 1 10 0M15 18v-4M19 18v-7M23 18V8" /></>,
  interventions: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /><path d="m16 8 5-5M17 3h4v4" /></>,
  guardians: <><circle cx="8" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M2.5 20a5.5 5.5 0 0 1 11 0M14 19a4 4 0 0 1 7.5-2" /><path d="M18.5 14.5c1.5-1.6 4.5.2 2.5 2.4l-2.5 2.3-2.5-2.3c-2-2.2 1-4 2.5-2.4z" /></>,
  exams: <><path d="M9 3h6M9 5h6M7 4h10v17H7z" /><path d="M10 10h4M10 14h4M10 18h3" /></>,
  assignments: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18m-11 5 2 2 4-4" /></>,
  reviews: <><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" /><path d="m8 11 2 2 5-5" /></>,
  results: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
  'student-progress': <><path d="m3 17 6-6 4 4 8-9" /><path d="M15 6h6v6" /></>,
  more: <><circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none" /></>,
};

interface SchoolAdminNavIconProps {
  name: SchoolAdminNavIconName;
  className?: string;
}

const SchoolAdminNavIcon = ({ name, className }: SchoolAdminNavIconProps) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    focusable="false"
    aria-hidden="true"
  >
    {ICON_PATHS[name]}
  </svg>
);

export default SchoolAdminNavIcon;
