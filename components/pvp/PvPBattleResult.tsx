import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Profile, RaidAttackResult, RaidTarget } from '../../types';
import AvatarWithFrame from '../AvatarWithFrame';
import { isFlickerThemeActive } from '../../src/lib/cosmetics';
import { audioService } from '../../services/audioService';
import { GemIcon } from '../icons';
import { announcePushMoment } from '../../src/lib/pushMoment';

type Outcome = 'win' | 'lose' | 'blocked';

interface PvPBattleResultProps {
  result: RaidAttackResult;
  attacker: Profile;
  defender: RaidTarget;
  onNextTarget: () => void;
}

const OUTCOME_COPY: Record<Outcome, { stamp: string; line: (name: string) => string; tone: string }> = {
  win: { stamp: 'VICTORY', line: name => `You cracked ${name}'s vault!`, tone: 'win' },
  lose: { stamp: 'DEFEATED', line: name => `${name} held the line.`, tone: 'lose' },
  blocked: { stamp: 'BLOCKED', line: name => `${name}'s shield absorbed the hit.`, tone: 'blocked' },
};

const HAPTICS: Record<Outcome, number[]> = {
  win: [30, 40, 70],
  lose: [140],
  blocked: [40, 30, 40],
};

const normalizeOutcome = (raw: string): Outcome => {
  if (raw === 'win' || raw === 'pvp_win') return 'win';
  if (raw === 'blocked' || raw === 'pvp_blocked') return 'blocked';
  return 'lose';
};

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Counts from 0 to `target` after `delayMs`, easing out. Jumps straight to the value with reduced motion. */
const useCountUp = (target: number, delayMs: number, durationMs = 700) => {
  const [value, setValue] = useState(prefersReducedMotion() ? target : 0);
  useEffect(() => {
    if (prefersReducedMotion() || target === 0) {
      setValue(target);
      return;
    }
    let frame = 0;
    let start = 0;
    const timer = window.setTimeout(() => {
      const step = (now: number) => {
        if (!start) start = now;
        const t = Math.min(1, (now - start) / durationMs);
        const eased = 1 - Math.pow(1 - t, 3);
        setValue(Math.round(target * eased));
        if (t < 1) frame = window.requestAnimationFrame(step);
      };
      frame = window.requestAnimationFrame(step);
    }, delayMs);
    return () => {
      window.clearTimeout(timer);
      window.cancelAnimationFrame(frame);
    };
  }, [target, delayMs, durationMs]);
  return value;
};

const signed = (n: number) => (n > 0 ? `+${n.toLocaleString()}` : n.toLocaleString());

const RewardChip: React.FC<{
  label: string;
  amount: number;
  delayMs: number;
  kind: 'xp' | 'coins' | 'gems';
  icon: React.ReactNode;
}> = ({ label, amount, delayMs, kind, icon }) => {
  const shown = useCountUp(amount, delayMs);
  const mood = amount > 0 ? 'gain' : amount < 0 ? 'loss' : 'zero';
  return (
    <div
      className={`pvp-reward-chip pvp-reward-${kind} pvp-reward-${mood}`}
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <span className="pvp-reward-icon" aria-hidden="true">{icon}</span>
      <span className="pvp-reward-amount">{signed(shown)}</span>
      <span className="pvp-reward-label">{label}</span>
    </div>
  );
};

