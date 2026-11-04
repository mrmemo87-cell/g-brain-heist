import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../../styles/ielts-course.css';
import IeltsStudentShell from '../../components/ielts/student/IeltsStudentShell';
import { Blaze, LEAGUE_TIERS, LeagueAvatar, LeagueShield, leagueTier } from '../../components/ielts/IeltsGameArt';
import { IELTS_COURSE_ROUTE } from '../../../services/ieltsCourseService';
import {
  cachedIeltsLeague,
  fetchIeltsLeague,
  leagueResultSeen,
  leagueTimeLeft,
  markLeagueResultSeen,
  type IeltsLeague,
  type IeltsLeagueResult,
} from '../../../services/ieltsCourseHabitService';

export const IELTS_LEAGUE_ROUTE = '/ielts/league';

function LeagueResultModal({ result, onClose }: { result: IeltsLeagueResult; onClose: () => void }) {
  const up = result.result === 'promoted';
  const down = result.result === 'demoted';
  return (
    <div className="ih-celebrate" role="dialog" aria-modal="true" aria-labelledby="lg-result-title" onClick={onClose}>
      <div className={`ih-celebrate-card lg-result lg-result--${result.result}`} onClick={(e) => e.stopPropagation()}>
        <div className="lg-result-art" aria-hidden="true">
          {up && <span className="lg-result-old"><LeagueShield tier={result.tier} size={64} /></span>}
          <span className={up ? 'lg-result-new' : ''}><LeagueShield tier={result.new_tier} size={128} glow={up} /></span>
        </div>
        <p className="ih-celebrate-kicker">Last week · #{result.rank} with {result.xp} XP</p>
        <h2 id="lg-result-title">{up ? `Promoted to ${result.new_tier_name}!` : down ? `Back to ${result.new_tier_name}` : `You stay in ${result.new_tier_name}`}</h2>
        <p>{up ? 'You finished in the top five. A tougher group is waiting.' : down ? 'A fresh week, a fresh start. Five places up and you are back.' : 'Finish in the top five this week to move up.'}</p>
        <button type="button" className="ic-btn ic-btn--primary ic-btn--block ic-btn--glow" onClick={onClose} autoFocus>Let's go</button>
      </div>
    </div>
  );
}

/** The course map's league card: tier, place and time left. */
export function IeltsLeagueCard() {
  const navigate = useNavigate();
  const [league, setLeague] = useState<IeltsLeague | null>(() => cachedIeltsLeague());
  useEffect(() => { let alive = true; fetchIeltsLeague().then((l) => { if (alive) setLeague(l); }).catch(() => undefined); return () => { alive = false; }; }, []);
  if (!league) return null;
  const me = league.members.find((m) => m.me);
  return (
    <button type="button" className="lg-card" onClick={() => navigate(IELTS_LEAGUE_ROUTE)}
      style={{ ['--tier-a' as string]: leagueTier(league.tier).a, ['--tier-b' as string]: leagueTier(league.tier).b } as React.CSSProperties}>
      <LeagueShield tier={league.tier} size={46} />
      <span className="lg-card-text">
        <b>{league.tier_name} League</b>
        <small>{league.joined && me ? `#${me.rank} of ${league.size} · ${leagueTimeLeft(league.ends_at)} left` : 'Earn XP this week to join'}</small>
      </span>
      <span className="lg-card-go" aria-hidden="true">→</span>
    </button>
  );
}

/**
 * Weekly league: up to 20 learners of the same tier race for XP. Top five move up, bottom five (in groups of ten or
 * more) move down. Learners appear as first name and initial with a Blaze avatar; nothing else is shown.
 */
