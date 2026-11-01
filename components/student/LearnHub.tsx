import React, { useMemo, useState } from 'react';
import { useLanguage } from '../../src/contexts/LanguageContext';

export type LearnTileKey = 'writing' | 'ielts' | 'cambridge' | 'progress';

export interface LearnTile {
  key: LearnTileKey;
  title: string;
  tag: string;
  locked: boolean;
  /** Full explanation for screen readers and the tooltip on locked tiles. */
  lockMessage?: string;
  requestState?: 'idle' | 'sending' | 'sent';
  onOpen: () => void;
  onRequest?: () => void;
  onPreload?: () => void;
}

const LAST_KEY = 'brains-heist:learn:last-opened:v1';

const readLast = (): LearnTileKey | null => {
  try {
    const value = window.localStorage.getItem(LAST_KEY);
    return value === 'writing' || value === 'ielts' || value === 'cambridge' || value === 'progress' ? value : null;
  } catch { return null; }
};
const writeLast = (key: LearnTileKey) => {
  try { window.localStorage.setItem(LAST_KEY, key); } catch { /* per-device convenience only */ }
};

/* ── Animated scenes (pure SVG + CSS, no images) ───────────────────────────────────────── */

const WritingScene: React.FC = () => (
  <svg viewBox="0 0 160 110" className="learn-scene learn-scene--writing" aria-hidden="true">
    <rect x="22" y="14" width="96" height="84" rx="8" fill="#1e1b4b" stroke="#a78bfa" strokeOpacity="0.5" strokeWidth="2" />
    <path className="learn-writing__line learn-writing__line--1" pathLength={100} d="M34 38c10-6 18 6 28 0s18-6 28 0 12 2 16 0" />
    <path className="learn-writing__line learn-writing__line--2" pathLength={100} d="M34 56c8-5 16 5 26 0s16-5 26 0" />
    <path className="learn-writing__line learn-writing__line--3" pathLength={100} d="M34 74c9-5 15 4 24 0" />
    <g className="learn-writing__pen">
      <path d="M0 0l30-30 8 8-30 30-11 3z" fill="#fbbf24" stroke="#0f172a" strokeWidth="2" strokeLinejoin="round" />
      <path d="M30-30l8 8" stroke="#0f172a" strokeWidth="2" />
      <path d="M0 0l-3 11 11-3" fill="#f8fafc" stroke="#0f172a" strokeWidth="2" strokeLinejoin="round" />
    </g>
    <g className="learn-sparkle learn-sparkle--a"><path d="M134 22l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="#c4b5fd" /></g>
    <g className="learn-sparkle learn-sparkle--b"><path d="M140 66l2 4 4 2-4 2-2 4-2-4-4-2 4-2z" fill="#f0abfc" /></g>
  </svg>
);

const IeltsScene: React.FC = () => (
  <svg viewBox="0 0 160 110" className="learn-scene learn-scene--ielts" aria-hidden="true">
    <ellipse className="learn-ielts__ring" cx="80" cy="56" rx="58" ry="38" fill="none" stroke="#fda4af" strokeOpacity="0.35" strokeWidth="1.5" strokeDasharray="3 5" />
    <circle cx="80" cy="56" r="24" fill="#4c0519" stroke="#fb7185" strokeWidth="2" />
    <path className="learn-ielts__meridian" d="M56 56h48M80 32c-9 8-9 40 0 48M80 32c9 8 9 40 0 48" stroke="#fb7185" strokeOpacity="0.6" strokeWidth="1.5" fill="none" />
    {/* listening, reading, writing, speaking light up in turn */}
    <g transform="translate(138 56)"><g className="learn-ielts__skill learn-ielts__skill--0"><circle r="11" fill="#0f172a" stroke="#fda4af" strokeWidth="2" /><path d="M-5 2v-2a5 5 0 0 1 10 0v2" stroke="#fda4af" strokeWidth="2" fill="none" /><rect x="-6" y="1" width="3" height="5" rx="1" fill="#fda4af" /><rect x="3" y="1" width="3" height="5" rx="1" fill="#fda4af" /></g></g>
    <g transform="translate(80 94)"><g className="learn-ielts__skill learn-ielts__skill--1"><circle r="11" fill="#0f172a" stroke="#fda4af" strokeWidth="2" /><path d="M-6-4h5a1 1 0 0 1 1 1v8a1 1 0 0 0-1-1h-5zM6-4H1a1 1 0 0 0-1 1v8a1 1 0 0 1 1-1h5z" fill="#fda4af" /></g></g>
    <g transform="translate(22 56)"><g className="learn-ielts__skill learn-ielts__skill--2"><circle r="11" fill="#0f172a" stroke="#fda4af" strokeWidth="2" /><path d="M-4 5l7-9 2 2-7 9-3 1z" fill="#fda4af" /></g></g>
    <g transform="translate(80 18)"><g className="learn-ielts__skill learn-ielts__skill--3"><circle r="11" fill="#0f172a" stroke="#fda4af" strokeWidth="2" /><path d="M-6-4h12v7h-7l-3 3v-3h-2z" fill="#fda4af" /></g></g>
  </svg>
);

