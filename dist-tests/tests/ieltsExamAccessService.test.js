import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { resolveIeltsExamModeAdminAccess } from '../services/ieltsExamAccessService.js';
test('IELTS Exam Mode access allows school and platform administrators', () => {
    assert.deepEqual(resolveIeltsExamModeAdminAccess({ isAuthenticated: true, role: 'school_admin' }), { allowed: true, reason: 'school_admin_role' });
    assert.deepEqual(resolveIeltsExamModeAdminAccess({ isAuthenticated: true, role: 'admin' }), { allowed: true, reason: 'school_admin_role' });
    assert.deepEqual(resolveIeltsExamModeAdminAccess({ isAuthenticated: true, isAdmin: true, role: 'student' }), { allowed: true, reason: 'platform_admin' });
});
test('IELTS Exam Mode access allows assigned teachers only when backend exposes scoped exams', () => {
    assert.deepEqual(resolveIeltsExamModeAdminAccess({
        isAuthenticated: true,
        role: 'teacher',
        manageableExamListSucceeded: true,
        manageableExamCount: 1,
    }), { allowed: true, reason: 'manageable_exam_scope' });
});
test('IELTS Exam Mode access denies students and isolated legacy IELTS admins', () => {
    assert.deepEqual(resolveIeltsExamModeAdminAccess({ isAuthenticated: true, role: 'student', manageableExamListSucceeded: true, manageableExamCount: 0 }), { allowed: false, reason: 'denied' });
    assert.deepEqual(resolveIeltsExamModeAdminAccess({ isAuthenticated: true, role: 'ielts_admin', manageableExamListSucceeded: true, manageableExamCount: 0 }), { allowed: false, reason: 'denied' });
    assert.deepEqual(resolveIeltsExamModeAdminAccess({ isAuthenticated: false, role: 'superadmin' }), { allowed: false, reason: 'not_authenticated' });
});
test('School Admin Portal exposes Phase 1 IELTS tabs without removing Cambridge', () => {
    const portal = fs.readFileSync(path.join(process.cwd(), 'components/SchoolAdminPortal.tsx'), 'utf8');
    for (const tab of ['ielts-exams', 'ielts-practice', 'ielts-results', 'ielts-student-progress', 'ielts-analytics']) {
        assert.match(portal, new RegExp(`'${tab}'`), `School Admin Portal should include ${tab}`);
    }
    assert.match(portal, /tab === 'cambridge' && '📚 Cambridge'/, 'existing Cambridge tab label must remain present');
    assert.match(portal, /<CambridgeTab \/>/, 'existing Cambridge tab content must remain wired');
    assert.match(portal, /<IeltsExamsTab \/>/, 'IELTS Exams tab content must be wired');
    assert.match(portal, /<IeltsPracticeTab \/>/, 'IELTS Practice placeholder tab must be wired');
    assert.match(portal, /<IeltsResultsTab \/>/, 'IELTS Results placeholder tab must be wired');
    assert.match(portal, /<IeltsAnalyticsTab \/>/, 'IELTS Analytics placeholder tab must be wired');
    assert.match(portal, /label: 'Student Progress'[\s\S]*route: '\/ielts\/journey'/, 'IELTS school admin nav must include a direct Student Progress link to /ielts/journey');
    assert.match(portal, /label: 'Assignment Overview'/, 'IELTS school admin nav should label assignment monitoring as Assignment Overview');
});
test('IELTS Exams school admin tab links to the secure Exam Manager route', () => {
    const tab = fs.readFileSync(path.join(process.cwd(), 'components/school-admin/tabs/IeltsExamsTab.tsx'), 'utf8');
    assert.match(tab, /href="\/ielts\/exams\/manage"/, 'IELTS Exams tab must link to the secure Exam Manager route');
});
test('Phase 1 IELTS passive tabs avoid unsafe global practice queries', () => {
    for (const file of [
        'components/school-admin/tabs/IeltsResultsTab.tsx',
        'components/school-admin/tabs/IeltsAnalyticsTab.tsx',
    ]) {
        const content = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
        assert.doesNotMatch(content, /ielts_(reading|listening|writing|speaking|mock|sessions)/i, `${file} must not query legacy IELTS practice tables`);
        assert.doesNotMatch(content, /answer_key/i, `${file} must not expose answer_key`);
        assert.doesNotMatch(content, /IeltsAdminGuard|rpc_is_ielts_admin/i, `${file} must not use legacy IELTS admin permissions`);
    }
});
test('IELTS routes isolate legacy admin pages from school-scoped Exam Mode guard', () => {
    const routes = fs.readFileSync(path.join(process.cwd(), 'index.tsx'), 'utf8');
    assert.match(routes, /path:\s*'\/ielts\/admin',[\s\S]*?<IeltsAdminGuard>[\s\S]*?<IeltsAdminDashboard\s*\/>[\s\S]*?<\/IeltsAdminGuard>/i, 'legacy IELTS admin route must keep IeltsAdminGuard');
    assert.match(routes, /path:\s*'\/ielts\/exams\/manage',[\s\S]*?<IeltsExamModeAdminGuard>[\s\S]*?<IeltsExamManager\s*\/>[\s\S]*?<\/IeltsExamModeAdminGuard>/i, 'IELTS exam manager route must use school-scoped Exam Mode guard');
    assert.match(routes, /path:\s*'\/ielts\/exam\/:examEventId\/monitor',[\s\S]*?<IeltsExamModeAdminGuard>[\s\S]*?<IeltsExamMonitor\s*\/>[\s\S]*?<\/IeltsExamModeAdminGuard>/i, 'IELTS exam monitor route must use school-scoped Exam Mode guard');
});
test('Phase 0 IELTS Exam Mode SQL keeps managers school-scoped and teachers monitor-only', () => {
    const migration = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20260516120000_ielts_exam_mode_school_scoped_permissions.sql'), 'utf8');
    assert.match(migration, /u\.school_id\s*=\s*e\.school_id[\s\S]*coalesce\(u\.role, ''\)\s*=\s*'school_admin'/i, 'school_admin role must be scoped to the exam school');
    assert.match(migration, /sm\.role_in_school\s+in\s*\('school_admin',\s*'admin',\s*'superadmin'\)/i, 'school membership managers must be explicit admin roles only');
    assert.doesNotMatch(migration, /role_in_school\s+in\s*\([^\)]*'teacher'/i, 'teachers must not be included in create/manage roles');
    assert.match(migration, /case\s+when\s+v_is_manager\s+then\s+to_jsonb\(f\)\s+else\s+to_jsonb\(f\)\s+-\s+'answer_key'\s+end/i, 'monitor-only detail responses must omit answer_key');
    assert.match(migration, /public\.can_assign_ielts_exam_class\(p_exam_event_id uuid, p_class_id uuid\)[\s\S]*public\.can_manage_ielts_exam\(p_exam_event_id\)/i, 'class assignment writes must require exam manager permissions');
});
