import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchClassConquest, type ClassConquestData } from '../../services/classConquestService';
import { buildConquest, classColors, dayPower, mapById, roleForRank } from '../../src/lib/classConquest';
import { buildCertificateDocument, conquestBadgeSvg, openCertificatePrintWindow, weekLabel } from '../../src/lib/conquestCertificates';
import ConquestMap from './ConquestMap';
import ConquestHistoryModal from './ConquestHistoryModal';
import './ClassConquest.css';

interface ClassConquestTeacherPageProps {
  onBack?: () => void;
  /** Printed in the certificate footer (usually the school name). */
  issuer?: string;
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const REASONS: Record<string, string> = {
  no_school: 'Join your school first to run Class Conquest.',
  no_grade: 'Class Conquest needs at least two classes in the same grade, each with two or more students.',
  one_class: 'This grade has only one class with two or more students, so there is nobody to compete with yet.',
  not_allowed: 'Class Conquest is available to teachers and school admins.',
};

const ClassConquestTeacherPage: React.FC<ClassConquestTeacherPageProps> = ({ onBack, issuer }) => {
  const [grade, setGrade] = useState<string | null>(null);
  const [grades, setGrades] = useState<string[]>([]);
  const [data, setData] = useState<ClassConquestData | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [presenting, setPresenting] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [printBlocked, setPrintBlocked] = useState(false);
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

  const map = useMemo(() => (data ? mapById(data.map_id) : null), [data]);
  const nextMap = useMemo(() => (data ? mapById(data.next_map_id) : null), [data]);
  const view = useMemo(() => (data && map ? buildConquest(data.classes, data.today, map) : null), [data, map]);
  const colors = useMemo(() => (data ? classColors(data.classes) : {}), [data]);
  const label = (id: string) => data?.classes.find((c) => c.class_id === id)?.label ?? '';
  const last = data?.last_week ?? null;
  const lastMap = last ? mapById(last.map_id) : null;

  const present = async () => {
    if (!stage.current) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await stage.current.requestFullscreen();
    } catch {
      setPresenting((value) => !value); // fullscreen blocked: fall back to an enlarged in-page view
    }
  };

  const printLastWeek = () => {
    if (!last) return;
    setPrintBlocked(!openCertificatePrintWindow(buildCertificateDocument({ result: last, issuer })));
  };

  return (
    <div className="ccq-teacher">
      <header className="ccq-teacher-head">
        {onBack ? <button type="button" className="ccq-back" onClick={onBack}>← Back</button> : null}
        <div>
          <p className="ccq-eyebrow">Weekly class battle · a new map every week</p>
          <h1 className="font-heading">Class Conquest</h1>
          <p className="ccq-sub">Classes in the same grade win territory by finishing the daily mission at home. Show the map in class to start the week; on Monday the top five of the winning class get certificates and badges.</p>
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
        <div className="ccq-toolbar-actions">
          <button type="button" className="ccq-secondary" onClick={() => setHistoryOpen(true)} disabled={!data}>🏆 Hall of Fame</button>
          <button type="button" className="ccq-present" onClick={() => void present()} disabled={!data}>
            {presenting ? 'Exit projector' : 'Show on projector'}
          </button>
        </div>
      </div>

      {loading ? <div className="ccq-empty">Loading this week’s battle…</div> : null}
      {!loading && !data ? <div className="ccq-empty">{REASONS[reason || ''] || 'Class Conquest is not available right now.'}</div> : null}

      {data && last && lastMap && last.winner_label ? (
        <section className="ccq-winners" aria-labelledby="ccq-winners-title">
          <div className="ccq-winners-head">
            <div>
              <p className="ccq-eyebrow">Last week · {lastMap.flag} {lastMap.name} · {weekLabel(last.week_start)}</p>
              <h2 id="ccq-winners-title" className="font-heading">{last.winner_label} conquered {lastMap.name}</h2>
              <p className="ccq-sub">Print the certificates, hand them out in class, and announce next week’s map. Every member of {last.winner_label} already has the silver badge; these five have gold.</p>
            </div>
            <div className="ccq-winners-actions">
              <button type="button" className="ccq-present" onClick={printLastWeek} disabled={last.top_students.length === 0}>🖨 Print {last.top_students.length} certificates + class certificate</button>
              {printBlocked ? <p className="ccq-modal-warn" role="alert">Your browser blocked the certificate window. Allow pop-ups for Brains Heist and try again.</p> : null}
            </div>
          </div>
          {last.top_students.length > 0 ? (
            <ol className="ccq-winner-cards">
              {last.top_students.map((s) => (
                <li key={s.student_id} className="ccq-winner-card">
                  <span className="ccq-winner-badge" aria-hidden="true" dangerouslySetInnerHTML={{ __html: conquestBadgeSvg({ kind: 'gold', mapId: last.map_id, rank: s.rank, caption: roleForRank(s.rank).toUpperCase(), size: 72 }) }} />
                  <b>{s.name}</b>
                  <span className="ccq-winner-role">{roleForRank(s.rank)}</span>
                  <small>{s.missions} missions · {s.correct} correct</small>
                </li>
              ))}
            </ol>
          ) : <p className="ccq-sub">Nobody in {last.winner_label} finished a mission, so there are no individual certificates this week.</p>}
        </section>
      ) : null}

      {data && view && map && nextMap ? (
        <div ref={stage} className={presenting ? 'ccq-stage is-presenting' : 'ccq-stage'}>
          <div className="ccq-stage-title">
            <h2 className="font-heading">{map.flag} Grade {data.grade} · Operation {map.name}</h2>
            <span>{data.days_until_reset <= 1 ? 'Final day — winners crowned tomorrow' : `${data.days_until_reset} days left · ${weekLabel(data.week_start)}`}</span>
          </div>

          {view.captures.length > 0 ? (
            <p className="ccq-capture ccq-capture--big" role="status">
              <span aria-hidden="true">⚑</span>
              {view.captures.map((c) => `${label(c.by)} took ${c.name}${c.from ? ` from ${label(c.from)}` : ''}`).join(' · ')}
            </p>
          ) : null}

          <div className="ccq-stage-grid">
            <ConquestMap map={map} classes={data.classes} owners={view.owners} colors={colors} label={`Map of ${map.name}: ${view.ranking.map((id) => `${label(id)} holds ${view.held[id]}`).join(', ')}`} />

            <div className="ccq-side">
              <ol className="ccq-standings ccq-standings--big">
                {view.ranking.map((id, index) => (
                  <li key={id} className="ccq-row">
                    <span className="ccq-rank">#{index + 1}</span>
                    <span className="ccq-swatch" style={{ background: colors[id] }} aria-hidden="true" />
                    <span className="ccq-name">{label(id)}</span>
                    <span className="ccq-stat">{view.held[id]} {map.unit}</span>
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

              <div className="ccq-next ccq-next--stage">
                <span className="ccq-next-flag" aria-hidden="true">{nextMap.flag}</span>
                <span>
                  <b>Next week: {nextMap.name}</b>
                  <small>{nextMap.territories.length} {nextMap.unit} to conquer. Missions count from Monday.</small>
                </span>
              </div>

              <p className="ccq-how">Classes hold {map.unit} in proportion to their power. A class that falls behind gives up its least valuable territory first. Most valuable: {map.territories.slice(0, 4).map((o) => o.name).join(', ')}.</p>
            </div>
          </div>
        </div>
      ) : null}

      <ConquestHistoryModal open={historyOpen} onClose={() => setHistoryOpen(false)} grade={grade} issuer={issuer} />
    </div>
  );
};

export default ClassConquestTeacherPage;
