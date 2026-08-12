# Official Admission Bank seed format

Platform seed scripts should insert **Brains Heist-owned, locked** admission pools and questions. Schools can read this content and generate tests from it, but cannot edit it.

## Pool fields

```json
{
  "id": "stable-uuid-optional",
  "school_id": null,
  "subject": "english | math | maths | science",
  "stage": 7,
  "stage_level": 7,
  "grade_level": 7,
  "name": "English Stage 7 Foundation — Official Bank v1",
  "description": "Short description for school admins.",
  "is_active": true,
  "is_official": true,
  "is_locked": true,
  "content_owner": "brain_heist",
  "content_version": "2026.1-demo",
  "source_label": "Brains Heist Official Admission Bank",
  "placement_band": "foundation | target | stretch"
}
```

## Question fields

```json
{
  "pool_id": "pool-uuid",
  "question_type": "mcq | gap_fill | error_correction | sentence_transformation | word_formation | open_cloze | reading_comprehension | short_answer | structured | matching | email_writing | essay_writing | writing_prompt",
  "stem": "Question text or writing prompt.",
  "passage": "Inline reading passage text when needed.",
  "reading_passage_id": "stable-passage-key-optional",
  "options": ["A", "B", "C", "D"],
  "correct_answer": "B or accepted answer JSON",
  "correct_index": 1,
  "marks": 1,
  "difficulty": "easy | medium | hard",
  "cognitive_level": "knowledge | application | reasoning",
  "topic": "Fractions",
  "skill_tag": "reading | writing | grammar | vocabulary | math_number | math_algebra | math_geometry | math_statistics",
  "diagnostic_skill": "Main diagnostic skill shown in reports",
  "strand": "Curriculum strand or reporting strand",
  "subskill": "Precise subskill",
  "grade_level": 7,
  "stage_level": 7,
  "placement_band": "foundation | target | stretch",
  "estimated_seconds": 90,
  "explanation": "Answer explanation for reports and review.",
  "writing_rubric": {
    "criteria": [
      { "name": "Task response", "marks": 5, "descriptors": ["..." ] },
      { "name": "Organisation", "marks": 5, "descriptors": ["..." ] }
    ]
  },
  "status": "published",
  "is_official": true,
  "is_locked": true,
  "content_owner": "brain_heist",
  "content_version": "2026.1-demo",
  "source_label": "Brains Heist Official Admission Bank"
}
```

## Seed rules

- Use stable UUIDs for repeatable upserts.
- Keep `school_id` null for official platform pools.
- Set both `is_official` and `is_locked` to `true` for every official pool and question.
- Set `source_label` to `Brains Heist Official Admission Bank` unless a later platform label is intentionally chosen.
- Do not grant schools insert/update/delete paths for official content; run official bank seeds as service role or platform admin.
- Tiny demo seeds are acceptable for smoke testing, but must not be represented as the complete official bank.
