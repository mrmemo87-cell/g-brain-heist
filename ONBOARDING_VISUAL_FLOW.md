# Onboarding Redesign - Visual Flow Guide

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    ENTRY SCREEN (Optional)                      │
│  ┌────────────────────────┐  ┌────────────────────────┐        │
│  │   🧠 Brains Heist      │  │   📚 IELTS Hub         │        │
│  │   ─────────────────    │  │   ──────────────       │        │
│  │   Gamified Learning    │  │   IELTS Preparation    │        │
│  │   PvP • Clans • Quests │  │   R•W•L•S Practice     │        │
│  └────────────────────────┘  └────────────────────────┘        │
│           ▼                              ▼                       │
│    Select Brains Heist           Redirect to /ielts            │
└─────────────────────────────────────────────────────────────────┘
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                    LOGIN / SIGNUP                               │
│  ┌─────────────────────────────────────────────────────┐       │
│  │  Email: _______________                             │       │
│  │  Password: ___________                              │       │
│  │  Username: ___________  (signup only)               │       │
│  │                                                      │       │
│  │  [Login]  [Sign Up]  [Google Sign In]               │       │
│  └─────────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────┘
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│               SETUP WIZARD - STEP 1                             │
│  Progress: ●●○○  (Step 1 of 3)                                 │
│  ┌─────────────────────────────────────────────────────┐       │
│  │       🏫 Join a School                              │       │
│  │       Use invite code • School leaderboards         │       │
│  │       [Enter invite code →]                         │       │
│  └─────────────────────────────────────────────────────┘       │
│  ┌─────────────────────────────────────────────────────┐       │
│  │       🎯 Continue Solo                              │       │
│  │       Play individually • Join school later         │       │
│  │       [Start playing →]                             │       │
│  └─────────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────┘
          ▼                              ▼
    [School Path]                  [Individual Path]

┌──────────────────────────┐    ┌──────────────────────────┐
│   SCHOOL PATH            │    │   INDIVIDUAL PATH        │
└──────────────────────────┘    └──────────────────────────┘

SCHOOL STEP 2:                   INDIVIDUAL STEP 2:
┌─────────────────────────┐      ┌─────────────────────────┐
│ Enter Invite Code       │      │ Choose Role             │
│ Progress: ●●●○ (2/4)    │      │ Progress: ●●●○ (2/3)    │
│                         │      │                         │
│ Code: [XXXXXXXX]        │      │ ○ 🎓 Student           │
│ [Continue]              │      │ ○ 👨‍🏫 Teacher           │
└─────────────────────────┘      └─────────────────────────┘
          ▼                                ▼
SCHOOL STEP 3:                   INDIVIDUAL STEP 3 (if student):
┌─────────────────────────┐      ┌─────────────────────────┐
│ Choose Role             │      │ Student Details         │
│ Progress: ●●●● (3/4)    │      │ Progress: ●●●● (3/3)    │
│ Joining: ABC School     │      │                         │
│                         │      │ Grade: [Select ▼]      │
│ ○ 🎓 Student           │      │ Class: [Select ▼]      │
│ ○ 👨‍🏫 Teacher           │      │ [Complete Setup]       │
└─────────────────────────┘      └─────────────────────────┘
          ▼                                ▼
SCHOOL STEP 4 (if student):      [Done - Call completeIndividualSetup]
┌─────────────────────────┐
│ Student Details         │
│ Progress: ●●●● (4/4)    │
│                         │
│ Grade: [Select ▼]      │
│ Class: [Select ▼]      │
│ [Complete Setup]        │
└─────────────────────────┘
          ▼
[Done - Call join_school_by_code]

                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                      DASHBOARD                                  │
│  ┌────────────────────────────────────────────────────┐        │
│  │  [Profile]  [Stats]  [Navigation]                  │        │
│  └────────────────────────────────────────────────────┘        │
│                                                                  │
│  ┌────────────────────────────────────────────────────┐        │
│  │  [Quest]  [PvP]  [Shop]  [Clan]  ...               │        │
│  └────────────────────────────────────────────────────┘        │
│                                                                  │
│  IF NO SCHOOL: ▼                                                │
│  ┌────────────────────────────────────────────────────┐        │
│  │  🏫 Join Your School          [▼]                  │        │
│  │  ─────────────────────────────────                 │        │
│  │  ✓ School leaderboards  ✓ Join clans              │        │
│  │  ✓ Competitions        ✓ Teacher assignments      │        │
│  │                                                     │        │
│  │  Invite Code: [XXXXXXXX] [Join]                   │        │
│  │  Don't have a code? Request school access →        │        │
│  └────────────────────────────────────────────────────┘        │
│                                                                  │
│  [Tasks] [Caps] [News]                                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## Component States

