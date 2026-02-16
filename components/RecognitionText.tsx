import React, { useState, useEffect, useMemo } from 'react';

/**
 * RecognitionText – shown once the role peek returns a username.
 *
 * Flow:
 *   "You look familiar…" → "Are you {username}?" → personalised dopamine lines
 *
 * Every session feels different:
 *   • stat lines pick a random variant
 *   • generic hype pool is shuffled and subset-sampled
 *   • animation direction and accent colour change on every line
 */

export interface RecognitionTextProps {
  username: string;
  role: 'student' | 'teacher' | 'admin';
  level?: number;
  coins?: number;
  gems?: number;
  streak?: number;
  clanName?: string;
}

/* ── accent colours for dynamic lines ─────────────────────── */
const ACCENT_POOL = [
  '#5eead4', // teal
  '#22d3ee', // cyan
  '#a78bfa', // purple
  '#f472b6', // pink
  '#facc15', // amber
  '#4ade80', // green
  '#fb923c', // orange
  '#818cf8', // indigo
];

/* ── animation names (keyframes defined in <style> below) ── */
const ANIM_POOL = [
  'rcgPunch',
  'rcgSlideL',
  'rcgSlideR',
  'rcgDrop',
  'rcgRise',
  'rcgFlash',
];

/* ── helpers ──────────────────────────────────────────────── */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/* ── build the personalised line pool ─────────────────────── */
function buildLines(props: RecognitionTextProps): string[] {
  const { role, level, coins, gems, streak, clanName } = props;
  const lines: string[] = [];

  if (role === 'student') {
    /* stat‑based lines – one random variant per stat each session */
    if (level != null && level > 0) {
      lines.push(
        pick([
          `Level ${level}. Not bad at all.`,
          `Level ${level}? You've been putting in work.`,
          `Level ${level}. The grind is real.`,
          `Level ${level}. Respect earned.`,
          `Level ${level} already? Impressive.`,
        ]),
      );
    }
    if (coins != null && coins > 0) {
      lines.push(
        pick([
          `${coins.toLocaleString()} coins in the vault.`,
          `Sitting on ${coins.toLocaleString()} coins. Smart.`,
          `${coins.toLocaleString()} coins stacked up.`,
          `${coins.toLocaleString()} coins? You're building something.`,
        ]),
      );
    }
    if (gems != null && gems > 0) {
      lines.push(
        pick([
          `${gems} gemstones. Nice collection.`,
          `${gems} gems? Shiny.`,
          `Hoarding ${gems} gemstones. We see you.`,
          `${gems} gemstones. A true collector.`,
        ]),
      );
    }
    if (streak != null && streak > 0) {
      lines.push(
        pick([
          `${streak}-day streak. Consistency wins.`,
          `${streak} days straight? That's discipline.`,
          `Streak: ${streak}. Don't break the chain.`,
          `${streak}-day streak? On fire.`,
        ]),
      );
    }
    if (clanName) {
      lines.push(
        pick([
          `Clan ${clanName}. Solid crew.`,
          `${clanName} member? Good taste.`,
          `Representing ${clanName}. Respect.`,
          `${clanName}. Strong allegiance.`,
        ]),
      );
    }

    /* generic hype – take a random subset so no two sessions feel the same */
    const hype = shuffle([
      'Your rivals should be worried.',
      'The leaderboard trembles.',
      'Time to stack some more.',
      "Let's run it up today.",
      'Welcome back, legend.',
      'Preparing your command center…',
      'The system remembers everything.',
      'Your record speaks for itself.',
      'Ready to dominate?',
      "Let's make it count.",
      'Back for more? Good.',
      'Another day, another heist.',
      'Loading your empire…',
      'The vault doors are opening.',
      'All systems nominal.',
      'Enemies are online. Just saying.',
      'Your profile is loading and it looks good.',
      'History will remember this session.',
    ]);
    lines.push(...hype.slice(0, 8));
  } else {
    /* teacher / admin */
    lines.push(
      ...shuffle([
        'The command center awaits.',
        'Dashboard warming up.',
        'Class data incoming.',
        'The portal recognizes you.',
        'Systems online, commander.',
        'Your toolkit is ready.',
        'Welcome back.',
        'Data streams connecting.',
        'Powering up the console.',
        "Students won't know what hit them.",
        'Performance metrics loading…',
        'Reports assembling themselves.',
      ]).slice(0, 8),
    );
  }

  return shuffle(lines);
}

/* ── component ────────────────────────────────────────────── */
const RecognitionText: React.FC<RecognitionTextProps> = (props) => {
  const { username } = props;

  // Build everything once on mount – different each session
  const dynaLines = useMemo(() => buildLines(props), []);
  const colorOrder = useMemo(() => shuffle([...ACCENT_POOL]), []);
  const animOrder = useMemo(() => {
    const seq: number[] = [];
    for (let i = 0; i < 5; i++) seq.push(...shuffle(ANIM_POOL.map((_, k) => k)));
    return seq;
  }, []);

  const [idx, setIdx] = useState(0);

  useEffect(() => {
    // opener lines hold a beat longer so users actually read them
    const delay = idx === 0 ? 600 : idx === 1 ? 1500 : 800;
    const id = window.setTimeout(() => setIdx((p) => p + 1), delay);
    return () => clearTimeout(id);
  }, [idx]);

  /* ── determine current text ── */
  let text: string;
  if (idx === 0) text = 'You look familiar…';
  else if (idx === 1) text = `Are you ${username}?`;
  else text = dynaLines[(idx - 2) % dynaLines.length];

  /* ── pick style for this line ── */
  const color = idx <= 1 ? '#5eead4' : colorOrder[(idx - 2) % colorOrder.length];
  const anim = idx === 0 ? 'rcgPunch' : ANIM_POOL[animOrder[idx % animOrder.length]];

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <p
        key={idx}
        className="text-center font-heading text-2xl sm:text-3xl tracking-wide font-bold px-6"
        style={{
          color,
          animation: `${anim} 0.25s cubic-bezier(0.22, 1, 0.36, 1)`,
        }}
      >
        {text}
      </p>

      {/* Hard-cut transition keyframes — each feels distinct */}
      <style>{`
        @keyframes rcgPunch {
          0%   { opacity: 0; transform: scale(1.35); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes rcgSlideL {
          0%   { opacity: 0; transform: translateX(-50px); }
          100% { opacity: 1; transform: translateX(0); }
        }
        @keyframes rcgSlideR {
          0%   { opacity: 0; transform: translateX(50px); }
          100% { opacity: 1; transform: translateX(0); }
        }
        @keyframes rcgDrop {
          0%   { opacity: 0; transform: translateY(-35px) scale(1.05); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes rcgRise {
          0%   { opacity: 0; transform: translateY(35px) scale(1.05); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes rcgFlash {
          0%   { opacity: 0; transform: scale(0.8); }
          40%  { opacity: 1; transform: scale(1.08); }
          100% { opacity: 1; transform: scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes rcgPunch  { 0% { opacity: 0 } 100% { opacity: 1 } }
          @keyframes rcgSlideL { 0% { opacity: 0 } 100% { opacity: 1 } }
          @keyframes rcgSlideR { 0% { opacity: 0 } 100% { opacity: 1 } }
          @keyframes rcgDrop   { 0% { opacity: 0 } 100% { opacity: 1 } }
          @keyframes rcgRise   { 0% { opacity: 0 } 100% { opacity: 1 } }
          @keyframes rcgFlash  { 0% { opacity: 0 } 100% { opacity: 1 } }
        }
      `}</style>
    </div>
  );
};

export default RecognitionText;
