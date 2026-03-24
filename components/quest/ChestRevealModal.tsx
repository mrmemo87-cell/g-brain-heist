import React, { useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import gsap from 'gsap';
import type { QuestChestResult } from '../../types';
import DotLottieAnimation from '../DotLottieAnimation';
import { CHEST_IMAGES } from './nodeAssets';
import { playSound } from '../../services/soundManager';

interface ChestRevealModalProps {
  result: QuestChestResult;
  onClose: () => void;
}

const CHEST_ART: Record<QuestChestResult['chest_tier'], { imgSrc: string; openImgSrc: string; color: string; glow: string }> = {
  bronze: { imgSrc: CHEST_IMAGES.bronze, openImgSrc: CHEST_IMAGES.bronze, color: 'from-orange-900/80 to-amber-950/90', glow: 'rgba(194,120,62,0.4)' },
  silver: { imgSrc: CHEST_IMAGES.silver, openImgSrc: CHEST_IMAGES.silver, color: 'from-slate-700/80 to-slate-900/90', glow: 'rgba(192,192,192,0.4)' },
  gold: { imgSrc: CHEST_IMAGES.gold, openImgSrc: CHEST_IMAGES.gold, color: 'from-yellow-800/80 to-amber-900/90', glow: 'rgba(250,204,21,0.5)' },
};

const ChestRevealModal: React.FC<ChestRevealModalProps> = ({ result, onClose }) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const chestRef = useRef<HTMLDivElement>(null);
  const rewardsRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<'shake' | 'open' | 'rewards'>('shake');
  const art = CHEST_ART[result.chest_tier];

  useEffect(() => {
    if (!modalRef.current || !chestRef.current) return;

    const tl = gsap.timeline();

    // Phase 1: Chest appears and shakes
    tl.fromTo(modalRef.current,
      { opacity: 0 },
      { opacity: 1, duration: 0.3 }
    )
    .fromTo(chestRef.current,
      { scale: 0.5, rotate: 0 },
      { scale: 1, duration: 0.5, ease: 'back.out(2)' }
    )
    // Shake sequence
    .to(chestRef.current, { rotate: -8, duration: 0.08 })
    .to(chestRef.current, { rotate: 8, duration: 0.08 })
    .to(chestRef.current, { rotate: -12, duration: 0.08 })
    .to(chestRef.current, { rotate: 12, duration: 0.08 })
    .to(chestRef.current, { rotate: -6, duration: 0.06 })
    .to(chestRef.current, { rotate: 0, duration: 0.06 })
    // Phase 2: Burst open
    .to(chestRef.current, {
      scale: 1.4,
      duration: 0.2,
      ease: 'power4.out',
      onStart: () => { setPhase('open'); playSound('chestOpen'); },
    })
    .to(chestRef.current, { scale: 1, duration: 0.4, ease: 'elastic.out(1, 0.5)' })
    // Phase 3: Rewards appear
    .call(() => setPhase('rewards'), [], '+=0.3');
  }, []);

  // Rewards entrance animation
  useEffect(() => {
    if (phase === 'rewards' && rewardsRef.current) {
      gsap.fromTo(rewardsRef.current.children,
        { y: 30, opacity: 0, scale: 0.8 },
        { y: 0, opacity: 1, scale: 1, stagger: 0.12, duration: 0.5, ease: 'back.out(1.6)' }
      );
    }
  }, [phase]);

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div
        ref={modalRef}
        className={`w-full max-w-md rounded-2xl border p-8 text-center space-y-6 bg-gradient-to-br ${art.color} border-yellow-500/30`}
        style={{ boxShadow: `0 0 60px ${art.glow}` }}
      >
        {/* Chest */}
        <div ref={chestRef} className="relative flex items-center justify-center select-none">
          <img
            src={phase === 'open' || phase === 'rewards' ? art.openImgSrc : art.imgSrc}
            alt="chest"
            className="w-28 h-28 object-contain drop-shadow-2xl"
            draggable={false}
          />
          {/* Explosion burst when chest opens */}
          {phase !== 'shake' && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none -z-10">
              <DotLottieAnimation
                src="/lotties/Explosion.lottie"
                width={200}
                height={200}
                loop={false}
              />
            </div>
          )}
        </div>

        <h2 className="text-2xl font-bold text-white">
          {phase === 'rewards'
            ? (result.perfect_run ? '🎯 Perfect Run!' : 'Mission Complete!')
            : 'Opening Chest...'}
        </h2>

        {result.perfect_run && phase === 'rewards' && (
          <p className="text-sm text-yellow-200 font-medium">All questions answered correctly!</p>
        )}

        {/* Rewards */}
        {phase === 'rewards' && (
          <div ref={rewardsRef} className="space-y-3">
            <div className="flex justify-center gap-6">
              <div className="card-glass p-4 border border-blue-400/30 rounded-xl min-w-[100px]">
                <p className="text-xs text-slate-400 uppercase tracking-wider">XP Earned</p>
                <p className="text-2xl font-bold text-blue-300">+{result.total_run_xp}</p>
              </div>
              <div className="card-glass p-4 border border-amber-400/30 rounded-xl min-w-[100px]">
                <p className="text-xs text-slate-400 uppercase tracking-wider">Coins</p>
                <p className="text-2xl font-bold text-amber-300">+{result.total_run_coins}</p>
              </div>
            </div>

            <div className="flex justify-center gap-4 text-sm">
              <span className="text-slate-300">🔥 Streak Peak: <strong className="text-white">{result.streak_peak}</strong></span>
              <span className="text-slate-300">📍 Nodes: <strong className="text-white">{result.nodes_cleared}/7</strong></span>
            </div>

            {/* Chest bonus */}
            {(result.chest_rewards.xp > 0 || result.chest_rewards.coins > 0) && (
              <div className="p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/30">
                <p className="text-xs text-yellow-300 font-semibold uppercase tracking-wider mb-1">Chest Bonus</p>
                <div className="flex justify-center gap-3 text-sm font-bold">
                  {result.chest_rewards.xp > 0 && <span className="text-blue-300">+{result.chest_rewards.xp} XP</span>}
                  {result.chest_rewards.coins > 0 && <span className="text-amber-300">+{result.chest_rewards.coins} Coins</span>}
                </div>
              </div>
            )}

            <button
              onClick={() => { playSound('correct'); onClose(); }}
              className="w-full py-4 rounded-xl font-bold text-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:scale-[1.02] active:scale-95 transition-all shadow-lg shadow-cyan-500/30"
            >
              Continue →
            </button>
          </div>
        )}
      </div>
    </div>
  , document.body);
};

export default ChestRevealModal;
