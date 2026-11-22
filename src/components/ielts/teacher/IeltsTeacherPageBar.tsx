import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { programmeAccess } from '../../../../services/ieltsProgrammeService';
import IeltsTeacherNav, { type IeltsTeacherTab } from './IeltsTeacherNav';
import '../../../styles/ielts-student-shell.css';
import '../../../styles/ielts-teacher-shell.css';

/** What the programme workspace last knew, so a teacher page can show the same bar at once (no second request). */
export type IeltsTeacherBarMemory = { school_id: string; school_name?: string; can_manage: boolean; review_count: number };
const KEY = 'bh-ielts-teacher-bar';

export function rememberIeltsTeacherBar(memory: IeltsTeacherBarMemory) {
  try { window.sessionStorage.setItem(KEY, JSON.stringify(memory)); } catch { /* private mode: the bar asks again */ }
}

function recall(): IeltsTeacherBarMemory | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    const v = raw ? JSON.parse(raw) : null;
    return v && typeof v.school_id === 'string' ? v : null;
  } catch { return null; }
}

/**
 * The teacher's IELTS tab bar on pages outside the programme workspace (a Speaking session, the interviews page,
 * a review, the full review list). Every tab goes back to that place in the workspace (Visual & UX Bible §13.12).
 * Nothing is shown to anyone without IELTS programme access, so students opening their own feedback see no bar.
 */
export default function IeltsTeacherPageBar({ active }: { active: IeltsTeacherTab }) {
  const navigate = useNavigate();
  const [bar, setBar] = useState<IeltsTeacherBarMemory | null>(recall);

  useEffect(() => {
    let alive = true;
    programmeAccess()
      .then((access) => {
        if (!alive) return;
        const schools = access?.schools ?? [];
        const known = recall();
        const school = schools.find((s) => s.id === known?.school_id) ?? schools[0];
        setBar(school ? { school_id: school.id, school_name: school.name, can_manage: !!school.can_manage, review_count: known?.school_id === school.id ? known.review_count : 0 } : null);
      })
      .catch(() => { if (alive && !recall()) setBar(null); });
    return () => { alive = false; };
  }, []);

  if (!bar) return null;
  const go = (tab: IeltsTeacherTab) => {
    const section = tab === 'today' ? 'overview' : tab;
    navigate(`/ielts/programme?programmeSection=${section}&school=${encodeURIComponent(bar.school_id)}`);
  };
  return (
    <div className="isn-page itn-page itn-pagebar has-nav" data-ielts-teacher-shell="">
      <header className="isn-top">
        <a className="isn-back" href={`/ielts/programme?school=${encodeURIComponent(bar.school_id)}`} onClick={(e) => { e.preventDefault(); go('today'); }}>
          <span aria-hidden="true">←</span> IELTS teaching
        </a>
        <span className="isn-brand" aria-label="Brains Heist IELTS teaching"><span className="isn-mark" aria-hidden="true">IELTS</span><span className="isn-brand-text">Teaching{bar.school_name ? <span className="itn-brand-school"> · {bar.school_name}</span> : null}</span></span>
      </header>
      <IeltsTeacherNav active={active} onNavigate={go} canManage={bar.can_manage} reviewCount={bar.review_count} />
    </div>
  );
}
