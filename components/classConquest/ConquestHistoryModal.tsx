import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLanguage } from '../../src/contexts/LanguageContext';
import { fetchClassConquestHistory, type ClassConquestHistory } from '../../services/classConquestService';
import { allTimeMasterminds, CONQUEST_COLORS, mapById, roleForRank, winStreak, type ConquestResult } from '../../src/lib/classConquest';
import { buildCertificateDocument, conquestBadgeSvg, openCertificatePrintWindow, weekLabel } from '../../src/lib/conquestCertificates';

interface ConquestHistoryModalProps {
  open: boolean;
  onClose: () => void;
  /** Teachers pick a grade; students always see their own. */
  grade?: string | null;
  /** Shown in the certificate footer. */
  issuer?: string;
}

/** Stable colours per class label across all weeks (alphabetical, like the live map). */
function labelColors(results: ConquestResult[]): Record<string, string> {
  const labels = [...new Set(results.flatMap((r) => r.standings.map((s) => s.label)))].sort((a, b) => a.localeCompare(b));
  return Object.fromEntries(labels.map((label, i) => [label, CONQUEST_COLORS[i % CONQUEST_COLORS.length]]));
}

const ConquestHistoryModal: React.FC<ConquestHistoryModalProps> = ({ open, onClose, grade = null, issuer }) => {
  const { t } = useLanguage();
  const [history, setHistory] = useState<ClassConquestHistory | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'weeks' | 'masterminds'>('weeks');
  const [filter, setFilter] = useState<string>('all');
  const [printBlocked, setPrintBlocked] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    void fetchClassConquestHistory(grade).then((result) => { if (!cancelled) { setHistory(result); setLoading(false); } });
    return () => { cancelled = true; };
  }, [open, grade]);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = previousOverflow; };
  }, [open, onClose]);

  const results = history?.results ?? [];
  const colors = useMemo(() => labelColors(results), [results]);
  const streak = useMemo(() => winStreak(results), [results]);
  const masterminds = useMemo(() => allTimeMasterminds(results), [results]);
  const classLabels = useMemo(() => Object.keys(colors), [colors]);
  const shown = filter === 'all' ? results : results.filter((r) => r.winner_label === filter);
  const isTeacher = history?.viewer === 'teacher';

  if (!open) return null;

  const print = (result: ConquestResult) => {
    const ok = openCertificatePrintWindow(buildCertificateDocument({ result, issuer }));
    setPrintBlocked(!ok);
  };

  return (
    <div className="ccq-modal-layer" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="ccq-modal" role="dialog" aria-modal="true" aria-labelledby="ccq-hof-title">
        <header className="ccq-modal-head">
          <div>
            <p className="ccq-eyebrow ccq-eyebrow--light">{t('Class Conquest')}</p>
            <h2 id="ccq-hof-title" className="font-heading">{history ? t('Hall of Fame · Grade {grade}', { grade: history.grade }) : t('Hall of Fame')}</h2>
          </div>
          <button ref={closeRef} type="button" className="ccq-modal-close" onClick={onClose} aria-label={t('Close')}>×</button>
        </header>

        {loading ? <p className="ccq-modal-empty">{t('Opening the archive…')}</p> : null}
        {!loading && results.length === 0 ? (
          <p className="ccq-modal-empty">{t('No finished weeks yet. The first winners are crowned on Monday.')}</p>
        ) : null}

        {!loading && history && results.length > 0 ? (
          <>
            {history.badges.length > 0 ? (
              <section className="ccq-badges" aria-label={t('Your badges')}>
                <h3>{t('Your badges')}</h3>
                <ul>
                  {history.badges.map((b) => (
                    <li key={`${b.week_start}-${b.kind}`} title={`${mapById(b.map_id).name} · ${weekLabel(b.week_start)}`}>
                      <span dangerouslySetInnerHTML={{ __html: conquestBadgeSvg({ kind: b.kind, mapId: b.map_id, rank: b.rank, caption: b.kind === 'gold' && b.rank ? roleForRank(b.rank).toUpperCase() : (b.class_label ?? '').toUpperCase(), size: 64 }) }} />
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {streak && streak.weeks >= 2 ? (
              <p className="ccq-streak" role="status">🔥 {t('{class} has won {count} weeks in a row', { class: streak.label, count: streak.weeks })}</p>
            ) : null}

            <div className="ccq-tabs" role="tablist">
              <button type="button" role="tab" aria-selected={tab === 'weeks'} className={tab === 'weeks' ? 'is-active' : ''} onClick={() => setTab('weeks')}>{t('Weeks')}</button>
              <button type="button" role="tab" aria-selected={tab === 'masterminds'} className={tab === 'masterminds' ? 'is-active' : ''} onClick={() => setTab('masterminds')}>{t('All-time Masterminds')}</button>
            </div>

            {tab === 'weeks' ? (
              <>
                {classLabels.length > 1 ? (
                  <div className="ccq-filters" role="group" aria-label={t('Filter by class')}>
                    <button type="button" className={filter === 'all' ? 'is-active' : ''} onClick={() => setFilter('all')}>{t('All classes')}</button>
                    {classLabels.map((label) => (
                      <button key={label} type="button" className={filter === label ? 'is-active' : ''} onClick={() => setFilter(label)}>
                        <span className="ccq-swatch" style={{ background: colors[label] }} aria-hidden="true" />{label}
                        <small>{results.filter((r) => r.winner_label === label).length}</small>
                      </button>
                    ))}
                  </div>
                ) : null}

                {printBlocked ? <p className="ccq-modal-warn" role="alert">{t('Your browser blocked the certificate window. Allow pop-ups for Brains Heist and try again.')}</p> : null}

                <ol className="ccq-weeks">
                  {shown.map((r) => {
                    const map = mapById(r.map_id);
                    const maxPower = Math.max(1, ...r.standings.map((s) => s.power));
                    return (
                      <li key={r.week_start} className="ccq-week">
                        <div className="ccq-week-map" aria-hidden="true">{map.flag}</div>
                        <div className="ccq-week-body">
                          <p className="ccq-week-meta">{map.name} · {weekLabel(r.week_start)}</p>
                          {r.winner_label ? (
                            <h3 className="ccq-week-title"><span className="ccq-swatch" style={{ background: colors[r.winner_label] }} aria-hidden="true" />{t('{class} conquered {map}', { class: r.winner_label, map: map.name })}</h3>
                          ) : (
                            <h3 className="ccq-week-title">{t('No winner — nobody finished a mission')}</h3>
                          )}
                          {r.top_students.length > 0 ? (
                            <ol className="ccq-podium">
                              {r.top_students.map((s) => (
                                <li key={s.student_id} className={`ccq-podium-${s.rank}`}>
                                  <b>#{s.rank}</b> {s.name}
                                  <small>{roleForRank(s.rank)}</small>
                                </li>
                              ))}
                            </ol>
                          ) : null}
                          <details className="ccq-week-standings">
                            <summary>{t('Standings')}</summary>
                            <ul>
                              {r.standings.map((s) => (
                                <li key={s.class_id}>
                                  <span className="ccq-standing-label"><span className="ccq-swatch" style={{ background: colors[s.label] }} aria-hidden="true" />#{s.rank} {s.label}</span>
                                  <span className="ccq-bar" aria-hidden="true"><span style={{ width: `${Math.round((100 * s.power) / maxPower)}%`, background: colors[s.label] }} /></span>
                                  <span className="ccq-standing-power">{t('{power} power', { power: s.power })}</span>
                                </li>
                              ))}
                            </ul>
                          </details>
                          {isTeacher && r.top_students.length > 0 ? (
                            <button type="button" className="ccq-print" onClick={() => print(r)}>🖨 {t('Print certificates')}</button>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </>
            ) : (
              <ol className="ccq-masterminds">
                {masterminds.length === 0 ? <li className="ccq-modal-empty">{t('No podium finishes yet.')}</li> : null}
                {masterminds.slice(0, 25).map((m, index) => (
                  <li key={m.student_id}>
                    <span className="ccq-rank">#{index + 1}</span>
                    <span className="ccq-name">{m.name}</span>
                    <span className="ccq-stat">{t('{count} podiums', { count: m.podiums })}</span>
                    <span className="ccq-stat ccq-power">{t('{count}× Mastermind', { count: m.firsts })}</span>
                  </li>
                ))}
              </ol>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
};

export default ConquestHistoryModal;
