import React, { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '../../src/contexts/LanguageContext';
import { fetchClassConquest, type ClassConquestData } from '../../services/classConquestService';
import { buildConquest, classColors, mapById, roleForRank } from '../../src/lib/classConquest';
import { conquestBadgeSvg } from '../../src/lib/conquestCertificates';
import { mascotMoment } from '../../src/features/studentMascot/mascotMoments';
import ConquestMap from './ConquestMap';
import ConquestHistoryModal from './ConquestHistoryModal';
import './ClassConquest.css';

interface ClassConquestCardProps {
  /** Change to reload (e.g. after finishing the daily mission). */
  refreshKey?: number;
}

const ClassConquestCard: React.FC<ClassConquestCardProps> = ({ refreshKey = 0 }) => {
  const { t } = useLanguage();
  const [data, setData] = useState<ClassConquestData | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchClassConquest().then((result) => { if (!cancelled) setData(result.available ? result.data : null); });
    return () => { cancelled = true; };
  }, [refreshKey]);

  const map = useMemo(() => (data ? mapById(data.map_id) : null), [data]);
  const nextMap = useMemo(() => (data ? mapById(data.next_map_id) : null), [data]);
  const view = useMemo(() => (data && map ? buildConquest(data.classes, data.today, map) : null), [data, map]);
  const colors = useMemo(() => (data ? classColors(data.classes) : {}), [data]);
  const label = (id: string) => data?.classes.find((c) => c.class_id === id)?.label ?? '';
  const territoryName = (zoneId: string) => map?.territories.find((o) => o.zoneId === zoneId)?.name ?? zoneId;

  const myCaptures = view?.mine ? view.captures.filter((c) => c.by === view.mine!.class_id) : [];
  useEffect(() => {
    if (!view?.mine || myCaptures.length === 0) return;
    try {
      const key = `bh:conquest-capture:${data?.today}:${view.mine.class_id}`;
      const seen = Number(localStorage.getItem(key) || 0);
      if (myCaptures.length > seen) { localStorage.setItem(key, String(myCaptures.length)); mascotMoment('climb'); }
    } catch { /* no storage: skip the cheer */ }
  }, [view, myCaptures.length, data?.today]);

  if (!data || !view || !view.mine || !map || !nextMap) return null;

  const mine = view.mine;
  const myHeld = view.held[mine.class_id];
  const total = map.territories.length;
  const unit = t(map.unit);
  const finalDay = data.days_until_reset <= 1;

  let goal: string;
  if (view.missionsToNext !== null) {
    goal = view.missionsToNext === 1
      ? t('1 more mission from {class} today wins another territory.', { class: mine.label })
      : t('{count} more missions from {class} today win another territory.', { count: view.missionsToNext, class: mine.label });
  } else if (view.myDoneToday >= mine.size) {
    goal = t('Everyone in {class} finished today. Unbeatable!', { class: mine.label });
  } else {
    goal = t('Each mission today adds {power} power to {class}.', { power: view.powerPerMission, class: mine.label });
  }

  const headline = myHeld === 0
    ? t('{class} holds nothing yet. Win some back!', { class: mine.label })
    : myHeld === total
      ? t('{class} rules all of {map}!', { class: mine.label, map: map.name })
      : t('{class} holds {count} of {total} {unit}', { class: mine.label, count: myHeld, total, unit });

  const last = data.last_week;
  const lastMap = last ? mapById(last.map_id) : null;

  return (
    <article className="student-feed-card ccq" aria-labelledby="ccq-title">
      <div className="ccq-head">
        <span className="ccq-pill">{t('Class Conquest · Grade {grade}', { grade: data.grade })}</span>
        <span className="ccq-meta">
          {finalDay ? t('Final day — new map tomorrow') : t('Resets in {count} days', { count: data.days_until_reset })}
        </span>
      </div>
      <h2 id="ccq-title" className="ccq-title font-heading">{map.flag} {headline}</h2>

      {last && last.winner_label ? (
        <div className={last.is_my_class ? 'ccq-last is-mine' : 'ccq-last'} role="status">
          {last.my_rank ? (
            <span className="ccq-last-badge" aria-hidden="true" dangerouslySetInnerHTML={{ __html: conquestBadgeSvg({ kind: 'gold', mapId: last.map_id, rank: last.my_rank, size: 44 }) }} />
          ) : last.is_my_class ? (
            <span className="ccq-last-badge" aria-hidden="true" dangerouslySetInnerHTML={{ __html: conquestBadgeSvg({ kind: 'silver', mapId: last.map_id, size: 44 }) }} />
          ) : <span className="ccq-last-flag" aria-hidden="true">{lastMap?.flag}</span>}
          <span className="ccq-last-text">
            {last.my_rank
              ? t('Last week you were the {role} of Grade {grade} — {class} conquered {map}!', { role: roleForRank(last.my_rank), grade: data.grade, class: last.winner_label, map: lastMap?.name ?? '' })
              : last.is_my_class
                ? t('Last week {class} conquered {map}. New badge unlocked!', { class: last.winner_label, map: lastMap?.name ?? '' })
                : t('Last week {class} conquered {map}.', { class: last.winner_label, map: lastMap?.name ?? '' })}
          </span>
        </div>
      ) : null}

      {myCaptures.length > 0 ? (
        <p className="ccq-capture" role="status">
          <span aria-hidden="true">⚑</span>
          {t('Today {class} captured {oblasts}!', { class: mine.label, oblasts: myCaptures.map((c) => c.name).join(', ') })}
        </p>
      ) : null}

      <ConquestMap map={map} classes={data.classes} owners={view.owners} colors={colors} label={t('Map of {map} showing which class holds each territory', { map: map.name })} />

      <ol className="ccq-standings">
        {view.ranking.map((id, index) => {
          const team = data.classes.find((c) => c.class_id === id)!;
          const today = team.days.find((d) => d.date === data.today)?.done ?? 0;
          return (
            <li key={id} className={team.is_mine ? 'ccq-row is-mine' : 'ccq-row'}>
              <span className="ccq-rank">#{index + 1}</span>
              <span className="ccq-swatch" style={{ background: colors[id] }} aria-hidden="true" />
              <span className="ccq-name">{team.label}</span>
              <span className="ccq-stat">{t('{count} {unit}', { count: view.held[id], unit })}</span>
              <span className="ccq-stat ccq-today">{t('{done}/{size} today', { done: today, size: team.size })}</span>
            </li>
          );
        })}
      </ol>

      <p className="ccq-goal">{goal}</p>
      {view.captures.filter((c) => c.by !== mine.class_id).length > 0 ? (
        <p className="ccq-how">
          {view.captures.filter((c) => c.by !== mine.class_id).map((c) => t('{class} took {oblast} today.', { class: label(c.by), oblast: territoryName(c.zoneId) })).join(' ')}
        </p>
      ) : null}

      <div className="ccq-next">
        <span className="ccq-next-flag" aria-hidden="true">{nextMap.flag}</span>
        <span>
          <b>{t('Next week: {map}', { map: nextMap.name })}</b>
          <small>{finalDay ? t('Unlocks tomorrow. Top five of the winning class get certificates.') : t('Unlocks Monday. Top five of the winning class get certificates.')}</small>
        </span>
        <button type="button" className="ccq-hof" onClick={() => setHistoryOpen(true)}>🏆 {t('Hall of Fame')}</button>
      </div>
      <p className="ccq-how">{t('Power each day = share of your class that finished the daily mission.')}</p>

      <ConquestHistoryModal open={historyOpen} onClose={() => setHistoryOpen(false)} />
    </article>
  );
};

export default ClassConquestCard;
