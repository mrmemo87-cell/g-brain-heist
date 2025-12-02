# Level-Based Question Unlocking System - Implementation Summary

## Overview

This system implements **progressive question unlocking** where players unlock questions gradually as they level up. Each question can only reward XP/coins **once per player**, preventing duplicate rewards while still allowing practice.

## Schema Changes Applied

### Tables Modified

#### 1. `mcq_questions` (Practice Mode Questions)
- ✅ **Added column**: `tier_level INTEGER DEFAULT 1`
- ✅ **Added check**: `difficulty IN ('easy', 'med', 'hard')`
- ✅ **Existing columns used**: `subject`, `grade`, `difficulty`, `created_at`, `id`

#### 2. `questions` (Teacher Questions)
- ✅ **Added column**: `tier_level INTEGER DEFAULT 1`
- ✅ **Existing columns used**: `subject`, `difficulty`, `created_at`, `id`
- ✅ **Existing check**: `difficulty IN ('easy', 'medium', 'hard')`

#### 3. `attempts` (MCQ Attempts Log)
- ✅ **Added column**: `rewarded BOOLEAN DEFAULT false`
- ✅ **Backfilled**: First correct attempt per user/question marked as rewarded
- ✅ **Existing columns used**: `user_id`, `question_id`, `is_correct`, `created_at`

#### 4. `question_attempts` (Teacher Question Attempts)
- ✅ **Added column**: `rewarded BOOLEAN DEFAULT false`
- ✅ **Backfilled**: All correct attempts marked as rewarded
- ✅ **Existing constraint**: `UNIQUE (student_id, question_id) WHERE is_correct = true`
- ✅ **Existing columns used**: `student_id`, `question_id`, `is_correct`

#### 5. `users` (Player Profiles)
- ✅ **No changes needed** - already has `level INTEGER DEFAULT 1`
- ✅ **Used columns**: `id`, `level`, `grade`

## Tier Assignment Logic

### MCQ Questions (Practice Mode)
- **Questions per tier**: 20
- **Grouping**: By `(subject, difficulty, grade)`
- **Ordering**: By `created_at ASC, id ASC`
- **Formula**: `tier_level = 1 + ((row_number - 1) / 20)`

### Teacher Questions
- **Questions per tier**: 15
- **Grouping**: By `(subject, difficulty)`
- **Ordering**: By `created_at ASC, id ASC`
- **Formula**: `tier_level = 1 + ((row_number - 1) / 15)`

### Auto-Assignment for New Questions
- ✅ **Trigger**: `trigger_auto_assign_tier_mcq` on `mcq_questions` BEFORE INSERT
- ✅ **Trigger**: `trigger_auto_assign_tier_questions` on `questions` BEFORE INSERT
- Automatically assigns `tier_level` based on existing question count

## Unlock Rules

### Tier Unlocking (Based on Player Level)
```
max_tier = ceil(player_level / 2) = (player_level + 1) / 2
```

**Examples:**
- Level 1-2 → Tier 1 only
- Level 3-4 → Tiers 1-2
- Level 5-6 → Tiers 1-3
- Level 7-8 → Tiers 1-4
- Level 9-10 → Tiers 1-5

### Difficulty Unlocking
- **Easy**: Unlocked at level **1+** (always available)
- **Medium**: Unlocked at level **3+**
- **Hard**: Unlocked at level **6+**

### Reward Rule
- Each question can reward XP/coins **only ONCE per player**
- Subsequent correct answers don't give rewards (practice mode)
- Tracked via `rewarded` column in attempts tables

## Database Functions Created

### 1. `get_unlocked_mcq_questions(p_subject, p_difficulty, p_limit)`
**Purpose**: Fetch practice mode questions player can earn from

**Parameters:**
- `p_subject TEXT` - Subject name (e.g., 'Maths', 'Science')
- `p_difficulty TEXT` - Difficulty ('easy', 'med', 'hard')
- `p_limit INTEGER` - Max questions to return (default 5)

**Returns:** Table of unlocked, unrewarded mcq_questions

**Logic:**
1. Get player level and grade
2. Calculate max_tier
3. Check if difficulty is unlocked
4. Return questions matching: subject, difficulty, grade, tier ≤ max_tier, no rewarded attempt

---

