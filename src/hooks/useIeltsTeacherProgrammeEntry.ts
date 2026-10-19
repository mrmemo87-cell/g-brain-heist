import { useCallback, useEffect, useState } from 'react';
import { fetchTeacherProgrammeEntries, type TeacherProgrammeEntry } from '../../services/ieltsTeacherProgrammeEntry';

export function useIeltsTeacherProgrammeEntry(userId: string, role: string, schoolId?: string | null) {
  const [state, setState] = useState<{ userId: string; entry: TeacherProgrammeEntry | null; failed: boolean }>({ userId: '', entry: null, failed: false });
  const [revision, setRevision] = useState(0);
  const retry = useCallback(() => setRevision(n => n + 1), []);
  useEffect(() => {
    let active = true;
    let pending = false;
    setState({ userId, entry: null, failed: false });
    if (role !== 'teacher' || !userId) return;
    // The first check hides any former allocation until it resolves. Re-checks when the tab regains focus
    // keep the current entry on screen and only replace it with the server's answer (no flicker or remount).
    const check = async (initial = false) => {
      if (!active || pending) return;
      pending = true;
      if (initial) setState({ userId, entry: null, failed: false });
      try {
        const entries = await fetchTeacherProgrammeEntries();
        if (active) setState({ userId, entry: entries.find(s => s.id === schoolId) ?? entries[0] ?? null, failed: false });
      } catch {
        if (active) setState((prev) => (initial || !prev.entry ? { userId, entry: null, failed: true } : prev));
      } finally { pending = false; }
    };
    const onFocus = () => { void check(); };
    const onVisible = () => { if (document.visibilityState === 'visible') void check(); };
    void check(true);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [userId, role, schoolId, revision]);
  const current = state.userId === userId && role === 'teacher';
  return { entry: current ? state.entry : null, failed: current && state.failed, retry };
}
