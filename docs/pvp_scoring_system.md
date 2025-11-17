# Brain Heist PvP Scoring System

A lightweight scoring model that layers a **PvP Score** on top of existing XP to produce a **Total Score** per player and a **Clan Score** per clan. The design fits Google Sheets, Supabase, or any small relational store.

## Core formulas
- **PvP Score gain**: win = +3, loss = +1 (always award participation).
- **Total Score** (per player): `total_score = xp + (pvp_score * 10)`.
- **Clan Score**: sum of member `total_score` values for non-admin players in the clan.

## Data model
### Players (existing `profiles` / `users` table)
Add a PvP score column and a computed total score:
- `pvp_score INTEGER NOT NULL DEFAULT 0`
- `total_score_generated` (virtual/computed column, view, or calculated cell): `xp + (pvp_score * 10)`

### Clans (`clans` table)
- `id`, `name`, `leader_id`, `is_admin_clan` (optional flag for teacher/admin groups)

### Clan membership (`clan_members` table)
- `clan_id`, `player_id`, `role ENUM('member', 'leader', 'admin')`, `joined_at`

### Leaderboard view (SQL or sheet formula)
- `clan_scores` view that joins `clan_members` → `profiles`, filters out `role = 'admin'`, groups by `clan_id`, and sums `total_score_generated` as `clan_score`.

## Game loop logic
1. **Battle resolution**
   - On PvP win: increment `pvp_score` by 3.
   - On PvP loss: increment `pvp_score` by 1.
   - Update happens in the same transaction / sheet row edit as the PvP result insert.

2. **Score recalculation**
   - `total_score` is derived, so it updates automatically after each PvP score change or XP gain.
   - Clan leaderboards recalc by summing member totals (excluding admins) whenever fetched.

3. **Leaderboards**
   - Player leaderboard ordered by `total_score` desc, tie-breakers: higher `pvp_score`, then most recent activity.
   - Clan leaderboard ordered by `clan_score` desc, tie-breakers: highest average `total_score` per active member, then recent activity.

## Implementation notes by platform
- **Google Sheets**: add columns `PVP_SCORE`, `TOTAL_SCORE` with formula `=[@XP] + ([@PVP_SCORE] * 10)`. Clan sheet uses `SUMIFS` on member rows excluding admins.
- **Supabase / Postgres**:
  - Migration: `ALTER TABLE profiles ADD COLUMN pvp_score INTEGER NOT NULL DEFAULT 0;`
  - View: `CREATE OR REPLACE VIEW clan_scores AS SELECT clan_id, SUM(xp + (pvp_score * 10)) AS clan_score FROM clan_members cm JOIN profiles p ON p.id = cm.player_id WHERE cm.role != 'admin' GROUP BY clan_id;`
  - Triggers/RPC: update `pvp_score` inside existing PvP battle RPC (win → +3, loss → +1).
- **Small game DB**: same fields; calculate totals on read if you prefer to keep `total_score` virtual.

## Optional fairness & motivation tweaks
- **Daily cap**: limit PvP score gain per day to prevent farming (e.g., max +30/day).
- **Decay**: slowly reduce PvP score after inactivity (e.g., -2/week of no PvP) to keep ladders fresh.
- **Streak bonuses**: +1 extra PvP score for win streak milestones (3+, 5+, 10+ wins).
- **Matchmaking bands**: pair players with similar `total_score` to keep battles fair.
- **Shielded roles**: keep teachers/admins out of leaderboards by filtering `role = 'admin'` in the clan membership join.
- **Season resets**: optional seasonal PvP score reset with cosmetic badges that persist across seasons.

## Minimal event payload (for RPC/API)
```json
{
  "battle_id": "uuid",
  "attacker_id": "uuid",
  "defender_id": "uuid",
  "result": "win" | "loss",
  "xp_delta": 100,
  "pvp_score_delta": 3,
  "coins_delta": 150
}
```
- `pvp_score_delta` is 3 for wins, 1 for losses; compute server-side to avoid tampering.
- After each battle, return updated `pvp_score`, `total_score`, and `clan_score` (if needed) so the UI can refresh in real time.

## Rollout checklist
1. Add `pvp_score` column and leaderboard view.
2. Update PvP resolve logic to apply the +3 / +1 increments.
3. Expose `total_score` and `clan_score` in the player/clan APIs and UI leaderboards.
4. (Optional) enable caps, decay, and streaks for live ops tuning.
