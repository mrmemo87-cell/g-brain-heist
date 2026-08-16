# Brains Heist lower-school coverage floor

Grades 1–5 are filled from the top down so content, language and interaction complexity decrease deliberately rather than by mechanically simplifying an older-grade package. No question or asset is reused across grades.

| Grade | Questions | Subjects | Objectives | Minimum visual questions | Additional interaction requirement |
| --- | ---: | ---: | ---: | ---: | --- |
| 5 | 80 | 4 | 20 | 32 | Current MCQ controls |
| 4 | 80 | 4 | 20 | 36 | Current MCQ controls with shorter reading load |
| 3 | 80 | 4 | 20 | 40 | Larger visual stimuli and shorter answer text |
| 2 | 80 | 4 | 20 | 48 | Audio-capable prompts and image answer controls |
| 1 | 80 | 4 | 20 | 56 | Audio-first prompts, minimal reading and large image controls |

The four governed subjects are Mathematics, English/literacy, Integrated Science and Geography/people and places. Each subject receives 20 questions mapped four-at-a-time to five curated objectives. Every subject retains the 5 easy / 10 medium / 5 hard distribution and balanced A–D answer positions, with difficulty interpreted at the appropriate age level.

## Release sequence

1. Complete and review Grade 5.
2. Build Grade 4 using the same package and asset pipeline.
3. Build Grade 3 after confirming phone readability at the larger visual ratio.
4. Extend the importer and player for audio prompts and image-based answers.
5. Build Grade 2, then Grade 1, only after the early-primary interaction checks pass.
6. Run one cross-grade coverage, progression and semantic-duplicate audit before expanding any grade beyond its floor.

## Non-negotiable QA gates

- Original, age-appropriate questions with no cross-grade prompt reuse.
- Exactly one approved primary curriculum mapping per question.
- Versioned immutable assets with checksum, dimensions, alt text and source/licence metadata.
- Phone-readable visuals that do not rely on colour alone.
- Alt text that provides equivalent access without explicitly disclosing the keyed answer.
- No accidental text, watermark, unsafe SVG content or externally embedded media.
- Balanced subject, objective, difficulty and answer-position coverage.
- Editorial, curriculum, accessibility and production-load verification before import.
