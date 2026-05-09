# Shop Cosmetic Effect Visibility Report

Date audited: 2026-05-09  
Scope: shop cosmetics that alter the player avatar after activation, especially where those cosmetics are visible to other players and how they layer when more than one cosmetic is active.

## Executive summary

The app currently supports three avatar cosmetics from the shop/inventory pipeline:

1. **Neon Frame** (`item_cosmetic_frame`) — stored on the profile as `active_cosmetic_frame = 'neon'`.
2. **Flicker / Glitch Theme** (`item_cosmetic_theme`) — stored on the profile as `active_cosmetic_theme = 'flicker'` by the current activation code, while legacy rows with `'glitch'` are still accepted during migration.
3. **Green Glitch Effect** (`item_cosmetic_glitch`) — stored on the profile as `active_cosmetic_effect = 'glitch'`.

Main findings:

- The reusable `AvatarWithFrame` component can render all three cosmetic flags on the same avatar by adding the related wrapper and image classes together.
- The CSS intentionally makes the **green glitch effect visually dominate** when paired with neon or flicker. In practice, neon/flicker can be technically active but mostly hidden underneath the green glitch styles.
- The player can see some effects in places that use the local `profile` object, but other players only see them where the view explicitly fetches cosmetic ownership and passes it into `AvatarWithFrame`.
- The previous **flicker/theme value mismatch** has been normalized: activation writes `active_cosmetic_theme = 'flicker'`, UI reads both `'flicker'` and legacy `'glitch'`, and multi-user fetches accept both values during migration.
- Header and settings-style avatar renderers do not consistently support all three effects. The top-right header supports neon or flicker, but not the green glitch effect, and it uses an either/or ternary instead of true layering.

## How activation stores each cosmetic

| Cosmetic | Inventory item id | Profile column | Activation value | Deactivation behavior |
|---|---:|---|---|---|
| Neon Frame | `item_cosmetic_frame` | `active_cosmetic_frame` | `neon` | Marks active inventory row consumed and clears `active_cosmetic_frame`. |
| Flicker / Glitch Theme | `item_cosmetic_theme` | `active_cosmetic_theme` | `flicker` | Marks active inventory row consumed and clears `active_cosmetic_theme`. |
| Green Glitch Effect | `item_cosmetic_glitch` | `active_cosmetic_effect` | `glitch` | Marks active inventory row consumed and clears `active_cosmetic_effect`. |

Cosmetics are permanent while active (`expires_at: null`). Deactivation is destructive/permanent from the user's perspective because the inventory row is changed to `consumed`.

## Visual behavior when activated separately

| Activated alone | Classes applied by `AvatarWithFrame` | Visible result | Notes |
|---|---|---|---|
| Neon Frame only | Wrapper: `neon-frame` plus size padding. Image: `neon-frame-avatar`. | Cyan/purple conic ring with glow around the circular avatar. | Stable glow, no corruption label. Most recognizable as the blue/pink halo shown around avatars. |
| Flicker / Glitch Theme only | Wrapper: `glitch-frame`. Image: `glitch-frame-avatar`. | Magenta/cyan animated digital flicker with scan-line overlay and RGB/hue shifting. | Despite the internal prop name `hasGlitchTheme`, this is the shop's flicker/theme cosmetic. |
| Green Glitch Effect only | Wrapper: `glitch-effect-frame`. Image: `glitch-effect-avatar`. | Green cyber glitch ring, rapid jitter, scan/noise animation, and an `ERROR` badge above the avatar. | This matches the screenshot where the profile card avatar has a green glow and red `ERROR` label. |

## Visual behavior when two cosmetics are paired

| Pair | Expected classes | Effective visible result | Dominance / caveat |
|---|---|---|---|
| Neon + Flicker | `neon-frame glitch-frame` and `neon-frame-avatar glitch-frame-avatar` | The flicker/glitch-theme magenta/cyan styling takes priority. | CSS explicitly says glitch takes priority. Neon may still contribute sizing/padding but its own conic ring is overridden by the flicker theme. |
| Neon + Green Glitch Effect | `neon-frame glitch-effect-frame` and `neon-frame-avatar glitch-effect-avatar` | The green glitch effect takes priority. | CSS overrides the neon frame with green gradient, green border, green glow, jitter, and noise. Neon is largely not visually distinct. |
| Flicker + Green Glitch Effect | `glitch-frame glitch-effect-frame` and `glitch-frame-avatar glitch-effect-avatar` | The green glitch effect takes priority. | CSS explicitly says glitch effect takes priority over flicker theme. The visible result is mostly green glitch + `ERROR`, not magenta/cyan flicker. |

## Visual behavior when all three are active together

When **Neon Frame + Flicker Theme + Green Glitch Effect** are all active, `AvatarWithFrame` can apply all three groups of classes at the same time:

- wrapper: `neon-frame glitch-frame glitch-effect-frame`
- image: `neon-frame-avatar glitch-frame-avatar glitch-effect-avatar`

The effective visible result is **mostly the Green Glitch Effect**:

- Green border and green glow win over neon and flicker.
- The `ERROR` badge is visible.
- The fast green jitter/noise animation is visible.
- Neon/flicker may only be detectable as minor inherited sizing, animation overlap, or occasional filter interaction, not as separately readable cosmetics.

Therefore, from a player's perspective, equipping all three does **not** currently create a balanced combined look. It reads as the green glitch effect replacing the others.

## Where effects are visible to other players

### Visible to other players when implemented through `AvatarWithFrame`

These surfaces explicitly pass cosmetic flags into `AvatarWithFrame`, so they can show other players' active effects if the data fetch returns the correct flags:

