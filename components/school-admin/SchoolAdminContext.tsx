/**
 * SchoolAdminContext — Shared state context for all SchoolAdminPortal tab/modal components.
 *
 * The provider lives in SchoolAdminPortal.tsx (the orchestrator).
 * Each tab component calls `useSchoolAdmin()` to read/write shared state.
 */
import { createContext, useContext } from 'react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SchoolAdminContext = createContext<any>(null);

export function useSchoolAdmin() {
  const ctx = useContext(SchoolAdminContext);
  if (!ctx) throw new Error('useSchoolAdmin() must be used inside <SchoolAdminPortal />');
  return ctx;
}

export default SchoolAdminContext;
