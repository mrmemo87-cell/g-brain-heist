// Pure helpers for the teacher "Send notification" screen. Unit-testable without a browser.
export const ANNOUNCEMENT_TITLE_MAX = 60;
export const ANNOUNCEMENT_BODY_MAX = 200;
export const ANNOUNCEMENT_DEFAULT_TITLE = 'Message from your teacher';
/** Groups the teacher's roster by class, keeping only students who can receive messages (active). */
export function groupStudentsByClass(students) {
    const groups = new Map();
    for (const s of students) {
        if (!s?.id)
            continue;
        if (s.access_status && s.access_status !== 'active')
            continue;
        const code = (s.class_code || s.batch || 'Other').toString();
        const name = (s.display_name || s.username || 'Student').toString();
        if (!groups.has(code))
            groups.set(code, new Map());
        groups.get(code).set(s.id, name);
    }
    return [...groups.entries()]
        .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
        .map(([classCode, members]) => ({
        classCode,
        students: [...members.entries()]
            .map(([id, name]) => ({ id, name }))
            .sort((a, b) => a.name.localeCompare(b.name)),
    }));
}
export function validateAnnouncement(selectedCount, title, body) {
    const t = title.trim();
    const b = body.trim();
    if (selectedCount < 1)
        return { ok: false, error: 'recipients_required' };
    if (!b)
        return { ok: false, error: 'message_required' };
    if (b.length > ANNOUNCEMENT_BODY_MAX)
        return { ok: false, error: 'message_too_long' };
    if (t.length > ANNOUNCEMENT_TITLE_MAX)
        return { ok: false, error: 'title_too_long' };
    return { ok: true, title: t || ANNOUNCEMENT_DEFAULT_TITLE, body: b };
}
/** Maps server/client error codes to the sentence the teacher sees. */
export function announcementErrorMessage(raw) {
    const code = (raw || '').toLowerCase();
    if (code.includes('recipients_required'))
        return 'Choose at least one class or student.';
    if (code.includes('message_required'))
        return 'Write a message first.';
    if (code.includes('message_too_long'))
        return `Keep the message under ${ANNOUNCEMENT_BODY_MAX} characters.`;
    if (code.includes('title_too_long'))
        return `Keep the title under ${ANNOUNCEMENT_TITLE_MAX} characters.`;
    if (code.includes('announcement_limit_reached'))
        return 'You have sent 20 notifications in the last 24 hours. Please try again later.';
    if (code.includes('student_not_in_your_classes'))
        return 'Some selected students are no longer in your classes. Reopen this window and try again.';
    if (code.includes('too_many_recipients'))
        return 'Choose 500 students or fewer.';
    return 'The notification could not be sent. Please try again.';
}
