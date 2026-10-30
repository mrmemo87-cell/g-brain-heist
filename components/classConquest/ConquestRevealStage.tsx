import { createPortal } from 'react-dom';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addDays, CONQUEST_COLORS, mapById, mapForWeek, roleForRank, type ConquestResult } from '../../src/lib/classConquest';
import { conquestBadgeSvg, weekLabel } from '../../src/lib/conquestCertificates';

interface ConquestRevealStageProps {
  result: ConquestResult;
  onClose: () => void;
}

/**
 * Monday-morning projector ceremony. The teacher taps / presses → to advance:
 * the vault opens, classes are revealed from last place to first, then the top
 * five of the winning class from #5 to the Mastermind, then the weekend extras.
 */
const ConquestRevealStage: React.FC<ConquestRevealStageProps> = ({ result, onClose }) => {
  const map = mapById(result.map_id);
  const nextMap = mapForWeek(addDays(result.week_start, 7));
  const stage = useRef<HTMLDivElement>(null);
  const standingsAsc = useMemo(() => [...result.standings].sort((a, b) => b.rank - a.rank), [result.standings]); // last place first
  const topAsc = useMemo(() => [...result.top_students].sort((a, b) => b.rank - a.rank), [result.top_students]);
  const colors = useMemo(() => Object.fromEntries([...result.standings].sort((a, b) => a.label.localeCompare(b.label)).map((s, i) => [s.class_id, CONQUEST_COLORS[i % CONQUEST_COLORS.length]])), [result.standings]);

  // Steps: 0 = sealed vault · 1..n = standings · n+1..n+m = top five · last = finale
  const total = 1 + standingsAsc.length + topAsc.length + 1;
  const [step, setStep] = useState(0);
  const next = useCallback(() => setStep((s) => Math.min(total - 1, s + 1)), [total]);
  const back = useCallback(() => setStep((s) => Math.max(0, s - 1)), []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight' || event.key === ' ' || event.key === 'Enter') { event.preventDefault(); next(); }
      else if (event.key === 'ArrowLeft') back();
      else if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    stage.current?.requestFullscreen?.().catch(() => { /* fullscreen blocked: in-page view is fine */ });
    return () => {
      document.removeEventListener('keydown', onKey);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => { /* already out */ });
    };
  }, [next, back, onClose]);

  const shownStandings = standingsAsc.slice(0, Math.max(0, Math.min(step, standingsAsc.length)));
  const winnerShown = step >= standingsAsc.length;
  const shownTop = topAsc.slice(0, Math.max(0, Math.min(step - standingsAsc.length, topAsc.length)));
  const finale = step >= total - 1;
  const weekend = result.weekend ?? null;

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div ref={stage} className="ccq-reveal" role="dialog" aria-modal="true" aria-label={`Class Conquest reveal · ${map.name}`} onClick={next}>
      <header className="ccq-reveal-head">
        <span>{map.flag} Operation {map.name} · Grade {result.grade} · {weekLabel(result.week_start)}</span>
        <button type="button" className="ccq-modal-close" onClick={(event) => { event.stopPropagation(); onClose(); }} aria-label="Close">×</button>
      </header>

      {step === 0 ? (
        <div className="ccq-reveal-vault">
          <div className="ccq-reveal-lock" aria-hidden="true">🔒</div>
          <h1 className="font-heading">The vault opens</h1>
          <p>Who conquered {map.name}? Tap or press → to find out.</p>
        </div>
      ) : (
        <div className="ccq-reveal-grid">
          <ol className="ccq-reveal-standings" aria-live="polite">
            {standingsAsc.map((s, i) => {
              const shown = i < shownStandings.length;
              const isWinner = s.rank === 1;
              return (
                <li key={s.class_id} className={`${shown ? 'is-shown' : ''}${isWinner && shown ? ' is-winner' : ''}`} style={{ order: s.rank }}>
                  <span className="ccq-rank">#{s.rank}</span>
                  <span className="ccq-swatch" style={{ background: colors[s.class_id] }} aria-hidden="true" />
                  <span className="ccq-name">{shown ? s.label : '???'}</span>
                  <span className="ccq-stat ccq-power">{shown ? `${s.power} power` : ''}</span>
                </li>
              );
            })}
          </ol>

          <div className="ccq-reveal-side">
            {winnerShown && result.winner_label ? (
              <div className="ccq-reveal-winner">
                <span dangerouslySetInnerHTML={{ __html: conquestBadgeSvg({ kind: 'silver', mapId: result.map_id, caption: result.winner_label.toUpperCase(), size: 120 }) }} />
                <h2 className="font-heading">{result.winner_label} conquered {map.name}!</h2>
                {topAsc.length > 0 && shownTop.length === 0 ? <p>Now… the top five of {result.winner_label}. Press → for #5.</p> : null}
              </div>
            ) : null}
            {shownTop.length > 0 ? (
              <ol className="ccq-reveal-top">
                {topAsc.map((s, i) => (
                  <li key={s.student_id} className={i < shownTop.length ? 'is-shown' : ''} style={{ order: s.rank }}>
                    {i < shownTop.length ? (
                      <>
                        <span className="ccq-reveal-badge" aria-hidden="true" dangerouslySetInnerHTML={{ __html: conquestBadgeSvg({ kind: 'gold', mapId: result.map_id, rank: s.rank, size: 64 }) }} />
                        <span className="ccq-reveal-role">{roleForRank(s.rank)}</span>
                        <b>{s.name}</b>
                        <small>{s.missions} missions · {s.correct} correct</small>
                      </>
                    ) : <span className="ccq-reveal-role">#{s.rank} · ???</span>}
                  </li>
                ))}
              </ol>
            ) : null}
            {finale ? (
              <div className="ccq-reveal-finale">
                {weekend?.raid_champion_label ? <p>⚔️ Border Raid champions: <b>{weekend.raid_champion_label}</b></p> : null}
                {weekend && weekend.oracles > 0 ? <p>🔮 {weekend.oracles} {weekend.oracles === 1 ? 'student' : 'students'} predicted it right — Oracle badges unlocked</p> : null}
                <p>{nextMap.flag} Next: Operation {nextMap.name}. Missions count from today.</p>
              </div>
            ) : null}
          </div>
        </div>
      )}

      <footer className="ccq-reveal-foot">
        <span>{step + 1} / {total}</span>
        <span>← → to move · Esc to close</span>
      </footer>
    </div>,
    document.body,
  );
};

export default ConquestRevealStage;
