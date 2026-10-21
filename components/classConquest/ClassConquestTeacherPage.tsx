import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchClassConquest, type ClassConquestData } from '../../services/classConquestService';
import { buildConquest, classColors, dayPower, OBLASTS } from '../../src/lib/classConquest';
import ConquestMap from './ConquestMap';
import './ClassConquest.css';

interface ClassConquestTeacherPageProps {
  onBack?: () => void;
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const REASONS: Record<string, string> = {
  no_school: 'Join your school first to run Class Conquest.',
  no_grade: 'Class Conquest needs at least two classes in the same grade, each with two or more students.',
  one_class: 'This grade has only one class with two or more students, so there is nobody to compete with yet.',
  not_allowed: 'Class Conquest is available to teachers and school admins.',
};

const ClassConquestTeacherPage: React.FC<ClassConquestTeacherPageProps> = ({ onBack }) => {
  const [grade, setGrade] = useState<string | null>(null);
  const [grades, setGrades] = useState<string[]>([]);
  const [data, setData] = useState<ClassConquestData | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [presenting, setPresenting] = useState(false);
  const stage = useRef<HTMLDivElement>(null);

  const load = useCallback(async (nextGrade: string | null) => {
    setLoading(true);
    const result = await fetchClassConquest(nextGrade);
    if (result.available) {
      setData(result.data); setGrades(result.data.grades); setGrade(result.data.grade); setReason(null);
    } else {
      setData(null); setGrades(result.grades); setReason(result.reason);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(null); }, [load]);

  useEffect(() => {
    const onChange = () => setPresenting(document.fullscreenElement === stage.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const view = useMemo(() => (data ? buildConquest(data.classes, data.today) : null), [data]);
  const colors = useMemo(() => (data ? classColors(data.classes) : {}), [data]);
  const label = (id: string) => data?.classes.find((c) => c.class_id === id)?.label ?? '';

  const present = async () => {
    if (!stage.current) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await stage.current.requestFullscreen();
    } catch {
      setPresenting((value) => !value); // fullscreen blocked: fall back to an enlarged in-page view
    }
  };

  return (
    <div className="ccq-teacher">
      <header className="ccq-teacher-head">
        {onBack ? <button type="button" className="ccq-back" onClick={onBack}>← Back</button> : null}
        <div>
          <p className="ccq-eyebrow">Weekly class battle</p>
          <h1 className="font-heading">Class Conquest</h1>
          <p className="ccq-sub">Classes in the same grade win oblasts by finishing the daily mission at home. Show the map in class to start the week.</p>
        </div>
      </header>

      <div className="ccq-toolbar">
        {grades.length > 0 ? (
          <label className="ccq-grade">
            <span>Grade</span>
            <select value={grade ?? ''} onChange={(event) => void load(event.target.value)} disabled={loading}>
              {grades.map((g) => <option key={g} value={g}>Grade {g}</option>)}
            </select>
          </label>
        ) : null}
        <button type="button" className="ccq-present" onClick={() => void present()} disabled={!data}>
          {presenting ? 'Exit projector' : 'Show on projector'}
        </button>
      </div>

      {loading ? <div className="ccq-empty">Loading this week’s battle…</div> : null}
      {!loading && !data ? <div className="ccq-empty">{REASONS[reason || ''] || 'Class Conquest is not available right now.'}</div> : null}

      {data && view ? (
        <div ref={stage} className={presenting ? 'ccq-stage is-presenting' : 'ccq-stage'}>
          <div className="ccq-stage-title">
            <h2 className="font-heading">Grade {data.grade} · Class Conquest</h2>
            <span>{data.days_until_reset <= 1 ? 'Final day — resets tomorrow' : `Resets in ${data.days_until_reset} days`}</span>
          </div>

          {view.captures.length > 0 ? (
            <p className="ccq-capture ccq-capture--big" role="status">
              <span aria-hidden="true">⚑</span>
              {view.captures.map((c) => `${label(c.by)} took ${c.name}${c.from ? ` from ${label(c.from)}` : ''}`).join(' · ')}
            </p>
          ) : null}

          <div className="ccq-stage-grid">
            <ConquestMap classes={data.classes} owners={view.owners} colors={colors} label={`Map of Kyrgyzstan: ${view.ranking.map((id) => `${label(id)} holds ${view.held[id]}`).join(', ')}`} />

            <div className="ccq-side">
              <ol className="ccq-standings ccq-standings--big">
                {view.ranking.map((id, index) => (
                  <li key={id} className="ccq-row">
                    <span className="ccq-rank">#{index + 1}</span>
                    <span className="ccq-swatch" style={{ background: colors[id] }} aria-hidden="true" />
                    <span className="ccq-name">{label(id)}</span>
                    <span className="ccq-stat">{view.held[id]} oblasts</span>
                    <span className="ccq-stat ccq-power">{view.powers[id]} power</span>
                  </li>
                ))}
              </ol>

              <div className="ccq-table-wrap">
                <table className="ccq-table">
                  <caption>Share of each class that finished the daily mission</caption>
                  <thead>
                    <tr>
                      <th scope="col">Class</th>
                      {data.classes[0].days.map((d, i) => <th key={d.date} scope="col">{DAY_NAMES[i] ?? d.date.slice(5)}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {view.ranking.map((id) => {
                      const team = data.classes.find((c) => c.class_id === id)!;
                      return (
                        <tr key={id}>
                          <th scope="row"><span className="ccq-swatch" style={{ background: colors[id] }} aria-hidden="true" />{team.label}</th>
                          {team.days.map((d) => <td key={d.date}>{dayPower(d.done, team.size)}%</td>)}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <p className="ccq-how">Classes hold oblasts in proportion to their power. A class that falls behind gives up its least valuable oblast first. Most valuable: {OBLASTS.map((o) => o.name).join(', ')}.</p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default ClassConquestTeacherPage;