const CambridgeScene: React.FC = () => (
  <svg viewBox="0 0 160 110" className="learn-scene learn-scene--cambridge" aria-hidden="true">
    <g transform="rotate(-6 70 56)">
      <rect x="34" y="12" width="74" height="90" rx="7" fill="#0c1a3a" stroke="#60a5fa" strokeOpacity="0.6" strokeWidth="2" />
      {[30, 52, 74].map((y, i) => (
        <g key={y}>
          <rect x="44" y={y - 5} width="10" height="10" rx="2.5" fill="none" stroke="#93c5fd" strokeWidth="1.8" />
          <path className={`learn-cam__tick learn-cam__tick--${i}`} d={`M45.5 ${y}l3 3 6-7`} stroke="#34d399" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="60" y={y - 2} width={34 - i * 6} height="4" rx="2" fill="#93c5fd" fillOpacity="0.45" />
        </g>
      ))}
    </g>
    <g className="learn-cam__flask" transform="translate(122 58)">
      <path d="M-6-22h12M-4-22v14l-12 22a4 4 0 0 0 3.5 6h25a4 4 0 0 0 3.5-6L4-8v-14" fill="#0c1a3a" stroke="#60a5fa" strokeWidth="2" strokeLinejoin="round" />
      <path d="M-11 10h22l3 5a2 2 0 0 1-2 3h-24a2 2 0 0 1-2-3z" fill="#38bdf8" fillOpacity="0.7" />
      <circle className="learn-bubble learn-bubble--a" cx="-2" cy="6" r="2" fill="#bae6fd" />
      <circle className="learn-bubble learn-bubble--b" cx="4" cy="8" r="1.6" fill="#bae6fd" />
    </g>
  </svg>
);

const ProgressScene: React.FC = () => (
  <svg viewBox="0 0 160 110" className="learn-scene learn-scene--progress" aria-hidden="true">
    <path d="M24 94h112" stroke="#34d399" strokeOpacity="0.35" strokeWidth="2" />
    {[{ x: 36, h: 26 }, { x: 60, h: 40 }, { x: 84, h: 34 }, { x: 108, h: 58 }].map((b, i) => (
      <rect key={b.x} className={`learn-bar learn-bar--${i}`} x={b.x} y={94 - b.h} width="16" height={b.h} rx="4" fill="#10b981" fillOpacity={0.45 + i * 0.15} />
    ))}
    <path className="learn-trend" pathLength={100} d="M40 70L66 54 90 60 118 30" stroke="#a7f3d0" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    <g className="learn-trend__head" transform="translate(118 30)"><circle r="6" fill="#022c22" stroke="#a7f3d0" strokeWidth="2.5" /><circle r="2" fill="#a7f3d0" /></g>
    <g className="learn-sparkle learn-sparkle--a"><path d="M136 14l2.5 6 6 2.5-6 2.5-2.5 6-2.5-6-6-2.5 6-2.5z" fill="#fde68a" /></g>
  </svg>
);

const SCENES: Record<LearnTileKey, React.FC> = {
  writing: WritingScene,
  ielts: IeltsScene,
  cambridge: CambridgeScene,
  progress: ProgressScene,
};

const ICONS: Record<LearnTileKey, string> = { writing: '✍️', ielts: '🌍', cambridge: '🧪', progress: '📈' };