### EntryScreen.tsx
```
┌─────────────────────────────────────────────┐
│          Choose Your Mission                │
│                                             │
│  ┌──────────────┐    ┌──────────────┐     │
│  │ 🧠           │    │ 📚           │     │
│  │ Brains Heist │    │ IELTS Hub    │     │
│  │              │    │              │     │
│  │ • PvP Battles│    │ • Reading    │     │
│  │ • Clan Wars  │    │ • Writing    │     │
│  │ • Leaderboard│    │ • Listening  │     │
│  │              │    │ • Speaking   │     │
│  │ [Start →]    │    │ [Start →]    │     │
│  └──────────────┘    └──────────────┘     │
│                                             │
│  You can switch between platforms anytime  │
└─────────────────────────────────────────────┘

States:
- Default: Both cards visible, animated background
- Hover: Card scales up (1.02), border glows
- Active: Card scales down (0.98)
- Click: Routes to selected app
```

### SetupWizard.tsx - Path Selection
```
┌─────────────────────────────────────────────┐
│  Welcome, Agent                             │
│  How do you want to start your mission?     │
│                                             │
│  Progress: ●●○○  Step 1 of 3               │
│                                             │
│  ┌─────────────────────────────────┐       │
│  │ 🏫 Join a School                │       │
│  │ Use an invite code. Compete     │       │
│  │ with classmates.                │       │
│  │ [Enter invite code →]           │       │
│  └─────────────────────────────────┘       │
│                                             │
│  ┌─────────────────────────────────┐       │
│  │ 🎯 Continue Solo                │       │
│  │ Play individually. Join school  │       │
│  │ later.                          │       │
│  │ [Start playing →]               │       │
│  └─────────────────────────────────┘       │
│                                             │
│  [Sign out and use different account]      │
└─────────────────────────────────────────────┘

States:
- Default: Two options visible
- Hover: Card border changes color, scales up
- Click: Transitions to next step (slide-up animation)
- Loading: Disabled state, cursor not-allowed
```

### SetupWizard.tsx - Invite Code Entry
```
┌─────────────────────────────────────────────┐
│  Enter Invite Code                          │
│  Get this from your school admin            │
│                                             │
│  Progress: ●●●○  Step 2 of 4               │
│                                             │
│  Invite Code                                │
│  ┌─────────────────┐                       │
│  │   XXXXXXXX      │                       │
│  └─────────────────┘                       │
│                                             │
│  [Continue]                                 │
│                                             │
│  [← Back]                                   │
│                                             │
│  ────────────────────────                  │
│  Don't have a code?                         │
│  Request school access →                    │
└─────────────────────────────────────────────┘

States:
- Empty: Button disabled (gray)
- Valid code (6+ chars): Button enabled (cyan gradient)
- Validating: Button shows "Validating...", disabled
- Error: Red border + shake animation, error message below
- Success: Transition to role selection
```

### SetupWizard.tsx - Role Selection
```
┌─────────────────────────────────────────────┐
│  Joining: ABC School                        │
│  Are you a student or teacher?              │
│                                             │
│  Progress: ●●●● Step 3 of 4                │
│                                             │
│  ┌─────────────────────────────────┐       │
│  │ 🎓 Student                      │       │
│  │ Complete quests, earn rewards   │       │
│  │                            [→]  │       │
│  └─────────────────────────────────┘       │
│                                             │
│  ┌─────────────────────────────────┐       │
│  │ 👨‍🏫 Teacher                      │       │
│  │ Create assignments, monitor     │       │
│  │                            [→]  │       │
│  └─────────────────────────────────┘       │
│                                             │
│  [← Back]                                   │
└─────────────────────────────────────────────┘

States:
- Default: Two options, hover effects
- Teacher selected: Immediately submits (no grade/batch needed)
- Student selected: Transitions to student details step
- Loading: Both cards disabled
```

### SetupWizard.tsx - Student Details
```
┌─────────────────────────────────────────────┐
│  Student Details                            │
│  Help us place you on right leaderboards    │
│                                             │
│  Progress: ●●●● Step 4 of 4                │
│                                             │
│  Grade *                                    │
│  ┌─────────────────────────────────┐       │
│  │ Select your grade         [▼]   │       │
│  └─────────────────────────────────┘       │
│                                             │
│  Class / Batch *                            │
│  ┌─────────────────────────────────┐       │
│  │ Select class              [▼]   │       │
│  └─────────────────────────────────┘       │
│                                             │
│  [Complete Setup]                           │
│                                             │
│  [← Back]                                   │
└─────────────────────────────────────────────┘

States:
- Empty: "Complete Setup" button disabled
- Grade selected: Batch dropdown enabled
- Both selected: "Complete Setup" enabled (cyan gradient)
- Submitting: Button shows "Setting up...", spinner
- Error: Red error message, shake animation
- Success: Transition to dashboard
```

