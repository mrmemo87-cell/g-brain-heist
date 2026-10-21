import React, { useEffect, useState } from 'react';
import { useLanguage } from '../../src/contexts/LanguageContext';
import { fetchWeeklyClassBoard, type WeeklyClassBoard as Board } from '../../services/weeklyClassBoardService';
import './WeeklyClassBoard.css';

interface WeeklyClassBoardProps {
  /** Change this value to reload the board (e.g. after finishing the daily mission). */
  refreshKey?: number;
}

const initials = (name: string) => name.trim().slice(0, 2).toUpperCase() || '?';

const WeeklyClassBoard: React.FC<WeeklyClassBoardProps> = ({ refreshKey = 0 }) => {
  const { t } = useLanguage();
  const [board, setBoard] = useState<Board | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchWeeklyClassBoard().then((next) => { if (!cancelled) setBoard(next); });
    return () => { cancelled = true; };
  }, [refreshKey]);

  if (!board) return null;

  const everyoneAtZero = board.entries.every((entry) => entry.points === 0);
  let headline: string;
  if (everyoneAtZero) headline = t('Nobody has points yet. Finish today’s mission to take #1.');
  else if (board.my_rank === 1) headline = t('You’re #1 in {label} this week. Keep it up!', { label: board.class_label });
  else if (board.next_name && board.points_to_next !== null) {
    headline = t('You’re #{rank}, {points} points behind {name}.', { rank: board.my_rank, points: board.points_to_next, name: board.next_name });
  } else headline = t('You’re #{rank} in {label} this week.', { rank: board.my_rank, label: board.class_label });

  const resetText = board.days_until_reset <= 1
    ? t('Resets tomorrow')
    : t('Resets in {count} days', { count: board.days_until_reset });

  let previousPosition = 0;

  return (
    <article className="student-feed-card wcb" aria-labelledby="wcb-title">
      <div className="wcb-head">
        <span className="wcb-pill">{t('{label} · this week', { label: board.class_label })}</span>
        <span className="wcb-meta">{resetText}</span>
      </div>
      <h2 id="wcb-title" className="wcb-title font-heading">{headline}</h2>
      {board.places_climbed_today > 0 ? (
        <p className="wcb-climb" role="status">
          <span aria-hidden="true">▲</span>
          {board.places_climbed_today === 1
            ? t('You moved up 1 place today')
            : t('You moved up {count} places today', { count: board.places_climbed_today })}
        </p>
      ) : null}

      <ol className="wcb-list">
        {board.entries.map((entry) => {
          const gap = entry.position - previousPosition > 1;
          previousPosition = entry.position;
          return (
            <React.Fragment key={`${entry.position}-${entry.name}`}>
              {gap ? <li className="wcb-gap" aria-hidden="true">⋯</li> : null}
              <li className={entry.is_me ? 'wcb-row is-me' : 'wcb-row'} aria-current={entry.is_me ? 'true' : undefined}>
                <span className="wcb-rank">#{entry.rank}</span>
                {entry.avatar_url
                  ? <img className="wcb-avatar" src={entry.avatar_url} alt="" loading="lazy" />
                  : <span className="wcb-avatar" aria-hidden="true">{initials(entry.name)}</span>}
                <span className="wcb-name">{entry.is_me ? t('You') : entry.name}</span>
                <span className="wcb-points">{t('{count} pts', { count: entry.points })}</span>
              </li>
            </React.Fragment>
          );
        })}
      </ol>

      <p className="wcb-how">{t('Daily mission: 10 pts + 2 per correct answer · Assignment: 5 pts')}</p>
    </article>
  );
};

export default WeeklyClassBoard;