/** Hero: a book whose pages flip while letters float up. */
const HeroBook: React.FC = () => (
  <svg viewBox="0 0 120 90" className="learn-hero__book" aria-hidden="true">
    <path d="M60 22c-14-8-30-9-44-6v56c14-3 30-2 44 6z" fill="#0f2a3d" stroke="#22d3ee" strokeWidth="2" strokeLinejoin="round" />
    <path d="M60 22c14-8 30-9 44-6v56c-14-3-30-2-44 6z" fill="#0f2a3d" stroke="#22d3ee" strokeWidth="2" strokeLinejoin="round" />
    <path className="learn-hero__page" d="M60 22c10-6 22-7 34-5v54c-12-2-24-1-34 5z" fill="#164e63" stroke="#67e8f9" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M24 32h26M24 42h22M24 52h26M70 32h24M70 42h20" stroke="#67e8f9" strokeOpacity="0.4" strokeWidth="2" strokeLinecap="round" />
    <text className="learn-hero__glyph learn-hero__glyph--a" x="38" y="16">A</text>
    <text className="learn-hero__glyph learn-hero__glyph--b" x="64" y="12">+</text>
    <text className="learn-hero__glyph learn-hero__glyph--c" x="84" y="18">?</text>
  </svg>
);

const LearnHub: React.FC<{ tiles: LearnTile[] }> = ({ tiles }) => {
  const { t } = useLanguage();
  const [last] = useState<LearnTileKey | null>(() => (typeof window === 'undefined' ? null : readLast()));
  const [shaking, setShaking] = useState<LearnTileKey | null>(null);

  const continueTile = useMemo(() => tiles.find((tile) => tile.key === last && !tile.locked) ?? null, [tiles, last]);

  const open = (tile: LearnTile) => {
    if (tile.locked) {
      setShaking(tile.key);
      window.setTimeout(() => setShaking(null), 500);
      return;
    }
    writeLast(tile.key);
    tile.onOpen();
  };

  return (
    <div className="learn-hub" data-testid="learn-hub">
      <section className="learn-hero">
        <HeroBook />
        <div className="learn-hero__copy">
          <span className="learn-hero__eyebrow">{t('Training ground')}</span>
          <h2 className="learn-hero__title">{t("Pick today's mission")}</h2>
        </div>
        {continueTile && (
          <button
            type="button"
            className={`learn-continue learn-theme--${continueTile.key}`}
            onClick={() => open(continueTile)}
            onMouseEnter={continueTile.onPreload}
            onFocus={continueTile.onPreload}
            data-testid="learn-continue"
          >
            <span className="learn-continue__play" aria-hidden="true">▶</span>
            <span className="learn-continue__copy">
              <small>{t('Continue')}</small>
              <strong>{ICONS[continueTile.key]} {continueTile.title}</strong>
            </span>
          </button>
        )}
      </section>

      <div className={`learn-grid ${tiles.length === 1 ? 'is-single' : ''}`}>
        {tiles.map((tile, index) => {
          const Scene = SCENES[tile.key];
          const lockId = `learn-lock-${tile.key}`;
          return (
            <div
              key={tile.key}
              className={`learn-tile learn-theme--${tile.key} ${tile.locked ? 'is-locked' : ''} ${shaking === tile.key ? 'is-shaking' : ''}`}
              style={{ animationDelay: `${index * 70}ms` }}
            >
              <button
                type="button"
                className="learn-tile__main"
                onClick={() => open(tile)}
                onMouseEnter={tile.locked ? undefined : tile.onPreload}
                onFocus={tile.locked ? undefined : tile.onPreload}
                aria-describedby={tile.locked ? lockId : undefined}
                title={tile.locked ? tile.lockMessage : undefined}
                data-testid={`learn-tile-${tile.key}`}
              >
                <span className="learn-tile__stage"><Scene /></span>
                <span className="learn-tile__text">
                  <strong>{tile.title}</strong>
                  <small>{tile.tag}</small>
                </span>
                <span className="learn-tile__go" aria-hidden="true">{tile.locked ? '🔒' : '▶'}</span>
              </button>
              {tile.locked && (
                <>
                  <span id={lockId} className="sr-only">{tile.lockMessage}</span>
                  <button
                    type="button"
                    className="learn-tile__ask"
                    onClick={tile.onRequest}
                    disabled={!tile.onRequest || tile.requestState === 'sending' || tile.requestState === 'sent'}
                  >
                    {tile.requestState === 'sent' ? `✓ ${t('Asked')}` : tile.requestState === 'sending' ? '…' : `🔔 ${t('Ask your school')}`}
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default LearnHub;