const IeltsCourseLeague: React.FC = () => {
  const navigate = useNavigate();
  const [league, setLeague] = useState<IeltsLeague | null>(() => cachedIeltsLeague());
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IeltsLeagueResult | null>(null);
  const [, tick] = useState(0);

  useEffect(() => {
    let alive = true;
    fetchIeltsLeague()
      .then((l) => {
        if (!alive) return;
        setLeague(l);
        if (l.last_week && !leagueResultSeen(l.last_week.week_start)) { markLeagueResultSeen(l.last_week.week_start); setResult(l.last_week); }
      })
      .catch((e: unknown) => { if (alive) setError(e instanceof Error ? e.message : 'The league could not load.'); });
    const t = window.setInterval(() => tick((n) => n + 1), 60000);
    return () => { alive = false; window.clearInterval(t); };
  }, []);

  const tier = league ? leagueTier(league.tier) : LEAGUE_TIERS[0];
  const nextName = league && league.tier < 8 ? leagueTier(league.tier + 1).name : null;
  const rows = useMemo(() => league?.members ?? [], [league]);

  return (
    <IeltsStudentShell active="course" focus={{ label: 'Course map', to: IELTS_COURSE_ROUTE }}>
      <div className="ic-page ic-page--embedded">
        <main className="ic-main">
          {result && <LeagueResultModal result={result} onClose={() => setResult(null)} />}
          {error && <div className="ic-notice ic-notice--error" role="alert"><b>{error}</b></div>}

          <section className="lg-hero" style={{ ['--tier-a' as string]: tier.a, ['--tier-b' as string]: tier.b, ['--tier-c' as string]: tier.c } as React.CSSProperties} aria-labelledby="lg-title">
            <div className="lg-hero-rays" aria-hidden="true" />
            <LeagueShield tier={league?.tier ?? 1} size={116} glow />
            <h1 id="lg-title">{league ? `${league.tier_name} League` : 'Weekly league'}</h1>
            {league && <p className="lg-hero-time">⏳ {leagueTimeLeft(league.ends_at)} left this week</p>}
            <p className="lg-hero-rule">{nextName ? `Top ${league?.promote_count ?? 5} move up to ${nextName}.` : 'The top league. Hold your place.'}</p>
          </section>

          <ol className="lg-ladder" aria-label="League tiers">
            {LEAGUE_TIERS.map((t) => {
              const state = !league ? 'locked' : t.tier < league.tier ? 'passed' : t.tier === league.tier ? 'current' : 'locked';
              return (
                <li key={t.tier} className={`lg-rung lg-rung--${state}`} aria-label={`${t.name}${state === 'current' ? ', your league' : state === 'locked' ? ', locked' : ''}`}>
                  <LeagueShield tier={t.tier} size={state === 'current' ? 54 : 40} locked={state === 'locked'} />
                  <small>{t.name}</small>
                </li>
              );
            })}
          </ol>

          {league && !league.joined && (
            <section className="ic-card lg-join">
              <Blaze mood="sleepy" size={84} />
              <h2>Your {league.tier_name} group opens with your first step</h2>
              <p className="ic-muted">Earn any XP this week and you join a group of up to 20 learners racing for the top five.</p>
              <button type="button" className="ic-btn ic-btn--primary ic-btn--block ic-btn--glow" onClick={() => navigate(IELTS_COURSE_ROUTE)}>Practise now <span aria-hidden="true">→</span></button>
            </section>
          )}

          {league?.joined && (
            <section className="lg-board" aria-label="This week's ranking">
              {rows.map((m, i) => {
                const promote = m.rank <= league.promote_count && m.xp > 0;
                const demote = league.demote_count > 0 && m.rank > league.size - league.demote_count;
                const before = rows[i - 1];
                const showPromoteLine = league.promote_count > 0 && before && before.rank === league.promote_count;
                const showDemoteLine = league.demote_count > 0 && m.rank === league.size - league.demote_count + 1;
                return (
                  <React.Fragment key={`${m.rank}-${m.name}`}>
                    {showPromoteLine && <div className="lg-zone lg-zone--up"><span>▲ Promotion zone</span></div>}
                    {showDemoteLine && <div className="lg-zone lg-zone--down"><span>▼ Demotion zone</span></div>}
                    <div className={`lg-row${m.me ? ' is-me' : ''}${promote ? ' is-up' : ''}${demote ? ' is-down' : ''}`} style={{ ['--i' as string]: i } as React.CSSProperties}>
                      <span className={`lg-rank lg-rank--${m.rank <= 3 ? m.rank : 'n'}`}>{m.rank <= 3 ? ['🥇', '🥈', '🥉'][m.rank - 1] : m.rank}</span>
                      <LeagueAvatar hue={m.hue} me={m.me} />
                      <span className="lg-name">{m.me ? `${m.name} (you)` : m.name}</span>
                      <span className="lg-xp">{m.xp} XP</span>
                    </div>
                  </React.Fragment>
                );
              })}
              {league.size < 5 && <p className="lg-note">More learners join as they practise this week.</p>}
              <p className="lg-note">Learners appear as first name and initial. Weekly XP is for fun, never an IELTS score.</p>
            </section>
          )}
        </main>
      </div>
    </IeltsStudentShell>
  );
};

export default IeltsCourseLeague;
