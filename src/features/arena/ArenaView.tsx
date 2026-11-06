import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import ModalPortal from '../../../components/ModalPortal';
import { abandonArenaMatch, answerRespawnQuestion, fetchArenaStatus, fetchRespawnQuestion, finishArenaMatch, startArenaMatch } from '../../../services/arenaService';
import { ArenaEngine, drawFighterPortrait } from './arenaEngine';
import { FIGHTERS, FIGHTER_IDS, TROPHY_ROAD, arenaBlock, type ArenaMatchOutcome, type ArenaMatchResult, type ArenaMatchTicket, type ArenaRespawnQuestion, type ArenaStatus, type FighterId } from './arenaModel';
import './arena.css';

const SOUND_KEY = 'bh:arena-sound';
const readSound = () => { try { return localStorage.getItem(SOUND_KEY) !== 'off'; } catch { return true; } };

export interface ArenaViewProps {
  userId: string;
  username: string;
  /** Deltas paid by the server after a match, so the header updates without a reload. */
  onRewards?: (rewards: { xp: number; gems: number }) => void;
  addToast?: (message: string, type?: 'info' | 'success' | 'error' | 'warning') => void;
}

type Phase = 'lobby' | 'starting' | 'match' | 'finishing' | 'results';
interface QuestionState { q: ArenaRespawnQuestion; picked: string | null; correct: boolean | null }

const FighterCard: React.FC<{ id: FighterId; power: number; attempts: number; unlocked: boolean; selected: boolean; onPick: () => void }> = ({ id, power, attempts, unlocked, selected, onPick }) => {
  const { t } = useLanguage();
  const H = FIGHTERS[id];
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => { if (ref.current) drawFighterPortrait(ref.current, id); }, [id]);
  return (
    <button type="button" className={`arena-fighter${selected ? ' is-selected' : ''}${unlocked ? '' : ' is-locked'}`} onClick={onPick} aria-pressed={selected} disabled={!unlocked}
      aria-label={`${H.name}, ${H.role}${unlocked ? '' : `, ${t('Unlocks at {count} trophies', { count: H.unlock })}`}`}>
      {!unlocked && <span className="arena-fighter__lock">{t('Unlocks at {count} trophies', { count: H.unlock })}</span>}
      <canvas ref={ref} width={400} height={220} aria-hidden="true" />
      <div><div className="arena-fighter__name">{H.name}</div><div className="arena-fighter__role">{H.role}</div></div>
      <div className="arena-fighter__subject">{attempts < 10 ? t('Answer more {subject} questions to power up.', { subject: H.subject }) : t('{subject} mastery powers this fighter.', { subject: H.subject })}</div>
      <div className="arena-pips" title={t('Power {power} of 5', { power })} aria-label={t('Power {power} of 5', { power })}>
        {[1, 2, 3, 4, 5].map((i) => <span key={i} className={i <= power ? 'is-on' : ''} />)}
      </div>
    </button>
  );
};

