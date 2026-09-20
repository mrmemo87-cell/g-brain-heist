# Generated MCQ answer-position balancing

## Policy

AI-generated multiple-choice questions created from teacher PDF learning material must not expose a systematic correct-answer position bias.

The server, not the model prompt, is authoritative for answer positioning:

- Only `candidate_origin=ai_generated_from_source` multiple-choice questions are re-ordered.
- Extracted source questions preserve their original option order.
- True/false questions keep `True, False` ordering.
- Short-answer questions are untouched.
- Malformed generated MCQs remain unchanged so the existing human-attention validation path can handle them.
- Generated MCQs are grouped by option count (2–6 choices).
- Within each group, correct-answer positions are distributed as evenly as mathematically possible.
- Balanced target positions are seed-shuffled so students do not see a simple A/B/C/D repeating pattern.
- Correct-answer text and question content never change; only option order changes.
- The same normalized AI payload produces the same option ordering.

## Invariant

For every option-count group of valid AI-generated MCQs, the difference between the most-used and least-used correct-answer positions must be at most 1.

Examples:

- 14 four-option MCQs: counts must be a permutation of `4, 4, 3, 3`.
- 8 three-option MCQs: counts must be a permutation of `3, 3, 2`.
- 11 five-option MCQs: counts must be a permutation of `3, 2, 2, 2, 2`.

The PDF pipeline fails closed if the invariant is violated after normalization.
