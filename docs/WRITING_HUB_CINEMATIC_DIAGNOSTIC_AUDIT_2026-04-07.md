# Writing Hub cinematic diagnostic audit (2026-04-07)

This document records a code-level audit of the current Brains Heist Writing Hub for feasibility of a first-submit cinematic diagnostic + guided repair flow.

Key findings:
- First submit is handled in `WritingHub.tsx` via `submitInitialWritingAssessment`, then optional AI feedback via `requestWritingAiAssist` (`mode: feedback`).
- Scoring is deterministic and rubric-style in `writingAssessment.ts` (subscores + weakness tags), not span-anchored.
- Persistence is mainly JSON payload rows in `bh_writing_*` tables through `writingRepository.ts`.
- Student UI currently shows list-based feedback and a plain-text “first attempt” modal; no inline span highlights yet.
- Personalized remediation already exists as weekly plan + daily tasks + practice evaluator feedback.
- No sentence IDs, paragraph IDs, or character offsets are currently stored in writing assessment or AI feedback payloads.
