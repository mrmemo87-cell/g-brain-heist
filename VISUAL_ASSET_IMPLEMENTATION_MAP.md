# Visual Asset Implementation Map

## Note about requested path
- The exact folder `public/visuals` does **not** exist in this repo right now.
- Closest existing visual-asset folders are:
  - `public/mission-console-images`
  - `public/rivalry_assets`
  - `public/question-images`

This map scans those folders and identifies where each visual is currently implemented (or where it should be implemented).

---

## 1) `public/mission-console-images/*` (Main dashboard action icons)

These are already wired in `components/MainActions.tsx` mission cards.

| Asset file | Current usage location | Implementation target / meaning |
|---|---|---|
| `public/mission-console-images/attack.webp` | `components/MainActions.tsx` (Launch Attack card icon) | PvP card icon in Mission Console |
| `public/mission-console-images/lockdown.webp` | `components/MainActions.tsx` (Lockdown card icon) | Lockdown mode entry card |
| `public/mission-console-images/shop.webp` | `components/MainActions.tsx` (Shop card icon) | Shop entry card |
| `public/mission-console-images/tournament.webp` | `components/MainActions.tsx` (Tournament card icon) | Tournament entry card |
| `public/mission-console-images/clan.webp` | `components/MainActions.tsx` (Clan card icon) | Clan entry card |
| `public/mission-console-images/inventory.webp` | `components/MainActions.tsx` (Inventory card icon) | Inventory entry card |
| `public/mission-console-images/leaderboard.webp` | `components/MainActions.tsx` (Leaderboard card icon) | Leaderboard entry card |
| `public/mission-console-images/achievements.webp` | `components/MainActions.tsx` (Achievements card icon) | Achievements entry card |
| `public/mission-console-images/ielts-prep.webp` | `components/MainActions.tsx` (IELTS Prep card icon) | IELTS entry card |
| `public/mission-console-images/cambridge-tests.webp` | `components/MainActions.tsx` (Cambridge Tests card icon) | Cambridge tests entry card |

---

## 2) `public/rivalry_assets/*` (Rivalry module visuals)

These are organized by scene/function and referenced via `components/rivalry/rivalryAssets.ts`.

### Backgrounds

| Asset file | Current usage location | Implementation target / meaning |
|---|---|---|
| `public/rivalry_assets/backgrounds/prep-phase.png` | `rivalryAssets.backgrounds.prep` used in `RivalryHub`, `RivalryPrepPanel`, `RivalryView` | Pre-war / onboarding atmosphere |
| `public/rivalry_assets/backgrounds/live-war.png` | `rivalryAssets.backgrounds.live` used in `RivalryWarDetail` | Live battle atmosphere |
| `public/rivalry_assets/backgrounds/blackout-scene.png` | `rivalryAssets.backgrounds.blackout` used in `RivalryWarDetail` | Blackout phase atmosphere |
| `public/rivalry_assets/backgrounds/results.png` | Mapped in `rivalryAssets`, not directly referenced in current components | Generic results/fallback background |
| `public/rivalry_assets/backgrounds/results-victory.png` | `rivalryAssets.backgrounds.victory` in `RivalryWarDetail` | Victory results scene |
| `public/rivalry_assets/backgrounds/results-defeated.png` | `rivalryAssets.backgrounds.defeat` in `RivalryWarDetail` | Defeat results scene |

### Banners

| Asset file | Current usage location | Implementation target / meaning |
|---|---|---|
| `public/rivalry_assets/banners/neutral-clan.png` | `rivalryAssets.banners.neutral` in `RivalryHub` | Neutral state banner |
| `public/rivalry_assets/banners/rival-clan.png` | `rivalryAssets.banners.rival` in `RivalryHub` | Active rival matchup banner |
| `public/rivalry_assets/banners/victory-clan.png` | `rivalryAssets.banners.victory` in `RivalryHub`, `RivalryWarDetail` | Victory banner |

### Onboarding slides

| Asset file | Current usage location | Implementation target / meaning |
|---|---|---|
| `public/rivalry_assets/onboarding/01-what-is-rivalry.png` | `rivalryAssets.onboarding[0]` in `RivalryView` | Onboarding step 1 |
| `public/rivalry_assets/onboarding/02-build-squad.png` | `rivalryAssets.onboarding[1]` in `RivalryView` | Onboarding step 2 |
| `public/rivalry_assets/onboarding/03-pick-strategy.png` | `rivalryAssets.onboarding[2]` in `RivalryView` | Onboarding step 3 |
| `public/rivalry_assets/onboarding/04-fight-war.png` | `rivalryAssets.onboarding[3]` in `RivalryView` | Onboarding step 4 |
| `public/rivalry_assets/onboarding/05-blackout-rewards.png` | `rivalryAssets.onboarding[4]` in `RivalryView` | Onboarding step 5 |

### Rewards/MVP