const ArenaView: React.FC<ArenaViewProps> = ({ userId, username, onRewards, addToast }) => {
  const { t } = useLanguage();
  const [status, setStatus] = useState<ArenaStatus | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [phase, setPhase] = useState<Phase>('lobby');
  const [selected, setSelected] = useState<FighterId>('rivet');
  const [ticket, setTicket] = useState<ArenaMatchTicket | null>(null);
  const [outcome, setOutcome] = useState<ArenaMatchOutcome | null>(null);
  const [result, setResult] = useState<ArenaMatchResult | null>(null);
  const [question, setQuestion] = useState<QuestionState | null>(null);
  const [sound, setSound] = useState(readSound);
  const [superReady, setSuperReady] = useState(false);
  const [touch, setTouch] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<ArenaEngine | null>(null);
  const questionTimer = useRef<number | undefined>(undefined);

  const reload = useCallback(async (fresh = true) => {
    try { setStatus(await fetchArenaStatus(fresh)); setLoadError(false); }
    catch { setLoadError(true); }
  }, []);
  useEffect(() => { void reload(false); }, [reload, userId]);

  const fighters = useMemo(() => {
    const by = new Map((status?.fighters ?? []).map((f) => [f.id, f]));
    return FIGHTER_IDS.map((id) => by.get(id) ?? { id, power: 1, attempts: 0, correct: 0, unlocked: FIGHTERS[id].unlock === 0 });
  }, [status]);
  const block = arenaBlock(status);
  const trophies = status?.trophies ?? 0;

  const labels = useMemo(() => ({
    holdReactor: t('Hold the reactor!'), backIn: t('Back in'), victory: t('Victory!'), defeat: t('Defeat'), draw: t('Draw'), go: t('GO!'),
    yourTeamHolds: t('Your team holds the reactor'), enemyHolds: t('Enemy holds the reactor'), contested: t('Contested'), reactorEmpty: t('Reactor empty'),
    superReady: t('Space'), superCharge: t('Super'), turnPhone: t('Turn your phone sideways for a bigger view'),
  }), [t]);

  const stopEngine = useCallback(() => { engineRef.current?.destroy(); engineRef.current = null; window.clearTimeout(questionTimer.current); }, []);
  useEffect(() => stopEngine, [stopEngine]);

  const onKnockout = useCallback((matchId: string) => {
    void fetchRespawnQuestion(matchId).then((q) => {
      if (!q.available || !engineRef.current) return;
      setQuestion({ q, picked: null, correct: null });
      window.clearTimeout(questionTimer.current);
      questionTimer.current = window.setTimeout(() => setQuestion((cur) => (cur && cur.picked === null ? null : cur)), 9000);
    }).catch(() => undefined);
  }, []);

  const onEnd = useCallback(async (matchId: string, o: ArenaMatchOutcome) => {
    setOutcome(o); setQuestion(null); setPhase('finishing');
    try {
      const r = await finishArenaMatch(matchId, o.scoreMine, o.scoreTheirs, o.mvp);
      setResult(r);
      if (r.paid && onRewards && (r.xp || r.gems)) onRewards({ xp: r.xp, gems: r.gems });
    } catch { setResult(null); addToast?.(t('The result could not be saved. Check your connection.'), 'error'); }
    stopEngine();
    setPhase('results');
    void reload(true);
  }, [addToast, onRewards, reload, stopEngine, t]);

  const startMatch = useCallback(async () => {
    if (phase !== 'lobby' && phase !== 'results') return;
    setPhase('starting'); setResult(null); setOutcome(null); setQuestion(null);
    try {
      const tk = await startArenaMatch(selected);
      setTicket(tk); setPhase('match');
    } catch (error) {
      setPhase('lobby');
      const msg = error instanceof Error ? error.message : String(error);
      addToast?.(msg.includes('NO_TICKETS') ? t('No tickets. Finish a quest, a quiz or an assignment to earn one.')
        : msg.includes('DAILY_CAP') ? t("You've played all {count} matches for today. Come back tomorrow.", { count: status?.daily_cap ?? 0 })
        : t('Could not start the match. Try again.'), 'error');
      void reload(true);
    }
  }, [addToast, phase, reload, selected, status?.daily_cap, t]);

  // Mount the engine once the match canvas exists.
  useEffect(() => {
    if (phase !== 'match' || !ticket || !canvasRef.current) return;
    const matchId = ticket.match_id;
    const engine = new ArenaEngine(canvasRef.current, {
      fighter: ticket.fighter, power: ticket.power, botPower: ticket.bot_power, playerName: username.slice(0, 12) || 'You', soundEnabled: sound, labels,
      onKnockout: () => onKnockout(matchId), onEnd: (o) => { void onEnd(matchId, o); },
    });
    engineRef.current = engine;
    const poll = window.setInterval(() => { setSuperReady(engine.superReady); setTouch(engine.touchMode); }, 250);
    return () => { window.clearInterval(poll); };
    // labels and sound are applied live through the engine; recreating it would restart the match.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, ticket]);
  useEffect(() => { engineRef.current?.setSound(sound); try { localStorage.setItem(SOUND_KEY, sound ? 'on' : 'off'); } catch { /* no storage */ } }, [sound]);

  // Quitting early returns the ticket (the server decides, within the first minute).
  const quit = () => {
    stopEngine(); setPhase('lobby'); setQuestion(null);
    const matchId = ticket?.match_id;
    if (matchId) {
      void abandonArenaMatch(matchId).then((r) => { if (r.refunded) addToast?.(t('Ticket returned.'), 'info'); }).catch(() => undefined).finally(() => void reload(true));
    } else void reload(true);
  };

  const answer = async (option: string) => {
    if (!question || question.picked !== null || !ticket || !question.q.prompt_id) return;
    setQuestion({ ...question, picked: option });
    try {
      const r = await answerRespawnQuestion(ticket.match_id, question.q.prompt_id, option);
      setQuestion((cur) => (cur ? { ...cur, correct: r.correct } : cur));
      if (r.correct) engineRef.current?.applyRespawnBonus();
    } catch { setQuestion((cur) => (cur ? { ...cur, correct: false } : cur)); }
    window.clearTimeout(questionTimer.current);
    questionTimer.current = window.setTimeout(() => setQuestion(null), 1400);
  };

  const blockMessage = block === 'school_off' ? t('The arena is off for your school.')
    : block === 'class_off' ? t('Your teacher has switched the arena off for your class.')
    : block === 'window' ? t('The arena opens at {start} and closes at {end}.', { start: status?.window_start ?? '', end: status?.window_end ?? '' })
    : block === 'assignment' ? t("Finish today's assignment first.")
    : block === 'cap' ? t("You've played all {count} matches for today. Come back tomorrow.", { count: status?.daily_cap ?? 0 })
    : block === 'tickets' ? t('No tickets. Finish a quest, a quiz or an assignment to earn one.') : null;

  const roadMax = TROPHY_ROAD[TROPHY_ROAD.length - 1].trophies;

  return (
    <>
      <section className="student-feed-card arena-lobby" aria-label={t('Proving Grounds')}>
        <div className="arena-lobby__head">
          <div><h2 className="font-heading text-white">{t('Proving Grounds')}</h2><p>{t('Each match costs 1 ticket. Earn tickets by finishing quests, quizzes and assignments.')}</p></div>
          <div className="arena-wallet">
            <span className="arena-chip arena-chip--good" aria-live="polite">🎟️ {status?.tickets ?? 0}<small>{t('Tickets')}</small></span>
            <span className="arena-chip">🏆 {trophies}<small>{t('Trophies')}</small></span>
            <button type="button" className="arena-chip" onClick={() => setSound((s) => !s)} aria-pressed={sound}>{sound ? t('Sound on') : t('Sound off')}</button>
          </div>
        </div>

        {loadError && <div className="arena-blocked" role="alert">{t('The arena could not be loaded. Check your connection.')} <button type="button" className="underline" onClick={() => void reload(true)}>{t('Retry')}</button></div>}

        {status && (
          <div className="arena-road" aria-label={t('Trophy road')}>
            <div className="arena-road__track">
              <div className="arena-road__fill" style={{ width: `${Math.min(100, trophies / roadMax * 100)}%` }} />
              {TROPHY_ROAD.map((m) => (
                <div key={m.trophies} className={`arena-road__mile${trophies >= m.trophies ? ' is-got' : ''}`} style={{ left: `${m.trophies / roadMax * 100}%` }}>
                  <b>{m.trophies} · {m.label}</b>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <h3 className="arena-fighter__role" style={{ marginBottom: 8 }}>{t('Pick your fighter')}</h3>
          <div className="arena-fighters">
            {fighters.map((f) => <FighterCard key={f.id} id={f.id} power={f.power} attempts={f.attempts} unlocked={f.unlocked} selected={selected === f.id} onPick={() => setSelected(f.id)} />)}
          </div>
        </div>

        {blockMessage && <div className="arena-blocked" role="status">{blockMessage}</div>}

        <div className="arena-cta">
          <button type="button" className="student-primary-button" onClick={() => void startMatch()} disabled={!status || block !== null || phase === 'starting'}>
            {phase === 'starting' ? t('Loading the arena…') : t('Battle!')}
          </button>
          <div className="arena-cta__mode">
            <b>{t('Reactor Rush · 3 vs 3')}</b><br />{t('Stand in the reactor ring with no enemies inside to score. First team to 100 wins.')}
            {status?.available && <><br /><span className="arena-muted">{t('Matches today: {played} of {cap}', { played: status.played_today ?? 0, cap: status.daily_cap ?? 0 })}</span></>}
          </div>
        </div>

        <details className="arena-how">
          <summary>{t('How to play')}</summary>
          <ul>
            <li>{t('Computer: WASD to move, mouse to aim and shoot, Space for your super.')}</li>
            <li>{t('Phone: left thumb moves, right thumb aims and shoots. Tap the round button for your super.')}</li>
            <li>{t('Hide in bushes, heal by not fighting for a few seconds, and answer the question while you wait to come back.')}</li>
            <li>{t('Your fighter gets stronger as your mastery of its subject grows.')}</li>
          </ul>
        </details>
      </section>

      {/* The dashboard sits inside a transformed "cinematic" wrapper, which would pin a fixed overlay to the page
          instead of the screen (the black-screen bug). ModalPortal renders into document.body and locks scroll. */}
      {(phase === 'match' || phase === 'finishing') && ticket && (
        <ModalPortal>
        <div className="arena-match" role="application" aria-label={t('Proving Grounds')}>
          <canvas ref={canvasRef} />
          <button type="button" className="arena-match__quit" onClick={quit}>{t('Quit match')}</button>
          {touch && <button type="button" className={`arena-match__super${superReady ? ' is-ready' : ''}`} onPointerDown={(e) => { e.preventDefault(); engineRef.current?.playerSuper(); }} aria-label={t('Super')}>{t('Super').toUpperCase()}</button>}
          {question && (
            <div className="arena-question" role="dialog" aria-live="polite" lang="en" dir="ltr">
              <div className="arena-question__eyebrow">{t('Quick question!')}</div>
              <p className="arena-question__text">{question.q.text}</p>
              <div className="arena-question__options">
                {(question.q.options ?? []).map((o) => (
                  <button key={o} type="button" disabled={question.picked !== null} onClick={() => void answer(o)}
                    className={question.picked === o ? (question.correct === true ? 'is-right' : question.correct === false ? 'is-wrong' : '') : ''}>{o}</button>
                ))}
              </div>
              {question.correct !== null && <div className="arena-question__verdict">{question.correct ? t('Correct! Back early with your super half charged.') : t('Not this time. Back in a moment.')}</div>}
            </div>
          )}
        </div>
        </ModalPortal>
      )}

      {phase === 'results' && outcome && (
        <ModalPortal>
        <div className="arena-results" role="dialog" aria-label={t('Match result')}>
          <div className="arena-results__card">
            <p className={`arena-results__verdict font-heading ${result?.result === 'win' || (!result && outcome.scoreMine > outcome.scoreTheirs) ? 'is-win' : result?.result === 'loss' || (!result && outcome.scoreMine < outcome.scoreTheirs) ? 'is-loss' : ''}`}>
              {outcome.scoreMine > outcome.scoreTheirs ? t('Victory!') : outcome.scoreMine < outcome.scoreTheirs ? t('Defeat') : t('Draw')}
            </p>
            <div className="arena-results__score"><span className="b">{outcome.scoreMine}</span><span>–</span><span className="r">{outcome.scoreTheirs}</span></div>
            {result && result.paid && (
              <div className="arena-results__rewards">
                <span className="arena-chip">🏆 {result.trophies_delta >= 0 ? '+' : ''}{result.trophies_delta}</span>
                {result.xp > 0 && <span className="arena-chip">+{result.xp} XP</span>}
                {result.gems > 0 && <span className="arena-chip">💎 +{result.gems}</span>}
                {outcome.mvp && <span className="arena-chip arena-chip--good">{t('MVP!')}</span>}
                {result.unlocked.map((id) => <span key={id} className="arena-chip arena-chip--good">{t('Unlocked {name}!', { name: FIGHTERS[id].name })}</span>)}
              </div>
            )}
            {result && !result.paid && <div className="arena-blocked">{t('No rewards: the match was too short or the daily cap is reached.')}</div>}
            <div className="arena-results__stats">{t('{kills} knockouts · {damage} damage', { kills: outcome.kills, damage: outcome.damage })}</div>
            <div className="arena-results__buttons">
              <button type="button" className="student-primary-button" onClick={() => void startMatch()} disabled={arenaBlock(status) !== null}>{t('Play again')}</button>
              <button type="button" className="student-secondary-button" onClick={() => setPhase('lobby')}>{t('Back to the lobby')}</button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}
    </>
  );
};

export default ArenaView;
