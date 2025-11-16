# IELTS Prep Center Functional Specification

## 1. Scope Overview
The IELTS Prep Center is a self-contained academic module within Brain Heist that shares only authentication and the `profiles.id` identity with the broader app. It excludes all game mechanics (XP, coins, items, hacks, PvP, leaderboards, streaks, etc.) and is visually separated via a dedicated layout with muted academic styling.

Primary audiences:
- **Students in Bishkek** preparing for academic IELTS.
- **Teachers/admins** (center owner and designated instructors) monitoring student progress.

## 2. Sections & Subpages
Top-level navigation entry: `IELTS Prep Center` tab in the global nav.
Once inside, a local sub-navigation (left sidebar or top tabs) exposes these routes:
1. **Overview / Dashboard** – summary of current band estimations, recent activity, quick links.
2. **Reading** – library of reading passages, attempt history, and new attempt flow.
3. **Listening** – library of listening sets, attempt history, and player/answer UI.
4. **Writing** – writing task bank (Task 1 and 2), submission editor, evaluation history.
5. **Speaking** – speaking prompts (Part 1–3), recorder/upload, feedback review.
6. **Skills Lab** – vocabulary, grammar, and trap drills.
7. **Tests** – weekly/mock test assignments, attempt results.
8. **Progress** – analytics dashboard for the logged-in student across all skills.
9. **Teacher** – access-controlled dashboard for instructors/admins.

Each section is autonomous, uses academic copy, and excludes all references to games, heists, or neon visuals.

## 3. Student User Flows
### 3.1 Overview / Dashboard
1. Student clicks `IELTS Prep Center` from global nav.
2. Overview page fetches aggregated metrics (average band per skill, recent attempts, scheduled tests).
3. Calls to action: “Start Reading Practice”, “Continue Writing Task”, etc.

### 3.2 Reading Practice Flow
1. Navigate to `/ielts/reading`.
2. See list of reading sets with metadata (title, level, duration, estimated band).
3. Selecting a set opens detail view (`/ielts/reading/:setId`) with passage and question list.
4. Student starts attempt: timer + answer entry UI per question type (MCQ, T/F/NG, matching, short answer).
5. On submission, front-end posts answers to `reading_attempts`. Backend grades, returns score/band.
6. Attempt summary view shows score breakdown, question review, recommended next actions.

### 3.3 Listening Practice Flow
Similar to Reading but with audio player:
1. `/ielts/listening` lists listening sets with metadata and audio duration.
2. Detail page includes audio URL, script (optional), and question panes.
3. Student answers while audio plays; submission stores attempt and returns score/band.

### 3.4 Writing Flow
1. `/ielts/writing` lists Task 1 and Task 2 prompts (filters by type/topic).
2. Student opens a prompt to view instructions and sample answer (if available).
3. Text editor with word count + timer is provided. Student submits writing attempt.
4. Attempt stored with raw text. Automated scoring service (or teacher) updates band score and feedback later.
5. Student views feedback history sorted by latest.

### 3.5 Speaking Flow
1. `/ielts/speaking` displays tasks grouped by Part 1/2/3.
2. Student opens a task, records audio (via browser) or uploads file.
3. Submission stores audio URL + optional transcript. Band score/feedback appended after evaluation.

### 3.6 Skills Lab Flow
1. `/ielts/skills` features tabs for Vocabulary, Grammar, Traps.
2. Each drill set displays description, target skill, and question format (flashcards, fill-in, multiple choice).
3. Attempt submission logs accuracy and completion time; UI surfaces explanations.

### 3.7 Tests Flow
1. `/ielts/tests` shows scheduled mock/weekly tests with recommended time.
2. Student launches a mock test which sequences Reading, Listening, Writing, Speaking modules per configuration.
3. After completion, a consolidated score sheet is stored in `mock_test_attempts` and summarized.

### 3.8 Progress Flow
1. `/ielts/progress` fetches aggregated metrics (average band per skill, attempt counts, time spent).
2. Charts (line graphs) visualize band trends for Reading/Listening/Writing/Speaking.
3. Section also highlights skill-specific strengths and weaknesses derived from attempt analytics.

## 4. Teacher/Admin User Flows
Access gated by role (flag on profile or separate mapping table).

### 4.1 Teacher Dashboard Overview
1. Teacher clicks `IELTS Prep Center` > `Teacher` route (`/ielts/teacher`).
2. Dashboard displays cohort summary: number of active students, recent submissions awaiting grading, average bands per skill.

