import React from 'react';

// Student-facing guide. Keep sentences short: many players read English as a second language.
const Card: React.FC<{ title: string; tone: string; children: React.ReactNode }> = ({ title, tone, children }) => (
  <div className={`rounded-lg border p-3 sm:p-4 ${tone}`}>
    <h3 className="mb-2 text-base font-bold text-white sm:text-lg">{title}</h3>
    <div className="space-y-1.5 text-sm leading-6 text-gray-300 sm:text-base">{children}</div>
  </div>
);

const CommanderHelpGuide: React.FC = () => (
  <div className="space-y-3 sm:space-y-4">
    <div className="rounded-xl border border-violet-500/40 bg-gradient-to-br from-violet-500/15 via-fuchsia-500/10 to-cyan-500/10 p-4 sm:p-5">
      <p className="text-xs font-bold uppercase tracking-[0.22em] text-violet-300">How to play</p>
      <h2 className="mt-1 text-xl font-black text-white sm:text-2xl">☠️ Cursed Commander</h2>
      <p className="mt-2 text-sm leading-6 text-gray-300 sm:text-base">
        You lead a small army: your Commander plus two fighters. Win battles to earn XP. Level up to unlock new ways to make your army stronger.
      </p>
    </div>

    <div className="grid gap-3 sm:grid-cols-2">
      <Card title="🚀 Start here" tone="border-cyan-500/30 bg-cyan-500/10">
        <ol className="list-decimal space-y-1 pl-5">
          <li>Tap <strong className="text-white">Get your free team</strong>.</li>
          <li>Play a <strong className="text-white">Practice battle</strong> against the computer. It is free.</li>
          <li>When you feel ready, try <strong className="text-white">Player Battles</strong> against other students' armies.</li>
        </ol>
      </Card>

      <Card title="⚔️ How a battle works" tone="border-fuchsia-500/30 bg-fuchsia-500/10">
        <ol className="list-decimal space-y-1 pl-5">
          <li>Tap an enemy to choose your target.</li>
          <li>Choose one move for your Commander.</li>
          <li>Your two fighters then attack by themselves. Then the enemy moves.</li>
        </ol>
        <p>Knock out the enemy Commander (or all enemies) to win. After 12 turns, the team with more health left wins.</p>
      </Card>
    </div>

    <Card title="🎮 Your moves" tone="border-white/10 bg-slate-900/60">
      <p><strong className="text-cyan-300">Focus Target:</strong> hit the enemy you chose. Your fighters attack it too.</p>
      <p><strong className="text-amber-300">Guard:</strong> add shield to your Commander. No enemy needed.</p>
      <p><strong className="text-violet-300">Death Bolt:</strong> a big hit on one enemy. Even stronger after Focus.</p>
      <p><strong className="text-cyan-300">Chain Surge</strong>, <strong className="text-lime-300">Rot Miasma</strong> and <strong className="text-emerald-300">Raise Dead</strong> are extra powers. You get them when a fighter of that magic type (Storm, Rot or Grave) is in your team.</p>
      <p><strong className="text-white">Powers need to recharge.</strong> All powers share one charge, so after you use one, wait a few turns. Focus and Guard are always ready.</p>
    </Card>

    <div className="grid gap-3 sm:grid-cols-2">
      <Card title="⭐ How to earn XP" tone="border-amber-500/30 bg-amber-500/10">
        <p>Open Headquarters once a day: <strong className="text-white">+100 XP</strong> (more on a login streak, up to +250).</p>
        <p>Win your first Practice battle each day: <strong className="text-white">+40 XP</strong>.</p>
        <p>Win a Player Battle: <strong className="text-white">+60 XP</strong> (up to 5 a day, each against a different player).</p>
        <p>You never lose XP or Coins when you lose a battle.</p>
      </Card>

      <Card title="🪙 Coins and Gemstones" tone="border-emerald-500/30 bg-emerald-500/10">
        <p><strong className="text-white">Coins</strong> are your normal Brains Heist Coins. Use them to buy fighters and gear, and to train.</p>
        <p><strong className="text-white">Gemstones</strong> buy Elixirs: a boost to one skill for 30 or 60 minutes.</p>
        <p>Pin an item as your <strong className="text-white">goal</strong> to see how many Coins you still need.</p>
      </Card>
    </div>

    <Card title="🔓 What you unlock" tone="border-blue-500/30 bg-blue-500/10">
      <p><strong className="text-white">From Level 1:</strong> train your Commander's Force, Defense, Dexterity and Stamina. Every new level raises the limit.</p>
      <p><strong className="text-white">Level 11:</strong> Unit Training makes each fighter stronger.</p>
      <p><strong className="text-white">Level 21:</strong> Evolution upgrades a fully trained fighter.</p>
      <p><strong className="text-white">Level 31:</strong> Mastery powers up your magic types.</p>
      <p><strong className="text-white">Level 41:</strong> Formations let you choose a team battle style.</p>
    </Card>

    <div className="rounded-xl border border-violet-400/40 bg-violet-400/10 p-4 text-center">
      <p className="font-bold text-violet-200">Top tip</p>
      <p className="mt-1 text-sm text-gray-300 sm:text-base">Use Focus on an enemy first, then hit it with Death Bolt. Use Guard when your Commander's health is low.</p>
    </div>
  </div>
);

export default CommanderHelpGuide;