| Surface | Other players visible? | Evidence / behavior |
|---|---:|---|
| Leaderboard player rows | Yes | Leaderboard fetches cosmetic owner sets, decorates entries with active cosmetic fields, and renders `AvatarWithFrame` for each row. |
| Leaderboard clan-member modal | Yes | Clan member modal fetches cosmetics for member ids and renders `AvatarWithFrame`. |
| PvP target cards / selected target / member lists | Yes | PvP fetches cosmetic owner sets for member/target rows and renders `AvatarWithFrame` in target components. |
| Clan member lists | Yes | Clan data services fetch owner sets and map them into clan member rows; ClanView renders member avatars with `AvatarWithFrame`. |
| Public profile card / clicked username profile | Yes, for the profile card | Public profile loading fetches cosmetic owner sets for the selected user, and `PlayerProfileCard` renders `AvatarWithFrame`. |

### Visible mainly to the current user or only partially supported

| Surface | Current behavior | Visibility gap |
|---|---|---|
| Top-right header avatar | Uses local `profile`. Supports neon or flicker through a ternary. | Does **not** render the green glitch effect. Also does not layer neon + flicker because flicker wins the ternary. Other players do not see another user's header anyway. |
| Settings modal avatar / some account UI | Uses local profile and manual classes. | Focused on the current user's own account. Does not consistently use `AvatarWithFrame`, so pairing and green glitch support are inconsistent. |
| User profile modal mini avatar | Manual wrapper with neon-only check. | Flicker and green glitch are not represented there. |
| Any plain `<img>` avatar not using `AvatarWithFrame` | No automatic cosmetic support. | If a surface displays avatars with a raw image tag, effects will not appear unless it manually adds cosmetic classes. |

## Data-flow issue fixed for “visible to me but not everywhere to others”

The code previously had two different truths for flicker/theme:

- Activation writes `active_cosmetic_theme: 'flicker'`.
- UI render checks use `profile.active_cosmetic_theme === 'flicker'`.
- `fetchFlickerThemeOwners()` queried the `users` table for `active_cosmetic_theme = 'glitch'` only.

The fix makes `flicker` canonical, keeps legacy `glitch` theme rows readable, and keeps the separate green glitch effect tied only to `active_cosmetic_effect = 'glitch'`.

A migration is included to backfill legacy theme rows to `flicker` without touching `active_cosmetic_effect`.

## Surface-by-surface visibility matrix

| Surface | Neon | Flicker / Theme | Green Glitch Effect | Pairing / triple behavior |
|---|---:|---:|---:|---|
| Current user's profile card | Yes | Yes, accepts canonical and legacy theme values | Yes | Uses `AvatarWithFrame`; green glitch dominates combinations. |
| Clicked/public profile card | Yes | Yes, accepts canonical and legacy theme values | Yes | Uses `AvatarWithFrame`; green glitch dominates combinations. |
| Leaderboard rows | Yes | Yes, accepts canonical and legacy theme values | Yes | Uses `AvatarWithFrame`; green glitch dominates combinations. |
| Leaderboard clan-member modal | Yes | Yes, accepts canonical and legacy theme values | Yes | Uses `AvatarWithFrame`; green glitch dominates combinations. |
| PvP target/member avatars | Yes | Yes, accepts canonical and legacy theme values | Yes | Uses `AvatarWithFrame`; green glitch dominates combinations. |
| Clan member avatars | Yes | Yes, accepts canonical and legacy theme values | Yes | Uses `AvatarWithFrame`; green glitch dominates combinations. |
| Header top-right avatar | Yes | Yes for current user only | No | Ternary chooses flicker over neon; no green glitch handling. |
| Settings/account mini avatars | Partial | Partial/no | No/partial | Manual class handling; not guaranteed to match `AvatarWithFrame`. |
| Raw avatar images elsewhere | No | No | No | Must be migrated to `AvatarWithFrame` or manually decorated. |

## Recommended fixes

1. **Normalize the flicker/theme value immediately.** Pick one value and use it everywhere. Keep `flicker` as the only write value and continue accepting legacy `glitch` reads until the migration has run everywhere.
2. **Backfill existing rows.** Run the included migration in production to backfill `active_cosmetic_theme = 'glitch'` rows to `flicker`.
3. **Use `AvatarWithFrame` everywhere an avatar should show cosmetics.** Replace manual header/settings/user-modal avatar wrappers or centralize their class logic through the shared component.
4. **Add green glitch support to header/account surfaces.** The current top-right header omits `active_cosmetic_effect`, so a user can have the green glitch active and still not see it in the header.
5. **Decide intended combination design.** If effects are meant to stack visibly, CSS needs dedicated combined states. If one effect is meant to dominate, the shop/inventory UI should state that green glitch overrides neon/flicker visually.
6. **Add automated checks for all public surfaces.** At minimum, test neon, flicker, glitch, neon+flicker, neon+glitch, flicker+glitch, and all three on leaderboard, PvP target list, clan list, public profile card, and header.

## QA checklist

Use a test account with three active inventory rows:

- `item_cosmetic_frame`, state `active`
- `item_cosmetic_theme`, state `active`
- `item_cosmetic_glitch`, state `active`

Then verify these cases:

1. Current user profile card shows green glitch with `ERROR` when all three are active.
2. Another account viewing leaderboard can see the same avatar effect.
3. Another account opening the clicked/public profile card can see the same avatar effect.
4. Another account viewing PvP targets can see the same avatar effect.
5. Another account viewing clan members can see the same avatar effect.
6. Header behavior is documented as current-user-only and currently missing green glitch support.
7. Flicker/theme remains visible to other players for canonical `flicker` rows and legacy `glitch` rows during migration.