| Asset file | Current usage location | Implementation target / meaning |
|---|---|---|
| `public/rivalry_assets/rewards/reward-card.png` | `rivalryAssets.rewards.card` in `RivalryWarDetail` | Reward gallery card |
| `public/rivalry_assets/rewards/reward-chest.png` | `rivalryAssets.rewards.chest` in `RivalryWarDetail` | Reward chest visual |
| `public/rivalry_assets/rewards/reward-panel.png` | `rivalryAssets.rewards.panel` in `RivalryWarDetail` | Reward panel visual |
| `public/rivalry_assets/mvp/breaker-mvp.png` | `rivalryAssets.mvp.breaker` in `RivalryWarDetail` | Breaker MVP card |
| `public/rivalry_assets/mvp/operator-mvp.png` | `rivalryAssets.mvp.operator` in `RivalryWarDetail` | Operator MVP card |
| `public/rivalry_assets/mvp/guardian-mvp.png` | `rivalryAssets.mvp.guardian` in `RivalryWarDetail` | Guardian MVP card |

### Doctrines / structures / action badges / FX

| Asset file | Current usage location | Implementation target / meaning |
|---|---|---|
| `public/rivalry_assets/doctrines/breach.png` | `doctrineAssetMap.breach` in `RivalryPrepPanel` | Doctrine card background |
| `public/rivalry_assets/doctrines/fortress.png` | `doctrineAssetMap.fortress` in `RivalryPrepPanel` | Doctrine card background |
| `public/rivalry_assets/doctrines/disruption.png` | `doctrineAssetMap.disruption` in `RivalryPrepPanel` | Doctrine card background |
| `public/rivalry_assets/structures/relay-core.png` | `structureAssetMap.relay_core` in `RivalryWarDetail` | Structure tile image |
| `public/rivalry_assets/structures/cipher-vault.png` | `structureAssetMap.cipher_vault` in `RivalryWarDetail` | Structure tile image |
| `public/rivalry_assets/structures/sentinel-grid.png` | `structureAssetMap.sentinel_grid` in `RivalryWarDetail` | Structure tile image |
| `public/rivalry_assets/ui/strike-badge.png` | `actionBadgeAssetMap.strike` in `RivalryActionPanel` | Strike action button badge |
| `public/rivalry_assets/ui/sabotage-badge.png` | `actionBadgeAssetMap.sabotage` in `RivalryActionPanel` | Sabotage action button badge |
| `public/rivalry_assets/ui/repair-badge.png` | `actionBadgeAssetMap.repair` in `RivalryActionPanel` | Repair action button badge |
| `public/rivalry_assets/fx/strike.png` | `actionFxAssetMap.strike` in `RivalryWarDetail` | Strike effect overlay |
| `public/rivalry_assets/fx/sabodage.png` | `actionFxAssetMap.sabotage` in `RivalryWarDetail` | Sabotage effect overlay |
| `public/rivalry_assets/fx/repair.png` | `actionFxAssetMap.repair` in `RivalryWarDetail` | Repair effect overlay |

### Found but not currently mapped

| Asset file | Current mapping status | Suggested implementation |
|---|---|---|
| `public/rivalry_assets/ui/reward-chest.png` | Not referenced in `rivalryAssets.ts` | Use as small icon badge in reward CTA / action panel, or remove if unused |

---

## 3) `public/question-images/AS-Chemistry/*` (question content illustrations)

| Asset file pattern | Likely implementation target |
|---|---|
| `public/question-images/AS-Chemistry/*.svg` | Embedded in AS Chemistry questions rendered by quiz/question components (content illustrations rather than UI chrome) |

---

## Recommended folder strategy for your new generated visuals

If you are generating a new visual pack with Gemini/Grok, this structure will map cleanly to existing components:

- `public/visuals/mission/` → dashboard cards/hero strips for `MainActions` / dashboard sections
- `public/visuals/join-school/` → assets for `JoinSchoolCard` and school conversion prompts
- `public/visuals/ielts/` → free vs prime bridge visuals for IELTS pages
- `public/visuals/referrals/` → badges/cards for invite-friend + invite-teacher flow
- `public/visuals/streaks/` → daily streak badge progression assets

Then wire them from:
- `components/MainActions.tsx`
- `components/JoinSchoolCard.tsx`
- `src/pages/ielts/IeltsHome.tsx`
- relevant referral/streak components when added

---

## Implementation started (fallback-safe wiring)

To start integration before every visual file lands locally, fallback-safe image wiring has been added to:

- `components/MainActions.tsx` using `/visuals/Today’s-3-Moves.png`
- `components/JoinSchoolCard.tsx` using `/visuals/Unlock-School-Leaderboards.png`
- `components/UpgradeModal.tsx` using `/visuals/Upgrade-to-Prime.png`

All three use `components/VisualFallbackImage.tsx`, which auto-falls back to in-UI placeholders if the image file is missing.
