# Visual Assets Usage Report
**Generated:** March 16, 2026  
**Scope:** Entire workspace (src/, components/, and all file types)

---

## Executive Summary

A comprehensive scan of the workspace has been completed to identify all references to visual files from `public/visuals/`. The report shows:

- ✅ **31 visual files exist** on disk in `public/visuals/`
- ✅ **Neon Cyber Icon Pack** (10 icons × 4 variants = 40 files) exists with both PNG and SVG formats
- ❌ **ZERO active code references** found in TypeScript/React components
- 📋 **All assets documented** in `VISUAL_ASSET_IMPLEMENTATION_MAP.md` (documentation only)

---

## Part 1: On-Disk Visual Assets

### ✅ Individual Visual Files (Confirmed on Disk)

#### Streak Reward Badges (6 files)
| File | Type | Size on Disk | Status | Components (Planned) |
|------|------|---|---|---|
| `1-day.png` | PNG | Present | ✅ Available | StreakTracker / RewardModal |
| `3-day.png` | PNG | Present | ✅ Available | StreakTracker / RewardModal |
| `5-day.png` | PNG | Present | ✅ Available | StreakTracker / RewardModal |
| `7-day.png` | PNG | Present | ✅ Available | StreakTracker / RewardModal |
| `14-day.png` | PNG | Present | ✅ Available | StreakTracker / RewardModal |
| `30-day.png` | PNG | Present | ✅ Available | StreakTracker / RewardModal |

#### Daily & Weekly Engagement Visuals (4 files)
| File | Type | Status | Components (Planned) |
|------|------|---|---|
| `Daily-Reward.png` | PNG | ✅ Available | MainActions / MissionConsole |
| `Monday-Boost.png` | PNG | ✅ Available | Weekly engagement banner |
| `Midweek-Challenge.png` | PNG | ✅ Available | Weekly engagement banner |
| `Friday-School-Battle-Teaser.png` | PNG | ✅ Available | Weekly engagement banner |

#### Mission & Quest Surfaces (3 files)
| File | Type | Status | Components (Planned) |
|------|------|---|---|
| `Today's-3-Moves.png` | PNG | ✅ Available | MainActions / App |
| `Quick-Quest-card-illustration.png` | PNG | ✅ Available | MissionConsole / QuestCard |
| `Post-quest-celebration-background.png` | PNG | ✅ Available | Quest celebration overlay |

#### Social & Referral Surfaces (3 files)
| File | Type | Status | Components (Planned) |
|------|------|---|---|
| `Invite-Friend-social-action-illustration.png` | PNG | ✅ Available | ReferralCard / social share |
| `Teacher-invite-hero-visual.png` | PNG | ✅ Available | JoinSchoolCard / teacher invite |
| `We-need-our-teacher-to-activate-class.png` | PNG | ✅ Available | JoinSchoolCard / gated view |

#### Social Sharing & Brag Surfaces (2 files)
| File | Type | Status | Components (Planned) |
|------|------|---|---|
| `I-completed-today's-mission.png` | PNG | ✅ Available | Social share modal |
| `My-streak-is-X-days.png` | PNG | ✅ Available | Social share modal |

#### School Unlock & Gating Surfaces (4 files)
| File | Type | Status | Components (Planned) |
|------|------|---|---|
| `Unlock-School-Leaderboards.png` | PNG | ✅ Available | JoinSchoolCard / App gated views |
| `Unlock-School-Clans.png` | PNG | ✅ Available | School unlock gating prompts |
| `Unlock-School-Competitions.png` | PNG | ✅ Available | School unlock gating prompts |
| `Unlock-Teacher-Assignments.png` | PNG | ✅ Available | School unlock gating prompts |

#### Prime & Upgrade Surfaces (3 files)
| File | Type | Status | Components (Planned) |
|------|------|---|---|
| `Only-Prime-Users.png` | PNG | ✅ Available | IeltsHome / upgrade prompts |
| `Upgrade-to-Prime.png` | PNG | ✅ Available | UpgradeModal / gated features |
| `Locked-feature-without-frustration.png` | PNG | ✅ Available | Soft-lock feature prompts |

#### Badge Assets (5 files) — **Note:** Files now exist vs. map documentation
| File | Type | Status | Components (Planned) |
|------|------|---|---|
| `class_builder.png` | PNG | ✅ Available | Class builder badges |
| `recruiter_i.png` | PNG | ✅ Available | Recruiter badge tier 1 |
| `recruiter_ii.png` | PNG | ✅ Available | Recruiter badge tier 2 |
| `recruiter_iii.png` | PNG | ✅ Available | Recruiter badge tier 3 |
| `teacher_connector.png` | PNG | ✅ Available | Teacher connector badge |

**Total Individual Visual Files:** **31 PNG files**

---

### ✅ Neon Cyber Icon Pack

**Location:** `public/visuals/neon_cyber_icon_pack/icon_pack/`

**Icon Names (10 icons):**
1. `assignment` 
2. `clan`
3. `invite_friend`
4. `invite_teacher`
5. `leaderboard`
6. `premium`
7. `quest`
8. `reward_chest`
9. `school_unlock`
10. `streak`

**Available Variants:**

| Variant | PNG | SVG | Status |
|---------|-----|-----|--------|
| `accent` (color) | ✅ 10 files | ✅ 10 files | Available |
| `white` (monochrome) | ✅ 10 files | ✅ 10 files | Available |

**Directory Structure:**
- `png/accent/` — 10 color PNG icons
- `png/white/` — 10 white PNG icons  
- `svg/accent/` — 10 color SVG icons
- `svg/white/` — 10 white SVG icons
- `manifest.json` — Icon metadata

**Total Icon Pack Files:** **40 files (10 icons × 2 colors × 2 formats)**

