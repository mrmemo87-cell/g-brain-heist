import React from 'react';
import { audioService } from '../services/audioService';
import { visualAssets } from './visualAssets';
import DotLottieAnimation from './DotLottieAnimation';

interface StreakRewardModalProps {
  streak: number;
  coinsAwarded: number;
  coinBalance: number;
  onClose: () => void;
}

const StreakRewardModal: React.FC<StreakRewardModalProps> = ({ streak, coinsAwarded, coinBalance, onClose }) => {
  React.useEffect(() => {
    // Keep streak wins sonically consistent with the existing level-up moment.
    audioService.play('tada');
  }, []);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[10020] flex items-center justify-center bg-black/90 p-4 backdrop-blur-md animate-fadeIn" role="dialog" aria-modal="true" aria-labelledby="streak-reward-title">
      <img src={visualAssets.mission.postCelebration} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-25" aria-hidden="true" />
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-orange-300/60 bg-gradient-to-b from-slate-900 via-slate-950 to-black p-6 text-center shadow-[0_0_70px_rgba(249,115,22,0.32)] sm:p-8 animate-scaleIn">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top,rgba(251,146,60,0.32),transparent_68%)]" aria-hidden="true" />
        <div className="relative">
          <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-full border border-orange-300/40 bg-orange-400/10 shadow-[0_0_45px_rgba(251,146,60,0.35)]">
            <DotLottieAnimation src="/lotties/Trophy.lottie" width={94} height={94} loop={false} />
          </div>
          <p className="mt-5 text-xs font-black uppercase tracking-[0.32em] text-orange-300">Streak reward secured</p>
          <h2 id="streak-reward-title" className="mt-2 font-heading text-4xl text-white">DAY {streak} IGNITED!</h2>
          <p className="mt-2 text-sm text-slate-300">Consistency paid off. Your daily vault drop is already banked.</p>

          <div className="my-6 rounded-2xl border border-amber-300/40 bg-gradient-to-br from-amber-400/20 to-orange-500/10 p-5 shadow-[inset_0_0_30px_rgba(251,191,36,0.08)]">
            <span className="text-4xl" aria-hidden="true">🪙</span>
            <strong className="mt-2 block font-heading text-4xl text-amber-200">+{coinsAwarded.toLocaleString()}</strong>
            <span className="text-sm font-bold uppercase tracking-wider text-amber-100">coins gained</span>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-cyan-400/20 bg-cyan-400/5 px-4 py-3 text-sm">
            <span className="text-slate-400">New coin balance</span>
            <strong className="font-mono text-cyan-200">{coinBalance.toLocaleString()}</strong>
          </div>

          <button type="button" onClick={onClose} autoFocus className="mt-6 w-full rounded-xl bg-gradient-to-r from-orange-500 via-amber-400 to-yellow-300 px-6 py-3 font-heading text-lg font-black text-slate-950 transition hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-amber-200">
            OK — CONTINUE
          </button>
        </div>
      </div>
    </div>
  );
};

export default StreakRewardModal;
