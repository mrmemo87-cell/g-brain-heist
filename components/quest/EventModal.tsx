import React, { useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import gsap from 'gsap';
import type { QuestNode } from '../../types';
import { playSound } from '../../services/soundManager';

interface EventModalProps {
  node: QuestNode;
  onClaim: () => void;
  /** Resolved result from server — null while loading */
  result: { xp?: number; coins?: number; effect?: string } | null;
  isResolving: boolean;
}

const EventModal: React.FC<EventModalProps> = ({ node, onClaim, result, isResolving }) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState(node.type === 'reward');
  const boxRef = useRef<HTMLDivElement>(null);

  const isSurprise = node.type === 'surprise';

  useEffect(() => {
    if (modalRef.current) {
      gsap.fromTo(modalRef.current,
        { scale: 0.85, opacity: 0, y: 30 },
        { scale: 1, opacity: 1, y: 0, duration: 0.4, ease: 'back.out(1.4)' }
      );
    }
  }, []);

  const handleReveal = () => {
    if (!isSurprise || revealed) return;
    if (boxRef.current) {
      gsap.timeline()
        .to(boxRef.current, { rotate: -5, duration: 0.1, ease: 'power2.out' })
        .to(boxRef.current, { rotate: 5, duration: 0.1, ease: 'power2.out' })
        .to(boxRef.current, { rotate: -3, duration: 0.08 })
        .to(boxRef.current, { rotate: 0, scale: 1.2, duration: 0.2, ease: 'back.out(2)' })
        .to(boxRef.current, { scale: 1, duration: 0.3, ease: 'power2.out' })
        .call(() => setRevealed(true));
    } else {
      setRevealed(true);
    }
  };

  const payload = result ?? node.event_payload;

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div
        ref={modalRef}
        className={`w-full max-w-md rounded-2xl border p-6 text-center space-y-5 ${
          isSurprise
            ? 'bg-gradient-to-br from-fuchsia-950/90 via-slate-900/95 to-purple-950/90 border-fuchsia-500/40 shadow-[0_0_40px_rgba(232,121,249,0.2)]'
            : 'bg-gradient-to-br from-amber-950/90 via-slate-900/95 to-yellow-950/90 border-amber-500/40 shadow-[0_0_40px_rgba(251,191,36,0.2)]'
        }`}
      >
        {/* Icon */}
        <div ref={boxRef} className="text-5xl select-none">
          {isSurprise ? (revealed ? '🎉' : '📦') : '🎁'}
        </div>

        {/* Title */}
        <h3 className="text-xl font-bold text-white">
          {node.event_title ?? (isSurprise ? 'Mystery Signal' : 'Supply Cache')}
        </h3>

        {/* Pre-reveal (surprise only) */}
        {isSurprise && !revealed && (
          <button
            onClick={handleReveal}
            className="px-6 py-3 rounded-xl font-bold bg-gradient-to-r from-fuchsia-500 to-purple-500 text-white hover:scale-105 active:scale-95 transition-all shadow-lg shadow-fuchsia-500/30"
          >
            Open Mystery Box
          </button>
        )}

        {/* Revealed content */}
        {revealed && payload && (
          <div className="space-y-3">
            <div className="flex justify-center gap-4">
              {(payload.xp ?? 0) > 0 && (
                <div className="flex items-center gap-1 text-blue-300 font-bold">
                  <span style={{ color: 'var(--ion-blue)' }}>⚡</span> +{payload.xp} XP
                </div>
              )}
              {(payload.coins ?? 0) > 0 && (
                <div className="flex items-center gap-1 text-amber-300 font-bold">
                  <span style={{ color: 'var(--amber-warn)' }}>🪙</span> +{payload.coins} Coins
                </div>
              )}
            </div>
            {payload.effect && (
              <p className="text-sm text-fuchsia-200 font-medium">✨ {payload.effect}</p>
            )}
            <button
              onClick={() => { playSound('correct'); onClaim(); }}
              disabled={isResolving}
              className="w-full py-3 rounded-xl font-bold bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:scale-[1.02] active:scale-95 transition-all shadow-lg shadow-cyan-500/30"
            >
              {isResolving ? 'Claiming...' : 'Claim & Continue →'}
            </button>
          </div>
        )}

        {/* Reward nodes show content immediately */}
        {!isSurprise && !payload && (
          <button
            onClick={() => { playSound('correct'); onClaim(); }}
            disabled={isResolving}
            className="w-full py-3 rounded-xl font-bold bg-gradient-to-r from-amber-500 to-yellow-500 text-white hover:scale-[1.02] active:scale-95 transition-all shadow-lg shadow-amber-500/30"
          >
            {isResolving ? 'Claiming...' : 'Claim & Continue →'}
          </button>
        )}
      </div>
    </div>
  , document.body);
};

export default EventModal;
