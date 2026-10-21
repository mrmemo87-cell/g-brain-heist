import React, { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '../../src/contexts/LanguageContext';
import { fetchClassConquest, type ClassConquestData } from '../../services/classConquestService';
import { buildConquest, classColors, OBLASTS } from '../../src/lib/classConquest';
import { mascotMoment } from '../../src/features/studentMascot/mascotMoments';
import ConquestMap from './ConquestMap';
import './ClassConquest.css';

interface ClassConquestCardProps {
  /** Change to reload (e.g. after finishing the daily mission). */
  refreshKey?: number;
}

const oblastName = (zoneId: string) => OBLASTS.find((o) => o.zoneId === zoneId)?.name ?? zoneId;

const ClassConquestCard: React.FC<ClassConquestCardProps> = ({ refreshKey = 0 }) => {
  const { t } = useLanguage();
  const [data, setData] = useState<ClassConquestData | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchClassConquest().then((result) => { if (!cancelled) setData(result.available ? result.data : null); });
    return () => { cancelled = true; };
  }, [refreshKey]);

  const view = useMemo(() => (data ? buildConquest(data.classes, data.today) : null), [data]);
  const colors = useMemo(() => (data ? classColors(data.classes) : {}), [data]);
  const label = (id: string) => data?.classes.find((c) => c.class_id === id)?.label ?? '';

  const myCaptures = view?.mine ? view.captures.filter((c) => c.by === view.mine!.class_id) : [];
  useEffect(() => {
    if (!view?.mine || myCaptures.length === 0) return;
    try {
      const key = `bh:conquest-capture:${data?.today}:${view.mine.class_id}`;
      const seen = Number(localStorage.getItem(key) || 0);
      if (myCaptures.length > seen) { localStorage.setItem(key, String(myCaptures.length)); mascotMoment('climb'); }
    } catch { /* no storage: skip the cheer */ }
  }, [view, myCaptures.length, data?.today]);

  if (!data || !view || !view.mine) return null;

  const mine = view.mine;
  const myHeld = view.held[mine.class_id];
  let goal: string;
  if (view.missionsToNext !== null) {
    goal = view.missionsToNext === 1
      ? t('1 more mission from {class} today wins another oblast.', { class: mine.label })
      : t('{count} more missions from {class} today win another oblast.', { count: view.missionsToNext, class: mine.label });
  } else if (view.myDoneToday >= mine.size) {
    goal = t('Everyone in {class} finished today. Unbeatable!', { class: mine.label });
  } else {
    goal = t('Each mission today adds {power} power to {class}.', { power: view.powerPerMission, class: mine.label });
  }

  const headline = myHeld === 0
    ? t('{class} holds no oblasts yet. Win some back!', { class: mine.label })
    : myHeld === OBLASTS.length
      ? t('{class} rules all of Kyrgyzstan!', { class: mine.label })
      : t('{class} holds {count} of 7 oblasts', { class: mine.label, count: myHeld });

  return (
    <article className="student-feed-card ccq" aria-labelledby="ccq-title">
      <div className="ccq-head">
        <span className="ccq-pill">{t('Class Conquest · Grade {grade}', { grade: data.grade })}</span>
        <span className="ccq-meta">{data.days_until_reset <= 1 ? t('Resets tomorrow') : t('Resets in {count} days', { count: data.days_until_reset })}</span>
      </div>
      <h2 id="ccq-title" className="ccq-title font-heading">{headline}</h2>
      {myCaptures.length > 0 ? (
        <p className="ccq-capture" role="status">
          <span aria-hidden="true">⚑</span>
          {t('Today {class} captured {oblasts}!', { class: mine.label, oblasts: myCaptures.map((c) => c.name).join(', ') })}
        </p>
      ) : null}

      <ConquestMap classes={data.classes} owners={view.owners} colors={colors} label={t('Map of Kyrgyzstan showing which class holds each oblast')} />

      <ol className="ccq-standings">
        {view.ranking.map((id, index) => {
          const team = data.classes.find((c) => c.class_id === id)!;
          const today = team.days.find((d) => d.date === data.today)?.done ?? 0;
          return (
            <li key={id} className={team.is_mine ? 'ccq-row is-mine' : 'ccq-row'}>
              <span className="ccq-rank">#{index + 1}</span>
              <span className="ccq-swatch" style={{ background: colors[id] }} aria-hidden="true" />
              <span className="ccq-name">{team.label}</span>
              <span className="ccq-stat">{t('{count} oblasts', { count: view.held[id] })}</span>
              <span className="ccq-stat ccq-today">{t('{done}/{size} today', { done: today, size: team.size })}</span>
            </li>
          );
        })}
      </ol>

      <p className="ccq-goal">{goal}</p>
      {view.captures.filter((c) => c.by !== mine.class_id).length > 0 ? (
        <p className="ccq-how">
          {view.captures.filter((c) => c.by !== mine.class_id).map((c) => t('{class} took {oblast} today.', { class: label(c.by), oblast: oblastName(c.zoneId) })).join(' ')}
        </p>
      ) : null}
      <p className="ccq-how">{t('Power each day = share of your class that finished the daily mission.')}</p>
    </article>
  );
};

export default ClassConquestCard;
