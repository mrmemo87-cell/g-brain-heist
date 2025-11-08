import React, { useState } from 'react';

interface HelpModalProps {
  onClose: () => void;
}

type HelpSection = 
  | 'overview'
  | 'quests'
  | 'pvp'
  | 'clans'
  | 'shop'
  | 'achievements'
  | 'ap'
  | 'xp'
  | 'coins';

const HelpModal: React.FC<HelpModalProps> = ({ onClose }) => {
  const [activeSection, setActiveSection] = useState<HelpSection>('overview');

  const sections: { id: HelpSection; icon: string; title: string }[] = [
    { id: 'overview', icon: '📖', title: 'Game Overview' },
    { id: 'quests', icon: '🧠', title: 'Quests & Questions' },
    { id: 'pvp', icon: '⚔️', title: 'PvP Raids' },
    { id: 'clans', icon: '🏰', title: 'Clans' },
    { id: 'shop', icon: '🛒', title: 'Shop & Items' },
    { id: 'achievements', icon: '🏆', title: 'Achievements' },
    { id: 'ap', icon: '⚡', title: 'Action Points (AP)' },
    { id: 'xp', icon: '✨', title: 'XP & Leveling' },
    { id: 'coins', icon: '🪙', title: 'Coins & Economy' },
  ];

  const content: Record<HelpSection, React.ReactElement> = {
    overview: (
      <div className="space-y-3 sm:space-y-4">
        <h2 className="text-xl sm:text-2xl font-bold text-cyan-400">🎮 Game Overview</h2>
        <div className="space-y-2 sm:space-y-3 text-sm sm:text-base text-gray-300">
          <p><strong className="text-white">Welcome to G-Brains Heist!</strong> An educational adventure where you compete with classmates while learning.</p>
          
          <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3 sm:p-4">
            <h3 className="text-base sm:text-lg font-bold text-purple-400 mb-2">🎯 Main Goals</h3>
            <ul className="list-disc list-inside space-y-1 text-sm sm:text-base">
              <li>Answer questions to earn <strong>XP</strong> and <strong>Coins</strong></li>
              <li>Level up and climb the <strong>Leaderboard</strong></li>
              <li>Join or create a <strong>Clan</strong> with friends</li>
              <li>Raid other players in <strong>PvP</strong> battles</li>
              <li>Unlock <strong>Achievements</strong> and rewards</li>
            </ul>
          </div>

          <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-3 sm:p-4">
            <h3 className="text-base sm:text-lg font-bold text-cyan-400 mb-2">📊 Your Stats</h3>
            <ul className="list-disc list-inside space-y-1 text-sm sm:text-base">
              <li><strong>Level:</strong> Your overall progress (gain from XP)</li>
              <li><strong>XP:</strong> Experience points for answering questions</li>
              <li><strong>Coins:</strong> Currency for shop items and upgrades</li>
              <li><strong>AP:</strong> Action Points needed for raids (regenerates)</li>
              <li><strong>Streak:</strong> Consecutive days logged in</li>
              <li><strong>Attack/Defense:</strong> Combat stats for PvP</li>
            </ul>
          </div>
        </div>
      </div>
    ),

    quests: (
      <div className="space-y-3 sm:space-y-4">
        <h2 className="text-xl sm:text-2xl font-bold text-cyan-400">🧠 Quests & Questions</h2>
        <div className="space-y-2 sm:space-y-3 text-sm sm:text-base text-gray-300">
          
          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 sm:p-4">
            <h3 className="text-base sm:text-lg font-bold text-green-400 mb-2">📚 Two Quest Modes</h3>
            <div className="space-y-2 sm:space-y-3 text-sm sm:text-base">
              <div>
                <p className="font-semibold text-white">Practice Mode</p>
                <p>• General questions on various subjects</p>
                <p>• Good for learning and earning XP</p>
                <p>• Always available</p>
              </div>
              <div>
                <p className="font-semibold text-white">Teacher Mode</p>
                <p>• Questions created by your teachers</p>
                <p>• Curriculum-based content</p>
                <p>• Subjects: Maths, Science, English, Russian, Kyrgyz, German, Geography, Global Perspective, ICT</p>
              </div>
            </div>
          </div>

          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 sm:p-4">
            <h3 className="text-base sm:text-lg font-bold text-blue-400 mb-2">💡 How It Works</h3>
            <ol className="list-decimal list-inside space-y-2">
              <li>Choose a quest mode (Practice or Teacher)</li>
              <li>Select a subject you want to learn</li>
              <li>Answer 5 questions in the quiz</li>
              <li>Get instant feedback on each answer</li>
              <li>Earn XP, Coins, and track your score</li>
            </ol>
          </div>

          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 sm:p-4">
            <h3 className="text-base sm:text-lg font-bold text-yellow-400 mb-2">🎁 Rewards</h3>
            <p>✅ <strong>Correct Answer:</strong> +20 XP, +30 Coins (varies by question)</p>
            <p>❌ <strong>Wrong Answer:</strong> -5 XP, learn from explanation</p>
            <p>📈 <strong>Complete Quest:</strong> Progress on daily/weekly tasks</p>
          </div>
        </div>
      </div>
    ),

    pvp: (
      <div className="space-y-3 sm:space-y-4">
        <h2 className="text-xl sm:text-2xl font-bold text-red-400">⚔️ PvP Raids</h2>
        <div className="space-y-2 sm:space-y-3 text-sm sm:text-base text-gray-300">
          
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 sm:p-4">
            <h3 className="text-base sm:text-lg font-bold text-red-400 mb-2">🎯 What is PvP?</h3>
            <p>Player vs Player battles where you raid other students to steal their coins!</p>
            <p className="mt-2"><strong>Costs:</strong> 3 AP per raid attempt</p>
            <p><strong>Cooldown:</strong> 30 minutes between raids on same target</p>
          </div>

          <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3 sm:p-4">
            <h3 className="text-base sm:text-lg font-bold text-orange-400 mb-2">⚡ How to Raid</h3>
            <ol className="list-decimal list-inside space-y-2">
              <li>Go to PvP Raids section</li>
              <li>Choose a target (check their level and coins)</li>
              <li>Spend 3 AP to launch the raid</li>
              <li>Win chance based on your Attack vs their Defense</li>
              <li>Steal coins if you win, or get blocked if they defend!</li>
            </ol>
          </div>

          <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3 sm:p-4">
            <h3 className="text-base sm:text-lg font-bold text-purple-400 mb-2">🛡️ Defense</h3>
            <p><strong>Shield Items:</strong> Buy from shop to protect yourself</p>
            <p><strong>Defense Power:</strong> Higher defense = better chance to block raids</p>
            <p><strong>Clan Protection:</strong> Being in a clan makes you harder to raid</p>
          </div>

          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 sm:p-4">
            <h3 className="text-base sm:text-lg font-bold text-green-400 mb-2">💰 Loot</h3>
            <p>• Win: Steal 10-20% of target's coins + earn XP</p>
            <p>• Loss: Lose 50 coins penalty</p>
            <p>• Blocked: Target keeps everything, you lose AP</p>
          </div>
        </div>
      </div>
    ),

    clans: (
      <div className="space-y-3 sm:space-y-4">
        <h2 className="text-xl sm:text-2xl font-bold text-purple-400">🏰 Clans</h2>
        <div className="space-y-2 sm:space-y-3 text-sm sm:text-base text-gray-300">
          
          <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3 sm:p-4">
            <h3 className="text-base sm:text-lg font-bold text-purple-400 mb-2">🤝 Why Join a Clan?</h3>
            <ul className="list-disc list-inside space-y-2">
              <li><strong>Team Power:</strong> Share resources with clanmates</li>
              <li><strong>Clan Vault:</strong> Pool coins together for clan upgrades</li>
              <li><strong>Private Chat:</strong> Communicate with your team</li>
              <li><strong>Social Fun:</strong> Make friends and compete together</li>
              <li><strong>Identity:</strong> Show off your clan tag</li>
              <li><strong>Protection:</strong> Clan members help defend each other</li>
            </ul>
          </div>

          <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-3 sm:p-4">
            <h3 className="text-base sm:text-lg font-bold text-cyan-400 mb-2">👥 Clan Roles</h3>
            <p><strong>🔷 Leader:</strong> Creates and manages the clan</p>
            <p><strong>🔶 Officer:</strong> Helps manage members and vault</p>
            <p><strong>🔹 Member:</strong> Regular clan participant</p>
          </div>

          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 sm:p-4">
            <h3 className="text-base sm:text-lg font-bold text-blue-400 mb-2">🎯 How to Join/Create</h3>
            <p><strong>Create Clan:</strong> Costs 5,000 coins - choose a unique name</p>
            <p><strong>Join Clan:</strong> Search for clans and request to join</p>
            <p><strong>Leave Clan:</strong> Can leave anytime (leader transfers ownership)</p>
          </div>

          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 sm:p-4">
            <h3 className="text-base sm:text-lg font-bold text-green-400 mb-2">💎 Clan Vault</h3>
            <p>• Members can donate coins to clan vault</p>
            <p>• Used for future clan upgrades and bonuses</p>
            <p>• Shows clan's collective wealth</p>
          </div>
        </div>
      </div>
    ),

    shop: (
      <div className="space-y-3 sm:space-y-4">
        <h2 className="text-xl sm:text-2xl font-bold text-amber-400">🛒 Shop & Items</h2>
        <div className="space-y-2 sm:space-y-3 text-sm sm:text-base text-gray-300">
          
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 sm:p-4">
            <h3 className="text-base sm:text-lg font-bold text-amber-400 mb-2">🛍️ What Can I Buy?</h3>
            <p>Spend your hard-earned coins on powerful items!</p>
          </div>

          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 sm:p-4">
            <h3 className="text-base sm:text-lg font-bold text-blue-400 mb-2">🔵 Item Types</h3>
            <div className="space-y-2 sm:space-y-3 text-sm sm:text-base">
              <div>
                <p className="font-semibold text-white">⚡ XP Boosters</p>
                <p>• Doubles XP gains for 30 minutes</p>
                <p>• Use before quests for maximum benefit</p>
                <p>• One per day limit</p>
              </div>
              <div>
                <p className="font-semibold text-white">🛡️ Shields</p>
                <p>• Protects you from PvP raids</p>
                <p>• Various durations available</p>
                <p>• Peace of mind while you focus on learning</p>
              </div>
              <div>
                <p className="font-semibold text-white">⚔️ Attack Boosts</p>
                <p>• Increases raid success chance</p>
                <p>• Temporary or permanent upgrades</p>
              </div>
              <div>
                <p className="font-semibold text-white">🔰 Defense Boosts</p>
                <p>• Improves chance to block raids</p>
                <p>• Stack with shields for best protection</p>
              </div>
            </div>
          </div>

          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 sm:p-4">
            <h3 className="text-base sm:text-lg font-bold text-green-400 mb-2">💡 Smart Shopping Tips</h3>
            <ul className="list-disc list-inside space-y-1">
              <li>Save coins for strategic purchases</li>
              <li>Use XP boosters before big quest sessions</li>
              <li>Buy shields when you have lots of coins</li>
              <li>Permanent upgrades give best long-term value</li>
            </ul>
          </div>
        </div>
      </div>
    ),

    achievements: (
      <div className="space-y-3 sm:space-y-4">
        <h2 className="text-xl sm:text-2xl font-bold text-yellow-400">🏆 Achievements</h2>
        <div className="space-y-2 sm:space-y-3 text-sm sm:text-base text-gray-300">
          
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 sm:p-4">
            <h3 className="text-base sm:text-lg font-bold text-yellow-400 mb-2">🎯 What Are Achievements?</h3>
            <p>Special milestones and challenges that reward you for accomplishments!</p>
            <p className="mt-2">Earn badges, XP, coins, and exclusive rewards.</p>
          </div>

          <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3 sm:p-4">
            <h3 className="text-base sm:text-lg font-bold text-purple-400 mb-2">🌟 Achievement Categories</h3>
            <div className="space-y-2">
              <p><strong>🧠 Scholar:</strong> Complete quests and answer questions</p>
              <p><strong>⚔️ Warrior:</strong> Win PvP raids and battles</p>
              <p><strong>🏰 Social:</strong> Join clans and interact with others</p>
              <p><strong>💰 Collector:</strong> Earn coins and buy items</p>
              <p><strong>📈 Progression:</strong> Reach certain levels and milestones</p>
              <p><strong>🔥 Streak:</strong> Maintain daily login streaks</p>
            </div>
          </div>

          <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-3 sm:p-4">
            <h3 className="text-base sm:text-lg font-bold text-cyan-400 mb-2">🎁 Rewards</h3>
            <p>• Bonus XP and Coins</p>
            <p>• Exclusive titles and badges</p>
            <p>• Special items and bonuses</p>
            <p>• Bragging rights!</p>
          </div>

          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 sm:p-4">
            <h3 className="text-base sm:text-lg font-bold text-green-400 mb-2">📊 Track Progress</h3>
            <p>Check the Achievements page to see:</p>
            <ul className="list-disc list-inside mt-2">
              <li>Which achievements you've unlocked</li>
              <li>Progress toward locked achievements</li>
              <li>Total achievement score</li>
            </ul>
          </div>
        </div>
      </div>
    ),

    ap: (
      <div className="space-y-3 sm:space-y-4">
        <h2 className="text-xl sm:text-2xl font-bold text-teal-400">⚡ Action Points (AP)</h2>
        <div className="space-y-2 sm:space-y-3 text-sm sm:text-base text-gray-300">
          
          <div className="bg-teal-500/10 border border-teal-500/30 rounded-lg p-3 sm:p-4">
            <h3 className="text-base sm:text-lg font-bold text-teal-400 mb-2">❓ What is AP?</h3>
            <p><strong>Action Points</strong> are energy you need to perform PvP raids.</p>
            <p className="mt-2">Think of it as your "stamina" for attacking other players.</p>
          </div>

          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 sm:p-4">
            <h3 className="text-base sm:text-lg font-bold text-blue-400 mb-2">⚙️ How It Works</h3>
            <ul className="list-disc list-inside space-y-2">
              <li><strong>Starting AP:</strong> 18/20 when you join</li>
              <li><strong>Raid Cost:</strong> 3 AP per raid attempt</li>
              <li><strong>Regeneration:</strong> +1 AP every 10 minutes</li>
              <li><strong>Maximum:</strong> 20 AP (can't go higher)</li>
            </ul>
          </div>

          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 sm:p-4">
            <h3 className="text-base sm:text-lg font-bold text-green-400 mb-2">♻️ Regeneration</h3>
            <p>AP regenerates automatically over time:</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Fully regenerates from 0 to 20 in ~3.5 hours</li>
              <li>Watch the countdown timer on your profile</li>
              <li>No need to do anything - it's automatic!</li>
              <li>Refreshes even when you're offline</li>
            </ul>
          </div>

          <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3 sm:p-4">
            <h3 className="text-base sm:text-lg font-bold text-purple-400 mb-2">💡 Pro Tips</h3>
            <ul className="list-disc list-inside space-y-1">
              <li>Don't let AP sit at max - use it or lose it!</li>
              <li>Plan raids when you have enough AP</li>
              <li>Save some AP for defense opportunities</li>
              <li>Check timer to know when you'll be ready</li>
            </ul>
          </div>
        </div>
      </div>
    ),

    xp: (
      <div className="space-y-3 sm:space-y-4">
        <h2 className="text-xl sm:text-2xl font-bold text-blue-400">✨ XP & Leveling</h2>
        <div className="space-y-2 sm:space-y-3 text-sm sm:text-base text-gray-300">
          
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 sm:p-4">
            <h3 className="text-base sm:text-lg font-bold text-blue-400 mb-2">📊 What is XP?</h3>
            <p><strong>Experience Points (XP)</strong> measure your learning progress.</p>
            <p className="mt-2">Earn XP by answering questions correctly and completing quests.</p>
          </div>

          <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-3 sm:p-4">
            <h3 className="text-base sm:text-lg font-bold text-cyan-400 mb-2">⬆️ Leveling Up</h3>
            <p><strong>How it works:</strong></p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Accumulate XP to reach next level</li>
              <li>Each level requires more XP than the last</li>
              <li>Level 1→2: 100 XP</li>
              <li>Level 2→3: ~283 XP</li>
              <li>Formula: 100 × (level + 1)^1.5</li>
            </ul>
          </div>

          <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3 sm:p-4">
            <h3 className="text-base sm:text-lg font-bold text-purple-400 mb-2">🎁 Level Up Rewards</h3>
            <p>Every time you level up, you get:</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Bonus XP based on new level</li>
              <li>Bonus coins</li>
              <li>Achievement progress</li>
              <li>News feed announcement</li>
              <li>Increased stats and abilities</li>
            </ul>
          </div>

          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 sm:p-4">
            <h3 className="text-base sm:text-lg font-bold text-green-400 mb-2">💡 Earning XP</h3>
            <div className="space-y-2">
              <p><strong>Quests:</strong> +10-30 XP per correct answer</p>
              <p><strong>PvP Wins:</strong> +50 XP</p>
              <p><strong>Daily Tasks:</strong> Bonus XP for completing</p>
              <p><strong>XP Boosters:</strong> Double XP for 30 minutes!</p>
              <p className="mt-3 text-yellow-400">⚠️ Wrong answers: -5 XP (learn from mistakes!)</p>
            </div>
          </div>

          <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3 sm:p-4">
            <h3 className="text-base sm:text-lg font-bold text-orange-400 mb-2">📈 Daily/Weekly Caps</h3>
            <p>To keep the game fair, there are limits:</p>
            <ul className="list-disc list-inside mt-2">
              <li><strong>Daily XP Cap:</strong> 500 XP per day</li>
              <li><strong>Weekly XP Cap:</strong> 2,000 XP per week</li>
              <li>Prevents grinding - encourages steady learning</li>
              <li>Resets automatically</li>
            </ul>
          </div>
        </div>
      </div>
    ),

    coins: (
      <div className="space-y-3 sm:space-y-4">
        <h2 className="text-xl sm:text-2xl font-bold text-amber-400">🪙 Coins & Economy</h2>
        <div className="space-y-2 sm:space-y-3 text-sm sm:text-base text-gray-300">
          
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 sm:p-4">
            <h3 className="text-base sm:text-lg font-bold text-amber-400 mb-2">💰 What Are Coins?</h3>
            <p><strong>Coins</strong> are the in-game currency used to buy items and upgrades.</p>
            <p className="mt-2">Earn them through quests, PvP, and achievements!</p>
          </div>

          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 sm:p-4">
            <h3 className="text-base sm:text-lg font-bold text-green-400 mb-2">💸 Earning Coins</h3>
            <div className="space-y-2">
              <p><strong>✅ Correct Answers:</strong> +15-45 coins per question</p>
              <p><strong>⚔️ PvP Wins:</strong> Steal 10-20% of target's coins</p>
              <p><strong>📋 Daily Tasks:</strong> Bonus coins for completion</p>
              <p><strong>🏆 Achievements:</strong> One-time coin rewards</p>
              <p><strong>⬆️ Level Up:</strong> Bonus coins each level</p>
            </div>
          </div>

          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 sm:p-4">
            <h3 className="text-base sm:text-lg font-bold text-red-400 mb-2">💸 Spending Coins</h3>
            <div className="space-y-2">
              <p><strong>🛒 Shop Items:</strong> Boosters, shields, upgrades</p>
              <p><strong>🏰 Create Clan:</strong> 5,000 coins to start</p>
              <p><strong>💎 Clan Vault:</strong> Donate to your clan</p>
              <p><strong>⚡ Premium Items:</strong> Special shop purchases</p>
            </div>
          </div>

          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 sm:p-4">
            <h3 className="text-base sm:text-lg font-bold text-yellow-400 mb-2">⚠️ Losing Coins</h3>
            <p>Be careful - you can lose coins through:</p>
            <ul className="list-disc list-inside mt-2">
              <li><strong>PvP Raids:</strong> Others can steal from you!</li>
              <li><strong>Failed Raids:</strong> -50 coins penalty</li>
              <li><strong>Shop Purchases:</strong> Spending on items</li>
            </ul>
            <p className="mt-3 text-cyan-400">💡 <strong>Tip:</strong> Buy a shield when you have lots of coins to protect them!</p>
          </div>

          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 sm:p-4">
            <h3 className="text-base sm:text-lg font-bold text-blue-400 mb-2">📊 Daily/Weekly Caps</h3>
            <ul className="list-disc list-inside">
              <li><strong>Daily Coin Cap:</strong> 300 coins per day</li>
              <li><strong>Weekly Coin Cap:</strong> 1,000 coins per week</li>
              <li>Encourages balanced gameplay</li>
              <li>Resets automatically</li>
            </ul>
          </div>
        </div>
      </div>
    ),
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-2 sm:p-4">
      <div className="bg-gray-900 border-2 border-cyan-500/50 rounded-2xl w-full max-w-5xl max-h-[95vh] sm:max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-700">
          <h1 className="text-xl sm:text-3xl font-bold font-heading text-cyan-400">📚 Help & Guide</h1>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors text-xl sm:text-2xl"
          >
            ✕
          </button>
        </div>

        {/* Mobile: Dropdown Navigation */}
        <div className="block lg:hidden p-4 border-b border-gray-700 bg-black/20">
          <select
            value={activeSection}
            onChange={(e) => setActiveSection(e.target.value as HelpSection)}
            className="w-full bg-gray-800 border border-gray-600 text-white rounded-lg px-4 py-3 text-base focus:border-cyan-500 focus:outline-none"
          >
            {sections.map((section) => (
              <option key={section.id} value={section.id}>
                {section.icon} {section.title}
              </option>
            ))}
          </select>
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Desktop: Sidebar */}
          <div className="hidden lg:block w-64 border-r border-gray-700 overflow-y-auto p-4 bg-black/20">
            <div className="space-y-2">
              {sections.map((section) => (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={`w-full text-left px-4 py-3 rounded-lg transition-all ${
                    activeSection === section.id
                      ? 'bg-cyan-500/20 border border-cyan-500/50 text-cyan-400'
                      : 'bg-gray-800/50 border border-gray-700 text-gray-300 hover:bg-gray-700/50'
                  }`}
                >
                  <span className="mr-2">{section.icon}</span>
                  <span className="font-semibold">{section.title}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            {content[activeSection]}
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 sm:p-4 border-t border-gray-700 bg-black/20 text-center">
          <p className="text-xs sm:text-sm text-gray-400">
            Still have questions? Ask your teacher or check with classmates in your clan! 💬
          </p>
        </div>
      </div>
    </div>
  );
};

export default HelpModal;


