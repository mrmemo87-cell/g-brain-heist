# AS Chemistry Ch6 (Electrochemistry) answer-checking logic

This note reflects the current logic in `public/cambridge-tests/Chemistry/electrochemistry.html`.

## Normal scoring path
1. Questions are defined with `code` labels and optional `masterCode` overrides.
2. The page attempts to derive `ANSWER_KEY` from the centralized helper:
   - `window.CHEMISTRY_MASTER_ANSWER_KEY.getAnswerKeyForQuestions(QUESTIONS)`
3. Readiness is validated per question (`QUESTIONS.every(...)`).
4. If complete, split/shuffle proceeds and scoring uses the derived key.

## Master-key-unavailable path (fallback)
This path is triggered when any of these happens:
- `window.CHEMISTRY_MASTER_ANSWER_KEY` is missing,
- `getAnswerKeyForQuestions` throws,
- or returned key coverage is partial for current QUESTIONS.

Behavior in this path:
- `ANSWER_KEY` stays `null` (sentinel for unavailable key).
- UI status is set to warning text.
- submit button is disabled.
- `calculateScore` returns pending (`{ score: 0, percentage: 0, pending: true }`) because readiness check fails.

## Runtime signals/logs to check while debugging
- Console warnings/errors emitted around master lookup and key completeness.
- `HAS_MASTER_KEY_LOOKUP` and `ANSWER_KEY` sentinel state before submit.
- `answerKeyReady` check inside `calculateScore`.
- Pending submission payload flags (`answer_key_ready`, `pending_answer_key`).

Generated from codebase baseline: `d6cb085` (+ local working changes at generation time).
