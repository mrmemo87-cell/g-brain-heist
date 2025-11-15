# Brains Heist Content & Question Design Guidelines

Brains Heist delivers light-mode, spy-themed learning missions organized as **Subjects → Topics → Task Groups → Questions**. Use this guide to design consistent, high-quality content that works for solo missions, PvP battles, and boss encounters.

---
## 1. Subject, Topic, and Task Group Framework

| Subject | Example Topics (Topic IDs) | Description & Spy Flavor Hooks | Typical Task Groups |
| --- | --- | --- | --- |
| **STEM Ops (S1)** | Algebraic Systems (T1), Geometry Recon (T2), Calculus Surveillance (T3) | Core math concepts framed as decoding encrypted intel. | Daily Brief (5-question quiz), Deep Dive Dossier (homework), Practice Run (timed mission). |
| **Science Intelligence (S2)** | Physics Tracking (T4), Chemical Countermeasures (T5), Bio-Labs (T6) | Scientific investigations tied to gadget prototyping and lab forensics. | Lab Report Mission, Gadget Calibration (practice), Concept Audit (quiz). |
| **Computer & Data Espionage (S3)** | Programming Protocols (T7), Cybersecurity Breaches (T8), Data Analysis (T9) | Coding, algorithms, and data literacy as hacking/defense ops. | Code Red Challenge, Breach Simulation Homework, Debug Drills. |
| **Humanities & Communication (S4)** | World History Briefings (T10), Strategic Literature (T11), Persuasion & Negotiation (T12) | Contextual missions about analyzing narratives and crafting persuasive intel briefs. | Timeline Decryption, Artifact Analysis, Rhetoric Practice. |
| **Metaskills & Spycraft (S5)** | Critical Thinking (T13), Logic & Puzzles (T14), Study Habits (T15) | Meta-learning and reasoning packaged as spy training exercises. | Puzzle Gauntlet, Strategy Homework, Reflection Log. |

### Task Group Types
| Task Group | Purpose | Format Notes |
| --- | --- | --- |
| **Daily Brief** | Quick formative check (5–7 questions). | Mix of PvP-suitable short questions and standard MCQs. |
| **Deep Dive Dossier** | Homework/mission pack (10–20 questions). | Include scenario questions and at least one boss composite item. |
| **Practice Run** | Timed drills for PvP prep (8–12 questions). | Emphasize short-response and quick MCQs; target 1 minute/question. |
| **Boss Encounter** | Capstone challenge (3–5 multi-part problems). | Use composite question template with escalating parts. |
| **Lab Report / Case File** | Applied tasks (5–8 questions) anchored to a scenario. | Provide shared context block at top. |

Assign each topic an ID (e.g., `T7`) and embed in question metadata for analytics.

---
## 2. Required Question Metadata

| Field | Description | Example |
| --- | --- | --- |
| `topic_id` | Topic identifier (e.g., `T8`). | `"topic_id": "T7"` |
| `difficulty` | `easy`, `medium`, or `hard`. | `"difficulty": "medium"` |
| `cognitive_level` | Bloom level: `recall`, `understand`, `apply`, `analyze`. | `"cognitive_level": "apply"` |
| `estimated_time_sec` | Target solve time for pacing. | `"estimated_time_sec": 90` |
| `tags` | Array of strings (exam style, concept). | `"tags": ["GCSE", "linear equations"]` |
| `task_group_type` | Link to mission pack type (optional). | `"task_group_type": "Daily Brief"` |
| `scenario_context_id` | Reference if shared narrative is used. | `"scenario_context_id": "CASEFILE-42"` |

Store metadata with each question so analytics can power adaptive missions.

---
## 3. Question Templates

### 3.1 Standard MCQ (4 options)
```
Type: MCQ
Stem: [Clear question rooted in mission tone]
Options:
  A. ...
  B. ...
  C. ...
  D. ...
Correct_Option: [A/B/C/D]
Rationale: [Explain why correct choice works and why distractors fail]
Metadata: {
  "topic_id": "T2",
  "difficulty": "medium",
  "cognitive_level": "understand",
  "estimated_time_sec": 75,
  "tags": ["triangles", "spy-gadgets"],
  "task_group_type": "Daily Brief"
}
```
**Tips:** keep distractors plausible, avoid “all of the above,” and reference spy flavor lightly (e.g., “laser grid” instead of plain “grid”).

### 3.2 Scenario-Based Immersive Question
```
Type: Scenario
Context: [2–4 sentence case file shared across question set]
Prompt: [Specific action or analysis students must perform]
Response_Format: [MCQ / short answer / numeric]
Correct_Answer: [...]
Explanation: [...]
Metadata: {...}
```
**Usage:** Place context in `Lab Report` or `Case File` task groups so multiple questions leverage the same narrative.

