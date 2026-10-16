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
    const check = async () => {
      if (!active || pending) return;
      pending = true;
      // Hide a former allocation while the authoritative check is in flight.
      setState({ userId, entry: null, failed: false });
      try {
        const entries = await fetchTeacherProgrammeEntries();
        if (active) setState({ userId, entry: entries.find(s => s.id === schoolId) ?? entries[0] ?? null, failed: false });
      } catch {
        if (active) setState({ userId, entry: null, failed: true });
      } finally { pending = false; }
    };
    const onVisible = () => { if (document.visibilityState === 'visible') void check(); };
    void check();
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [userId, role, schoolId, revision]);
  const current = state.userId === userId && role === 'teacher';
  return { entry: current ? state.entry : null, failed: current && state.failed, retry };
}
