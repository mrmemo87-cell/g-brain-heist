# Biology Question Import Workflow (Low-Confusion Method)

This workflow is designed for your exact situation:
- Questions come from **picture-based PDFs**.
- Each question has a **question code** (example: `9700_m20_qp_12 Q: 1`).
- You want to split each chapter into tests with **max 30 questions per test**.
- You want to paste **all answers at the end in one batch** (like Chemistry).

---

## 1) Use a strict naming rule first (before adding questions)

Pick one naming format and never change it during import.

### Recommended test IDs (for Biology)
- `as-biology-ch1-cell-structure-part-1`
- `as-biology-ch1-cell-structure-part-2`
- `as-biology-ch2-biological-molecules-part-1`
- ...

### Recommended quiz base names inside HTML
Must exactly match `components/biologyAnswerKeys.ts` keys:
- `AS Biology Ch1 ( Cell structure )`
- `AS Biology Ch2 ( Biological molecules )`
- etc.

If names drift, answer key lookup becomes confusing later.

---

## 2) Build a "question bank sheet" before editing HTML

Create one spreadsheet (or markdown table) with these columns:

1. `chapter`
2. `test_part` (Part 1 / Part 2 / Part 3)
3. `local_q_no` (1..30 inside each part)
4. `source_code` (e.g. `9700_m20_qp_12 Q: 1`)
5. `prompt_done` (Y/N)
6. `options_done` (Y/N)
7. `image_needed` (Y/N)
8. `answer` (leave blank for now)
9. `explanation_done` (Y/N)

This sheet is your single source of truth while copying from image PDFs.

---

## 3) Chunk by chapter in fixed blocks of 30

For each chapter:

- Sort questions in your preferred teaching order.
- Split into chunks of **max 30**:
  - Part 1 = Q1–Q30
  - Part 2 = Q31–Q60
  - Part 3 = Q61–Q90 (if needed)
- Keep numbering in each HTML file as **1..N** for that part.

This prevents long-page editing errors and keeps student sessions stable.

---

## 4) Add questions first, answers later (safe two-pass method)

### Pass A: Question ingestion only
In each chapter HTML under `public/cambridge-tests/Biology/`:
- Fill `QUESTIONS` array with:
  - `number`
  - `code`
  - `prompt`
  - `simpleOptions` or `table`
  - `explanation` (optional now, can be short placeholder)
- Keep `ANSWER_KEY` minimal/placeholder during this pass.

### Pass B: Answer key finalization (single batch)
When all questions are complete:
1. Fill each chapter key in `components/biologyAnswerKeys.ts`.
2. Set `biologyQuestionRanges` totals and split index:
   - `total = total chapter questions`
   - `splitIndex = Math.ceil(total / 2)` (or your chosen split if using 30-block parts in the UI).
3. Verify every `QUIZ_BASE_NAME` exactly matches the key in `biologyAnswerKeys`.

---

## 5) Use a copy template for every question object

```js
{
  number: 1,
  code: '9700_m20_qp_12 Q: 1',
  prompt: 'Question text here',
  simpleOptions: [
    { label: 'A', text: '...' },
    { label: 'B', text: '...' },
    { label: 'C', text: '...' },
    { label: 'D', text: '...' },
  ],
  explanation: 'Add explanation later if needed.'
}
```

Using one template avoids structural mistakes while transcribing image PDFs.

---

## 6) Image-based question handling rule

For questions with diagrams:
- Save image once under `public/question-images/AS-Biology/<chapter>/...`.
- Reference the same image path in prompt HTML.
- Name files with source code for traceability, e.g.:
  - `9700_m20_qp_12_q1.png`

This makes later corrections much easier.

---

## 7) Fast validation checklist after each chapter

- [ ] No test part has more than 30 questions.
- [ ] Question numbers are sequential (1..N) inside each part.
- [ ] Every question has a unique `code` within the chapter.
- [ ] Every question has exactly 4 options (A–D) unless table format defines equivalent choices.
- [ ] Every HTML `QUIZ_BASE_NAME` matches biology answer-key map key.
- [ ] Chapter appears correctly in the test hub list.

---

## 8) Recommended work order (least confusion)

1. Finish **all prompts/options/codes** chapter by chapter.
2. Do a quick chapter smoke test in browser.
3. Only after all chapters are stable, paste **all answers at once** into `biologyAnswerKeys.ts`.
4. Run one final pass for naming consistency and totals.

This keeps context switching low and mirrors your successful Chemistry flow.

---

## 9) Optional anti-confusion trick

At top of each Biology HTML file, add a short comment block:

```html
<!--
Chapter: AS Biology ChX
Part: 1
Question range in source sheet: rows 1-30
Answer key status: PENDING
-->
```

Then change `PENDING` to `DONE` only when answer keys are inserted.

