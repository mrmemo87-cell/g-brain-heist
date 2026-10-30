import { createPortal } from 'react-dom';
import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useLanguage } from '../../src/contexts/LanguageContext';
import type { ConquestMap } from '../../src/lib/classConquest';
import { CONQUEST_RULES, territoryIntel } from '../../src/lib/conquestIntel';

const ClanTerritoryMap = React.lazy(() =>
  import('../../src/features/clanTerritory/components/ClanTerritoryMap').then((m) => ({ default: m.ClanTerritoryMap })),
);

interface ConquestIntelModalProps {
  open: boolean;
  onClose: () => void;
  map: ConquestMap;
  /** "Next week" or "This week" — shown in the eyebrow. */
  when: 'next' | 'current';
}

/** Value tiers painted on the map so students see at a glance where the points are. */
const TIERS = [
  { id: 'tier-1', color: '#f5c042' },
  { id: 'tier-2', color: '#c084fc' },
  { id: 'tier-3', color: '#60a5fa' },
];

const ConquestIntelModal: React.FC<ConquestIntelModalProps> = ({ open, onClose, map, when }) => {
  const { t } = useLanguage();
  const [selected, setSelected] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    setSelected(map.territories[0]?.zoneId ?? null);
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = previousOverflow; };
  }, [open, onClose, map]);

  const tierOf = useMemo(() => {
    const n = map.territories.length;
    return Object.fromEntries(map.territories.map((ter, i) => [ter.zoneId, i < Math.ceil(n / 3) ? 0 : i < Math.ceil((2 * n) / 3) ? 1 : 2]));
  }, [map]);
  // The selected territory is painted white so it stands out on every tier (the map's own
  // selection ring is yellow, invisible on gold). Small territories like Greater London need it.
  const zones = useMemo(() => Object.fromEntries(map.territories.map((ter) => [
    ter.zoneId, { id: ter.zoneId, influence: { [ter.zoneId === selected ? 'selected' : TIERS[tierOf[ter.zoneId]].id]: 1 } },
  ])), [map, tierOf, selected]);
  const clans = useMemo(() => ({
    ...Object.fromEntries(TIERS.map((tier) => [tier.id, { id: tier.id, name: tier.id, color: tier.color }])),
    selected: { id: 'selected', name: 'selected', color: '#f8fafc' },
  }), []);

  if (!open) return null;
  const current = map.territories.find((ter) => ter.zoneId === selected) ?? map.territories[0];
  const total = map.territories.reduce((sum, ter) => sum + ter.value, 0);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="ccq-modal-layer" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="ccq-modal ccq-modal--wide" role="dialog" aria-modal="true" aria-labelledby="ccq-intel-title">
        <header className="ccq-modal-head">
          <div>
            <p className="ccq-eyebrow ccq-eyebrow--light">{when === 'next' ? t('Next map briefing') : t('This week’s map')}</p>
            <h2 id="ccq-intel-title" className="font-heading">{map.flag} {t('Operation {map}', { map: map.name })}</h2>
            <p className="ccq-intel-sub">{t('{count} {unit} · {total} points on the table', { count: map.territories.length, unit: t(map.unit), total })}</p>
          </div>
          <button ref={closeRef} type="button" className="ccq-modal-close" onClick={onClose} aria-label={t('Close')}>×</button>
        </header>

        <div className="ccq-intel-grid">
          <div className="conquest-map ccq-intel-map" role="group" aria-label={t('Map of {map}. Tap a territory for intel.', { map: map.name })}>
            <Suspense fallback={<div className="conquest-map-loading" aria-hidden="true" />}>
              <ClanTerritoryMap key={map.mapId} mapId={map.mapId} zones={zones} clans={clans} hideHeader hideLegend selectedZoneId={selected} onZoneSelect={(zoneId) => { if (zoneId in tierOf) setSelected(zoneId); }} />
            </Suspense>
            <ul className="ccq-intel-legend" aria-hidden="true">
              <li><span style={{ background: TIERS[0].color }} />{t('Most valuable')}</li>
              <li><span style={{ background: TIERS[1].color }} />{t('Mid')}</li>
              <li><span style={{ background: TIERS[2].color }} />{t('Entry')}</li>
            </ul>
          </div>

          <div className="ccq-intel-side">
            {current ? (
              <div className="ccq-intel-card" aria-live="polite">
                <p className="ccq-week-meta">{t('Territory intel')}</p>
                <h3>{current.name}</h3>
                <p className="ccq-intel-value">{t('{value} points', { value: current.value })} · {t('#{rank} of {count}', { rank: map.territories.indexOf(current) + 1, count: map.territories.length })}</p>
                <p className="ccq-intel-fact">{territoryIntel(map.mapId, current.zoneId) ?? t('Classified. Conquer it to find out.')}</p>
              </div>
            ) : null}
            <ol className="ccq-intel-list">
              {map.territories.map((ter, i) => (
                <li key={ter.zoneId}>
                  <button type="button" className={ter.zoneId === current?.zoneId ? 'is-active' : ''} onClick={() => setSelected(ter.zoneId)} aria-pressed={ter.zoneId === current?.zoneId}>
                    <span className="ccq-swatch" style={{ background: TIERS[tierOf[ter.zoneId]].color }} aria-hidden="true" />
                    <span className="ccq-intel-name">{i + 1}. {ter.name}</span>
                    <span className="ccq-intel-points">{ter.value}</span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <section className="ccq-rules" aria-labelledby="ccq-rules-title">
          <h3 id="ccq-rules-title">{t('How the week works')}</h3>
          <ol>
            {CONQUEST_RULES.map((rule) => <li key={rule}>{t(rule)}</li>)}
          </ol>
        </section>
      </div>
    </div>,
    document.body,
  );
};

export default ConquestIntelModal;
