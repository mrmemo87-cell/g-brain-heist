# AS Chemistry Ch6 (Electrochemistry) answer-checking logic

This note reflects the current logic in `public/cambridge-tests/Chemistry/electrochemistry.html`.

## How answer checking now works
1. Question metadata is defined in-page (`QUESTIONS`) with stable `code` fields.
2. `ANSWER_KEY` is derived from the centralized master source:
   - `window.CHEMISTRY_MASTER_ANSWER_KEY.getAnswerKeyForQuestions(QUESTIONS)`
3. Quiz part split is then applied (`part=1|2`) by filtering both questions and the derived key.
4. Questions may be shuffled for display, while answer mapping is re-indexed to current order.
5. Submission scoring compares student responses against the derived `ANSWER_KEY`.

## Release behavior
- Students submit first.
- Per-question right/wrong display is shown when teacher release logic enables review mode.

## Why this matters
- Scoring is now tied to one central chemistry answer source (`chemistry_master_answer_key.js`) rather than per-file hardcoded keys.
