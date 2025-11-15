# Teacher & School Systems Blueprint

This blueprint translates the product requirements for Brains Heist handler tooling into shippable flows. It details the steps teachers, lead teachers, and admins follow to manage content, monitor performance, schedule assignments, and optionally run PvP events.

## Content Management

### 1. Subject & Topic Browser
1. Handler opens **Content > Subjects**.
2. Left sidebar lists all subjects the handler can access (role-filtered).
3. Selecting a subject populates the main panel with topic cards that include:
   - Total task groups.
   - Total questions.
   - Last edited timestamp + teacher avatar.
4. Toolbar actions: `+ Subject`, `Assign Owner` (admin/lead only), `Filter by grade`.

**Backend needs**: subjects, topics, and ownership metadata; aggregate counts of task groups/questions per topic.

### 2. Topic Detail / Task Group Table
1. Clicking a topic opens a sortable table of task groups.
2. Columns: Name, # Questions, Difficulty tags, Last editor, Status (draft/published), Version icon.
3. Inline actions per row: open editor, duplicate, archive, delete (role-limited).
4. Bulk actions for admins: lock/unlock, assign reviewers.

**Backend needs**: task group metadata, audit trail of creators/editors, bulk mutation endpoints.

### 3. Task Group Editor & Question List
1. Header shows task group metadata (subject, topic, difficulty, visibility, author).
2. Body lists questions with chips for type/difficulty/tags plus creator & last editor avatars.
3. Actions: add question, reorder, toggle active, bulk import (CSV/AI), preview entire mission.
4. Right rail: live preview and history timeline (version diff, rollback).

**Backend needs**: question CRUD API, ordering metadata, history/audit storage, preview endpoint.

### 4. Question CRUD Surface
1. Modal or full page with tabs `Content`, `Answers`, `Hints`, `Metadata`.
2. Required inputs: stem, correct answer(s), difficulty, tags, attachments.
3. Save triggers validation + audit log entry; success toast links back to list.
4. Delete provides soft-delete option with restore from history.

**Backend needs**: validation rules, audit logging, version recovery, attachment storage links.

## Class Analytics

### 1. Overview Dashboard
1. Landing screen lists each class as a tile showing Avg Accuracy, Completion Rate, and Top 3 weak topics (chips with % accuracy).
2. Filters for teacher/lead/admin views, grade level, subject, and date range.
3. Tiles link to class detail panel.

**Backend needs**: aggregated `question_attempts`, completion metrics, topic weakness calculations, role-scoped access.

### 2. Topic Heatmap
1. Within a class detail page, show matrix (rows: students, columns: topics) with color coding for accuracy/completion.
2. Hover reveals per-topic stats plus last mission date.
3. Toggle to switch between Accuracy vs Completion view.

**Backend needs**: normalized student-topic metrics, last activity timestamps.

### 3. Student Drill-Down
1. Selecting a student opens drawer with tabs:
   - **Progress Map**: mission nodes with status and XP earned.
   - **Mission History**: table listing assignments, accuracy, completion date, XP/coin rewards.
   - **Battle Outcomes**: PvP participation log (opponent, result, reward).
2. Lead teachers can swap between classes; admins see cross-class summary.

**Backend needs**: student progress graph data, mission attempt history, PvP battle logs.

### 4. School Owner View
1. Admin-only selector toggles cross-class analytics (trend lines for accuracy/completion, weakest topics by grade).
2. Export button to download CSV or share snapshot with stakeholders.

**Backend needs**: aggregated metrics per class, grade, department; export service.

## Assignments & Scheduling

### 1. Assignment Creation Wizard
1. Step 1: Choose task group (search/filter/favorites, show question counts and difficulty).
2. Step 2: Select targets (class, subgroup, individual students) with multi-select chips and saved filters.
3. Step 3: Set schedule (start/end/due, timezone, recurrence optional) and add instructions.
4. Step 4: Review summary, confirm rewards (XP/coins), and publish.

**Backend needs**: task group catalog, targeting rules, schedule validation, recurrence support.

### 2. Assignment Management Views
1. Dual toggle between **List** and **Calendar**.
2. List rows show status (upcoming/active/completed), start/end, assigned vs completed counts, quick actions (edit, clone, cancel).
3. Calendar displays assignment bars across weeks, color-coded by status; clicking opens detail drawer with performance metrics.
4. Notifications area highlights assignments ending soon or low completion.

**Backend needs**: assignment state machine, progress tracking, notification service hooks.

## PvP & Events (Optional Layer)

### 1. Event Builder
1. Choose format (bracket tournament vs challenge day) and participating classes/subgroups.
2. Configure start/end, scoring rules, rewards, and optional seeding.
3. Publish to generate brackets/challenge board.

### 2. Leaderboard & Participation Panel
1. Real-time leaderboard showing rank, wins/losses, badges earned.
2. Participation metrics (students joined vs eligible, total matches played).
3. Export standings or share to class channels.

**Backend needs**: event entity, bracket generation logic, live scoring updates.

## Role Levels & Permissions

| Role | Scope | Capabilities |
| --- | --- | --- |
| Teacher | Assigned subjects/classes | Create/edit content within owned topics, view own classes, schedule assignments for own students. |
| Lead Teacher | Department/grade span | View/manage multiple classes, approve content, monitor department analytics, run events within scope. |
| Admin / School Owner | Entire school | Manage roles, lock content, access cross-class analytics, export reports, orchestrate school-wide events. |

Role checks apply to every flow above. Admins can view/edit everything, lead teachers inherit teacher tools plus multi-class controls, and teachers see only their assignments and content.

## Screen Reference Checklist

| Screen / Section | Key UI Components | Primary Data Feeds |
| --- | --- | --- |
| Subject Browser | Subject sidebar, topic cards, counts badges, ownership toolbar | Subjects/topics aggregates |
| Task Group Editor | Question list table, preview pane, history timeline | Questions, audit logs |
| Class Analytics Dashboard | Class tiles, filters, weak topic chips | Aggregated attempt metrics |
| Topic Heatmap | Matrix grid, hover tooltips, accuracy/completion toggle | Student-topic stats |
| Student Drawer | Tabs (progress map, mission history, battle outcomes) | Missions, PvP logs |
| Assignment Wizard | Stepper, selectors, schedule form, review card | Task groups, schedules |
| Assignment List/Calendar | Status list, calendar grid, notification banner | Assignment states |
| Event Manager | Format selector, bracket display, leaderboard widget | PvP events, standings |

Use this document as the shared contract between product, design, and engineering when implementing handler experiences.
