# Visual Assets — Component-by-Component Analysis

> Generated for the Brains Heist workspace. Covers 20 core components.
> All asset references use `public/visuals/` unless stated otherwise.

---

## Table of Contents

1. [Image Patterns Already in Use](#image-patterns-already-in-use)
2. [Component Reports (A → Z)](#component-reports)
3. [Cross-Cutting: Streak, Referral, Social, Weekly, Gated, Neon/Cyber](#cross-cutting-features)
4. [Priority Integration Map](#priority-integration-map)

---

## Image Patterns Already in Use

| Pattern | Where | Example |
|---|---|---|
| `/mission-console-images/*.webp` | `MainActions.tsx` | `<img src="/mission-console-images/attack.webp" className={missionIconClass} />` |
| `/logo.png` | Header, LoginView, UpgradeModal, NewsFeed, IeltsPrepHub, HelpModal | `<img src="/logo.png" className="w-14 h-14" />` |
| `/BRAINS.svg` | ClanView, QuestView, AchievementView, InventoryView, BrainsLoader | `<img src="/BRAINS.svg" className="animate-pulse" />` — loading spinner with neon glow |
| SVG icon components (`./icons`) | Header, QuestView, TaskList, ShopView, InventoryView | `<CoinIcon />`, `<GemIcon />`, `<XPIcon />`, `<StreakIcon />`, `<ShieldIcon />`, `<BoosterIcon />` |
| `rivalryAssets` module | RivalryView | 5 onboarding carousel images + background (`rivalryAssets.onboarding[0–4]`, `rivalryAssets.backgrounds.prep`) |
| `AvatarWithFrame` | ClanView, LeaderboardView, ClickableUsername, PlayerProfileCard | Dicebear presets / uploaded URL + neon/flicker/glitch CSS cosmetic frames |
| Emoji text icons | Nearly every component | 🔒, 🚀, 🏫, 🎉, 💰, ⭐, ⚡, 🔥, 🎯, 🥇🥈🥉, etc. |
| Base64 SVG data URL | MainActions (default school icon) | `data:image/svg+xml;base64,...` inline fallback |
| Supabase Storage | QuestView (question/option images) | `resolveQuestionImageUrl()` → `question-images/...` |

---

## Component Reports

---

### 1. MainActions.tsx (~400 lines)

**Purpose:** Dashboard "Mission Console" — action-button grid for all major features.

**Current images:**
| Line(s) | Asset | Usage |
|---|---|---|
| 5 | `defaultSchoolIcon` (base64 SVG) | Fallback school logo |
| ~283 | `displaySchoolLogo` (dynamic) | School badge in header & competition buttons |
| ~325 | `/mission-console-images/attack.webp` | Attack button (full-bleed circular) |
| ~339 | `/mission-console-images/lockdown.webp` | Lockdown button |
| ~353 | `/mission-console-images/shop.webp` | Shop button |
| ~355+ | `/mission-console-images/tournament.webp` | Tournament button |
| ~355+ | `/mission-console-images/clan.webp` | Clan button |
| ~355+ | `/mission-console-images/inventory.webp` | Inventory button (in "more" section) |
| ~355+ | `/mission-console-images/leaderboard.webp` | Leaderboard button |
| ~355+ | `/mission-console-images/achievements.webp` | Achievements button |
| ~355+ | `/mission-console-images/ielts-prep.webp` | IELTS Prep button |
| ~355+ | `/mission-console-images/cambridge-tests.webp` | Cambridge Tests button |

**Visual asset integration points:**

| Priority | Line(s) | Opportunity | Suggested Asset |
|---|---|---|---|
| **HIGH** | 107–113 | PRO lock badge — replace `🔒 PRO` text with visual | `/visuals/Only-Prime-Users.png` or `neon_cyber_icon_pack/premium` |
| **HIGH** | ~290–295 | `QuestPlayButton` — text-only CTA with no illustration | `/visuals/Quick-Quest-card-illustration.png` or `neon_cyber_icon_pack/quest` |
| **MED** | 269–275 | Mission Console header — `🚀` emoji section icon | `neon_cyber_icon_pack/quest` (accent SVG) |
| **MED** | Before grid | Add Daily Reward card above action grid | `/visuals/Daily-Reward.png` + `/visuals/Today's-3-Moves.png` |
| **LOW** | Quota badge | `⚡ UPGRADE` text → upgrade icon | `neon_cyber_icon_pack/premium` |

---

### 2. QuestView.tsx (~1650 lines)

**Purpose:** Practice/assignment quest engine — subject picker → question loop → scoring → mission report.

**Current images:**
| Line(s) | Asset | Usage |
|---|---|---|
| 53–76 | `resolveQuestionImageUrl()` / `getOptionImageUrl()` | Supabase-hosted question & option images |
| 1094, 1127, 1648 | `/BRAINS.svg` | Loading spinners (3 locations) |
| 137 | `CoinIcon`, `XPIcon`, `GemIcon` | Reward particle SVGs |

**Visual asset integration points:**

| Priority | Line(s) | Opportunity | Suggested Asset |
|---|---|---|---|
| **HIGH** | ~1240 | Streak counter display (plain text `{soloStreak}`) — add streak flame visual | `/visuals/neon_cyber_icon_pack/streak` (accent) |
| **HIGH** | Mission report screen (post-quest) | Celebration background | `/visuals/Post-quest-celebration-background.png` |
| **MED** | Subject selection UI (~300–400) | Subject cards have no illustrations | `neon_cyber_icon_pack/quest` or subject-specific art |
| **MED** | ~1230 (mission score card) | Cards are text-only — add score badge visual | Could use existing themed approach |
| **LOW** | Loading states (lines 1094, 1127, 1648) | `/BRAINS.svg` already works well | No change needed |

---

### 3. JoinSchoolCard.tsx (~170 lines)

**Purpose:** Expandable card prompting students to join a school via invite code.

**Current images:** Only `🏫` emoji (line ~73) and inline SVG checkmarks.

**Visual asset integration points:**

| Priority | Line(s) | Opportunity | Suggested Asset |
|---|---|---|---|
| **HIGH** | 73–74 | School icon area (`🏫` emoji) | `/visuals/neon_cyber_icon_pack/school_unlock` |
| **HIGH** | 88–108 | Benefits grid (text + SVG checks for 4 items) | `/visuals/Unlock-School-Leaderboards.png`, `Unlock-School-Clans.png`, `Unlock-School-Competitions.png`, `Unlock-Teacher-Assignments.png` — one per benefit row |
| **HIGH** | 143–146 | "Request school access" / teacher invite CTA | `/visuals/Teacher-invite-hero-visual.png` or `/visuals/We-need-our-teacher-to-activate-class.png` |
| **MED** | Collapsed state header | Card header has no visual weight | `neon_cyber_icon_pack/invite_teacher` (accent SVG) |

---

### 4. UpgradeModal.tsx (~280 lines)

**Purpose:** Subscription/pricing modal — Core, Standard, Pro plans + Pilot trial.

**Current images:** Only `/logo.png` (16×16) in header badge (~line 96).

**Visual asset integration points:**

| Priority | Line(s) | Opportunity | Suggested Asset |
|---|---|---|---|
| **HIGH** | 105–108 | Title area ("Upgrade Your Plan") — no hero visual | `/visuals/Upgrade-to-Prime.png` |
| **HIGH** | 96–97 | Small logo badge — replace with premium icon | `neon_cyber_icon_pack/premium` (accent SVG) |
| **MED** | 225–229 | Enterprise / custom plans section | `/visuals/class_builder.png` (if/when created) |
| **MED** | Trust signals area | `🔒 ↩️ ⚡` text → could add visual trust badges | `neon_cyber_icon_pack/premium` + shield icon |
| **LOW** | Plan comparison cards | Plans are text-only, could add tier illustrations | Tier badge art (not yet on disk) |

---

### 5. ShopView.tsx (~340 lines)

**Purpose:** Item shop — defensive, boost, and cosmetic items with SVG icons.

**Current images:** `/BRAINS.svg` (loading), SVG icon components (`ShieldIcon`, `BoosterIcon`).

**Visual asset integration points:**

| Priority | Line(s) | Opportunity | Suggested Asset |
|---|---|---|---|
| **MED** | ~195 | Section headers ("Defensive", "Boosts", "Cosmetic") — text only | Category banner illustrations (not yet on disk) |
| **MED** | ItemCard icon area (56×64) | SVG icons are functional but plain | Detailed item artwork (not yet on disk) |
| **LOW** | Empty state | No empty-state illustration | Shop-themed empty state art |

---

### 6. AchievementView.tsx (~500 lines)

**Purpose:** Achievement Hall — earned/locked achievements, completed assignment history.

**Current images:** `/BRAINS.svg` (loading), emoji icons (`achievement.icon`), inline SVG progress ring.

**Visual asset integration points:**

| Priority | Line(s) | Opportunity | Suggested Asset |
|---|---|---|---|
| **HIGH** | 163–171 | Achievement icon display (5xl emoji) | Custom achievement badge artwork per achievement |
| **MED** | 209–224 | "Achievement Hall" header with SVG progress ring | Trophy illustration or themed header banner |
| **MED** | 286–292 | Empty search state (`🔍` emoji) | Themed empty-state illustration |
| **LOW** | Achievement cards | Card backgrounds — currently glass only | Subtle tier-themed backgrounds |

---

### 7. ClanView.tsx (~1700 lines)

**Purpose:** Clan management — join/create/browse clans, chat, buffs, members, gem deposits.

**Current images:** `AvatarWithFrame` (member photos with cosmetic frames), `SyndicateRune` SVG icon, `/BRAINS.svg` (loading).

**Visual asset integration points:**

| Priority | Line(s) | Opportunity | Suggested Asset |
|---|---|---|---|
| **HIGH** | Clan header area | No clan banner/emblem image | `neon_cyber_icon_pack/clan` (accent SVG) |
| **HIGH** | Buff cards area | Buff descriptions are text-only | Buff-specific icons (not yet on disk) |
| **MED** | 1452–1689 | Member list — `AvatarWithFrame` already has cosmetic frames | Already well-served |
| **MED** | Create/join clan flow | Forms have no illustrations | `neon_cyber_icon_pack/clan` + themed input border art |
| **LOW** | Chat area | Text-bubble UI | Themed chat background (not yet on disk) |

---

### 8. LeaderboardView.tsx (~500 lines)

**Purpose:** School leaderboards — Score, XP, PvP, Clans tabs with GSAP entrance animations.

**Current images:** `AvatarWithFrame` (player photos), dicebear fallback avatars, `🥇🥈🥉` emojis for rank.

**Visual asset integration points:**

| Priority | Line(s) | Opportunity | Suggested Asset |
|---|---|---|---|
| **HIGH** | Tab bar / header area | No leaderboard header illustration | `neon_cyber_icon_pack/leaderboard` (accent SVG) |
| **MED** | Top-3 rank badges | Emoji-only (`🥇🥈🥉`) | Custom rank badge artwork (not yet on disk) |
| **MED** | School branding area | No school branding in leaderboard view | Dynamic school logo (already available via props) |
| **LOW** | Online status dots | CSS colored dots — functional | No change needed |

---

### 9. IeltsPrepHub.tsx (~130 lines)

**Purpose:** IELTS prep landing page — highlights, milestones, teacher/student toolkits.

**Current images:** `/logo.png` (16×16, inline in student experience list).

**Visual asset integration points:**

| Priority | Line(s) | Opportunity | Suggested Asset |
|---|---|---|---|
| **HIGH** | 57–67 | Highlight cards (🎙️ ✍️ 🛰️ emoji icons) — no illustrations | Section-specific illustrations (speaking, writing, mission) |
| **HIGH** | 127–128 | "Ready to activate?" CTA — no hero image | Custom IELTS hero banner (not yet on disk) |
| **MED** | 96–120 | Teacher Toolkit / Student Experience sections — text-only | `/visuals/Teacher-invite-hero-visual.png` (partial fit) |
| **LOW** | Milestones list | Text with inline `/logo.png` | `neon_cyber_icon_pack/quest` or milestone badges |

---

### 10. SettingsModal.tsx (~350 lines)

**Purpose:** User settings — avatar, profile editing, cosmetic toggles, display mode.

**Current images:** Dicebear avatar presets (from API URL), custom uploaded avatars.

**Visual asset integration points:**

| Priority | Line(s) | Opportunity | Suggested Asset |
|---|---|---|---|
| **LOW** | 207–215 | Avatar preset grid — images already present from dicebear | No immediate need |
| **LOW** | Cosmetic toggles | Neon frame / flicker theme described in text only | Preview thumbnails of each cosmetic (not yet on disk) |
| **LOW** | Settings header | No decorative illustration | Lightweight — skip unless desired |

---

### 11. InventoryView.tsx (~380 lines)

**Purpose:** Player inventory — active, unused, and consumed items with SVG icons.

**Current images:** `/BRAINS.svg` (loading), SVG icon components (`ShieldIcon`, `BoosterIcon`, `NeonFrameIcon`, etc.).

**Visual asset integration points:**

| Priority | Line(s) | Opportunity | Suggested Asset |
|---|---|---|---|
| **MED** | ItemCard icon area | Same SVG icons as ShopView — functional but basic | Detailed item artwork (same set as Shop) |
| **MED** | Empty state | `ShieldIcon` SVG | Themed empty-inventory illustration |
| **LOW** | Section tabs (active/unused/consumed) | Text-only headers | Category icons |

---

### 12. PlayerProfileCard.tsx (~350 lines)

**Purpose:** Dashboard profile card — avatar, stats HUD, XP bar, clan buffs display.

**Current images:** `AvatarWithFrame` with neon/flicker/glitch cosmetic effects.

**Visual asset integration points:**

| Priority | Line(s) | Opportunity | Suggested Asset |
|---|---|---|---|
| **MED** | 186–196 | Avatar + username header | Profile banner/background image (not yet on disk) |
| **MED** | Clan buff cards | Text-only buff descriptions | Buff-specific icons (shared need with ClanView) |
| **LOW** | XP bar, stat displays | CSS-only — functional | No change needed |

---

### 13. Header.tsx (~800 lines)

**Purpose:** App header — branding, currency/stat HUDs, mobile menu, notifications, plan badge.

**Current images:** `/logo.png` (32×32 mobile, 40×40 desktop), avatar images, SVG stat icons (`CoinIcon`, `XPIcon`, `APIcon`, `StreakIcon`, `GemIcon`).

**Visual asset integration points:**

| Priority | Line(s) | Opportunity | Suggested Asset |
|---|---|---|---|
| **HIGH** | 553–556 | Streak display — `StreakIcon` + number, could enhance | `neon_cyber_icon_pack/streak` (accent SVG) to replace or augment |
| **MED** | ~479–485 | Plan badge (PILOT/PRO/DISCOVERY text) — no tier visual | `neon_cyber_icon_pack/premium` or plan-tier badge art |
| **LOW** | 364, 578 | `/logo.png` — already present | No change needed |
| **LOW** | StatChip icons | SVG icons are clean and effective | No change needed |

---

### 14. LoginView.tsx (~700 lines)

**Purpose:** Landing page — hero section, auth form, How It Works, For Schools/Students, footer.

**Current images:** `/logo.png` (56×64 hero, footer branding). Heavy GSAP animations. CSS floating orbs.

**Visual asset integration points:**

| Priority | Line(s) | Opportunity | Suggested Asset |
|---|---|---|---|
| **CRITICAL** | 540–560 | Hero section — prime location for hero illustration or product screenshot | Custom hero illustration (not yet on disk) |
| **HIGH** | 610–632 | "How it works" step cards — numbered circles, no illustrations | Step illustrations (not yet on disk) |
| **HIGH** | 636–660 | "For Schools" / "For Students" audience cards — text + emoji headers | `/visuals/class_builder.png`, audience illustrations |
| **MED** | Footer | Logo only | No urgent need |
| **LOW** | Value bullets | Text + CheckBadge SVG | No change needed |

---

### 15. NewsFeed.tsx (~200 lines)

**Purpose:** Activity feed — PvP wins/losses, level ups, purchases, achievements, reactions.

**Current images:** `/logo.png` (inline 16×16 in quest_cleared event), SVG icons from `./icons`.

**Visual asset integration points:**

| Priority | Line(s) | Opportunity | Suggested Asset |
|---|---|---|---|
| **MED** | Feed header | No feed header illustration | Small themed icon |
| **LOW** | Event cards | Left-border colored cards with SVG icons — clean design | No urgent need |
| **LOW** | Emoji reactions (🔥😮😂❤️) | Already expressive | No change needed |

---

### 16. SessionTracker.tsx (~60 lines)

**Purpose:** Daily session bonus countdown timer with multiplier display.

**Current images:** `ClockIcon` and `MultiplierIcon` SVGs only.

**Visual asset integration points:**

| Priority | Line(s) | Opportunity | Suggested Asset |
|---|---|---|---|
| **LOW** | 38–40 | "Session Used" state — could add "come back tomorrow" visual | Small illustration (not yet on disk) |
| **LOW** | Timer area | Functional numeric display | No change needed |

---

### 17. TaskList.tsx (~140 lines)

**Purpose:** Daily and weekly task items with progress bars and claim buttons.

**Current images:** `CoinIcon`, `GemIcon`, `XPIcon` SVG components, `CoinAnimation`.

**Visual asset integration points:**

| Priority | Line(s) | Opportunity | Suggested Asset |
|---|---|---|---|
| **MED** | ~121 | "Daily Tasks" header — text only | `/visuals/Daily-Reward.png` as section banner or `neon_cyber_icon_pack/reward_chest` |
| **MED** | ~131 (weekly section) | "Weekly Tasks" header — text only | `/visuals/Midweek-Challenge.png` or themed weekly banner |
| **LOW** | Claim button area | Pulse-glow button with `✨ Claim` text | `/visuals/neon_cyber_icon_pack/reward_chest` as celebrate overlay |

---

### 18. RivalryView.tsx (~420 lines) — REFERENCE IMPLEMENTATION

**Purpose:** Clan-vs-clan rivalry mode with onboarding carousel.

**Current images:** **Most image-rich component.** Uses `rivalryAssets` module:
- `rivalryAssets.onboarding[0–4]` — 5 carousel slide images
- `rivalryAssets.backgrounds.prep` — rivalry backdrop
- `RivalryImage` component for optimized loading with `loading="eager" | "lazy"`

**This is the gold-standard pattern** for how images should be integrated in other components:
```tsx
import { rivalryAssets } from './rivalryAssets';

<RivalryImage
  src={rivalryAssets.onboarding[0]}
  alt="description"
  className="rounded-xl"
  loading="eager"
/>
```

**No additional integration needed** — this component is already fully illustrated.

---

### 19. LevelUpModal.tsx (~60 lines)

**Purpose:** Celebration modal when player levels up.

**Current images:** None — uses `🎉` emoji (6xl) and text-only reward list (`💰`, `⭐`, `⚡` emojis).

**Visual asset integration points:**

| Priority | Line(s) | Opportunity | Suggested Asset |
|---|---|---|---|
| **HIGH** | 22 | `🎉` celebration area — prime location for animated level-up visual | `/visuals/Post-quest-celebration-background.png` as modal backdrop |
| **MED** | 33–48 | Reward icons (`💰`, `⭐`, `⚡` emojis) → could use SVG icons | `CoinIcon`, `XPIcon` (already imported elsewhere) or `neon_cyber_icon_pack/reward_chest` |
| **LOW** | Background overlay | `bg-black/90` — could have themed particle background | Subtle celebration particles (CSS or canvas) |

---

### 20. App.tsx (~1000+ lines)

**Purpose:** Root component — state management, view routing, boot sequence, pro-gating.

**Current images:** None directly (delegates to child components). Has `SkeletonDashboard` for loading, `RecognitionText` during boot.

**Visual asset integration points:**

| Priority | Line(s) | Opportunity | Suggested Asset |
|---|---|---|---|
| **MED** | Pro-gating logic | `showUpgradeModal` triggers `UpgradeModal` — could show feature visual | `/visuals/Locked-feature-without-frustration.png` passed as context to gate overlay |
| **LOW** | Boot/loading state | `SkeletonDashboard` — CSS skeleton | `/BRAINS.svg` already used elsewhere for loading |

---

## Cross-Cutting Features

### Streak Tracking

**Status:** No dedicated `StreakTracker` component exists.

| Location | Line(s) | Current | Asset Opportunity |
|---|---|---|---|
| QuestView.tsx | 177, 275, 302, 618, 654, 705, 727, 761 | `soloStreak` state for consecutive-correct tracking | — |
| QuestView.tsx | 1240–1241 | Mission report streak card — plain text number | `neon_cyber_icon_pack/streak` + milestone badges (`1-day.png` through `30-day.png`) |
| Header.tsx | 3, 553–556 | `StreakIcon` SVG + streak number | `neon_cyber_icon_pack/streak` (accent) to enhance |
| UserProfileModal | 173–175 | Streak display in profile | Same as Header approach |
| IeltsPrepHub.tsx | 113 | Streak mention in text | Minor — text only |
| ClanTerritoryTeacherView / StudentView | Various | Streak references in territory context | Minor — text references |

**Missing component:** A `StreakRewardModal` or `DailyStreakTracker` widget that shows the 1→3→5→7→14→30 day progression with the badge images (`/visuals/1-day.png` through `30-day.png`).

---

### Referral / Invite Components

**Status:** No dedicated referral/invite-friend component exists. No social sharing flow.

| Location | Line(s) | Current | Asset Opportunity |
|---|---|---|---|
| JoinSchoolCard.tsx | Full file | Join via invite code (school-level) | `/visuals/Teacher-invite-hero-visual.png`, `/visuals/We-need-our-teacher-to-activate-class.png` |
| FinishSetupModal.tsx | 29–33, 99 | `inviteCode` state + handler for school join during onboarding | `neon_cyber_icon_pack/invite_teacher` |
| LoginView.tsx | 39 | Mention of invite in text | Minor |

**Missing components:**
- **InviteFriendCard** — social action to invite friends → `/visuals/Invite-Friend-social-action-illustration.png`, `neon_cyber_icon_pack/invite_friend`
- **ShareModal** — share mission completion / streak brag → `/visuals/I-completed-today's-mission.png`, `/visuals/My-streak-is-X-days.png`
- **ReferralBadgeDisplay** — show recruiter badges → `/visuals/recruiter_i.png`, `recruiter_ii.png`, `recruiter_iii.png` (when created)

---

### Social Sharing

**Status:** No social sharing functionality exists anywhere in the codebase.

**Assets ready on disk:**
- `/visuals/I-completed-today's-mission.png` — share-card visual
- `/visuals/My-streak-is-X-days.png` — streak brag share-card

**Needs:** A `ShareModal` or `ShareCard` component (not yet built).

---

### Weekly Engagement Banners

**Status:** No weekly engagement banner system exists.

**Assets ready on disk:**
- `/visuals/Monday-Boost.png`
- `/visuals/Midweek-Challenge.png`
- `/visuals/Friday-School-Battle-Teaser.png`

**Best integration points:**
1. **MainActions.tsx** — banner above the action grid (highest visibility)
2. **TaskList.tsx** — daily/weekly section headers
3. **App.tsx** — conditional banner based on day-of-week

---

### Gated / Locked Feature Prompts

**Status:** Gating exists in two forms:

1. **MainActions.tsx** (`locked` prop on `ActionButton`)
   - Lines 107–113: PRO badge `🔒 PRO`
   - Lines ~116: Quota badge `⚡ UPGRADE`
   - `isLocked` dims button to `opacity-60`

2. **App.tsx** (pro-gating at view level)
   - `showUpgradeModal` state + `upgradeFeatureLabel` → triggers `UpgradeModal`
   - Pro-only views: pvp, shop, clan, inventory, leaderboard, achievements, tournament, raids, cambridge, ielts

**Assets ready on disk:**
- `/visuals/Only-Prime-Users.png` — prime gating overlay
- `/visuals/Upgrade-to-Prime.png` — upgrade CTA hero
- `/visuals/Locked-feature-without-frustration.png` — soft-lock visual

**Integration:** Replace the `🔒 PRO` text badge with a visually rich locked overlay using these assets.

---

### Neon / Cyber Theme Application

**Status:** Theme is applied through three layers:

1. **CSS Custom Properties** (global theme tokens):
   - `--ion-blue` (cyan), `--plasma-pink` (pink), `--amber-warn` (gold)
   - `--success-teal`, `--danger-red`, `--mist-400` (gray), `--ink-900` (dark), `--grid-purple`
   - Used on backgrounds, borders, text colors, glows across all components

2. **Glass Card Pattern** (used everywhere):
   ```css
   .card-glass → bg-white/[0.03] + border-white/10 + backdrop-blur
   ```
   Plus radial gradient overlays for subtle light reflections

3. **Cosmetic Frames** (`AvatarWithFrame` component):
   - `hasNeonFrame` → CSS class `neon-frame` + animated glow border
   - `hasFlickerTheme` → flicker animation overlay (CRT scanline effect)
   - `hasGlitchEffect` → glitch animation on avatar
   - Size variants: xs, sm, md, lg, xl (different padding per size)
   - Used in: ClanView (lines 1452, 1591, 1683), ClickableUsername (line 76), LeaderboardView, PlayerProfileCard

4. **GSAP Animations** (LoginView, LeaderboardView):
   - Scroll-triggered reveals with `gsap.from()` / `ScrollTrigger`
   - Logo glow pulse animation
   - Text cipher reveal animation
   - Card entrance stagger animations

---

## Priority Integration Map

### Tier 1 — Highest Impact (8 integration points)

| # | Component | What | Asset |
|---|---|---|---|
| 1 | LoginView (lines 540–560) | Hero illustration — biggest visual gap | New hero art needed |
| 2 | MainActions (before grid) | Daily Reward + Today's 3 Moves banner | `Daily-Reward.png`, `Today's-3-Moves.png` |
| 3 | JoinSchoolCard (lines 88–108) | School unlock benefit visuals | `Unlock-School-*.png` (4 images) |
| 4 | UpgradeModal (lines 105–108) | Upgrade hero visual | `Upgrade-to-Prime.png` |
| 5 | LevelUpModal (line 22) | Celebration visual | `Post-quest-celebration-background.png` |
| 6 | QuestView (~1240) | Streak counter visual | `neon_cyber_icon_pack/streak` |
| 7 | MainActions (lines 107–113) | PRO lock visual upgrade | `Only-Prime-Users.png` |
| 8 | Header (lines 553–556) | Streak icon enhancement | `neon_cyber_icon_pack/streak` |

### Tier 2 — New Components Needed

| # | Component (to build) | Assets Ready |
|---|---|---|
| 1 | `StreakRewardModal` / `DailyStreakTracker` | `1-day.png` through `30-day.png` (6 badges) |
| 2 | `InviteFriendCard` | `Invite-Friend-social-action-illustration.png`, `neon_cyber_icon_pack/invite_friend` |
| 3 | `ShareModal` (social brag) | `I-completed-today's-mission.png`, `My-streak-is-X-days.png` |
| 4 | `WeeklyBanner` (day-of-week) | `Monday-Boost.png`, `Midweek-Challenge.png`, `Friday-School-Battle-Teaser.png` |

### Tier 3 — Neon Cyber Icon Pack Rollout

| Icon | Target Components |
|---|---|
| `streak` (accent SVG) | Header, QuestView, StreakRewardModal |
| `quest` (accent SVG) | MainActions (QuestPlayButton), QuestView subject cards |
| `clan` (accent SVG) | ClanView header, MainActions clan button |
| `leaderboard` (accent SVG) | LeaderboardView tab header |
| `premium` (accent SVG) | UpgradeModal, MainActions PRO badge, Header plan badge |
| `reward_chest` (accent SVG) | TaskList section headers, LevelUpModal rewards |
| `school_unlock` (accent SVG) | JoinSchoolCard header |
| `invite_friend` / `invite_teacher` (accent SVG) | InviteFriendCard, JoinSchoolCard |
| `assignment` (accent SVG) | QuestView assignment mode, MainActions pending badge |

---

## Assets on Disk vs. Integration Status

| Asset | On Disk | Referenced in Code | Needs |
|---|---|---|---|
| `/visuals/1-day.png` through `30-day.png` | ✅ | ❌ | StreakRewardModal component |
| `/visuals/Daily-Reward.png` | ✅ | ❌ | MainActions integration |
| `/visuals/Today's-3-Moves.png` | ✅ | ❌ | MainActions integration |
| `/visuals/Quick-Quest-card-illustration.png` | ✅ | ❌ | QuestPlayButton integration |
| `/visuals/Post-quest-celebration-background.png` | ✅ | ❌ | LevelUpModal / QuestView post-quest |
| `/visuals/Invite-Friend-social-action-illustration.png` | ✅ | ❌ | InviteFriendCard (build required) |
| `/visuals/Teacher-invite-hero-visual.png` | ✅ | ❌ | JoinSchoolCard integration |
| `/visuals/We-need-our-teacher-to-activate-class.png` | ✅ | ❌ | JoinSchoolCard integration |
| `/visuals/I-completed-today's-mission.png` | ✅ | ❌ | ShareModal (build required) |
| `/visuals/My-streak-is-X-days.png` | ✅ | ❌ | ShareModal (build required) |
| `/visuals/Unlock-School-Leaderboards.png` | ✅ | ❌ | JoinSchoolCard integration |
| `/visuals/Unlock-School-Clans.png` | ✅ | ❌ | JoinSchoolCard integration |
| `/visuals/Unlock-School-Competitions.png` | ✅ | ❌ | JoinSchoolCard integration |
| `/visuals/Unlock-Teacher-Assignments.png` | ✅ | ❌ | JoinSchoolCard integration |
| `/visuals/Only-Prime-Users.png` | ✅ | ❌ | MainActions / App gating |
| `/visuals/Upgrade-to-Prime.png` | ✅ | ❌ | UpgradeModal integration |
| `/visuals/Locked-feature-without-frustration.png` | ✅ | ❌ | App.tsx pro-gating overlay |
| `/visuals/Monday-Boost.png` | ✅ | ❌ | WeeklyBanner (build required) |
| `/visuals/Midweek-Challenge.png` | ✅ | ❌ | WeeklyBanner (build required) |
| `/visuals/Friday-School-Battle-Teaser.png` | ✅ | ❌ | WeeklyBanner (build required) |
| `neon_cyber_icon_pack` (40 variants) | ✅ | ❌ | Rollout across all 10 icon types |
| `/visuals/class_builder.png` | ✅ | ❌ | Login/school building flow |
| `/visuals/recruiter_i/ii/iii.png` | ✅ | ❌ | Referral badge (build required) |
| `/visuals/teacher_connector.png` | ✅ | ❌ | Teacher invite flow |

**Bottom line: 31 visual PNGs + 40 icon pack variants sit on disk with zero code references. Every asset has a clear home.**
