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

## 2. Topic Classification

| Classification | Accuracy | Avg Time vs Limit | Attempts |
|----------------|----------|-------------------|----------|
| **Crushed**    | ≥ 90%    | ≤ 70% of limit    | ≤ 1 retry|
| **Average**    | 70-89%   | 71-100%           | ≤ 2      |
| **Struggled**  | < 70%    | >100%             | ≥ 3      |

A topic is marked by the lowest satisfied category across these metrics.

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

Use this spec to implement mission scoring, topic assessments, progression thresholds, PvP, and optional raids.
