# Brains Heist UI/UX Design Reference

## Visual Principles
- **Theme**: Light-mode agency dashboard with bright whites, cool grays (#F4F6FB backgrounds, #1E2A44 headings) and accent colors (#4A90E2 success, #F5A623 warning, #D0021B danger, #7ED321 progress) that maintain accessibility.
- **Typography**: Use modern sans-serif (e.g., Inter). Headings bold 600-700, body 400, micro-labels uppercase 500.
- **Interaction**: Subtle hover lifts (2px shadow), soft fades (150ms ease), never harsh flashes or shaking. Micro progress pulses (opacity 0.8→1) for live elements.
- **Layout Rhythm**: 8pt spacing grid; cards with 16px padding, 12px gutters. Mobile-first stacked layouts; desktop uses 12-col responsive grid.
- **Iconography**: Outline spy gadgets (radar, dossier) with simple lines. Status chips use icon + text (e.g., shield for locked, lightning for crushed).

---

## Student Experience

### 1. Home / Mission Hub
```
[Top Bar]
 ├─ Logo + "Agent Codename"
 ├─ Notification bell (badge)
 └─ Quick action: "Resume Mission"

[Hero Card]
 ├─ Mission Title + timer chip
 ├─ CTA button: "Enter Mission"
 └─ Subtext: "Next checkpoint in 2 tasks"

[Upcoming Homework Carousel]
 ├─ Horizontal cards: Subject, due date, difficulty chip
 └─ Mobile: swipe; Desktop: 3 cards visible

[Quick Battles]
 ├─ Mini list of PvP challenges (player avatar, reward)
 └─ Button: "Join Lobby"

[Progress Snapshot]
 ├─ Circular progress per topic (crushed/average/struggled)
 └─ Link: "View Progress Map"
```

### 2. Progress Map
```
[Header]
 ├─ Filter chips: Subject, Timeframe
 └─ Legend: Crushed (green), Average (blue), Struggled (amber), Locked (gray)

[Scrollable Path]
 ├─ Node clusters grouped by mission arc
 ├─ Each node = TopicNode component
 │    • Status chip + % mastery
 │    • Micro icon for topic
 └─ Tap node → detail drawer with recommended action

[Action Drawer]
 ├─ Summary stats, "Replay Mission" button, "Request Handler" link
 └─ Suggested resources list
```

### 3. Mission Screen (Solo)
```
[Top Strip]
 ├─ Mission title
 ├─ Timer pill (soft blue background, countdown digits)
 └─ Lifelines icon row (hints)

[Question Panel]
 ├─ Stem text with emphasis styles
 ├─ Media slot (image/audio)
 └─ Progress bar (questions left)

[Answer Grid]
 ├─ 2x2 buttons on mobile stacking
 └─ Selection highlight: subtle glow + check icon

[Bottom Summary Drawer (after mission)]
 ├─ Score badge + XP earned
 ├─ Two-column cards: "You crushed" / "Needs work"
 └─ CTA buttons: "Review mistakes" and "Jump to struggled topic"
```

### 4. Battle Screen (PvP)
```
[Top Banner]
 ├─ Versus avatars side-by-side (mobile stacked)
 └─ Score + streak chips

[Shared Question Panel]
 ├─ Prompt text + media slot
 └─ Timer bar across top (fills down as time passes)

[Answer Matrix]
 ├─ Each player column with answer buttons
 ├─ Locked once selected, subtle fade

[Feed]
 ├─ Minimal log: "Agent Nova answered in 3s (+20 pts)"
 └─ No flashing; entries slide up softly

[Result Modal]
 ├─ Winner highlight, XP tally
 └─ Share button + "Rematch" CTA
```

### 5. History & Stats
```
[Segmented Control]
 ├─ Tabs: Missions / Battles / Topics

[Topic Breakdown]
 ├─ Table rows: Topic | Status chip | Accuracy | Last attempt
 └─ "Retry" button for struggled topics

[Trend Cards]
 ├─ Sparkline of accuracy over time
 └─ Achievement badges
```

---

## Teacher Experience

### 1. Dashboard
```
[Header]
 ├─ Handler avatar + quick links (Alerts, Settings)
 └─ Global stats chips (Active missions, Avg XP, Battle queue)

[Class Cards Grid]
 ├─ Card: Class name, # agents, mission status
 └─ Icons for most-struggled topic + CTA: "View analytics"

[Alerts Panel]
 ├─ List of flagged students/topics
 └─ Buttons: "Assign support mission"
```

### 2. Content Builder
```
[Side Tree]
 ├─ Subject > Topic > Task group (expand/collapse)
 └─ Icons for item counts

[Question Workspace]
 ├─ Filters (difficulty, tags, author)
 ├─ Table list: Question title, type, last edited, owner
 └─ Detail drawer for editing

[Creation Toolbar]
 ├─ Buttons: +Mission, +Question, Import
 └─ Status indicator (draft/published)
```

### 3. Scheduler
```
[Toggle]
 ├─ Calendar view / List view

[Calendar]
 ├─ Week rows, colored chips for Mission vs Homework
 └─ Drag to schedule; modal with due date, class, reminders

[List]
 ├─ Upcoming events sorted by date
 └─ Quick actions: notify class, duplicate schedule
```

### 4. Analytics
```
[Heatmap]
 ├─ Topics vs Classes grid (soft greens/blues)
 └─ Hover → tooltip with accuracy, attempts

[Student Drawer]
 ├─ Opens right side with selected student card
 ├─ Mini progress map + stats summary
 └─ Buttons: "Send note", "Assign booster"
```

---

## Reusable Components
- **TopNavBar**: logo, profile, action buttons.
- **StatusChip**: color-coded statuses (crushed, average, struggled, locked).
- **MissionCard**: title, timer, CTA, progress snippet.
- **HomeworkCard**: due date, difficulty, subject icon.
- **BattleScoreBar**: avatar, score, streak indicator.
- **TopicNode**: map node with status, mastery %, action button.
- **QuestionPanel**: consistent layout for question stem/media.
- **AnswerButton**: large touch target with selection states.
- **ProgressBar**: linear indicator used in missions/battles.
- **ResultSummaryPanel**: highlights strengths/weaknesses.
- **HeatmapGrid**: teacher analytics matrix component.
- **ClassCard**: teacher dashboard item with class metrics.
- **ContentTree**: expandable subject/topic tree.
- **SchedulerEventChip**: mission/homework event representation.
- **StatsTable**: sortable table for history & topic breakdowns.
- **ActionDrawer**: slide-up/slide-over contextual detail panel.

---

## Key Flows

### Student: Joining a Battle
1. From Home Hub, agent taps "Join Lobby" under Quick Battles.
2. Lobby modal lists available matches with status chips (open/full). Agent selects one.
3. Pre-battle screen shows opponent, rewards, and "Ready" button. When both ready, screen transitions softly to battle layout.
4. During battle, shared question panel syncs between both columns; timer bar counts down. Scores update in BattleScoreBar after each question.
5. After final question, Result Modal appears with winner highlight, XP, and options: "Rematch" or "Analyze Battle" (opens History & Stats with filtered battle recap).

### Student: Reviewing a Struggled Topic
1. Agent opens History & Stats and switches to Topics tab via segmented control.
2. Table rows show StatusChips; agent taps "Retry" on a Struggled item.
3. ActionDrawer slides up with topic summary, past mistakes, and "Launch Booster Mission" CTA.
4. Selecting CTA routes to Mission Screen preflight; mission uses same QuestionPanel layout. Upon completion, ResultSummaryPanel emphasizes improvement and offers "Back to Progress Map" button.

### Teacher: Assigning Homework
1. Handler opens Scheduler and switches to List view for quick planning.
2. Taps "+ Mission" in Creation Toolbar, opening scheduling modal.
3. Modal collects: subject, topic, class, due date, optional reminders. Status indicator shows Draft until published.
4. On Save, event appears in Calendar/List as SchedulerEventChip color-coded for homework. Handler can tap chip to edit, notify class, or duplicate for other classes.
5. Students see the homework in their Home Hub Upcoming Homework carousel.

### Teacher: Investigating Struggled Topics
1. From Dashboard, handler checks Alerts Panel and clicks "Most-struggled topic" link on a ClassCard.
2. Redirects to Analytics view with HeatmapGrid filtered to that class/topic.
3. Handler selects a cell to open Student Drawer, showing each agent's mastery, attempt counts, and mini progress map.
4. Handler can send a note (triggering message via Supabase) or assign a booster mission directly from the drawer.

---

## Accessibility Notes
- Minimum contrast ratio 4.5:1 for text; chips use darker text on light backgrounds.
- All timers and colors are supplemented with text labels (e.g., "02:15 left").
- Animations under 150ms, no looping flashes; respect reduced motion preferences by disabling progress pulses.

