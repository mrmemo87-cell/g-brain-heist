# Student Field Manual

Agents, welcome to Brains Heist. Read this guide to understand missions, progression, and how to read feedback during your heists.

## What Are Missions?
- **Solo Missions** are knowledge quests made of multiple-choice or short-answer tasks tied to school subjects.
- Each correct answer awards **XP** (experience) and **coins**; tougher questions deliver higher payouts.
- Missions can be story-driven (e.g., Silk Road operation) or teacher-created quest templates.
- Finish a mission to log a `quest_complete` activity, contribute to streaks, and unlock achievements.

### Mission Loop
1. **Briefing**: Pick a subject/topic from the map or teacher assignment.
2. **Engage**: Answer the set of questions before the timer expires.
3. **Debrief**: Review correct answers, hints, and explanations.
4. **Rewards**: Earn XP/coins, progress daily tasks, and move along the progress map.

## Progress Map & Labels
- The **progress map** displays your journey through chapters and highlights upcoming missions.
- Each node shows:
  - **Completion state** (locked, unlocked, cleared).
  - **Medal** tied to your best score.
  - **“Crushed / Average / Struggled”** label calculated from rolling accuracy:
    - `Crushed` → ≥85% accuracy across recent attempts.
    - `Average` → 60–84% accuracy.
    - `Struggled` → <60% accuracy. Replay missions, review hints, or ask your handler for remediation.
- Teachers use the same metrics to spot weak topics, so improving a mission updates both your map and their dashboards.

## Action Points (AP) & Streaks
- AP regenerates 1 point every 10 minutes (capped by your level). Spending AP happens mostly in PvP battles, but missions refill AP via level-up rewards.
- Daily streaks increase as long as you complete at least one mission per day; streak XP bonuses apply automatically.

## Battles & PvP Hacks
- PvP hacks let you duel classmates for coins and glory.
- **Costs**: Each hack consumes 2 AP. Make sure your AP bar is topped up.
- **Outcome**:
  - Attack power vs. defense power determines win chance. Shields add defense; crackers break shields.
  - Winning steals up to 30% of the defender’s coins (capped by their balance) and grants XP.
  - Losing costs coins and XP but teaches resilience.
  - Defender cooldown prevents spam attacks—if you’re attacked, you get a brief shield window.
- **Inventory**: Activate shields or boosters from your bag before hacking. Purchased items live in `inventory` until consumed.

## Scoring & Leaderboards
- **XP** drives your level; each level-up grants 100 coins and a full AP refill through the `rpc_grant_levelup_rewards` function.
- **Coins** buy inventory items (shields, crackers, boosters, cosmetics). Spending coins doesn’t reduce your leaderboard rank.
- **Achievements** grant bonus XP/coins for milestones (PvP wins, quests completed, coins earned). Use the Achievements panel to see what’s next.
- **Caps**: There’s a daily/weekly limit to how many XP/coins you can earn to keep competition fair. Once capped, focus on clan support or reviewing tough missions.

## Reading Feedback
- Mission recap uses color-coded chips and hints to show which subjects need more practice.
- PvP history shows when your shields blocked attacks or when you lost coins—use it to time your counter-hacks.
- Announcements in HQ inform you about new operations or clan wars—mark them as read so your handler knows you’re briefed.

Stay sharp, upgrade your loadout before major missions, and collaborate with your clan. Every mission you crush brings you closer to the top of the Brains Heist leaderboard.