### 2. `get_unlocked_teacher_questions(p_subject, p_difficulty, p_limit)`
**Purpose**: Fetch teacher questions player can earn from

**Parameters:**
- `p_subject TEXT` - Subject name
- `p_difficulty TEXT` - Difficulty ('easy', 'medium', 'hard')
- `p_limit INTEGER` - Max questions to return (default 5)

**Returns:** Table of unlocked, unrewarded teacher questions

**Logic:**
1. Get player level
2. Calculate max_tier
3. Normalize difficulty (handle 'med' vs 'medium')
4. Check if difficulty is unlocked
5. Return public, active questions matching: subject, difficulty, tier ≤ max_tier, no correct attempt

---

### 3. `get_player_unlock_status()`
**Purpose**: Get player's current unlock status

**Parameters:** None (uses auth.uid())

**Returns:**
```sql
{
  player_level: INTEGER,
  max_tier: INTEGER,
  easy_unlocked: BOOLEAN,
  medium_unlocked: BOOLEAN,
  hard_unlocked: BOOLEAN
}
```

---

### 4. `count_unlocked_questions(p_subject, p_difficulty)`
**Purpose**: Count total/rewarded/available questions for progress display

**Parameters:**
- `p_subject TEXT` - Subject name
- `p_difficulty TEXT` - Difficulty

**Returns:**
```sql
{
  total_questions: INTEGER,        -- Total unlocked questions
  rewarded_questions: INTEGER,     -- Already earned rewards from
  new_questions_left: INTEGER      -- Still can earn from
}
```

---

### 5. `record_mcq_attempt(p_question_id, p_is_correct)`
**Purpose**: Record attempt and determine if reward should be granted

**Parameters:**
- `p_question_id BIGINT` - Question ID
- `p_is_correct BOOLEAN` - Whether answer was correct

**Returns:**
```sql
{
  attempt_id: BIGINT,
  should_grant_reward: BOOLEAN,
  message: TEXT
}
```

**Logic:**
- Checks if already rewarded for this question
- Inserts attempt with `rewarded = (is_correct AND NOT already_rewarded)`
- Returns whether frontend should grant rewards

## Indexes Added

```sql
idx_mcq_questions_tier_level
idx_mcq_questions_subject_difficulty_tier
idx_questions_tier_level
idx_questions_subject_difficulty_tier
idx_attempts_user_question_rewarded
```

## Frontend Integration Summary

### Step 1: Update Types
Add `PlayerUnlockStatus`, `QuestionCount` types

### Step 2: Update gameService.ts
- Add `getPlayerUnlockStatus()`
- Add `countUnlockedQuestions(subject, difficulty)`
- Add `getUnlockedMcqQuestions(subject, difficulty, limit)`
- Add `getUnlockedTeacherQuestions(subject, difficulty, limit)`
- Add `recordMcqAttempt(questionId, isCorrect)`

### Step 3: Update QuestView.tsx
- Replace mock progress with real API calls to `countUnlockedQuestions`
- Replace `mcq_questions_get` with `getUnlockedMcqQuestions`
- Replace `get_public_questions` with `getUnlockedTeacherQuestions`
- Handle empty result sets (no rewardable questions)

### Step 4: Update finalizeMcqAnswer
- Use `recordMcqAttempt` RPC to track rewards properly
- Only grant rewards when `should_grant_reward = true`

### Step 5: Update UI Components
- Show locked difficulties with required levels
- Display "no rewardable questions" when appropriate
- Show tier progress indicators (optional)

## Deployment Checklist

### Database Deployment
1. ✅ Backup database before running
2. ⬜ Run `IMPLEMENT_LEVEL_BASED_UNLOCKING.sql` in Supabase SQL Editor
3. ⬜ Verify tier assignments with verification queries
4. ⬜ Test RPCs with sample calls
5. ⬜ Check indexes were created

### Frontend Deployment
1. ⬜ Update `types.ts` with new interfaces
2. ⬜ Add new RPC functions to `gameService.ts`
3. ⬜ Update `QuestView.tsx` to use new RPCs
4. ⬜ Update `finalizeMcqAnswer` to use `record_mcq_attempt`
5. ⬜ Update `UnifiedSubjectPlay.tsx` to show locked states
6. ⬜ Test with multiple player levels (1, 3, 6, 10)