/** Gold coins that burst out of the defender's vault on a win. Purely decorative. */
const CoinBurst: React.FC<{ count: number }> = ({ count }) => {
  const coins = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.6;
        const distance = 90 + Math.random() * 90;
        return {
          dx: Math.round(Math.cos(angle) * distance),
          dy: Math.round(Math.sin(angle) * distance * 0.7 - 60),
          delay: Math.round(Math.random() * 180),
          rot: Math.round((Math.random() - 0.5) * 720),
          size: 14 + Math.round(Math.random() * 10),
        };
      }),
    [count],
  );
  return (
    <div className="pvp-coin-burst" aria-hidden="true">
      {coins.map((c, i) => (
        <span
          key={i}
          className="pvp-coin"
          style={{
            '--dx': `${c.dx}px`,
            '--dy': `${c.dy}px`,
            '--rot': `${c.rot}deg`,
            width: c.size,
            height: c.size,
            animationDelay: `${450 + c.delay}ms`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
};

/** Shows the luck behind the battle: the winning zone and where the dice landed. */
const OddsMeter: React.FC<{ winChance: number; roll: number; outcome: Outcome }> = ({ winChance, roll, outcome }) => {
  const chance = Math.max(0, Math.min(100, winChance));
  const landed = Math.max(0, Math.min(100, roll));
  const hit = landed < chance;
  const caption =
    outcome === 'blocked'
      ? 'Your hit landed, but the shield kept the loot.'
      : hit
        ? `Rolled ${Math.round(landed)} — inside your ${Math.round(chance)}% zone. HIT!`
        : `Rolled ${Math.round(landed)} — outside your ${Math.round(chance)}% zone. MISS.`;

  return (
    <div className="pvp-odds">
      <div className="pvp-odds-head">
        <span>Your odds</span>
        <span className="pvp-odds-pct">{Math.round(chance)}%</span>
      </div>
      <div className="pvp-odds-track" role="img" aria-label={caption}>
        <div className="pvp-odds-zone" style={{ width: `${chance}%` }} />
        <div className={`pvp-odds-marker ${hit ? 'is-hit' : 'is-miss'}`} style={{ left: `${landed}%` }}>
          <span className="pvp-odds-die">🎲</span>
        </div>
      </div>
      <p className="pvp-odds-caption">{caption}</p>
    </div>
  );
};

const PvPBattleResult: React.FC<PvPBattleResultProps> = ({ result, attacker, defender, onNextTarget }) => {
  const outcome = normalizeOutcome(result.result);
  const copy = OUTCOME_COPY[outcome];
  const xp = Number(result.attacker_deltas?.xp ?? 0);
  const coins = Number(result.attacker_deltas?.coins ?? 0);
  const gems = Number(result.attacker_deltas?.gemstones ?? 0);
  const stats = result.combat_stats;
  const playedCollect = useRef(false);

  useEffect(() => {
    announcePushMoment('battle');
  }, []);

  useEffect(() => {
    try {
      navigator.vibrate?.(HAPTICS[outcome]);
    } catch {
      /* vibration is optional */
    }
    if (outcome === 'win' && coins > 0 && !playedCollect.current) {
      playedCollect.current = true;
      const t = window.setTimeout(() => audioService.play('collect'), 900);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [outcome, coins]);

  const attackerWon = outcome === 'win';
  const defenderWon = outcome === 'lose';

  return (
    <div className={`pvp-result pvp-result-${copy.tone}`}>
      <div className="pvp-result-glow" aria-hidden="true" />

      <div className="pvp-result-stage">
        <div className={`pvp-fighter ${defenderWon ? 'is-beaten' : ''}`}>
          {attackerWon && <span className="pvp-crown" aria-hidden="true">👑</span>}
          <div className="pvp-avatar">
          <AvatarWithFrame
            src={attacker.avatar_url}
            alt={attacker.username}
            size="lg"
            hasNeonFrame={attacker.active_cosmetic_frame === 'neon'}
            hasFlickerTheme={isFlickerThemeActive(attacker.active_cosmetic_theme)}
            hasGlitchEffect={attacker.active_cosmetic_effect === 'glitch'}
            fallbackFrameClassName="border-2 border-cyan-400"
          />
          </div>
          <span className="pvp-fighter-name">{attacker.username}</span>
        </div>

        <div className="pvp-versus" aria-hidden="true">VS</div>

        <div className={`pvp-fighter ${attackerWon ? 'is-beaten' : ''}`}>
          {defenderWon && <span className="pvp-crown" aria-hidden="true">👑</span>}
          <div className="pvp-avatar">
          {outcome === 'blocked' && <span className="pvp-shield-bubble" aria-hidden="true" />}
          <AvatarWithFrame
            src={defender.avatar_url}
            alt={defender.username}
            size="lg"
            hasNeonFrame={defender.active_cosmetic_frame === 'neon'}
            hasFlickerTheme={isFlickerThemeActive(defender.active_cosmetic_theme)}
            hasGlitchEffect={defender.active_cosmetic_effect === 'glitch'}
            fallbackFrameClassName="border-2 border-pink-400"
          />
          {attackerWon && <span className="pvp-crack" aria-hidden="true" />}
          </div>
          <span className="pvp-fighter-name">{defender.username}</span>
        </div>

        {attackerWon && coins > 0 && <CoinBurst count={16} />}
      </div>

      <div role="status" aria-live="polite" className="pvp-stamp-wrap">
        <h2 className="pvp-stamp">{copy.stamp}</h2>
        <p className="pvp-stamp-line">{copy.line(defender.username)}</p>
        {result.shield_state === 'removed' && (
          <p className="pvp-shield-note">💥 Your Cracker shattered their shield!</p>
        )}
      </div>

      <div className="pvp-rewards">
        <RewardChip kind="xp" label="XP" amount={xp} delayMs={650} icon="⚡" />
        <RewardChip kind="coins" label="Coins" amount={coins} delayMs={800} icon={<span className="pvp-coin pvp-coin-static" />} />
        {gems !== 0 && (
          <RewardChip kind="gems" label="Gems" amount={gems} delayMs={950} icon={<GemIcon className="w-5 h-5" />} />
        )}
      </div>

      {stats && typeof stats.win_chance === 'number' && typeof stats.roll === 'number' && (
        <OddsMeter winChance={stats.win_chance} roll={stats.roll} outcome={outcome} />
      )}

      <button type="button" onClick={onNextTarget} className="pvp-next-btn">
        ⚔️ Next target
      </button>
    </div>
  );
};

export default PvPBattleResult;
