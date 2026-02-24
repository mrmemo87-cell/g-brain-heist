/**
 * AdminContext — Shared state context for all AdminPortal tab/modal components.
 *
 * The provider lives in AdminPortal.tsx (the orchestrator).
 * Each tab component calls `useAdmin()` to read/write shared state.
 */
import { createContext, useContext } from 'react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AdminContext = createContext<any>(null);

export function useAdmin() {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error('useAdmin() must be used inside <AdminPortal />');
  return ctx;
}

export default AdminContext;
