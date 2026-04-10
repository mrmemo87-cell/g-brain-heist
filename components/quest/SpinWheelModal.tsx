import React, { useRef, useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import gsap from 'gsap';
import { WHEEL_IMAGES } from './nodeAssets';
import { playSound } from '../../services/soundManager';

/* ─── Prize types ─── */
export interface SpinPrize {
  label: string;
  emoji: string;
  color: string;         // Tailwind-ish hex for the segment
  rarity: 'common' | 'rare' | 'legendary';
  reward: {
    xp?: number;
    coins?: number;
    gemstones?: number;
    item_id?: string;      // shop item id, e.g. 'item_shield'
    item_name?: string;    // display name
  };
}

/* ─── Default prize pool ─── */
const PRIZE_POOL: SpinPrize[] = [
  { label: '+30 Coins',     emoji: '🪙', color: '#f59e0b', rarity: 'common',    reward: { coins: 30 } },
  { label: '+50 XP',        emoji: '⚡', color: '#3b82f6', rarity: 'common',    reward: { xp: 50 } },
  { label: 'Shield',        emoji: '🛡️', color: '#6366f1', rarity: 'common',    reward: { item_id: 'item_shield', item_name: 'Shield' } },
  { label: '+100 Coins',    emoji: '💰', color: '#eab308', rarity: 'rare',      reward: { coins: 100 } },
  { label: 'Booster',       emoji: '🚀', color: '#8b5cf6', rarity: 'rare',      reward: { item_id: 'item_booster', item_name: '1.5x XP Booster' } },
  { label: '+15 XP',        emoji: '✨', color: '#06b6d4', rarity: 'common',    reward: { xp: 15 } },
  { label: 'Exploit Kit',   emoji: '🔧', color: '#ec4899', rarity: 'rare',      reward: { item_id: 'item_exploit_kit', item_name: 'Exploit Kit' } },
  { label: '💎 Gemstone!',  emoji: '💎', color: '#a855f7', rarity: 'legendary', reward: { gemstones: 1 } },
];

/* ─── Weighted random selection ─── */
const RARITY_WEIGHTS: Record<string, number> = { common: 50, rare: 25, legendary: 3 };

function pickWeightedPrize(pool: SpinPrize[]): { prize: SpinPrize; index: number } {
  const weights = pool.map(p => RARITY_WEIGHTS[p.rarity] ?? 10);
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return { prize: pool[i], index: i };
  }
  return { prize: pool[0], index: 0 };
}

/* ─── Component ─── */
interface SpinWheelModalProps {
  /** Called with the prize when player finishes the spin and taps "Claim" */
  onClaim: (prize: SpinPrize) => void;
  /** If true, the Claim button shows a loading state */
  isClaiming?: boolean;
  /** Optional server-authored reward payload for the active surprise node */
  rewardPayload?: {
    xp?: number;
    coins?: number;
    gemstones?: number;
    item_id?: string;
    shop_item_id?: string;
    item_name?: string;
  };
}

const SEGMENTS = PRIZE_POOL.length;
const SEG_ANGLE = 360 / SEGMENTS;

