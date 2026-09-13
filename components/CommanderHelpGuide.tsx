import React from 'react';

const CommanderHelpGuide: React.FC = () => (
  <div className="space-y-3 sm:space-y-4">
    <div className="rounded-xl border border-violet-500/40 bg-gradient-to-br from-violet-500/15 via-fuchsia-500/10 to-cyan-500/10 p-4 sm:p-5">
      <p className="text-xs font-bold uppercase tracking-[0.22em] text-violet-300">Commander Field Manual</p>
      <h2 className="mt-1 text-xl font-black text-white sm:text-2xl">☠️ Cursed Commander</h2>
      <p className="mt-2 text-sm leading-6 text-gray-300 sm:text-base">
        Build your army, shape your Commander, and learn when to focus, strike, or defend. Practice battles are your lab: test ideas, read the battlefield, then refine your loadout.
      </p>
    </div>

    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-3 sm:p-4">
        <h3 className="mb-2 text-base font-bold text-cyan-300 sm:text-lg">🚀 Your first command</h3>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-gray-300 sm:text-base">
          <li>Open <strong className="text-white">Cursed Commander</strong> from your dashboard.</li>
          <li>Claim your <strong className="text-white">free starter squad</strong>.</li>
          <li>Your Commander fights with <strong className="text-white">one frontline unit</strong> and <strong className="text-white">one ranged unit</strong>.</li>
          <li>Enter <strong className="text-white">Practice</strong> to learn the battle flow with no battle cost.</li>
        </ol>
      </div>

      <div className="rounded-lg border border-fuchsia-500/30 bg-fuchsia-500/10 p-3 sm:p-4">
        <h3 className="mb-2 text-base font-bold text-fuchsia-300 sm:text-lg">🎮 Three Commander actions</h3>
        <div className="space-y-2 text-sm text-gray-300 sm:text-base">
          <p><strong className="text-cyan-300">Focus Target:</strong> lock onto an enemy so your squad concentrates fire there.</p>
          <p><strong className="text-violet-300">Death Bolt:</strong> launch a heavy strike; a focused target takes bonus damage.</p>
          <p><strong className="text-emerald-300">Guard:</strong> reinforce your Commander's shield without selecting a target.</p>
        </div>
      </div>
    </div>

    <div className="rounded-lg border border-slate-600/60 bg-slate-800/60 p-3 sm:p-4">
      <h3 className="mb-2 text-base font-bold text-white sm:text-lg">👁️ Read the battlefield like a Commander</h3>
      <div className="grid gap-2 text-sm sm:grid-cols-2 sm:text-base">
        <p className="rounded-md bg-black/20 p-2 text-gray-300"><strong className="text-rose-300">HP</strong> = health. At 0, that fighter is knocked out.</p>
        <p className="rounded-md bg-black/20 p-2 text-gray-300"><strong className="text-cyan-300">SH</strong> = shield. It absorbs damage before HP.</p>
        <p className="rounded-md bg-black/20 p-2 text-gray-300"><strong className="text-amber-300">ATK</strong> = unit attack power.</p>
        <p className="rounded-md bg-black/20 p-2 text-gray-300"><strong className="text-violet-300">BOLT</strong> = your Commander's Death Bolt power.</p>
      </div>
    </div>

    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 sm:p-4">
        <h3 className="mb-2 text-base font-bold text-blue-300 sm:text-lg">♜ Army + Armory</h3>
        <ul className="list-disc space-y-1 pl-5 text-sm text-gray-300 sm:text-base">
          <li><strong className="text-white">Army:</strong> choose one frontline unit and one ranged unit.</li>
          <li><strong className="text-white">Armory:</strong> equip one weapon and one shield.</li>
          <li>Buying an item adds it to your collection; you decide when to equip it.</li>
          <li>Changing equipment affects your next battle, not a battle already in progress.</li>
        </ul>
      </div>

      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 sm:p-4">
        <h3 className="mb-2 text-base font-bold text-amber-300 sm:text-lg">◈ Coins + progression</h3>
        <ul className="list-disc space-y-1 pl-5 text-sm text-gray-300 sm:text-base">
          <li>Commander purchases and training use your <strong className="text-white">shared Brains Heist Coins</strong>.</li>
          <li><strong className="text-white">Commander XP</strong> and Commander level are separate from your normal account XP.</li>
          <li>Pin a unit or item as a <strong className="text-white">goal</strong> to track how many Coins you still need.</li>
          <li>Your <strong className="text-white">Records</strong> show confirmed upgrades, deployments, and balance changes.</li>
        </ul>
      </div>
    </div>

    <div className="rounded-lg border border-purple-500/30 bg-purple-500/10 p-3 sm:p-4">
      <h3 className="mb-3 text-base font-bold text-purple-300 sm:text-lg">🧬 Training paths — choose your identity</h3>
      <p className="mb-3 text-sm text-gray-300 sm:text-base">
        Training is permanent for your current expedition, so spend with a plan.
      </p>
      <div className="grid gap-2 text-sm sm:grid-cols-2 sm:text-base">
        <div className="rounded-md border border-fuchsia-500/20 bg-black/20 p-3">
          <strong className="text-fuchsia-300">ϟ Force</strong>
          <p className="mt-1 text-gray-300">Each rank gives +2 Death Bolt damage and +1 Focus damage.</p>
        </div>
        <div className="rounded-md border border-cyan-500/20 bg-black/20 p-3">
          <strong className="text-cyan-300">⬡ Defense</strong>
          <p className="mt-1 text-gray-300">Each rank improves starting shield, Guard strength, and shield capacity by +2.</p>
        </div>
        <div className="rounded-md border border-amber-500/20 bg-black/20 p-3">
          <strong className="text-amber-300">⌁ Dexterity</strong>
          <p className="mt-1 text-gray-300">Each rank gives +1 attack to every deployed unit.</p>
        </div>
        <div className="rounded-md border border-emerald-500/20 bg-black/20 p-3">
          <strong className="text-emerald-300">✧ Stamina</strong>
          <p className="mt-1 text-gray-300">Each rank gives your Commander +6 health.</p>
        </div>
      </div>
    </div>

    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 sm:p-4">
      <h3 className="mb-2 text-base font-bold text-emerald-300 sm:text-lg">🧠 Build ideas</h3>
      <div className="space-y-2 text-sm text-gray-300 sm:text-base">
        <p><strong className="text-white">The Fortress:</strong> lean into Defense + Stamina if you want to survive longer and protect your Commander.</p>
        <p><strong className="text-white">The Executioner:</strong> lean into Force + Dexterity if you want pressure and faster knockouts.</p>
        <p><strong className="text-white">The Tactician:</strong> spread ranks across all four stats for a flexible squad that can switch plans mid-fight.</p>
      </div>
    </div>

    <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 sm:p-4">
      <h3 className="mb-2 text-base font-bold text-red-300 sm:text-lg">⚔️ Simple battle plan</h3>
      <ol className="list-decimal space-y-1 pl-5 text-sm text-gray-300 sm:text-base">
        <li>Pick the enemy that matters most.</li>
        <li><strong className="text-white">Focus Target</strong> to concentrate your squad.</li>
        <li>Use <strong className="text-white">Death Bolt</strong> when you want a heavy hit on that focused enemy.</li>
        <li>Use <strong className="text-white">Guard</strong> when your Commander's shield needs help.</li>
        <li>Watch HP and SH every turn, then change your plan instead of repeating the same move blindly.</li>
      </ol>
    </div>

    <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 sm:p-4">
      <h3 className="mb-2 text-base font-bold text-yellow-300 sm:text-lg">🛡️ Practice safely</h3>
      <p className="text-sm leading-6 text-gray-300 sm:text-base">
        Practice uses your equipped army, costs no battle resources, and has no ranked losses. A practice win, defeat, or draw does not change your live progress, so experiment with builds before committing more Coins to training or gear.
      </p>
    </div>

    <div className="rounded-xl border border-violet-400/40 bg-violet-400/10 p-4 text-center">
      <p className="font-bold text-violet-200">Commander rule #1</p>
      <p className="mt-1 text-sm text-gray-300 sm:text-base">Don't build the strongest-looking army. Build the army that matches the way you want to command.</p>
    </div>
  </div>
);

export default CommanderHelpGuide;