### 4.2 Student Detail View
1. Teacher selects a student to open `/ielts/teacher/students/:profileId`.
2. View shows per-skill accuracy, attempt history, writing/speaking band trends, time spent, strengths/weaknesses.
3. Teacher can add feedback comments or update band scores for writing/speaking attempts.

### 4.3 Content Management
(Optional initial scope) Provide UI for teachers to create or edit reading sets, listening sets, writing prompts, speaking tasks, skill drills, and mock test assemblies. If not yet built, these can be handled via Supabase but data model must support teacher-created content.

## 5. Data Model Overview
All tables live in the same Supabase database but are independent from game tables. All foreign keys reference `profiles.id` (UUID).

### 5.1 Core Reference Tables
| Table | Key Fields | Notes |
| --- | --- | --- |
| `ielts_reading_sets` | `id uuid PK`, `title`, `description`, `level` (A/B/C), `estimated_band`, `duration_minutes`, `tags`, `created_by` (FK to profiles), `created_at` | Metadata per reading passage.
| `ielts_reading_passages` | `id uuid PK`, `reading_set_id FK`, `content` (rich text/JSON), `order_index` | Allows multi-passage sets.
| `ielts_reading_questions` | `id uuid PK`, `reading_set_id FK`, `type` (MCQ/T_F_NG/MATCHING/SHORT), `prompt`, `options JSON`, `correct_answer JSON`, `explanation` | Stored per question.
| `ielts_listening_sets` | `id`, `title`, `description`, `audio_url`, `transcript`, `level`, `estimated_band`, `duration_minutes`, `created_by`, timestamps |
| `ielts_listening_questions` | Similar fields as reading questions with `listening_set_id` FK and question-type enum.
| `ielts_writing_tasks` | `id`, `task_type` (TASK1/TASK2), `title`, `prompt`, `topic`, `sample_answer`, `band_focus`, `created_by`, timestamps |
| `ielts_speaking_tasks` | `id`, `part` (1/2/3), `title`, `prompt`, `hints`, `sample_band`, `created_by`, timestamps |
| `ielts_skill_drills` | `id`, `skill_type` (VOCAB/GRAMMAR/TRAP), `title`, `description`, `question_data JSON`, `level`, `created_by`, timestamps |
| `ielts_mock_tests` | `id`, `label`, `description`, `recommended_duration_minutes`, `reading_set_id FK`, `listening_set_id FK`, `writing_task1_id`, `writing_task2_id`, `speaking_taskset JSON`, `active_from`, `active_to`, `created_by`, timestamps |
| `ielts_teacher_assignments` | `id`, `teacher_profile_id`, `student_profile_id`, `role` (OWNER/TEACHER), timestamps | Controls teacher access per student.

### 5.2 Attempt Tables
| Table | Key Fields | Description |
| --- | --- | --- |
| `ielts_reading_attempts` | `id`, `profile_id FK`, `reading_set_id FK`, `answers JSON`, `score_raw`, `score_percentage`, `estimated_band`, `time_spent_seconds`, `started_at`, `completed_at` |
| `ielts_listening_attempts` | Similar structure referencing `listening_set_id`.
| `ielts_writing_attempts` | `id`, `profile_id`, `writing_task_id`, `response_text`, `word_count`, `submitted_at`, `band_score`, `feedback`, `reviewed_by` |
| `ielts_speaking_attempts` | `id`, `profile_id`, `speaking_task_id`, `audio_url`, `transcript`, `submitted_at`, `band_score`, `fluency_score`, `lexical_score`, `grammar_score`, `pronunciation_score`, `feedback`, `reviewed_by` |
| `ielts_skill_attempts` | `id`, `profile_id`, `skill_drill_id`, `answers JSON`, `score_percentage`, `time_spent_seconds`, `completed_at` |
| `ielts_mock_test_attempts` | `id`, `profile_id`, `mock_test_id`, `component_scores JSON`, `overall_band`, `time_spent_seconds`, `started_at`, `completed_at`, `notes`, `reviewed_by` |

### 5.3 Analytics Support Tables
| Table | Purpose |
| --- | --- |
| `ielts_progress_snapshots` | Precomputed aggregates per profile and skill (average band, attempts count, last attempt date). Updated via scheduled job or trigger when attempts change.
| `ielts_time_tracking` | Optional table to log time spent per session for each skill/module to support analytics.

