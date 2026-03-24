import React, { useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import gsap from 'gsap';

interface RetreatConfirmModalProps {
  rewardsXp: number;
  rewardsCoins: number;
  nodesClearedCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}

const RetreatConfirmModal: React.FC<RetreatConfirmModalProps> = ({
  rewardsXp, rewardsCoins, nodesClearedCount, onConfirm, onCancel,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (modalRef.current) {
      gsap.fromTo(modalRef.current,
        { scale: 0.9, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.3, ease: 'power2.out' }
      );
    }
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div
        ref={modalRef}
        className="w-full max-w-sm rounded-2xl border border-amber-500/40 bg-gradient-to-br from-slate-900/95 via-amber-950/30 to-slate-900/95 p-6 text-center space-y-5 shadow-[0_0_40px_rgba(251,191,36,0.15)]"
      >
        <div className="text-4xl">🚪</div>
        <h3 className="text-xl font-bold text-white">Retreat from Mission?</h3>
        <p className="text-sm text-slate-300 leading-relaxed">
          You'll keep the <strong className="text-white">{nodesClearedCount}</strong> nodes worth of rewards collected so far,
          but you'll lose the <strong className="text-yellow-300">Final Chest</strong> bonus.
        </p>

        <div className="flex justify-center gap-4 text-sm">
          <div className="card-glass p-3 border border-blue-400/30 rounded-lg">
            <p className="text-xs text-slate-400">XP Kept</p>
            <p className="font-bold text-blue-300">{rewardsXp}</p>
          </div>
          <div className="card-glass p-3 border border-amber-400/30 rounded-lg">
            <p className="text-xs text-slate-400">Coins Kept</p>
            <p className="font-bold text-amber-300">{rewardsCoins}</p>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-xl font-bold bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:scale-[1.02] active:scale-95 transition-all"
          >
            Keep Going
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-3 rounded-xl font-bold bg-slate-700 text-slate-300 hover:bg-slate-600 hover:scale-[1.02] active:scale-95 transition-all"
          >
            Retreat
          </button>
        </div>
      </div>
    </div>
  , document.body);
};

export default RetreatConfirmModal;
