import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
async function loadValidator() {
    const moduleUrl = pathToFileURL(path.resolve('scripts/validate-admission-official-bank.mjs')).href;
    return await import(moduleUrl);
}
test('official admission bank validator bans generation residue examples', () => {
    const bad = [
        'In a sports report, which sentence is punctuated correctly? Focus on After lunch, Maya asked, “May I borrow your ruler?”.',
        'The instructions were clear and ______. Focus on precise.',
        'rough with a tempting but incomplete explanation.',
        'The book creates new darkness with a plausible but incorrect detail added.',
        'They are all trying to look alike while mixing in an extra unsupported condition.',
        'Geometry Measurement scenario 2: calculate the result for the described situation.',
        'A class studies a evaporation tray. Which conclusion best applies the chemistry / materials idea being tested?',
        'The conclusion that correctly uses evidence from the evaporation tray.',
    ];
    const joined = bad.join('\n');
    assert.match(joined, /Focus on/);
});
test('normalized stem detection strips artificial answer hints', async () => {
    const { normalizeAdmissionQuestionStem } = await loadValidator();
    assert.equal(normalizeAdmissionQuestionStem('In a sports report, which word best completes the sentence: The instructions were clear and ______. Focus on precise.'), normalizeAdmissionQuestionStem('In a library conversation, which word best completes the sentence: The instructions were clear and ______. Focus on precise.'));
});
test('official admission banks pass content-quality validation', async () => {
    const { validateAdmissionOfficialBank } = await loadValidator();
    const result = validateAdmissionOfficialBank();
    assert.equal(result.ok, true, result.errors.slice(0, 20).join('\n'));
});
