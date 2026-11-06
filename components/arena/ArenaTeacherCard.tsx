import React, { useEffect, useState } from 'react';
import { listMySchoolClasses, type ApprovedSignupClass } from '../../services/authService';
import { fetchArenaTeacherSummary, grantArenaClassBonus, updateArenaClassSettings, type ArenaTeacherSummary } from '../../services/arenaService';

interface ArenaTeacherCardProps {
  /** Shown only for teachers with a school. */
  schoolId: string | null | undefined;
}

type Row = { cls: ApprovedSignupClass; summary: ArenaTeacherSummary | null; busy: boolean; note: string | null };

/** Teacher view of the Proving Grounds arena: this week's activity per class, with the class switch and a bonus ticket. */
const ArenaTeacherCard: React.FC<ArenaTeacherCardProps> = ({ schoolId }) => {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    if (!schoolId) return;
    let active = true;
    void listMySchoolClasses().then(async (result) => {
      const classes = result.success ? result.classes : [];
      const loaded = await Promise.all(classes.map(async (cls) => ({ cls, summary: await fetchArenaTeacherSummary(cls.id).catch(() => null), busy: false, note: null })));
      if (active) setRows(loaded.filter((r) => r.summary !== null));
    });
    return () => { active = false; };
  }, [schoolId]);

  if (!schoolId || !rows || rows.length === 0) return null;
  const schoolEnabled = rows.some((r) => r.summary?.school_enabled);

  const patch = (classId: string, change: Partial<Row>) => setRows((cur) => cur ? cur.map((r) => (r.cls.id === classId ? { ...r, ...change } : r)) : cur);
  const toggle = async (row: Row, enabled: boolean, requireAssignment: boolean) => {
    patch(row.cls.id, { busy: true, note: null });
    try { const summary = await updateArenaClassSettings(row.cls.id, enabled, requireAssignment); patch(row.cls.id, { summary, busy: false }); }
    catch { patch(row.cls.id, { busy: false, note: 'Could not save. Try again.' }); }
  };
  const bonus = async (row: Row) => {
    patch(row.cls.id, { busy: true, note: null });
    try {
      const r = await grantArenaClassBonus(row.cls.id);
      const summary = await fetchArenaTeacherSummary(row.cls.id).catch(() => row.summary);
      patch(row.cls.id, { busy: false, summary, note: r.granted ? `Bonus ticket given to ${r.granted} student${r.granted === 1 ? '' : 's'}.` : 'Everyone already holds the maximum of 10 tickets.' });
    } catch (error) {
      const msg = error instanceof Error ? error.message : '';
      patch(row.cls.id, { busy: false, note: msg.includes('BONUS_ALREADY_GIVEN') ? 'A bonus was already given today.' : 'Could not give the bonus. Try again.' });
    }
  };

  return (
    <section className="teacher-card p-5" data-testid="arena-teacher-card" aria-label="Proving Grounds arena">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-slate-800">⚔️ Proving Grounds arena</h3>
          <p className="mt-1 text-sm text-slate-500">{schoolEnabled ? 'Students earn match tickets by finishing quests, quizzes and your assignments. Respawn questions count as practice.' : 'The arena is off for your school. A school admin can switch it on under School Settings.'}</p>
        </div>
      </div>
      <ul className="mt-4 grid gap-3">
        {rows.map((row) => {
          const s = row.summary!;
          const pct = s.respawn_questions_this_week ? Math.round(s.respawn_correct_this_week / s.respawn_questions_this_week * 100) : null;
          return (
            <li key={row.cls.id} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong className="text-slate-800">{row.cls.class_name}</strong>
                <span className="text-xs text-slate-500">{s.matches_this_week} matches · {s.tickets_earned_this_week} tickets earned · {s.respawn_questions_this_week} questions{pct !== null ? ` (${pct}% right)` : ''} this week</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-slate-700">
                <label className="flex items-center gap-2"><input type="checkbox" checked={s.class_enabled} disabled={row.busy || !schoolEnabled} onChange={(event) => void toggle(row, event.target.checked, s.require_assignment)} />Arena on for this class</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={s.require_assignment} disabled={row.busy || !schoolEnabled} onChange={(event) => void toggle(row, s.class_enabled, event.target.checked)} />Assignments must be done first</label>
                <button type="button" className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50" disabled={row.busy || !schoolEnabled} onClick={() => void bonus(row)}>Give everyone a bonus ticket</button>
              </div>
              {row.note ? <p className="mt-2 text-xs text-slate-500" role="status">{row.note}</p> : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
};

export default ArenaTeacherCard;
