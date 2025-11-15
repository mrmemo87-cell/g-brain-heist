# Teacher Mission Builder Guide

Welcome, Handler! This guide explains how to build curriculum-aligned missions, assign them to squads, and use analytics to find weak topics.

## Teacher Roles & Access
1. **Create a user** and set `role = 'teacher'` on the `users` row (via Supabase dashboard or admin RPC).
2. Insert a row into the `teachers` table with bio, subjects, and verification status (`teacher_question_system.sql`).
3. Teachers are automatically excluded from PvP, leaderboards, and student reward loops, but gain access to authoring surfaces.

## Creating Subjects, Topics, and Question Banks
1. **Pick a subject**: Within the teacher dashboard, choose or create a subject label (stored as `subject` in the `questions` table).
2. **Add topics & tags**: Use the `topic` field and `tags[]` column to describe standards (e.g., `"Linear Equations"`, `['algebra','grade-9']`).
3. **Compose a question**:
   - Select `question_type` (`multiple_choice`, `true_false`, `short_answer`).
   - Fill `question_text`, `options` (JSON array) if applicable, and `correct_answer` (text or option key).
   - Add `explanation` plus optional `hints[]` to support remediation.
   - Configure `difficulty`, `points`, `time_limit`, and `grade_level`.
4. **Preview and publish**:
   - Drafts default to `is_active = true`. Toggle off to hide from missions.
   - Set `is_public = true` to share with other teachers in the same Supabase project.
5. **Monitor stats**: `times_answered` and `times_correct` auto-increment through `question_attempts`, enabling accuracy breakdowns per item.

## Building Task Groups & Missions
1. **Quest Templates**: From the Mission Builder, create a `quest_templates` entry with:
   - `title`, `description`, `subject`, and `difficulty`.
   - `question_ids` array referencing 5–20 curated questions.
   - Reward sliders (`xp_reward`, `coins_reward`) and eligibility (`min_level`, `max_attempts`).
2. **Task Groups**: Combine templates with daily/weekly cadence using the `tasks` table:
   - Daily mission = `kind = 'daily'`, `task_type = 'quest_complete'`, `target = number of completions`.
   - Homework arc = `kind = 'weekly'`, `task_type = 'quest_score'`, `target = target score%`.
3. **Action Points & Boosters**: Remind students that missions consume AP indirectly (quests award XP/coins; AP influences PvP). Teachers can grant boosters by inserting `sessions` rows (e.g., multiplier `1.5` for a class reward).

## Assigning Missions & Homework
1. **Create a class**: Insert into `classes` with `class_name`, `class_code`, `subject`, `grade_level`.
2. **Enroll students**: Add entries to `class_students` by selecting student UUIDs (use Supabase Table Editor or admin UI).
3. **Attach missions**:
   - Link `quest_templates` to a class via metadata (recommended approach: store mapping in `classes` JSON or maintain a `class_quests` table—see backlog).
   - Alternatively, issue tasks filtered by `batch`/`grade` by inserting rows into `tasks` for each student (scriptable via Supabase SQL or edge functions).
4. **Send announcements**: Use the `announcements` + `announcement_receipts` tables to broadcast mission briefings and track who acknowledged them.

## Reading Analytics & Locating Weak Topics
1. **Per-question performance**:
   - Query `question_attempts` grouped by `question_id` to see `avg(time_taken)` and `avg(is_correct)`.
   - Sort by low correctness to find topics needing reteach.
2. **Mission completion**:
   - `quest_templates.times_completed` tracks the number of class-wide clears.
   - Join with `class_students` to compute participation rate.
3. **Student health**:
   - `activities` feed reveals `quest_complete`, `quest_failed`, and `achievement_earned` events.
   - `caps` displays whether a student hit XP/coin ceilings (useful when pacing weekly work).
4. **“Crushed / Average / Struggled” labels**:
   - Calculate each student's rolling accuracy per subject (`correct / total attempts`).
   - Threshold suggestion: `>=85% = Crushed`, `60–84% = Average`, `<60% = Struggled`. Store this summary alongside `class_students` metadata or derive in dashboards.
5. **Weak topic drill-down**:
   - Filter `question_attempts` by `topic` and compute accuracy/time. Pair with `tags[]` to produce heatmaps.
   - Use `activities` to correlate mission completions with PvP performance for motivational nudges.

## Workflow Tips
- Duplicate questions frequently using the “clone” button to build variants quickly.
- Use CSV imports (planned feature) or Supabase's spreadsheet upload to add dozens of questions at once.
- When testing missions, temporarily enroll a dummy student to verify rewards, then remove the record to keep analytics clean.

Keep iterating on missions weekly to align with classroom pacing. The more `question_attempts` data you collect, the smarter Brains Heist becomes at surfacing weak links.
