import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLanguage } from '../../src/contexts/LanguageContext';
import {
  fetchClassConquestWeekend, postConquestCheer, predictConquestWinner,
  type ClassConquestData, type ClassConquestWeekend,
} from '../../services/classConquestService';
import { CHEER_CODES, CHEER_TEXT, CONQUEST_COLORS, countdownLabel, type CheerCode, type ConquestMap } from '../../src/lib/classConquest';

interface ConquestWeekendCardProps {
  data: ClassConquestData;
  map: ConquestMap;
  nextMap: ConquestMap;
  onOpenIntel: () => void;
  onOpenHallOfFame: () => void;
}

const ConquestWeekendCard: React.FC<ConquestWeekendCardProps> = ({ data, map, nextMap, onOpenIntel, onOpenHallOfFame }) => {
  const { t } = useLanguage();
  const [weekend, setWeekend] = useState<ClassConquestWeekend | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [cheerClass, setCheerClass] = useState<string | null>(null);
  const [cheerCode, setCheerCode] = useState<CheerCode>('all_the_way');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await fetchClassConquestWeekend();
    setWeekend(result);
    if (result && !cheerClass) setCheerClass(result.my_class ?? result.classes[0]?.class_id ?? null);
  }, [cheerClass]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const refresh = setInterval(() => { void load(); }, 60_000);
    return () => { clearInterval(tick); clearInterval(refresh); };
  }, [load]);

  const classes = weekend?.classes ?? [];
  const colors = useMemo(() => Object.fromEntries([...classes].sort((a, b) => a.label.localeCompare(b.label)).map((c, i) => [c.class_id, CONQUEST_COLORS[i % CONQUEST_COLORS.length]])), [classes]);
  const label = (id: string | null) => classes.find((c) => c.class_id === id)?.label ?? '';
  const revealMs = new Date(data.reveal_at).getTime() - now;

  const totalPredictions = (weekend?.predictions ?? []).reduce((s, p) => s + p.count, 0);
  const predictionFor = (id: string) => weekend?.predictions.find((p) => p.class_id === id)?.count ?? 0;
  const cheersFor = (id: string) => weekend?.cheer_counts.find((p) => p.class_id === id)?.count ?? 0;
  const loudest = classes.reduce<{ id: string | null; n: number }>((best, c) => (cheersFor(c.class_id) > best.n ? { id: c.class_id, n: cheersFor(c.class_id) } : best), { id: null, n: 0 });
  const cooldownMs = weekend?.next_cheer_at ? new Date(weekend.next_cheer_at).getTime() - now : 0;

  const predict = async (classId: string) => {
    if (busy || weekend?.my_prediction) return;
    setBusy(true);
    const result = await predictConquestWinner(classId);
    setBusy(false);
    if (result.ok) { setNote(t('Prediction locked. If you are right, the Oracle badge is yours on Monday.')); await load(); }
    else setNote(t('Could not save your prediction. Try again in a moment.'));
  };

  const cheer = async () => {
    if (busy || !cheerClass) return;
    setBusy(true);
    const result = await postConquestCheer(cheerClass, cheerCode);
    setBusy(false);
    if (result.ok) { setNote(null); await load(); }
    else if (result.reason === 'cooldown') setNote(t('One chant every 30 minutes — the wall needs room for everyone.'));
    else if (result.reason === 'weekend_limit') setNote(t('You have used all 20 chants this weekend. Legendary.'));
    else setNote(t('Could not post that chant. Try again in a moment.'));
  };

  return (
    <article className="student-feed-card ccq ccq--weekend" aria-labelledby="ccq-weekend-title">
      <div className="ccq-head">
        <span className="ccq-pill">{t('Class Conquest · Grade {grade}', { grade: data.grade })}</span>
        <span className="ccq-meta ccq-meta--sealed">🔒 {t('Vault sealed')}</span>
      </div>

      <div className="ccq-vault" role="status">
        <div className="ccq-vault-dial" aria-hidden="true">{map.flag}</div>
        <div>
          <h2 id="ccq-weekend-title" className="ccq-title font-heading">{t('Operation {map} is over. The result is locked in the vault.', { map: map.name })}</h2>
          <p className="ccq-vault-count"><span>{t('Winners revealed Monday 07:00')}</span><b>{countdownLabel(revealMs)}</b></p>
        </div>
      </div>

      {classes.length > 0 ? (
        <section className="ccq-block" aria-labelledby="ccq-predict-title">
          <h3 id="ccq-predict-title">🔮 {t('Who conquered {map}?', { map: map.name })}</h3>
          {weekend?.my_prediction ? (
            <>
              <p className="ccq-block-sub">{t('You picked {class}. {count} students have voted.', { class: label(weekend.my_prediction), count: totalPredictions })}</p>
              <ul className="ccq-tally">
                {classes.map((c) => {
                  const n = predictionFor(c.class_id);
                  const pct = totalPredictions ? Math.round((100 * n) / totalPredictions) : 0;
                  return (
                    <li key={c.class_id} className={c.class_id === weekend.my_prediction ? 'is-mine' : ''}>
                      <span className="ccq-standing-label"><span className="ccq-swatch" style={{ background: colors[c.class_id] }} aria-hidden="true" />{c.label}</span>
                      <span className="ccq-bar" aria-hidden="true"><span style={{ width: `${pct}%`, background: colors[c.class_id] }} /></span>
                      <span className="ccq-standing-power">{pct}%</span>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <>
              <p className="ccq-block-sub">{t('One pick, no take-backs. Guess right and you earn the Oracle badge.')}</p>
              <div className="ccq-choices">
                {classes.map((c) => (
                  <button key={c.class_id} type="button" disabled={busy} onClick={() => void predict(c.class_id)} style={{ borderColor: colors[c.class_id] }}>
                    <span className="ccq-swatch" style={{ background: colors[c.class_id] }} aria-hidden="true" />{c.label}{c.is_mine ? ` · ${t('us')}` : ''}
                  </button>
                ))}
              </div>
            </>
          )}
        </section>
      ) : null}

      {classes.length > 0 ? (
        <section className="ccq-block" aria-labelledby="ccq-hype-title">
          <h3 id="ccq-hype-title">📣 {t('Hype Wall')}</h3>
          {loudest.id ? <p className="ccq-block-sub">{t('Loudest class so far: {class} ({count} chants)', { class: label(loudest.id), count: loudest.n })}</p> : <p className="ccq-block-sub">{t('Pick a class, pick a chant, make some noise.')}</p>}
          <div className="ccq-choices ccq-choices--small" role="group" aria-label={t('Chant for')}>
            {classes.map((c) => (
              <button key={c.class_id} type="button" className={cheerClass === c.class_id ? 'is-active' : ''} onClick={() => setCheerClass(c.class_id)} aria-pressed={cheerClass === c.class_id}>
                <span className="ccq-swatch" style={{ background: colors[c.class_id] }} aria-hidden="true" />{c.label}
              </button>
            ))}
          </div>
          <div className="ccq-chants" role="group" aria-label={t('Chant')}>
            {CHEER_CODES.map((code) => (
              <button key={code} type="button" className={cheerCode === code ? 'is-active' : ''} onClick={() => setCheerCode(code)} aria-pressed={cheerCode === code}>
                {t(CHEER_TEXT[code], { class: label(cheerClass) || '…' })}
              </button>
            ))}
          </div>
          <button type="button" className="ccq-present ccq-send" disabled={busy || !cheerClass || cooldownMs > 0} onClick={() => void cheer()}>
            {cooldownMs > 0 ? t('Next chant in {time}', { time: countdownLabel(cooldownMs) }) : t('Post to the wall')}
          </button>
          {weekend && weekend.cheers.length > 0 ? (
            <ul className="ccq-wall" aria-live="polite">
              {weekend.cheers.slice(0, 12).map((c, i) => (
                <li key={`${c.at}-${i}`} className={c.is_me ? 'is-me' : ''} style={{ borderColor: colors[c.class_id] }}>
                  <b>{c.name}</b>{c.from_class_id ? <small> · {label(c.from_class_id)}</small> : null}
                  <span>{t(CHEER_TEXT[c.cheer_code] ?? CHEER_TEXT.gg, { class: label(c.class_id) })}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {weekend?.raids ? (
        <section className="ccq-block" aria-labelledby="ccq-raids-title">
          <h3 id="ccq-raids-title">⚔️ {t('Border Raids')}</h3>
          <p className="ccq-block-sub">{t('Hack a player from a rival class in PvP. Every win counts for your class until Sunday midnight; the champions are named on Monday.')}</p>
          <ul className="ccq-tally">
            {weekend.raids.classes.map((c) => {
              const max = Math.max(1, ...weekend.raids!.classes.map((x) => x.wins));
              return (
                <li key={c.class_id}>
                  <span className="ccq-standing-label"><span className="ccq-swatch" style={{ background: colors[c.class_id] }} aria-hidden="true" />{c.label}</span>
                  <span className="ccq-bar" aria-hidden="true"><span style={{ width: `${Math.round((100 * c.wins) / max)}%`, background: colors[c.class_id] }} /></span>
                  <span className="ccq-standing-power">{t('{count} wins', { count: c.wins })}</span>
                </li>
              );
            })}
          </ul>
          {weekend.raids.top.length > 0 ? (
            <p className="ccq-how">{t('Top raiders: {list}', { list: weekend.raids.top.map((r) => `${r.name} (${r.class_label}) ${r.wins}`).join(' · ') })}</p>
          ) : null}
        </section>
      ) : null}

      {note ? <p className="ccq-note" role="status">{note}</p> : null}

      <div className="ccq-next">
        <span className="ccq-next-flag" aria-hidden="true">{nextMap.flag}</span>
        <span>
          <b>{t('Next: Operation {map}', { map: nextMap.name })}</b>
          <small>{t('{count} {unit}. Missions count from Monday. Study the map before your rivals do.', { count: nextMap.territories.length, unit: t(nextMap.unit) })}</small>
        </span>
        <button type="button" className="ccq-hof" onClick={onOpenIntel}>🗺️ {t('Map briefing')}</button>
      </div>
      <div className="ccq-actions">
        <button type="button" className="ccq-hof" onClick={onOpenHallOfFame}>🏆 {t('Hall of Fame')}</button>
      </div>
    </article>
  );
};

export default ConquestWeekendCard;
