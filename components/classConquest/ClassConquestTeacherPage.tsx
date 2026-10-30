import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchClassConquest, fetchClassConquestWeekend, type ClassConquestData, type ClassConquestWeekend } from '../../services/classConquestService';
import { buildConquest, CHEER_TEXT, classColors, CONQUEST_COLORS, dayPower, mapById, roleForRank } from '../../src/lib/classConquest';
import { buildCertificateDocument, conquestBadgeSvg, openCertificatePrintWindow, weekLabel, type CertificateTheme } from '../../src/lib/conquestCertificates';
import ConquestMap from './ConquestMap';
import ConquestHistoryModal from './ConquestHistoryModal';
import ConquestIntelModal from './ConquestIntelModal';
import ConquestRevealStage from './ConquestRevealStage';
import { useSchoolBranding } from '../../src/hooks/useSchoolBranding';
import './ClassConquest.css';

interface ClassConquestTeacherPageProps {
  onBack?: () => void;
  /** Used to resolve the current school name and crest for certificates. */
  schoolId?: string | null;
  /** Fallbacks from the signed-in profile while the school row loads. */
  issuer?: string;
  schoolLogoUrl?: string | null;
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const REASONS: Record<string, string> = {
  no_school: 'Join your school first to run Class Conquest.',
  no_grade: 'Class Conquest needs at least two classes in the same grade, each with two or more students.',
  one_class: 'This grade has only one class with two or more students, so there is nobody to compete with yet.',
  not_allowed: 'Class Conquest is available to teachers and school admins.',
};

const brandLogoUrl = () => (typeof window === 'undefined' ? null : `${window.location.origin}/logo.png`);

const ClassConquestTeacherPage: React.FC<ClassConquestTeacherPageProps> = ({ onBack, schoolId, issuer: issuerFallback, schoolLogoUrl: logoFallback }) => {
  const branding = useSchoolBranding({ schoolId, schoolName: issuerFallback, schoolLogoUrl: logoFallback });
  const issuer = branding.schoolName ?? issuerFallback;
  const schoolLogoUrl = branding.schoolLogoUrl ?? logoFallback ?? null;
  const [grade, setGrade] = useState<string | null>(null);
  const [grades, setGrades] = useState<string[]>([]);
  const [data, setData] = useState<ClassConquestData | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [presenting, setPresenting] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [intelOpen, setIntelOpen] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [printBlocked, setPrintBlocked] = useState(false);
  const [theme, setTheme] = useState<CertificateTheme>('light');
  const [weekend, setWeekend] = useState<ClassConquestWeekend | null>(null);
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
    if (!data || data.phase !== 'sealed') { setWeekend(null); return; }
    let cancelled = false;
    void fetchClassConquestWeekend(data.grade).then((w) => { if (!cancelled) setWeekend(w); });
    return () => { cancelled = true; };
  }, [data]);

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
    setPrintBlocked(!openCertificatePrintWindow(buildCertificateDocument({ result: last, issuer, schoolLogoUrl, brandLogoUrl: brandLogoUrl(), theme })));
  };
  const sealed = data?.phase === 'sealed';
  const weekendLabel = (id: string | null) => weekend?.classes.find((c) => c.class_id === id)?.label ?? '';
  const weekendColors = useMemo(() => Object.fromEntries([...(weekend?.classes ?? [])].sort((a, b) => a.label.localeCompare(b.label)).map((c, i) => [c.class_id, CONQUEST_COLORS[i % CONQUEST_COLORS.length]])), [weekend]);

  return (
    <div className="ccq-teacher">
      <header className="ccq-teacher-head">
        {onBack ? <button type="button" className="ccq-back" onClick={onBack}>← Back</button> : null}
        <div>
          <p className="ccq-eyebrow">Weekly class battle · a new map every week</p>
          <h1 className="font-heading">Class Conquest</h1>
          <p className="ccq-sub">Classes in the same grade win territory by finishing the daily mission at home, Monday to Friday. The vault seals Friday night; students learn the winner Monday 07:00. Print certificates over the weekend and run the reveal ceremony on the projector Monday.</p>
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
          <button type="button" className="ccq-secondary" onClick={() => setIntelOpen(true)} disabled={!data}>🗺️ Next map briefing</button>
          <button type="button" className="ccq-secondary" onClick={() => setHistoryOpen(true)} disabled={!data}>🏆 Hall of Fame</button>
          {last && last.winner_label ? (
            <button type="button" className="ccq-secondary ccq-secondary--gold" onClick={() => setRevealing(true)}>🎬 Reveal ceremony</button>
          ) : null}
          <button type="button" className="ccq-present" onClick={() => void present()} disabled={!data || sealed}>
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
              <p className="ccq-eyebrow">{last.revealed ? 'Last week' : 'Sealed · students see this Monday 07:00'} · {lastMap.flag} {lastMap.name} · {weekLabel(last.week_start)}</p>
              <h2 id="ccq-winners-title" className="font-heading">{last.winner_label} conquered {lastMap.name}</h2>
              <p className="ccq-sub">
                {last.revealed
                  ? <>Hand out the certificates and run the reveal ceremony on the projector. Every member of {last.winner_label} has the silver badge; these five have gold.</>
                  : <>Only teachers can see this until Monday. Print the certificates now so they are ready for the ceremony; students are busy predicting, raiding and cheering.</>}
              </p>
            </div>
            <div className="ccq-winners-actions">
              <div className="ccq-theme" role="group" aria-label="Certificate theme">
                <button type="button" className={theme === 'light' ? 'is-active' : ''} onClick={() => setTheme('light')} aria-pressed={theme === 'light'}>☀️ Light · ink-friendly</button>
                <button type="button" className={theme === 'dark' ? 'is-active' : ''} onClick={() => setTheme('dark')} aria-pressed={theme === 'dark'}>🌙 Dark</button>
              </div>
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

      {data && sealed && map && nextMap ? (
        <section className="ccq-pulse" aria-labelledby="ccq-pulse-title">
          <div>
            <p className="ccq-eyebrow">Weekend pulse · the vault is sealed</p>
            <h2 id="ccq-pulse-title" className="font-heading">🔒 Grade {data.grade} is waiting for Monday</h2>
            <p className="ccq-sub">Students cannot see standings until the reveal. Meanwhile they predict the winner, chant on the Hype Wall, and raid rival classes in PvP (wins against other classes count until Sunday midnight).</p>
          </div>
          {weekend ? (
            <div className="ccq-pulse-grid">
              <div className="ccq-pulse-card">
                <h3>🔮 Predictions</h3>
                {weekend.predictions.length === 0 ? <p className="ccq-sub">No picks yet.</p> : (
                  <ul className="ccq-tally">
                    {weekend.classes.map((c) => {
                      const n = weekend.predictions.find((p) => p.class_id === c.class_id)?.count ?? 0;
                      const total = weekend.predictions.reduce((s, p) => s + p.count, 0) || 1;
                      return (
                        <li key={c.class_id}>
                          <span className="ccq-standing-label"><span className="ccq-swatch" style={{ background: weekendColors[c.class_id] }} aria-hidden="true" />{c.label}</span>
                          <span className="ccq-bar" aria-hidden="true"><span style={{ width: `${Math.round((100 * n) / total)}%`, background: weekendColors[c.class_id] }} /></span>
                          <span className="ccq-standing-power">{n}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <div className="ccq-pulse-card">
                <h3>⚔️ Border Raids</h3>
                {!weekend.raids || weekend.raids.classes.every((c) => c.raids === 0) ? <p className="ccq-sub">No raids yet.</p> : (
                  <ul className="ccq-tally">
                    {weekend.raids.classes.map((c) => (
                      <li key={c.class_id}>
                        <span className="ccq-standing-label"><span className="ccq-swatch" style={{ background: weekendColors[c.class_id] }} aria-hidden="true" />{c.label}</span>
                        <span className="ccq-bar" aria-hidden="true"><span style={{ width: `${Math.round((100 * c.wins) / Math.max(1, ...weekend.raids!.classes.map((x) => x.wins)))}%`, background: weekendColors[c.class_id] }} /></span>
                        <span className="ccq-standing-power">{c.wins} wins / {c.raids}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="ccq-pulse-card ccq-pulse-card--wide">
                <h3>📣 Hype Wall · {weekend.cheers.length} recent chants</h3>
                {weekend.cheers.length === 0 ? <p className="ccq-sub">Quiet so far.</p> : (
                  <ul className="ccq-wall ccq-wall--light">
                    {weekend.cheers.slice(0, 10).map((c, i) => (
                      <li key={`${c.at}-${i}`} style={{ borderColor: weekendColors[c.class_id] }}>
                        <b>{c.name}</b>{c.from_class_id ? <small> · {weekendLabel(c.from_class_id)}</small> : null}
                        <span>{CHEER_TEXT[c.cheer_code].replace('{class}', weekendLabel(c.class_id))}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : <div className="ccq-empty">Loading the weekend…</div>}
        </section>
      ) : null}

      {data && view && map && nextMap && !sealed ? (
        <div ref={stage} className={presenting ? 'ccq-stage is-presenting' : 'ccq-stage'}>
          <div className="ccq-stage-title">
            <h2 className="font-heading">{map.flag} Grade {data.grade} · Operation {map.name}</h2>
            <span>{data.days_left <= 1 ? 'Final day — the vault seals at midnight' : `${data.days_left} scoring days left · seals Friday 23:59`}</span>
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
                  <small>{nextMap.territories.length} {nextMap.unit} to conquer. Missions count from Monday — open the map briefing to brief the class.</small>
                </span>
              </div>

              <p className="ccq-how">Classes hold {map.unit} in proportion to their power. A class that falls behind gives up its least valuable territory first. Most valuable: {map.territories.slice(0, 4).map((o) => o.name).join(', ')}.</p>
            </div>
          </div>
        </div>
      ) : null}

      <ConquestHistoryModal open={historyOpen} onClose={() => setHistoryOpen(false)} grade={grade} issuer={issuer} schoolLogoUrl={schoolLogoUrl} theme={theme} />
      {nextMap ? <ConquestIntelModal open={intelOpen} onClose={() => setIntelOpen(false)} map={nextMap} when="next" /> : null}
      {revealing && last ? <ConquestRevealStage result={last} onClose={() => setRevealing(false)} /> : null}
    </div>
  );
};

export default ClassConquestTeacherPage;
