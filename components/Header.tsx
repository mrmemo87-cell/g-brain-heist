import React, { useState, useEffect, useRef } from 'react';
import { Profile } from '../types';
import { CoinIcon, XPIcon, APIcon } from './icons';

// Custom hook for animating number changes
const useAnimatedValue = (endValue: number, duration: number = 500) => {
    const [currentValue, setCurrentValue] = useState(endValue);
    // FIX: The error "Expected 1 arguments, but got 0." likely refers to this line. Using useRef with a generic but no argument is ambiguous. Explicitly initializing with null is more robust.
    const frameRef = useRef<number | null>(null);
    const prevValueRef = useRef(endValue);

    useEffect(() => {
        const startValue = prevValueRef.current;
        const valueDiff = endValue - startValue;
        if (valueDiff === 0) return;

        let startTime: number;

        const animate = (timestamp: number) => {
            if (!startTime) startTime = timestamp;
            const progress = timestamp - startTime;
            const percentage = Math.min(progress / duration, 1);
            
            const easedPercentage = 1 - Math.pow(1 - percentage, 3); // easeOutCubic

            const nextValue = startValue + valueDiff * easedPercentage;
            setCurrentValue(Math.round(nextValue));

            if (progress < duration) {
                frameRef.current = requestAnimationFrame(animate);
            } else {
                setCurrentValue(endValue);
                prevValueRef.current = endValue;
            }
        };

        frameRef.current = requestAnimationFrame(animate);

        return () => {
            if (frameRef.current) cancelAnimationFrame(frameRef.current);
            prevValueRef.current = endValue;
        };
    }, [endValue, duration]);

    return currentValue;
};


const StatChip: React.FC<{ icon: React.ReactNode; value: number; 'data-testid': string }> = ({ icon, value, 'data-testid': testId }) => {
    const animatedValue = useAnimatedValue(value);
    return (
        <div id={testId} className="flex items-center space-x-2 bg-black/20 px-3 py-1.5 rounded-full">
            <div className="w-5 h-5">{icon}</div>
            <span className="font-mono font-semibold text-base">{animatedValue.toLocaleString()}</span>
        </div>
    );
};

interface HeaderProps {
  profile: Profile;
}

const Header: React.FC<HeaderProps> = ({ profile }) => {
  return (
    <header className="flex justify-between items-center card-glass glow-ion p-3 sm:p-4">
      <div className="flex items-center space-x-4">
        <h1 className="font-heading text-2xl md:text-3xl font-bold tracking-wider" style={{ color: 'var(--ion-blue)' }}>
            BH
        </h1>
         <span className="hidden sm:block text-lg font-medium text-gray-300">{profile.username}</span>
      </div>
      <div className="flex items-center space-x-2 sm:space-x-3">
        <StatChip icon={<CoinIcon />} value={profile.coins} data-testid="coin-hud" />
        <StatChip icon={<XPIcon />} value={profile.xp} data-testid="xp-hud" />
        <StatChip icon={<APIcon />} value={profile.ap_now} data-testid="ap-hud" />
        <img src={profile.avatar_url} alt="Player Avatar" className="w-9 h-9 sm:w-10 sm:h-10 rounded-full border-2" style={{ borderColor: 'var(--plasma-pink)' }} />
      </div>
    </header>
  );
};

export default Header;