---

## Part 2: Code References Analysis

### Search Results: Active Usage in Source Code

**Scope:** Searched all `*.tsx`, `*.ts`, `*.jsx`, `*.js` files in:
- `/components/` (151 component files)
- `/services/` (50+ service files)
- `/src/` (80+ utility/lib files)
- Root level TypeScript files

**Search Patterns Used:**
1. Direct file name references (e.g., `"1-day.png"`, `"Daily-Reward.png"`)
2. Path patterns (e.g., `/visuals/`, `src="/visuals/`)
3. Dynamic path construction patterns
4. Background image references

**Result:** ❌ **NO ACTIVE REFERENCES FOUND**

All 31 individual visual files + neon icon pack are **not currently being imported or referenced** in any TypeScript/React component or service file.

### Documented Usage (Documentation Only)

**Files with references:**
- ✅ `VISUAL_ASSET_IMPLEMENTATION_MAP.md` — Contains all visual files listed with implementation targets

**Meaning:** These assets are planned/documented but not yet integrated into component code.

---

## Part 3: Component Status

### Key Components (Per Implementation Map)

These components are **expected** to use visuals but currently **do NOT reference them**:

| Component | Expected Visuals | Current Status |
|-----------|---|---|
| `StreakTracker.tsx` | 1-day.png through 30-day.png | ❌ No references |
| `RewardModal.tsx` | Streak badges | ❌ No references |
| `MainActions.tsx` | Daily-Reward.png, Today's-3-Moves.png | ❌ No references |
| `MissionConsole.tsx` | Quick-Quest-card-illustration.png | ❌ No references |
| `JoinSchoolCard.tsx` | Unlock-School-*.png, Teacher-invite-hero-visual.png, We-need-our-teacher-to-activate-class.png | ❌ No references |
| `UpgradeModal.tsx` | Upgrade-to-Prime.png, Only-Prime-Users.png, Locked-feature-without-frustration.png | ❌ No references |
| `ReferralCard.tsx` | Invite-Friend-social-action-illustration.png | ❌ No references |
| `IeltsHome.tsx` | Prime/upgrade visuals | ❌ No references |

---

## Part 4: Implementation Readiness

### ✅ What's Ready for Implementation

| Asset Category | Count | Ready | Path |
|---|---|---|---|
| Individual Streak Badges | 6 | ✅ Yes | `/public/visuals/1-day.png` etc. |
| Engagement Visuals | 4 | ✅ Yes | `/public/visuals/Monday-Boost.png` etc. |
| Mission/Quest Surfaces | 3 | ✅ Yes | `/public/visuals/Quick-Quest-card-illustration.png` etc. |
| Social Surfaces | 5 | ✅ Yes | `/public/visuals/Invite-Friend*.png` etc. |
| School Unlock Gating | 4 | ✅ Yes | `/public/visuals/Unlock-School-*.png` |
| Prime/Upgrade Surfaces | 3 | ✅ Yes | `/public/visuals/Upgrade-to-Prime.png` etc. |
| Badge Assets | 5 | ✅ Yes | `/public/visuals/{class_builder,recruiter_*,teacher_connector}.png` |
| Neon Cyber Icon Pack | 40 | ✅ Yes | `/public/visuals/neon_cyber_icon_pack/icon_pack/{png,svg}/{accent,white}/` |

**Total Assets Ready:** **30 visual files + 40 icon variants**

---

## Part 5: Recommended Next Steps

### For Developers Implementing Visuals

1. **Reference Pattern:** Use relative path from public folder:
   ```tsx
   <img src="/visuals/1-day.png" alt="1-day streak badge" />
   ```

2. **Component Updates Needed:**
   - `StreakTracker.tsx` — Add streak badge images (1-7-14-30 day)
   - `MainActions.tsx` — Add Daily-Reward.png and Today's-3-Moves.png
   - `JoinSchoolCard.tsx` — Add Unlock-School-*.png visuals
   - `UpgradeModal.tsx` — Add Upgrade-to-Prime.png hero image
   - Icon implementations — Use neon_cyber_icon_pack across UI

3. **Icon Pack Implementation:**
   - Use PNG files for direct rendering
   - Use SVG files for dynamic styling (color changes, animations)
   - Reference manifest.json for metadata if needed

4. **Quick Import Template:**
   ```tsx
   // Import at component level
   const streakBadges = {
     1: '/visuals/1-day.png',
     3: '/visuals/3-day.png',
     5: '/visuals/5-day.png',
     7: '/visuals/7-day.png',
     14: '/visuals/14-day.png',
     30: '/visuals/30-day.png',
   };
   
   // Use in JSX
   <img src={streakBadges[streak]} alt={`${streak}-day streak`} />
   ```

---

## Part 6: Summary Table

| Metric | Count | Status |
|--------|-------|--------|
| **Visual Files on Disk** | 31 | ✅ All present |
| **Neon Icon Variants** | 40 | ✅ All present |
| **Total Assets Available** | 71 | ✅ Ready |
| **Active Code References** | 0 | ❌ Not yet implemented |
| **Planned Components** | 8+ | 📋 Documented only |
| **Components with Implementation** | 0 | ❌ Awaiting development |

---

## Notes

- **Status Date:** March 16, 2026
- **Audit Method:** Recursive file system scan + grep pattern matching across all TypeScript/React files
- **Next Update:** Run `VISUAL_ASSETS_USAGE_REPORT.md` refresh after implementing first batch of visual assets
- **Reference Document:** See [VISUAL_ASSET_IMPLEMENTATION_MAP.md](VISUAL_ASSET_IMPLEMENTATION_MAP.md) for planned implementation locations

---

**Report Complete** ✓
