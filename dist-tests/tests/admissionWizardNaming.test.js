import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAdmissionWizardBlueprintName, buildAdmissionWizardDefaultName, getAdmissionWizardSubjectLabel, } from '../src/lib/admissionWizardNaming.js';
test('default admission wizard name updates with grade', () => {
    assert.equal(buildAdmissionWizardDefaultName(5, 'english'), 'Grade 5 English Admission Test');
    assert.equal(buildAdmissionWizardDefaultName(7, 'english'), 'Grade 7 English Admission Test');
});
test('default admission wizard name updates with subject and uses Maths wording', () => {
    assert.equal(buildAdmissionWizardDefaultName(5, 'math'), 'Grade 5 Maths Admission Test');
    assert.equal(buildAdmissionWizardDefaultName(5, 'science'), 'Grade 5 Science Admission Test');
});
test('subject labels normalize math aliases for displayed and payload names', () => {
    assert.equal(getAdmissionWizardSubjectLabel('math'), 'Maths');
    assert.equal(getAdmissionWizardSubjectLabel('maths'), 'Maths');
    assert.equal(getAdmissionWizardSubjectLabel('mathematics'), 'Maths');
});
test('blueprint payload name preserves custom names and adds wizard prefix once', () => {
    assert.equal(buildAdmissionWizardBlueprintName('Custom Grade 5 Maths Screen'), 'Admission Test Wizard — Custom Grade 5 Maths Screen');
    assert.equal(buildAdmissionWizardBlueprintName('Admission Test Wizard — Grade 5 Science Admission Test'), 'Admission Test Wizard — Grade 5 Science Admission Test');
});
