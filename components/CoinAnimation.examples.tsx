// Example Integration: Using CoinAnimation in the Header Component
// This file shows how to integrate the animated coin into existing components

import CoinAnimation from './CoinAnimation';

// EXAMPLE 1: Replace CoinIcon in Header with animated version
// Original:
// <div className="w-6 h-6 text-amber-400"><CoinIcon /></div>
//
// Updated:
// <CoinAnimation width={24} height={24} className="text-amber-400" />

// EXAMPLE 2: Conditional animation based on state
// Show animated coin only during reward moments
export const RewardIndicator = ({ coins, isRewarding }: { coins: number; isRewarding: boolean }) => {
  return (
    <div className="flex items-center gap-2">
      {isRewarding ? (
        <CoinAnimation width={24} height={24} speed={1.2} />
      ) : (
        <div className="w-6 h-6 text-amber-400">
          {/* Static icon */}
        </div>
      )}
      <span className="text-lg font-bold text-amber-400">{coins.toLocaleString()}</span>
    </div>
  );
};

// EXAMPLE 3: Celebration effect with multiple coins
export const CoinCelebration = () => {
  return (
    <div className="flex gap-4 justify-center">
      <CoinAnimation width={64} height={64} speed={1.5} />
      <CoinAnimation width={56} height={56} speed={1.2} />
      <CoinAnimation width={48} height={48} speed={0.9} />
    </div>
  );
};

// EXAMPLE 4: Loading state
export const CoinLoader = () => {
  return (
    <div className="flex items-center gap-2">
      <CoinAnimation width={40} height={40} speed={0.8} />
      <span className="text-gray-400">Loading rewards...</span>
    </div>
  );
};

// EXAMPLE 5: Shop item with animated coin price
export const ShopItemWithAnimatedPrice = ({ 
  name, 
  price, 
  description 
}: { 
  name: string; 
  price: number; 
  description: string;
}) => {
  return (
    <div className="card-glass p-4 rounded-lg">
      <h3 className="text-lg font-bold mb-2">{name}</h3>
      <p className="text-gray-400 text-sm mb-4">{description}</p>
      <div className="flex items-center gap-2 text-amber-400">
        <CoinAnimation width={32} height={32} />
        <span className="text-xl font-bold">{price.toLocaleString()}</span>
      </div>
    </div>
  );
};

// EXAMPLE 6: Reward popup
export const RewardPopup = ({ 
  title, 
  coinsAwarded, 
  xpAwarded 
}: { 
  title: string; 
  coinsAwarded: number; 
  xpAwarded: number;
}) => {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur">
      <div className="card-glass p-8 rounded-2xl text-center max-w-md">
        <h2 className="text-3xl font-bold mb-6 text-amber-300">{title}!</h2>
        
        {/* Animated coin reward */}
        <div className="mb-6 flex items-center justify-center gap-3">
          <CoinAnimation width={48} height={48} speed={1.2} />
          <div className="text-left">
            <p className="text-gray-400 text-sm uppercase">Coins</p>
            <p className="text-3xl font-bold text-amber-400">+{coinsAwarded.toLocaleString()}</p>
          </div>
        </div>

        {/* XP reward */}
        <div className="mb-6 text-left">
          <p className="text-gray-400 text-sm uppercase">Experience</p>
          <p className="text-2xl font-bold text-blue-400">+{xpAwarded.toLocaleString()} XP</p>
        </div>

        <button className="w-full py-3 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400 rounded-lg font-bold">
          Claim Reward
        </button>
      </div>
    </div>
  );
};

// EXAMPLE 7: Stats display in profile
export const ProfileStatsWithAnimatedCoins = ({ coins, level }: { coins: number; level: number }) => {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="bg-black/30 p-4 rounded-lg">
        <CoinAnimation width={36} height={36} className="mb-2" />
        <p className="text-xs uppercase text-gray-400">Coins</p>
        <p className="text-2xl font-bold text-amber-400">{coins.toLocaleString()}</p>
      </div>
      <div className="bg-black/30 p-4 rounded-lg">
        <p className="text-2xl font-bold text-blue-400">⭐ {level}</p>
        <p className="text-xs uppercase text-gray-400">Level</p>
      </div>
    </div>
  );
};

export default {
  RewardIndicator,
  CoinCelebration,
  CoinLoader,
  ShopItemWithAnimatedPrice,
  RewardPopup,
  ProfileStatsWithAnimatedCoins,
};
