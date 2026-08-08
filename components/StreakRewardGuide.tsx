import React from 'react';

export const STREAK_REWARD_TIERS = [
  { label: 'Every day', detail: 'Your daily drop', coins: 100, icon: '⚡', tone: 'cyan' },
  { label: 'Every 3rd day', detail: 'Momentum bonus', coins: 250, icon: '🔥', tone: 'orange' },
  { label: 'Every 7th day', detail: 'Weekly jackpot', coins: 500, icon: '🛡️', tone: 'blue' },
  { label: 'Every 14th day', detail: 'Elite loyalty drop', coins: 1000, icon: '💎', tone: 'purple' },
  { label: 'Every 30th day', detail: 'Legendary vault', coins: 2500, icon: '👑', tone: 'amber' },
] as const;

const tierClasses: Record<(typeof STREAK_REWARD_TIERS)[number]['tone'], string> = {
  cyan: 'border-cyan-400/40 bg-cyan-400/10 shadow-cyan-500/10',
  orange: 'border-orange-400/40 bg-orange-400/10 shadow-orange-500/10',
  blue: 'border-blue-400/40 bg-blue-400/10 shadow-blue-500/10',
  purple: 'border-fuchsia-400/40 bg-fuchsia-400/10 shadow-fuchsia-500/10',
  amber: 'border-amber-300/60 bg-amber-400/15 shadow-amber-500/20',
};

interface StreakRewardGuideProps {
  currentStreak?: number;
}

const StreakRewardGuide: React.FC<StreakRewardGuideProps> = ({ currentStreak }) => (
  <div className="space-y-5 text-gray-200">
    <div className="relative overflow-hidden rounded-2xl border border-orange-400/40 bg-gradient-to-br from-orange-500/20 via-fuchsia-500/10 to-cyan-500/10 p-5 sm:p-6">
      <div className="pointer-events-none absolute -right-8 -top-10 text-9xl opacity-10" aria-hidden="true">🔥</div>
      <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-300">Daily streak protocol</p>
      <h2 className="mt-2 font-heading text-2xl text-white sm:text-3xl">Show up. Build heat. Bank coins.</h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
        Open Brain Heist on consecutive days and the vault pays you automatically. Longer streaks unlock much bigger drops.
      </p>
      {typeof currentStreak === 'number' && (
        <div className="mt-4 inline-flex items-center gap-3 rounded-xl border border-orange-300/30 bg-black/30 px-4 py-3">
          <span className="text-2xl" aria-hidden="true">🔥</span>
          <span><strong className="block text-xl text-white">Day {currentStreak}</strong><small className="text-orange-200">Your live streak</small></span>
        </div>
      )}
    </div>

    <section>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-300">Reward ladder</p>
          <h3 className="mt-1 font-heading text-xl text-white">The hotter the streak, the bigger the haul</h3>
        </div>
        <span className="rounded-full border border-amber-300/30 bg-amber-400/10 px-3 py-1 text-xs font-bold text-amber-200">10× boosted</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {STREAK_REWARD_TIERS.map((tier) => (
          <article key={tier.label} className={`rounded-xl border p-4 shadow-lg ${tierClasses[tier.tone]}`}>
            <div className="text-2xl" aria-hidden="true">{tier.icon}</div>
            <p className="mt-3 text-xs font-bold uppercase tracking-wider text-slate-300">{tier.label}</p>
            <strong className="mt-1 block text-2xl text-white">{tier.coins.toLocaleString()}</strong>
            <span className="text-xs text-slate-400">coins · {tier.detail}</span>
          </article>
        ))}
      </div>
      <p className="mt-3 rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-xs leading-5 text-slate-400">
        Milestone rewards replace the normal daily drop for that day; they do not stack. If milestones overlap, the highest reward wins.
      </p>
    </section>

    <section className="grid gap-3 sm:grid-cols-3">
      {[
        ['1', 'Enter the game', 'Your reward is deposited automatically when Brain Heist records your first activity of the day.'],
        ['2', 'Protect the chain', 'Return on the next calendar day to increase your streak. One reward can be earned per day.'],
        ['3', 'Don’t go cold', 'Miss a full day and your next visit restarts the streak at Day 1.'],
      ].map(([step, title, copy]) => (
        <div key={step} className="rounded-xl border border-slate-700 bg-slate-900/70 p-4">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-cyan-400 font-black text-slate-950">{step}</span>
          <h4 className="mt-3 font-bold text-white">{title}</h4>
          <p className="mt-1 text-sm leading-5 text-slate-400">{copy}</p>
        </div>
      ))}
    </section>

    <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm leading-6 text-emerald-100">
      <strong>Secure by design:</strong> rewards use Bishkek calendar days and are saved by the game server. Refreshing, switching pages, or signing in again cannot duplicate a daily payout.
    </div>
  </div>
);

export default StreakRewardGuide;
