import React, { useState, useEffect } from 'react';
import SignalBreachBg from './SignalBreachBg';

/**
 * WhoAreYou – shown while the app fetches the user's role.
 * Displays animated text that flips through entertaining lines fast enough
 * to keep users reading. Starts with "Who are you?" then cycles through
 * random lines, never repeating the same order twice.
 *
 * Wrapped in SignalBreachBg for the perspective-grid / scan-line aesthetic.
 */

const LINES = [
  'Who are you?',
  'Signal breach initiated…',
  'Scanning neural fingerprint…',
  'Checking your clearance level…',
  'Decrypting your profile…',
  'Verifying identity…',
  'Establishing secure channel…',
  'Cross-referencing records…',
  'Intercepting data stream…',
  'Almost got it…',
  'Stabilizing neural channel…',
  'One moment, agent…',
];

function shuffleFrom(startIdx: number): number[] {
  // Build a shuffled sequence that starts after "Who are you?"
  const rest = Array.from({ length: LINES.length - 1 }, (_, i) => i + 1);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return [0, ...rest]; // always start with "Who are you?"
}

const WhoAreYou: React.FC = () => {
  const [order] = useState(() => shuffleFrom(0));
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    // First line stays 1.2s, rest stay 1.5s each
    const delay = idx === 0 ? 1200 : 1500;
    const id = window.setTimeout(() => {
      setIdx((prev) => (prev + 1) % order.length);
    }, delay);
    return () => clearTimeout(id);
  }, [idx, order.length]);

  const line = LINES[order[idx]];

  return (
    <SignalBreachBg>
      <p
        key={idx}
        className="text-center font-heading text-2xl sm:text-3xl tracking-wide font-bold"
        style={{
          color: '#d7eeff',
          animation: 'whoFlip 0.4s ease-out',
          textShadow: '0 0 18px rgba(68,231,213,.22)',
        }}
      >
        {line}
      </p>

      <div
        className="w-56 h-2 rounded-full overflow-hidden"
        style={{
          background: 'rgba(255,255,255,.10)',
          border: '1px solid rgba(255,255,255,.08)',
        }}
      >
        <div
          key={`bar-${idx}`}
          className="h-full rounded-full"
          style={{
            width: `${15 + ((idx * 17) % 85)}%`,
            background: 'linear-gradient(90deg, #33d9ff, #44e7d5, #d162ff)',
            boxShadow: '0 0 16px rgba(68,231,213,.45)',
            transition: 'width 0.5s ease',
          }}
        />
      </div>

      <style>{`
        @keyframes whoFlip {
          0%   { opacity: 0; transform: translateY(12px) scale(0.96); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes whoFlip {
            0%   { opacity: 0; }
            100% { opacity: 1; }
          }
        }
      `}</style>
    </SignalBreachBg>
  );
};

export default WhoAreYou;