### JoinSchoolCard.tsx - Collapsed
```
┌─────────────────────────────────────────────┐
│  🏫 Join Your School                   [▼] │
│  Get full access to school features        │
└─────────────────────────────────────────────┘

States:
- Collapsed: Single row, subtle glow
- Hover: Background lightens, cursor pointer
- Click: Expands (smooth max-height transition)
```

### JoinSchoolCard.tsx - Expanded
```
┌─────────────────────────────────────────────┐
│  🏫 Join Your School                   [▲] │
│  Click to collapse                          │
│  ───────────────────────────────────────── │
│                                             │
│  ✓ School leaderboards  ✓ Join school clan │
│  ✓ School competitions  ✓ Teacher assign's │
│                                             │
│  Enter Invite Code                          │
│  ┌───────────────────┬──────┐              │
│  │ XXXXXXXX          │ Join │              │
│  └───────────────────┴──────┘              │
│                                             │
│  ────────────────────────                  │
│  Don't have a code?                         │
│  Request school access →                    │
└─────────────────────────────────────────────┘

States:
- Expanded: Full content visible
- Code entry: Focus ring on input
- Validating: "Join" button shows "..."
- Error: Red text below input
- Success: Card collapses, dashboard refreshes
```

---

## Animation Timing

```
Entry Screen:
├── Logo float: 3s infinite
├── Background pulse: 4s infinite (staggered)
├── Title fade-in: 0.6s (0s delay)
└── Cards slide-up: 0.8s (0.2s delay)

Setup Wizard:
├── Step transitions: 0.5s slide-up
├── Step indicators: 0.3s width/color
├── Error shake: 0.3s
└── Loading spinner: infinite rotation

Join School Card:
├── Expand/collapse: 0.3s max-height
├── Hover scale: 0.2s transform
└── Checkmark fade-in: 0.3s
```

---

## Responsive Breakpoints

```css
/* Mobile First (default) */
- Single column layouts
- Full-width buttons
- Touch-friendly targets (min 44px)
- Text: text-sm (14px)

/* Tablet (md: 768px) */
- Two-column grids
- Side-by-side cards
- Text: text-base (16px)

/* Desktop (lg: 1024px+) */
- Hover states active
- Larger logo/spacing
- Text: text-lg (18px)
```

---

## Color States

### Buttons
```
Default: bg-gray-700 text-gray-300
Hover: bg-gray-600 text-white
Active: bg-gray-500
Disabled: bg-gray-800 text-gray-600 cursor-not-allowed

Primary (Cyan):
Default: bg-gradient-to-r from-cyan-500 to-cyan-600
Hover: from-cyan-600 to-cyan-700
Active: from-cyan-700 to-cyan-800
Disabled: from-gray-700 to-gray-700
```

### Borders
```
Default: border-gray-700
Hover: border-cyan-400/50
Focus: ring-2 ring-cyan-400
Error: border-red-500
```

### Text
```
Primary: text-white
Secondary: text-gray-300
Muted: text-gray-400
Error: text-red-400
Success: text-cyan-400
```

---

## Mobile Touch Targets

All interactive elements meet WCAG 2.1 minimum size (44x44px):

```
✓ Card buttons: min-h-[100px]
✓ Navigation buttons: py-3 (48px minimum)
✓ Input fields: p-4 (56px height)
✓ Icon buttons: w-12 h-12
✓ Collapse toggle: p-4 (56px height)
```

---

## Loading States

```
┌─────────────────────────────────────┐
│        Setting up your mission...   │
│                                     │
│            ◐ (spinning)             │
│                                     │
│        This will only take a moment │
└─────────────────────────────────────┘

Spinner: border-4 border-cyan-400/30 border-t-cyan-400
Animation: 1s linear infinite rotation
```

---

## Error States

```
┌─────────────────────────────────────┐
│  [Content with error]               │
│                                     │
│  ┌─────────────────────────────┐   │
│  │ ⚠️ Invalid invite code      │   │
│  └─────────────────────────────┘   │
│  (Shakes horizontally)              │
└─────────────────────────────────────┘

Error box:
- Red border: border-red-500/50
- Red background: bg-red-500/10
- Red text: text-red-400
- Shake animation: 0.3s
```

This visual guide should help developers and designers understand the complete flow and states of the new onboarding system!
