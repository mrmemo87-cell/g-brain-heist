# RPC & API Reference

Brains Heist relies on Supabase's RPC (stored procedure) interface so that gameplay logic executes inside Postgres with RLS enforcement. Call these endpoints with `supabase.rpc('<function>', params)` from the frontend or server-to-server scripts.

## Authentication & Headers
- All requests use the Supabase JS client instantiated in [`services/supabaseClient.ts`](../services/supabaseClient.ts).
- Authenticated sessions automatically attach the Supabase JWT. Functions that call `auth.uid()` (e.g., PvP hacks) must be invoked by logged-in users.

## Available RPC Functions
| Function | Parameters | Returns | Description |
| --- | --- | --- | --- |
| `rpc_hack_attempt(p_defender_id uuid)` | `p_defender_id` – UUID of target player. | JSON payload with `result_kind`, `xp_delta`, `coins_delta`, `coins_stolen_from_def`, `coins_lost_to_def`, `shield_blocks`, `win_chance`, etc. | Executes PvP battle logic: checks AP cost, defender cooldown, shield/cracker inventory, randomizes outcome, updates coins/XP, logs activities, and enforces attack cooldown (`last_attacked_at`). |
| `rpc_grant_levelup_rewards(p_new_level int)` | `p_new_level` – level the player just reached. | `{ coins: number, ap_refill: boolean, message: string }` | Grants 100 coins per level and refills AP. Called right after the frontend confirms a level-up. |
| `rpc_check_achievements(p_user_id uuid)` | `p_user_id` – target user (teachers can call for students; players can call for themselves). | Table result containing `newly_earned JSONB` array. | Evaluates each achievement's condition (`pvp_wins_count`, `total_xp`, etc.), inserts newly earned records, applies XP/coin rewards, and logs `achievement_earned` activities. |
| `calculate_current_ap(current_ap int, max_ap int, last_update timestamptz)` | Raw SQL function (not RPC) | `int` | Calculates regenerated AP without persisting changes (1 AP per 10 minutes in Asia/Bishkek timezone). Used via the `users_with_current_ap` view for dashboards. |
| `regenerate_user_ap(user_id uuid)` | `user_id_param` – UUID of the player. | Row with `new_ap`, `ap_regenerated`, `minutes_elapsed`. | Updates the `users` table with regenerated AP and refreshed `last_ap_update`. Can be called via scheduled cron or an admin panel. |

> Additional SQL modules in `supabase-functions/` (achievements, tournaments, notifications) follow the same pattern—register the function in SQL and expose it through Supabase RPC for reuse.

## Example Usage
```ts
import { supabase } from '../services/supabaseClient';

export async function launchHack(defenderId: string) {
  const { data, error } = await supabase.rpc('rpc_hack_attempt', { p_defender_id: defenderId });
  if (error) throw error; // Supabase surfaces PostgreSQL exceptions (e.g., AP shortage, cooldown)
  return data; // Contains result_kind, xp_delta, coins_delta, win_chance, etc.
}
```

```ts
export async function grantLevelRewards(level: number) {
  const { data } = await supabase.rpc('rpc_grant_levelup_rewards', { p_new_level: level });
  return data?.message;
}
```

```ts
export async function refreshAchievements(userId: string) {
  const { data } = await supabase.rpc('rpc_check_achievements', { p_user_id: userId });
  return data?.newly_earned ?? [];
}
```

## Error Handling Patterns
- RPC functions raise descriptive exceptions (`RAISE EXCEPTION 'Not enough AP'`) that propagate to the client. Wrap calls in try/catch to convert them into UI toasts.
- `rpc_event_log` can be populated by triggers or function-level inserts to capture telemetry (`log_level` column distinguishes info vs. error events).
- Always validate parameters on the frontend before invoking RPCs (e.g., ensure players cannot attack themselves before calling `rpc_hack_attempt`).

Document any new RPCs in this file as they are added so game logic remains transparent for future contributors.
