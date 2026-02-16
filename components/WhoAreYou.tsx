import React, { useState, useEffect } from 'react';

/**
 * WhoAreYou – shown while the app fetches the user's role.
 * Displays animated text that flips through entertaining lines fast enough
 * to keep users reading. Starts with "Who are you?" then cycles through
 * random lines, never repeating the same order twice.
 */

const LINES = [
  'Who are you?',
  'Checking your clearance level…',
  'Are you a student or a mastermind?',
  'Scanning neural fingerprint…',
  'Verifying identity…',
  'Running background check…',
  'Looking up your dossier…',
  'Agent or handler? Let me check…',
  'Peeking at your file…',
  'Hmmm, interesting…',
  'Almost got it…',
  'You look familiar…',
  'Cross-referencing records…',
  'Decrypting your profile…',
  'Accessing the vault…',
  'One moment, agent…',
  'Establishing secure channel…',
  'Your secrets are safe with us…',
  'Pulling up your records…',
  'Identity verification in progress…',
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
    // First line stays 600ms, rest cycle every 900ms
    const delay = idx === 0 ? 600 : 900;
    const id = window.setTimeout(() => {
      setIdx((prev) => (prev + 1) % order.length);
    }, delay);
    return () => clearTimeout(id);
  }, [idx, order.length]);

  const line = LINES[order[idx]];

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <p
        key={idx}
        className="text-center font-heading text-2xl sm:text-3xl tracking-wide"
        style={{
          color: '#5eead4',
          animation: 'whoFlip 0.4s ease-out',
        }}
      >
        {line}
      </p>

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
    </div>
  );
};

export default WhoAreYou;