### Testing Scenarios
1. ⬜ **Level 1 Player**: Can only see easy tier 1 questions
2. ⬜ **Level 3 Player**: Can see easy/medium up to tier 2
3. ⬜ **Level 6 Player**: Can see all difficulties up to tier 3
4. ⬜ **Answered Question**: Shows "already rewarded" on repeat
5. ⬜ **Empty Question Set**: Shows "no rewardable questions" message
6. ⬜ **Locked Difficulty**: Shows lock icon with required level
7. ⬜ **Progress Display**: Shows correct total/rewarded/newLeft counts

## Rollback Plan

If issues occur:

### Database Rollback
```sql
-- Remove columns
ALTER TABLE mcq_questions DROP COLUMN IF EXISTS tier_level;
ALTER TABLE questions DROP COLUMN IF EXISTS tier_level;
ALTER TABLE attempts DROP COLUMN IF EXISTS rewarded;
ALTER TABLE question_attempts DROP COLUMN IF EXISTS rewarded;

-- Drop triggers
DROP TRIGGER IF EXISTS trigger_auto_assign_tier_mcq ON mcq_questions;
DROP TRIGGER IF EXISTS trigger_auto_assign_tier_questions ON questions;

-- Drop functions
DROP FUNCTION IF EXISTS auto_assign_tier_mcq();
DROP FUNCTION IF EXISTS auto_assign_tier_teacher_questions();
DROP FUNCTION IF EXISTS get_unlocked_mcq_questions(TEXT, TEXT, INTEGER);
DROP FUNCTION IF EXISTS get_unlocked_teacher_questions(TEXT, TEXT, INTEGER);
DROP FUNCTION IF EXISTS get_player_unlock_status();
DROP FUNCTION IF EXISTS count_unlocked_questions(TEXT, TEXT);
DROP FUNCTION IF EXISTS record_mcq_attempt(BIGINT, BOOLEAN);
```

### Frontend Rollback
- Revert gameService.ts changes
- Restore original QuestView.tsx logic
- Use old mcq_questions_get and get_public_questions

## Verification Queries

### Check Tier Distribution
```sql
-- MCQ Questions
SELECT subject, difficulty, tier_level, COUNT(*) as count
FROM mcq_questions
GROUP BY subject, difficulty, tier_level
ORDER BY subject, difficulty, tier_level;

-- Teacher Questions
SELECT subject, difficulty, tier_level, COUNT(*) as count
FROM questions
GROUP BY subject, difficulty, tier_level
ORDER BY subject, difficulty, tier_level;
```

### Test Unlock Status (as logged-in user)
```sql
SELECT * FROM get_player_unlock_status();
```

### Count Available Questions
```sql
SELECT * FROM count_unlocked_questions('Maths', 'easy');
```

### Fetch Unlocked Questions
```sql
SELECT * FROM get_unlocked_mcq_questions('Maths', 'easy', 5);
```

## Benefits

✅ **Progressive Learning**: Players gradually unlock harder content
✅ **Prevent Overwhelming**: New players don't see 1000s of questions at once
✅ **Motivation to Level Up**: Clear progression incentive
✅ **Fair Rewards**: Each question rewards only once per player
✅ **Practice Mode**: Players can still practice already-rewarded questions
✅ **Scalable**: Automatically assigns tiers to new questions
✅ **Flexible**: Can adjust tier sizes and unlock formulas easily

## Support & Troubleshooting

### Issue: No questions returned
- Check player level: `SELECT level FROM users WHERE id = auth.uid()`
- Check unlock status: `SELECT * FROM get_player_unlock_status()`
- Check tier distribution: See verification queries above
- Verify player hasn't already answered all questions in tier range

### Issue: Duplicate rewards still occurring
- Verify `rewarded` column is being set correctly
- Check unique constraint on `question_attempts` table
- Ensure `record_mcq_attempt` RPC is being used

### Issue: Questions not appearing after level up
- Frontend may be caching old progress data
- Call `countUnlockedQuestions` again to refresh counts
- Check max_tier calculation: `(level + 1) / 2`

## Future Enhancements

- [ ] Add tier progress visualization in UI
- [ ] Show "X more questions unlock at level Y"
- [ ] Add achievement for completing all questions in a tier
- [ ] Add admin panel to adjust tier sizes
- [ ] Add analytics dashboard showing player progression through tiers
- [ ] Consider dynamic difficulty adjustment based on performance