### 3.3 PvP Quick-Fire Question
```
Type: PvP Quick
Stem: [≤120 characters, direct command]
Response_Format: [1-word / number / option]
Answer_Check: [Exact match or tolerance rule]
Hint (optional): [Short nudge used in solo practice]
Metadata: {
  "estimated_time_sec": 30,
  ...
}
```
**Design Rules:** No multi-step calculations. Players should respond within 20–40 seconds. Ideal for lightning rounds.

### 3.4 Boss Composite Question
```
Type: Boss Composite
Scenario: [Immersive narrative]
Parts:
  - Part A: [Sub-question]
    Format: [MCQ / numeric / short]
    Answer: [...]
  - Part B: ...
  - Part C: ...
Scoring: [Per part or all-or-nothing]
Explanation: [Step-by-step walkthrough]
Metadata: {...}
```
**Design Rules:** 2–4 escalating parts, mixing skills (e.g., recall + analysis). Provide scoring guidance per part for transparency.

---
## 4. Quality Rules

1. **Clarity:** Stems must be concise, one learning objective each, and include necessary data (units, diagrams, definitions).
2. **Fair Play:** No trick wording or double negatives. Use spy theme to motivate, not to obscure information.
3. **Plausible Distractors:** Wrong answers should reflect common misconceptions or calculation errors. Avoid obviously impossible values.
4. **Explanation Required:** Provide rationales focusing on key concept + why distractors fail.
5. **Consistency:** Match difficulty with cognitive level and estimated time; e.g., hard/analyze should allow 2+ minutes.
6. **Accessibility:** Avoid cultural references that exclude learners. Use light-mode friendly images if needed.
7. **Data Integrity:** Ensure metadata matches actual content (topic ID, tags, etc.) to power analytics and recommendations.

---
## 5. AI-Assisted Question Generation Guidelines

When prompting AI models, supply structured inputs so the output is “Brains Heist-ready.”

### Prompt Ingredients
1. **Subject & Topic ID** (e.g., `Subject: STEM Ops`, `Topic ID: T1 - Algebraic Systems`).
2. **Learning Objective** (e.g., “Solve 2-variable linear systems by substitution”).
3. **Desired Question Type** (MCQ, Scenario, PvP Quick, Boss Composite).
4. **Difficulty & Cognitive Level**.
5. **Mission Flavor Notes** (optional, e.g., “laser grid decoding theme”).
6. **Output Schema** (JSON or markdown template as below).

### Recommended Output Schema
```
{
  "type": "MCQ",
  "stem": "...",
  "options": {"A": "...", "B": "...", "C": "...", "D": "..."},
  "correct_option": "B",
  "explanation": "...",
  "metadata": {
    "topic_id": "T1",
    "difficulty": "medium",
    "cognitive_level": "apply",
    "estimated_time_sec": 90,
    "tags": ["substitution", "exam-style"],
    "task_group_type": "Deep Dive Dossier"
  }
}
```
For scenario or boss questions, extend the schema with `context`, `parts`, and `scoring` fields. Require the AI to generate plausible distractors, note any assumptions, and avoid referencing real student data.

### Post-Processing Checklist for AI-Generated Items
- Validate correctness manually.
- Edit mission flavor text to ensure consistency with Brains Heist tone.
- Run automated linting (if available) to ensure metadata completeness.

---
## 6. Authoring Checklists

### Quick Checklist (per question)
- [ ] Stem is clear, single objective, mission tone optional but not distracting.
- [ ] Data/figures included; units stated.
- [ ] Correct answer verified independently.
- [ ] Distractors are plausible and unique.
- [ ] Explanation teaches the concept.
- [ ] Metadata complete: topic_id, difficulty, cognitive_level, estimated_time, tags.
- [ ] Scenario or context references remain consistent within task group.

### Task Group Assembly Checklist
- [ ] Mission description ties to subject & topic arc.
- [ ] Question mix meets target (e.g., 1 boss item per Deep Dive Dossier).
- [ ] Difficulties distributed (e.g., 30% easy, 50% medium, 20% hard).
- [ ] PvP-suitable questions flagged for multiplayer reuse.
- [ ] Estimated total time fits class allocation.
- [ ] Playtest (self-run or peer review) completed.
- [ ] Accessibility review (language, diagrams, color contrast) done.

### AI Usage Checklist
- [ ] Prompt included subject, topic ID, objective, difficulty, cognitive level, and format.
- [ ] Output reviewed for tone, clarity, and correctness.
- [ ] Metadata verified and stored.
- [ ] Any sensitive data removed before sharing prompts.

Use these guidelines to keep Brains Heist missions cohesive, fair, and fun while supporting analytics-driven personalization.