const SpinWheelModal: React.FC<SpinWheelModalProps> = ({ onClaim, isClaiming, rewardPayload }) => {
  const wheelRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<SpinPrize | null>(null);
  const [currentRotation, setCurrentRotation] = useState(0);

  const resolvePrizeFromPayload = useCallback((payload?: SpinWheelModalProps['rewardPayload']) => {
    if (!payload) return null;
    const itemId = payload.item_id ?? payload.shop_item_id;
    if (itemId) {
      return PRIZE_POOL.find((prize) => prize.reward.item_id === itemId) ?? null;
    }
    if (typeof payload.gemstones === 'number' && payload.gemstones > 0) {
      return PRIZE_POOL.find((prize) => prize.reward.gemstones === payload.gemstones) ?? null;
    }
    if (typeof payload.coins === 'number' && payload.coins > 0) {
      return PRIZE_POOL.find((prize) => prize.reward.coins === payload.coins) ?? null;
    }
    if (typeof payload.xp === 'number' && payload.xp > 0) {
      return PRIZE_POOL.find((prize) => prize.reward.xp === payload.xp) ?? null;
    }
    return null;
  }, []);

  // Entrance animation
  useEffect(() => {
    if (modalRef.current) {
      gsap.fromTo(modalRef.current,
        { scale: 0.8, opacity: 0, y: 40 },
        { scale: 1, opacity: 1, y: 0, duration: 0.5, ease: 'back.out(1.6)' }
      );
    }
  }, []);

  const handleSpin = useCallback(() => {
    if (spinning || result) return;
    setSpinning(true);
    playSound('spin');

    const serverPrize = resolvePrizeFromPayload(rewardPayload);
    const weightedPick = pickWeightedPrize(PRIZE_POOL);
    const prize = serverPrize ?? weightedPick.prize;
    const index = serverPrize ? PRIZE_POOL.indexOf(serverPrize) : weightedPick.index;
    const segCenter = index * SEG_ANGLE + SEG_ANGLE / 2;

    if (wheelRef.current) {
      // Audio structure: 14.949s total, 148 ticks × 45° = 18.5 full rotations
      // Phase 1 (0–6s): near-constant fast spin → linear ease, 10.5 rotations
      // Phase 2 (6–14.949s): deceleration → power2.out, 7.5 rotations + landing offset
      const phase1End = currentRotation + 10.5 * 360;
      const phase2End = phase1End + 7.5 * 360 + (360 - segCenter);

      const tl = gsap.timeline({
        onComplete: () => {
          setCurrentRotation(phase2End);
          setResult(prize);
          setSpinning(false);
          playSound('win');
        },
      });

      // Constant-speed sustain phase — matches audio's 0.5s–6s fast spin
      tl.to(wheelRef.current, {
        rotation: phase1End,
        duration: 6,
        ease: 'none',
      });

      // Deceleration phase — matches audio's 6s–14.949s slowdown
      tl.to(wheelRef.current, {
        rotation: phase2End,
        duration: 8.949,
        ease: 'power2.out',
      });
    }
  }, [spinning, result, currentRotation, resolvePrizeFromPayload, rewardPayload]);

  const rarityGlow: Record<string, string> = {
    common: 'shadow-cyan-500/20',
    rare: 'shadow-purple-500/30',
    legendary: 'shadow-amber-400/50',
  };

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div
        ref={modalRef}
        className="w-full max-w-sm rounded-2xl border border-fuchsia-500/40 bg-gradient-to-br from-slate-900/98 via-purple-950/95 to-slate-900/98 backdrop-blur-md p-5 space-y-4 text-center shadow-2xl shadow-fuchsia-500/15"
      >
        {/* Title */}
        <div>
          <div className="text-3xl mb-1">🎰</div>
          <h3 className="text-xl font-black text-white tracking-wide">SPIN THE WHEEL</h3>
          <p className="text-xs text-fuchsia-300/80 mt-1">Tap to spin and win prizes!</p>
        </div>

        {/* Wheel container */}
        <div className="relative mx-auto" style={{ width: 260, height: 260 }}>
          {/* Arrow indicator at top */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-3 z-20"
            style={{ filter: 'drop-shadow(0 0 6px rgba(250,204,21,0.8))' }}>
            <img src={WHEEL_IMAGES.pointer} alt="pointer" className="w-8 h-10 object-contain" draggable={false} />
          </div>

          {/* Outer glow ring */}
          <div className="absolute inset-0 rounded-full border-2 border-fuchsia-400/30"
            style={{ boxShadow: '0 0 30px rgba(232,121,249,0.25), inset 0 0 20px rgba(232,121,249,0.1)' }}
          />

          {/* The wheel */}
          <div
            ref={wheelRef}
            className="relative w-full h-full rounded-full overflow-hidden border-4 border-slate-600/60"
            style={{ willChange: 'transform' }}
          >
            <svg viewBox="0 0 200 200" className="w-full h-full">
              {PRIZE_POOL.map((prize, i) => {
                const startAngle = i * SEG_ANGLE;
                const endAngle = startAngle + SEG_ANGLE;
                const startRad = (startAngle - 90) * Math.PI / 180;
                const endRad = (endAngle - 90) * Math.PI / 180;
                const x1 = 100 + 100 * Math.cos(startRad);
                const y1 = 100 + 100 * Math.sin(startRad);
                const x2 = 100 + 100 * Math.cos(endRad);
                const y2 = 100 + 100 * Math.sin(endRad);
                const largeArc = SEG_ANGLE > 180 ? 1 : 0;
                const midRad = ((startAngle + endAngle) / 2 - 90) * Math.PI / 180;
                const textR = 62;
                const tx = 100 + textR * Math.cos(midRad);
                const ty = 100 + textR * Math.sin(midRad);
                const emojiR = 42;
                const ex = 100 + emojiR * Math.cos(midRad);
                const ey = 100 + emojiR * Math.sin(midRad);
                const textAngle = (startAngle + endAngle) / 2;

                return (
                  <g key={i}>
                    <path
                      d={`M 100,100 L ${x1},${y1} A 100,100 0 ${largeArc},1 ${x2},${y2} Z`}
                      fill={prize.color}
                      stroke="rgba(0,0,0,0.3)"
                      strokeWidth="0.5"
                      opacity={0.85}
                    />
                    {/* Emoji */}
                    <text
                      x={ex} y={ey}
                      textAnchor="middle" dominantBaseline="central"
                      fontSize="16"
                      transform={`rotate(${textAngle}, ${ex}, ${ey})`}
                    >
                      {prize.emoji}
                    </text>
                    {/* Label */}
                    <text
                      x={tx} y={ty}
                      textAnchor="middle" dominantBaseline="central"
                      fontSize="6" fontWeight="bold" fill="white"
                      transform={`rotate(${textAngle}, ${tx}, ${ty})`}
                    >
                      {prize.label}
                    </text>
                  </g>
                );
              })}
              {/* Center circle overlay (non-rotating, on top of the wheel) */}
            </svg>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none" style={{ width: 44, height: 44 }}>
              <img src={WHEEL_IMAGES.center} alt="center" className="w-full h-full object-contain drop-shadow-lg" draggable={false} />
            </div>
          </div>
        </div>

        {/* Spin button or Result */}
        {!result ? (
          <button
            onClick={handleSpin}
            disabled={spinning}
            className={`w-full py-3.5 rounded-xl font-black text-base uppercase tracking-wider transition-all ${
              spinning
                ? 'bg-slate-700 text-slate-400 cursor-wait'
                : 'bg-gradient-to-r from-fuchsia-500 to-purple-500 text-white hover:scale-[1.03] active:scale-95 shadow-lg shadow-fuchsia-500/30'
            }`}
          >
            {spinning ? '🎰 Spinning...' : '🎰 SPIN!'}
          </button>
        ) : (
          <div className="space-y-3">
            {/* Prize reveal */}
            <div className={`p-4 rounded-xl border ${
              result.rarity === 'legendary'
                ? 'bg-amber-500/15 border-amber-400/50'
                : result.rarity === 'rare'
                ? 'bg-purple-500/15 border-purple-400/50'
                : 'bg-cyan-500/10 border-cyan-400/30'
            } ${rarityGlow[result.rarity]}`}>
              <div className="text-3xl mb-1">{result.emoji}</div>
              <p className="text-white font-bold text-lg">{result.label}</p>
              <p className={`text-xs font-semibold uppercase tracking-widest mt-1 ${
                result.rarity === 'legendary' ? 'text-amber-300' : result.rarity === 'rare' ? 'text-purple-300' : 'text-cyan-300'
              }`}>
                {result.rarity === 'legendary' ? '🌟 LEGENDARY' : result.rarity === 'rare' ? '✨ RARE' : '⭐ NICE'}
              </p>
              {result.reward.item_name && (
                <p className="text-slate-400 text-xs mt-1">Item added to your inventory</p>
              )}
              {result.reward.gemstones && (
                <p className="text-amber-200 text-xs mt-1 font-medium">💎 +{result.reward.gemstones} Gemstone{result.reward.gemstones > 1 ? 's' : ''}</p>
              )}
            </div>

            <button
              onClick={() => { playSound('correct'); onClaim(result); }}
              disabled={isClaiming}
              className="w-full py-3 rounded-xl font-bold bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:scale-[1.02] active:scale-95 transition-all shadow-lg shadow-cyan-500/30"
            >
              {isClaiming ? 'Claiming...' : 'Claim & Continue →'}
            </button>
          </div>
        )}
      </div>
    </div>
  , document.body);
};

export default SpinWheelModal;
