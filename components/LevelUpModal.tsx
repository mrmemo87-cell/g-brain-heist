import React from 'react';
import { audioService } from '../services/audioService';
import { visualAssets } from './visualAssets';
import DotLottieAnimation from './DotLottieAnimation';

interface LevelUpModalProps {
  newLevel: number;
  rewards: {
    xp?: number;
    coins?: number;
    ap_refill?: boolean;
  };
  onClose: () => void;
}

const LevelUpModal: React.FC<LevelUpModalProps> = ({ newLevel, rewards, onClose }) => {
  const coinsReward = rewards.coins ?? 0;
  const xpReward = rewards.xp ?? 0;
  const hasVisibleReward = coinsReward > 0 || xpReward > 0 || rewards.ap_refill === true;

  React.useEffect(() => {
    audioService.play('tada');
  }, []);

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
      {/* Celebration background */}
      <img
        src={visualAssets.mission.postCelebration}
        alt=""
        className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-20"
        aria-hidden="true"
      />
      <div className="card-glass glow-warn max-w-md w-full p-8 text-center transform animate-scaleIn relative z-10" style={{ borderColor: 'rgba(255, 176, 32, 0.5)' }}>
        <div className="flex justify-center mb-4">
          <DotLottieAnimation
            src="/lotties/Trophy.lottie"
            width={100}
            height={100}
            loop={false}
          />
        </div>
        <h2 className="font-heading text-4xl mb-2" style={{ color: 'var(--amber-warn)' }}>
          LEVEL UP!
        </h2>
        <p className="text-gray-300 text-xl mb-6">
          You've reached <span className="font-bold text-white">Level {newLevel}</span>!
        </p>
        
        <div className="bg-black/40 rounded-xl p-6 mb-6 space-y-3">
          <h3 className="font-heading text-lg" style={{ color: 'var(--ion-blue)' }}>
            {hasVisibleReward ? 'Level-Up Bonus:' : 'Level Milestone:'}
          </h3>
          {coinsReward > 0 && (
            <div className="flex items-center justify-center gap-2 text-lg">
              <span style={{ color: 'var(--amber-warn)' }}>💰</span>
              <span className="font-bold text-white">+{coinsReward} Coins</span>
            </div>
          )}
          {xpReward > 0 && (
            <div className="flex items-center justify-center gap-2 text-lg">
              <span style={{ color: 'var(--ion-blue)' }}>⭐</span>
              <span className="font-bold text-white">+{xpReward} XP Bonus</span>
            </div>
          )}
          {rewards.ap_refill === true && (
            <div className="flex items-center justify-center gap-2 text-lg">
              <span style={{ color: 'var(--plasma-pink)' }}>⚡</span>
              <span className="font-bold text-white">AP Fully Restored!</span>
            </div>
          )}
          {!hasVisibleReward && (
            <p className="text-sm leading-relaxed text-gray-300">
              Your question rewards were already saved with the mission results. No separate level-up bonus is available right now.
            </p>
          )}
        </div>

        <button
          onClick={onClose}
          className="w-full py-3 px-6 rounded-xl font-heading text-lg transition-all hover:scale-105 bg-gradient-to-r from-amber-500 to-yellow-500 text-black font-bold"
        >
          Awesome!
        </button>
      </div>
    </div>
  );
};

export default LevelUpModal;
