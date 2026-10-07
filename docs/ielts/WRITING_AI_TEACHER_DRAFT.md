# Writing teacher AI assistance

IELTS Diagnostic Bible **v1.2.0**. This is teacher assistance for the current qualitative Academic Task 2 screener, not a new scorer, a calibrated evaluator or universal genre reviewer. Public Writing release gates remain unchanged.

## Teacher flow

`Draft feedback with AI` reads the immutable essay and frozen task/rubric. It fills gaps in the four observations, selects exact excerpts, gives one concrete practice step and adds a neutral conditions note if incidents were recorded. Existing teacher notes are retained; `Use AI draft in every field` deliberately replaces them with the full draft. `Restore notes from before AI` restores the pre-generation workspace until feedback is shared.

Loading is indeterminate, accessible and respects reduced motion. Editing/sharing is blocked only while generation is pending. Failures leave notes unchanged. Navigating to another essay cancels the browser request and ignores late responses. Teachers must explicitly confirm the draft before sharing; editing clears that confirmation. Nothing is automatically shared with a student.

## Quality and trust

- Prompt version: `bh-ielts-task2-simple-feedback-v1`; bump it for instruction or quality-policy changes.
- Default provider model: `gpt-4.1-2025-04-14`, overridable only through server `IELTS_WRITING_DRAFT_MODEL`. Uses the existing server OpenAI configuration; no browser keys.
- Strict structured output, all four criteria, plain student-facing English, 2–3 short sentences per note and one achievable practice action. Runtime checks reject common jargon, overly long sentences, score claims and malformed outputs. One bounded retry repairs invalid output; no fabricated fallback feedback.
- Quotes must be verbatim; Unicode offsets are computed by the server and checked again in Postgres. Blank/invalid responses cannot receive an observed/developing conclusion. Exact quotation is necessary but does not prove that an AI interpretation is correct: the teacher must check relevance and accuracy.
- The prompt treats essay/task text as data, ignores injected instructions, follows the actual Task 2 question, and prohibits band estimates, persistent weakness labels, official-examiner claims and invented interruption effects.
- No whole-essay rewrite, arbitrary maximum word count or fixed paragraph-count rule.

## Server boundaries and history

`ielts_writing_teacher_ai` requires a valid user JWT, verifies identity with Auth, and claims work through the current canonical teacher/group/school review gate. Browser input contains only an attempt ID. The database supplies the original essay, task, word count, response state and frozen rubric; student names and contact details are not sent to the model. Access is checked again before returning a generated draft. Requests use `store:false`; full texts, provider error bodies and credentials are not logged.

Private draft history preserves requester, attempt, essay hash, source context, prompt/model version, provider response ID, generated fields and timestamps. Completed drafts and confirmed review links are immutable. A ready draft is reused for the same teacher/source/model/prompt. Claims serialize per teacher, prevent overlapping attempts on the same essay, and limit generation to six claims per ten minutes and forty per day. Provider work has a 45-second timeout and browser work a 70-second timeout.

Only the service role can complete a draft. The authenticated AI-assisted submit wrapper requires the same authorized teacher, matching source hash, ready draft and explicit confirmation. It calls the existing exact-evidence, optimistic-concurrency and idempotent review function and appends a draft-to-review link in the same transaction. The original essay, past reviews and coached revisions are unchanged. The original manual review path remains available.

## Acceptance and expansion

Automated tests cover exact Unicode quotes, fake quotes, incomplete responses, malformed criteria, jargon, source mismatch, retained teacher edits, loading/confirmation, student/outsider denial, revoked allocation, immutable history, cache reuse, rate limits and idempotent confirmed sharing. Deno checks the function separately from the Vite build.

Actual AI wording quality and authenticated phone/Macbook interaction must be checked in Gulzada's pilot before accepting this version. Automated tests are not teacher agreement studies. Do not claim universal writing suitability or validated scoring accuracy. Add other genres only with their own reviewed task/rubric profiles and representative teacher comparisons; do not reuse the Task 2 rubric for letters, stories, reports or Task 1.

References used for implementation: [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [GPT-4.1](https://developers.openai.com/api/docs/models/gpt-4.1), [Supabase Edge Function authentication](https://supabase.com/docs/guides/functions/auth).
