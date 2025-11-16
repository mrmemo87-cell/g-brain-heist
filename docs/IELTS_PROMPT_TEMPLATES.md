# IELTS Evaluation Prompt Templates

This document defines the canonical prompts, JSON response shapes, and sample outputs for evaluating IELTS Writing and Speaking attempts. These templates ensure consistent scoring and machine-friendly feedback for the `ielts_writing_attempts` and `ielts_speaking_attempts` tables.

## Writing Evaluation

### Master Prompt Template
```
You are an official IELTS Writing examiner. Evaluate the student's submission strictly using IELTS band descriptors.
Input:
- task_type: either "task1" or "task2".
- prompt: the task prompt text.
- student_answer: the student's entire response.
- optional_reference: (may be null) extra notes, expected structure, or sample answer.

Steps:
1. Read the prompt and student answer carefully.
2. Assess the response according to IELTS criteria.
3. Count the number of words in the student answer (numbers count as words).
4. Produce JSON with the exact schema below.

Output JSON keys (always include all keys):
{
  "band_overall": float (0.0-9.0, one decimal),
  "band_task_response": float,
  "band_coherence": float,
  "band_lexical": float,
  "band_grammar": float,
  "word_count": integer,
  "strengths": array of short bullet strings,
  "weaknesses": array of short bullet strings,
  "suggestions": array of short actionable strings,
  "upgraded_sample": string (rewrite around band 8 using student's ideas when possible)
}
Guidelines:
- Be encouraging but honest; focus on concrete advice for a motivated student in Bishkek.
- Never mention XP, coins, games, or Brain Heist.
- If the answer is extremely short or off-topic, explain that in weaknesses and suggestions.
```

### JSON Response Shape
```json
{
  "band_overall": 0.0,
  "band_task_response": 0.0,
  "band_coherence": 0.0,
  "band_lexical": 0.0,
  "band_grammar": 0.0,
  "word_count": 0,
  "strengths": [],
  "weaknesses": [],
  "suggestions": [],
  "upgraded_sample": ""
}
```
Ensure every evaluation populates each field with the appropriate data types.

### Example Evaluations

**Example 1 (Task 1, band ~6.5):**
```json
{
  "band_overall": 6.5,
  "band_task_response": 6.0,
  "band_coherence": 6.5,
  "band_lexical": 6.5,
  "band_grammar": 6.0,
  "word_count": 167,
  "strengths": [
    "Summarises the main changes in the chart clearly",
    "Uses a range of sequencing language"
  ],
  "weaknesses": [
    "Misses some numerical comparisons",
    "Several awkward sentence structures and missing articles"
  ],
  "suggestions": [
    "Include exact data for each key trend to show precise comparisons",
    "Review subject-verb agreement and article use to improve accuracy"
  ],
  "upgraded_sample": "Overall, the number of subway users climbed steadily from 2 million in 2000 to 3.8 million in 2020, while tram usage fell sharply from 1.5 million to under 0.5 million. The only mode to remain stable was buses, hovering around 2 million passengers throughout the period."
}
```

**Example 2 (Task 2, band ~7.5):**
```json
{
  "band_overall": 7.5,
  "band_task_response": 7.5,
  "band_coherence": 7.5,
  "band_lexical": 7.5,
  "band_grammar": 7.0,
  "word_count": 286,
  "strengths": [
    "Addresses both views and gives a clear opinion",
    "Paragraphing is logical with helpful transition phrases"
  ],
  "weaknesses": [
    "Some repetitive vocabulary around 'technology'",
    "A few complex sentences are overextended"
  ],
  "suggestions": [
    "Add synonyms such as 'digital tools' or 'automation' to avoid repetition",
    "Break very long sentences into two clauses to maintain clarity"
  ],
  "upgraded_sample": "While online lessons offer flexibility for working adults, they cannot fully replace the social interaction and immediate feedback found in classrooms. A balanced policy would invest in digital platforms for theory while preserving in-person workshops for collaboration and mentorship."
}
```

## Speaking Evaluation

### Master Prompt Template
```
You are an official IELTS Speaking examiner. Evaluate the transcript using IELTS criteria.
Input:
- part: 1, 2, or 3.
- prompt: the question or cue card text.
- transcript: the student's spoken response (already transcribed).
- pronunciation_notes: optional hints about mispronunciations; may be null.

Steps:
1. Read the prompt and transcript carefully.
2. Judge the answer according to IELTS Speaking bands.
3. Produce JSON with the schema below.

Output JSON keys (always include all keys):
{
  "band_overall": float,
  "band_fluency": float,
  "band_lexical": float,
  "band_grammar": float,
  "band_pronunciation": float,
  "strengths": array of short bullet strings,
  "weaknesses": array of short bullet strings,
  "suggestions": array of practical coaching tips,
  "upgraded_sample": string (band 8 style spoken answer referencing the same topic)
}
Tone and restrictions:
- Encouraging but straightforward; aim to help a dedicated student in Bishkek.
- Never mention XP, coins, games, or Brain Heist.
- If the response is incomplete, note it and score accordingly.
```

### JSON Response Shape
```json
{
  "band_overall": 0.0,
  "band_fluency": 0.0,
  "band_lexical": 0.0,
  "band_grammar": 0.0,
  "band_pronunciation": 0.0,
  "strengths": [],
  "weaknesses": [],
  "suggestions": [],
  "upgraded_sample": ""
}
```

### Example Evaluations

**Example 1 (Part 1, band ~5.5):**
```json
{
  "band_overall": 5.5,
  "band_fluency": 5.5,
  "band_lexical": 5.0,
  "band_grammar": 5.5,
  "band_pronunciation": 6.0,
  "strengths": [
    "Answers each question and keeps going without long pauses",
    "Pronunciation of common words is generally clear"
  ],
  "weaknesses": [
    "Uses limited vocabulary and repeats the same phrases",
    "Simple grammar with noticeable tense shifts"
  ],
  "suggestions": [
    "Create short lists of synonyms for daily topics such as hobbies and work",
    "Practice combining two clauses with conjunctions like 'although' or 'because' to add variety"
  ],
  "upgraded_sample": "When I finish work I usually meet my friends at a small café near my apartment. It helps me relax because we chat about our day and plan hikes for the weekend."
}
```

**Example 2 (Part 2, band ~7.5):**
```json
{
  "band_overall": 7.5,
  "band_fluency": 7.5,
  "band_lexical": 7.5,
  "band_grammar": 7.0,
  "band_pronunciation": 8.0,
  "strengths": [
    "Narrative is sustained smoothly with natural pausing",
    "Uses idiomatic expressions and precise adjectives"
  ],
  "weaknesses": [
    "A couple of verb agreement slips",
    "Ending lacks a clear concluding sentence"
  ],
  "suggestions": [
    "Review third-person 's' endings when describing other people",
    "Add a short concluding sentence that reflects on the story's significance"
  ],
  "upgraded_sample": "One memorable trip was a winter hike in Ala-Archa gorge. The air was sharp, the snow reflected every bit of sunlight, and I felt a rare sense of calm. That day reminded me why I need to spend time outdoors to recharge."
}
```