### 5.4 Data Access in Main Flows
- Reading/listening attempts: read from set/question tables, write to attempt tables. Stats queries join attempts grouped by `profile_id`.
- Writing/speaking: read tasks, write attempts initially without scores; teachers update `band_score` and `feedback` later.
- Skills Lab: read drills, write attempts immediately with auto-scored data.
- Tests: read assembled mock tests, fetch referenced component sets/tasks, write `mock_test_attempts` with component breakdown.
- Progress page: read from attempt tables and/or `ielts_progress_snapshots` for quick load. Use React Query to fetch aggregated endpoints per skill.
- Teacher dashboard: aggregated queries filtered by `ielts_teacher_assignments` to ensure teachers only see assigned students.

## 6. Front-End Route & Component Structure
Route base: `/ielts` with dedicated layout component (`IeltsLayout`). Layout fetches user profile, verifies access, and renders sub-navigation with muted styling.

### 6.1 Route Map
- `/ielts` → OverviewDashboardPage (redirect to `/ielts/overview`).
- `/ielts/overview` → Student overview dashboard.
- `/ielts/reading` → ReadingLibraryPage (list + filters).
- `/ielts/reading/:setId` → ReadingDetailPage with attempt workflow.
- `/ielts/reading/:setId/attempt/:attemptId` → AttemptReviewPage (results).
- `/ielts/listening` and `/ielts/listening/:setId` / attempt routes similarly.
- `/ielts/writing` → WritingTaskListPage.
- `/ielts/writing/:taskId` → WritingTaskDetailPage with submission editor.
- `/ielts/speaking` → SpeakingTaskListPage.
- `/ielts/speaking/:taskId` → SpeakingTaskDetailPage with recorder/upload.
- `/ielts/skills` → SkillsLabPage with nested tabs: `/ielts/skills/vocab`, `/ielts/skills/grammar`, `/ielts/skills/traps`.
- `/ielts/tests` → TestsPage listing mock/weekly tests.
- `/ielts/tests/:testId` → MockTestDetailPage (launch flow). Sub-routes for each section while taking test (managed client-side state) if needed.
- `/ielts/progress` → ProgressAnalyticsPage.
- `/ielts/teacher` → TeacherDashboardPage (guarded by role).
- `/ielts/teacher/students/:profileId` → TeacherStudentDetailPage.
- `/ielts/teacher/content/*` (optional future) → Content management forms.

### 6.2 Core Components
- `IeltsLayout`: wraps all `/ielts/*` routes, sets typography/colors, includes sub-nav.
- `SectionHeader`, `StatCard`, `BandIndicator`, `AttemptList`, `QuestionRenderer`, `AudioPlayer`, `WritingEditor`, `SpeakingRecorder`, `DrillCard`, `ProgressChart`, `TeacherStudentTable`.
- Use React Query hooks (`useReadingSets`, `useCreateReadingAttempt`, etc.) to interact with Supabase.

### 6.3 UX/Layout Decisions
- Sidebar nav with muted blue background, white content cards, plenty of whitespace.
- Each practice section uses a two-column layout: left for content/passage/audio, right for questions.
- Attempt review pages show summary metrics up top, question-level review below.
- Progress page uses cards for each skill plus chart components (line chart for bands, bar for accuracy). Use existing chart libs or simple custom components.
- Teacher dashboard uses tables and filters, with summary cards at top.

## 7. Separation from Game System
To ensure isolation from Brain Heist’s game mechanics:
1. **Routing**: All IELTS routes live under `/ielts/*` and use `IeltsLayout` without referencing game HUD components.
2. **Styling**: Create dedicated Tailwind theme tokens/classes for muted colors; do not import neon/“heist” theme styles.
3. **State/Data**: IELTS pages only query new `ielts_*` tables plus `profiles` for identity. No hooks or context from XP/coins/inventory modules are imported.
4. **Copy/Content**: All text uses academic IELTS language; banned terms include “heist”, “agent”, “loot”, etc.
5. **Access Control**: Auth uses Supabase session from main app; after login, IELTS modules operate independently. Teacher roles are defined via `ielts_teacher_assignments` or a flag on `profiles` (e.g., `is_ielts_teacher`).
6. **Testing**: Integration tests confirm IELTS pages render without referencing XP/coins selectors or contexts. Lint checks enforce no imports from game-specific directories.

This specification provides the structure needed for implementation while keeping IELTS Prep Center fully separated from the Brain Heist gameplay systems.
