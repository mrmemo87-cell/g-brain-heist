# Database Schema Reference

This section summarizes the most important Supabase tables that power Brains Heist. All definitions live in [`supabase-schema.sql`](../supabase-schema.sql) plus optional modules under `supabase-functions/`.

## Core Identity Tables
| Table | Purpose | Notable Columns |
| --- | --- | --- |
| `users` | Canonical record for every student/teacher/administrator. | `id UUID`, `email`, `username`, `grade` (8/9), `batch` (8A–9C), `level`, `xp`, `coins`, `streak`, `ap_now/ap_max/last_ap_update`, `attack_power`, `defense_power`, `is_admin`, `is_banned`, timestamps. |
| `profiles` (view) | Read-optimized slice of `users` for leaderboards and dashboards. | Exposes `username`, `grade`, `batch`, `xp`, `coins`, `streak`, `avatar_url`, `level`, `is_admin`, `is_banned`. |
| `teachers` | Extended teacher profile enabling question creation. | `user_id`, `school_name`, `subject_specializations[]`, `role`, `verified`, `bio`. |

## Content & Assessment Tables
| Table | Purpose | Notable Columns |
| --- | --- | --- |
| `mcq_questions` | Built-in MCQ bank for Silk Road missions. | `grade`, `difficulty` (`easy/med/hard`), `stem`, `opt1–opt4`, `correct` (1–4), `lang`, `reward_xp`, `reward_coins`, `active`. |
| `questions` | Teacher-authored bank supporting multiple question types. | `subject`, `topic`, `difficulty`, `question_type`, `options JSONB`, `correct_answer`, `explanation`, `hints[]`, `time_limit`, `points`, `tags[]`, `grade_level`, `is_public`, `is_active`, `stats` columns. |
| `quest_templates` | Teacher-designed mission bundles referencing curated question IDs. | `title`, `subject`, `difficulty`, `question_ids UUID[]`, `xp_reward`, `coins_reward`, `min_level`, `max_attempts`, `is_public`, `is_active`. |
| `attempts` | Student history for default MCQs. | `user_id`, `question_id`, `is_correct`, `created_at`. |
| `question_attempts` | Student history for teacher-authored questions. | `student_id`, `question_id`, `quest_session_id`, `answer_given`, `is_correct`, `time_taken`, `points_earned`, `attempted_at`. |

## Progression Tables
| Table | Purpose | Notable Columns |
| --- | --- | --- |
| `activities` | Event feed capturing wins, quests, purchases, achievements. | `kind`, `actor_id`, `actor_username`, `target_id`, `data JSONB`, `reactions JSONB`, timestamps. |
| `activity_reactions` | Emoji responses to feed items. | `activity_id`, `user_id`, `emoji`. |
| `tasks` | Daily/weekly objectives per user. | `kind` (`daily/weekly`), `task_type`, `progress`, `target`, `expires_at`. |
| `caps` | Daily/weekly XP/coin caps + reset tracking. | `xp_daily_earned`, `coins_daily_earned`, `xp_weekly_earned`, `coins_weekly_earned`, `daily_reset_at`, `weekly_reset_at`. |
| `sessions` | Active XP booster multipliers. | `multiplier`, `started_at`, `expires_at`, `today_used`. |
| `announcements` + `announcement_receipts` | Broadcast messages and which users have seen them. | Message text, `created_by`, `seen_at` per user. |
| `rpc_event_log` | Telemetry for RPC success/failure. | `function_name`, `log_level ('info'/'error')`, `message`, `context JSONB`. |

## Economy & Inventory Tables
| Table | Purpose | Notable Columns |
| --- | --- | --- |
| `inventory` | Consumables and boosters. | `item_id`, `name`, `kind` (`shield`, `firewall`, `cracker`, `booster`), `state` (`unused/active/consumed`), `activated_at`, `expires_at`, stat bonuses. |
| `shop_purchases` | Purchase ledger with limits & receipts. | `item_id`, `quantity`, `total_cost`, `purchase_date`. |

## Social Tables
| Table | Purpose | Notable Columns |
| --- | --- | --- |
| `clans` | Clan metadata and vault values. | `name`, `notice`, `vault_coins`, `leader_id`, `member_count`. |
| `clan_members` | Role assignment per clan. | `role ('leader'/'officer'/'member')`, `joined_at`. |
| `clan_chat` | Chat transcript per clan. | `clan_id`, `user_id`, `username`, `message`, `created_at`. |
| `classes` | Teacher-managed cohorts for mission assignments. | `class_code`, `subject`, `grade_level`, `is_active`. |
| `class_students` | Join table between classes and student agents. | Composite PK `(class_id, student_id)`.

## Triggers & Helpers
- `update_updated_at` trigger keeps `users` and `clans` timestamps fresh.
- `update_clan_member_count` trigger runs on `clan_members` inserts/deletes.
- `update_user_last_seen` can be attached to activity tables to bump presence.
- Views such as `users_with_current_ap` combine `calculate_current_ap(...)` with the latest AP regeneration logic.

Refer back to the SQL files for column constraints, indexes, and example seed data whenever evolving the schema.
