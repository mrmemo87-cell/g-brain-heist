import test from 'node:test';
import assert from 'node:assert/strict';
import { announcementErrorMessage, groupStudentsByClass, validateAnnouncement, ANNOUNCEMENT_DEFAULT_TITLE } from '../src/lib/teacherAnnouncement.js';
test('roster is grouped by class, sorted, de-duplicated, and suspended students are left out', () => {
    const groups = groupStudentsByClass([
        { id: 'a', display_name: 'Zara', class_code: '10A' },
        { id: 'b', display_name: 'Aidai', class_code: '7A' },
        { id: 'c', display_name: 'Bek', class_code: '7A', access_status: 'suspended' },
        { id: 'b', display_name: 'Aidai', class_code: '7A' },
        { id: 'd', username: 'ruslan', batch: '7A' },
    ]);
    assert.deepEqual(groups.map((g) => g.classCode), ['7A', '10A'], 'numeric-aware order');
    assert.deepEqual(groups[0].students.map((s) => s.name), ['Aidai', 'ruslan']);
});
test('validation: recipients and message required, limits enforced, blank title gets the default', () => {
    assert.deepEqual(validateAnnouncement(0, '', 'Hi'), { ok: false, error: 'recipients_required' });
    assert.deepEqual(validateAnnouncement(2, '', '   '), { ok: false, error: 'message_required' });
    assert.deepEqual(validateAnnouncement(2, '', 'x'.repeat(201)), { ok: false, error: 'message_too_long' });
    assert.deepEqual(validateAnnouncement(2, 'x'.repeat(61), 'Hi'), { ok: false, error: 'title_too_long' });
    assert.deepEqual(validateAnnouncement(2, '  ', ' Bring books '), { ok: true, title: ANNOUNCEMENT_DEFAULT_TITLE, body: 'Bring books' });
});
test('server error codes become plain sentences', () => {
    assert.match(announcementErrorMessage('announcement_limit_reached'), /20 notifications/);
    assert.match(announcementErrorMessage('ERROR: student_not_in_your_classes'), /no longer in your classes/);
    assert.match(announcementErrorMessage('network down'), /could not be sent/);
});
