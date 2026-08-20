import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
const bankRoot = 'supabase/seed/admission-official-bank';
const subjectFiles = ['english/grade_5.json', 'maths/grade_5.json', 'science/grade_5.json', 'english/grade_6.json', 'maths/grade_6.json', 'science/grade_6.json'];
const sharedFiles = ['shared/reading_passages.json', 'shared/writing_rubrics.json'];
const templatePatterns = [
    /Grade\s+[5-8]\s+science\s+question/i,
    /Grade\s+[5-8]\s+maths\s+question/i,
    /Grade\s+[5-8]\s+Algebraic/i,
    /Grade\s+[5-8]\s+Number/i,
    /\bproblem\s+(?:1|2)\b/i,
    /\bitem\s+(?:1|20)\b/i,
    /\bchoose the correct result\b/i,
    /\bquestion on\b/i,
    /\bchoose the best explanation\b/i,
    /\bCorrect result\s+\d+\b/i,
    /\bCommon error\s+\d+[A-Z]?\b/i,
    /\bscientific explanation\s+\d+\b/i,
    /\bkey idea tested in the question\b/i,
];
function assertNaturalCandidateText(value, location) {
    if (typeof value !== 'string')
        return;
    for (const pattern of templatePatterns) {
        assert.doesNotMatch(value, pattern, `${location} contains generator/template wording: ${value}`);
    }
}
test('official admission bank candidate-facing text avoids generator/template wording', () => {
    for (const file of subjectFiles) {
        const seed = JSON.parse(readFileSync(join(bankRoot, file), 'utf8'));
        for (const [index, question] of seed.questions.entries()) {
            const id = question.external_id ?? `${file}#${index}`;
            assertNaturalCandidateText(question.prompt, `${id}.prompt`);
            assertNaturalCandidateText(question.explanation, `${id}.explanation`);
        }
    }
    for (const file of sharedFiles) {
        const seed = JSON.parse(readFileSync(join(bankRoot, file), 'utf8'));
        for (const [collectionName, records] of Object.entries(seed)) {
            if (!Array.isArray(records))
                continue;
            for (const [index, record] of records.entries()) {
                const id = record.external_id ?? `${file}#${collectionName}[${index}]`;
                assertNaturalCandidateText(record.title, `${id}.title`);
                assertNaturalCandidateText(record.passage, `${id}.passage`);
                assertNaturalCandidateText(record.prompt, `${id}.prompt`);
                assertNaturalCandidateText(record.description, `${id}.description`);
                assertNaturalCandidateText(record.explanation, `${id}.explanation`);
            }
        }
    }
});
