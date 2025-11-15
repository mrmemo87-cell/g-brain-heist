# Brains Heist Systems Design Specification

## 1. Solo Missions

**Score Formula**

```
score = baseScore * difficultyMultiplier + speedBonus + streakBonus
```

### Base Score per Correct Answer

| Difficulty | Base Score |
|------------|------------|
| Easy       | 60         |
| Medium     | 80         |
| Hard       | 100        |

### Difficulty Multipliers

| Difficulty | Multiplier |
|------------|------------|
| Easy       | 1.0        |
| Medium     | 1.25       |
| Hard       | 1.5        |

### Speed Bonus

- \( speedBonus = \max(0, 40 - \frac{timeInSeconds}{timeLimit} \times 40) \)
- Example: 20s of 40s limit → bonus = 20.

### Streak Bonus

- \( streakBonus = 10 \times \max(0, streakCount - 2) \)
- No bonus until 3 correct answers in a row.

---

## 2. Adaptive Mastery Engine

### 2.1 Rolling Metrics

Maintain per-student, per-topic (and aggregated per task group) stats over the most recent 30 days or the last 20 attempts—whichever contains more data. Track:

| Metric | Definition |
| --- | --- |
| `accuracy(s,t)` | `correct_attempts / total_attempts` (null if no attempts). |
| `avg_time(s,t)` | `sum(time_spent_per_attempt) / total_attempts` (median optional to reduce outliers). |
| `total_attempts(s,t)` | Count of attempts in the window. |
| `recency_score(s,t)` | `exp(-Δt / τ)` where Δt is days since last attempt and τ defaults to 14 days. |

Use the same formulas for task groups, aggregating across their topics. Configuration knobs: `min_attempt_threshold` (default 10), `time_benchmark(t)` (80th percentile answer time), and `stale_threshold` (recency score 0.4).

### 2.2 Topic Classification Rules

```
if topic locked by prerequisites:
    status = "locked"
elif total_attempts < min_attempt_threshold:
    status = "average"  # more data required
else:
    if accuracy ≥ 0.85 and avg_time ≤ time_benchmark and recency_score ≥ 0.4:
        status = "crushed"
    elif accuracy < 0.60 or avg_time ≥ 1.5 * time_benchmark or recency_score < 0.2:
        status = "struggled"
    else:
        status = "average"
```

Interpretation:

- **Crushed:** high accuracy, efficient timing, and recently practiced.
- **Average:** meets attempt + recency minimums but fails a mastery check (accuracy between 0.60–0.85, slow timing, or stale practice).
- **Struggled:** low accuracy, severe timing issues, or long inactivity after attempts.
- **Locked:** prerequisite topics still in “struggled” or under-attempted state.

Tag task groups using the worst status among their covered topics.

---

## 3. Progression

### Unlock Next Topic

- Complete 5 missions at current tier.
- Maintain ≥ 75% accuracy and average time ≤ 90% of the limit.

### Unlock Boss Node or Mini-Event

- Complete 3 consecutive missions on Medium or higher difficulty with ≥ 80% accuracy.
- Must have at least one “Crushed” topic in the same branch.

### Milestone Rewards

| Milestone                         | Reward                                      |
|----------------------------------|---------------------------------------------|
| Each mission completed           | 15 XP, 50 coins                             |
| Topic Crushed                    | +50 XP, +100 coins, cosmetic rank badge     |
| Unlock new topic                 | +75 XP, +150 coins                          |
| Boss victory                     | +200 XP, +300 coins, rare cosmetic badge    |
| Mini-event completion            | +100 XP, +200 coins                         |

---

## 4. PvP Battles

**Score Formula**

```
score = (baseScore + speedBonus + comboBonus)
```

### Base Score per Correct Answer

- 70 points.

### Speed Bonus

- \( speedBonus = \max(0, 20 - (answerTime \times 0.5)) \)
- Example: 4s answer → 20 - 2 = 18.

### Combo Bonus

- \( comboBonus = 15 \times \max(0, streak - 1) \)
- First answer no bonus; second onward increases.

### Tie-Breaking Rules

1. Highest total combo bonus.
2. Fastest average response time.
3. Sudden-death question (first correct wins).

### Rewards

| Outcome | Reward                                         |
|---------|------------------------------------------------|
| Winner  | 100 XP, 150 coins, 1 PvP badge shard          |
| Loser   | 50 XP, 75 coins (consolation)                 |
| Tie     | 70 XP each, 100 coins, no badge shards        |

---

## 5. Optional Raids/Bosses

### Team Damage Calculation

```
teamDamage = (individualScore / waveScoreThreshold) * bossHPPerWave
```
- Each wave requires cumulative damage to drop boss HP to zero.

### Boss Behavior

- 3 waves with increasing difficulty (Easy → Medium → Hard).
- Each wave introduces 2 “spike” questions (Hard) randomly.
- Boss retaliates with penalty: wrong answers increase team timer by 5 seconds.

### Reward Distribution

- Total reward pool: 500 XP, 800 coins, unique badge.
- MVP (highest damage) gets 30% bonus reward.
- Remaining rewards split proportionally to damage contribution.
- All participants receive base raid badge; MVP gets special variant.

---

## 6. Next-Mission Recommendation + API Contract

### 6.1 Decision Rules

```
function recommend_next_task(student):
    struggled = topics_with_status(student, "struggled")
    average = topics_with_status(student, "average")
    crushed = topics_with_status(student, "crushed")
    upcoming = get_upcoming_milestone(student)

    if struggled not empty:
        target = least_recent_or_lowest_accuracy(struggled)
        return reinforcement_group(target), "reinforce weak topic", "remedial"

    if upcoming and upcoming.deadline_within(7 days):
        blockers = average ∩ upcoming.required_topics
        if blockers not empty:
            target = priority_topic(blockers)
            return targeted_practice(target), "stabilize before milestone", "core"

    next_topic = next_unlocked_topic(student)
    if next_topic:
        return intro_group(next_topic), "progress to next level", next_topic.default_difficulty

    return enrichment_bundle(crushed), "enrich mastered topics", "challenge"
```

Milestone unlocking requires: no prerequisite topic in “struggled”, each prerequisite has ≥ `min_attempt_threshold`, and accuracy ≥ 0.75.

### 6.2 API-Friendly Output

Expose the adaptive state via `/api/brains_heist/game/progress` (per student) using:

```json
{
  "student_topic_summary": [
    {
      "topic_id": "fractions_basics",
      "status": "struggled",
      "stats": {
        "accuracy": 0.52,
        "avg_time": 75.2,
        "attempts": 15,
        "last_activity": "2024-07-02T15:12:00Z"
      }
    }
  ],
  "student_taskgroup_summary": [
    {
      "task_group_id": "mission_fractions_reinforce",
      "covered_topics": ["fractions_basics"],
      "status": "struggled",
      "stats": {
        "accuracy": 0.52,
        "avg_time": 75.2,
        "attempts": 15,
        "last_activity": "2024-07-02T15:12:00Z"
      }
    }
  ],
  "next_mission_recommendation": {
    "task_group_id": "mission_fractions_reinforce",
    "reason": "reinforce weak topic",
    "difficulty": "remedial",
    "related_topic": "fractions_basics"
  }
}
```

Optional extras: `unlockable_milestones` with blockers list, and a `confidence` score derived from attempt volume.

---

Use this spec to implement mission scoring, adaptive mastery tracking, progression thresholds, PvP, and optional raids.
