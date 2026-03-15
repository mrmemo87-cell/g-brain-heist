# Visual Asset Implementation Map

> Last updated: 2026-03-16 — All assets confirmed on disk at `public/visuals/`.

---

## Streak Reward Badges

| File (confirmed on disk) | Implementation Target |
|---|---|
| `public/visuals/1-day.png` | Streak reward UI — 1-day milestone badge (StreakTracker / RewardModal) |
| `public/visuals/3-day.png` | Streak reward UI — 3-day milestone badge |
| `public/visuals/5-day.png` | Streak reward UI — 5-day milestone badge |
| `public/visuals/7-day.png` | Streak reward UI — 7-day milestone badge |
| `public/visuals/14-day.png` | Streak reward UI — 14-day milestone badge |
| `public/visuals/30-day.png` | Streak reward UI — 30-day milestone badge |

---

## Daily / Weekly Engagement Visuals

| File (confirmed on disk) | Implementation Target |
|---|---|
| `public/visuals/Daily-Reward.png` | Main dashboard daily reward card (MainActions / MissionConsole) |
| `public/visuals/Monday-Boost.png` | Weekly engagement banner — Monday boost prompt |
| `public/visuals/Midweek-Challenge.png` | Weekly engagement banner — Midweek challenge prompt |
| `public/visuals/Friday-School-Battle-Teaser.png` | Weekly engagement banner — Friday school battle teaser |

---

## Mission / Quest Surfaces

| File (confirmed on disk) | Implementation Target |
|---|---|
| `public/visuals/Today's-3-Moves.png` | Mission console — today's 3 moves card (MainActions / App) |
| `public/visuals/Quick-Quest-card-illustration.png` | Quick Quest card illustration (MissionConsole / QuestCard) |
| `public/visuals/Post-quest-celebration-background.png` | Post-quest celebration overlay background |

---

## Social / Referral Surfaces

| File (confirmed on disk) | Implementation Target |
|---|---|
| `public/visuals/Invite-Friend-social-action-illustration.png` | Invite friend action card (ReferralCard / social share flow) |
| `public/visuals/Teacher-invite-hero-visual.png` | Teacher invite hero banner (JoinSchoolCard / teacher invite flow) |
| `public/visuals/We-need-our-teacher-to-activate-class.png` | Class activation prompt — nudge students to request teacher (JoinSchoolCard / gated view) |

---

## Social Sharing / Brag Surfaces

| File (confirmed on disk) | Implementation Target |
|---|---|
| `public/visuals/I-completed-today's-mission.png` | Share card — mission complete brag (social share modal) |
| `public/visuals/My-streak-is-X-days.png` | Share card — streak brag (social share modal) |

---

## School Unlock / Gating Surfaces

| File (confirmed on disk) | Implementation Target |
|---|---|
| `public/visuals/Unlock-School-Leaderboards.png` | Gated feature prompt — school leaderboards unlock (JoinSchoolCard / App gated views) |
| `public/visuals/Unlock-School-Clans.png` | Gated feature prompt — school clans unlock |
| `public/visuals/Unlock-School-Competitions.png` | Gated feature prompt — school competitions unlock |
| `public/visuals/Unlock-Teacher-Assignments.png` | Gated feature prompt — teacher assignments unlock |

---

## Prime / Upgrade Surfaces

| File (confirmed on disk) | Implementation Target |
|---|---|
| `public/visuals/Only-Prime-Users.png` | Prime gating overlay — feature locked to Prime (IeltsHome / upgrade prompts) |
| `public/visuals/Upgrade-to-Prime.png` | Upgrade modal hero visual (Upgrade modal / gated feature prompts) |
| `public/visuals/Locked-feature-without-frustration.png` | Soft-lock feature prompt — non-frustrating gating visual |

---

## Neon Cyber Icon Pack

All icons exist in two variants (`accent` and `white`) and two formats (`png` and `svg`).

**Directory:** `public/visuals/neon_cyber_icon_pack/icon_pack/`

**Manifest:** `manifest.json` (confirmed on disk)

| Icon name | PNG accent | PNG white | SVG accent | SVG white | Implementation Target |
|---|---|---|---|---|---|
| assignment | ✅ | ✅ | ✅ | ✅ | Assignment cards, teacher assignment UI |
| clan | ✅ | ✅ | ✅ | ✅ | Clan badges, clan dashboard header |
| invite_friend | ✅ | ✅ | ✅ | ✅ | Referral / invite friend buttons |
| invite_teacher | ✅ | ✅ | ✅ | ✅ | Teacher invite CTA buttons |
| leaderboard | ✅ | ✅ | ✅ | ✅ | Leaderboard tab icon, school leaderboard |
| premium | ✅ | ✅ | ✅ | ✅ | Prime badge, upgrade prompts |
| quest | ✅ | ✅ | ✅ | ✅ | Quest card icon, mission console |
| reward_chest | ✅ | ✅ | ✅ | ✅ | Reward chest / loot box surfaces |
| school_unlock | ✅ | ✅ | ✅ | ✅ | School unlock gating prompts |
| streak | ✅ | ✅ | ✅ | ✅ | Streak counter icon, streak reward UI |

---

## Not Found on Disk

The following files were expected but are **not present** in `public/visuals/` as of this audit:

| Expected file | Status |
|---|---|
| `class_builder.png` | ❌ Not on disk |
| `recruiter_i.png` | ❌ Not on disk |
| `recruiter_ii.png` | ❌ Not on disk |
| `recruiter_iii.png` | ❌ Not on disk |
| `teacher_connector.png` | ❌ Not on disk |

These badge assets need to be created/added before referral badge UI can reference them.

---

## Implementation Priority

1. **Streak & Daily Reward** — High visibility on main dashboard (streak badges + Daily-Reward.png + Today's-3-Moves.png)
2. **School Unlock Gating** — Unlock-School-*.png visuals for gated feature prompts in JoinSchoolCard / App
3. **Prime/Upgrade** — Upgrade-to-Prime.png, Only-Prime-Users.png for IeltsHome and gated surfaces
4. **Neon Cyber Icons** — Replace placeholder icons across quest, clan, streak, and reward UI with themed variants
5. **Social Sharing** — Mission-complete and streak brag share cards
6. **Weekly Engagement** — Monday-Boost, Midweek-Challenge, Friday-School-Battle-Teaser banners
