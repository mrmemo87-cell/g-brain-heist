import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { resolveIeltsDashboardMode } from '../src/pages/ielts/ieltsDashboardMode.js';
const dashboardPath = path.join(process.cwd(), 'src/pages/ielts/IeltsJourneyDashboard.tsx');
assert.ok(fs.existsSync(dashboardPath), 'Expected IeltsJourneyDashboard.tsx to exist before reading test source');
let page = '';
try {
    page = fs.readFileSync(dashboardPath, 'utf8');
}
catch (error) {
    assert.fail(`Failed to read ${dashboardPath}: ${error instanceof Error ? error.message : String(error)}`);
}
test('uses valid assigned practice route and never links to nonexistent /ielts/assigned', () => {
    assert.match(page, /navigate\('\/ielts\/practice\/assigned'\)/);
    assert.doesNotMatch(page, /\/ielts\/assigned/);
});
test('dashboard mode uses only canonical platform or delegated administration capability', () => {
    const noMembership = { status: 'ready', capabilities: null };
    const delegatedMembership = {
        status: 'ready',
        capabilities: {
            school_id: 'school-1',
            role: 'teacher',
            is_owner: false,
            can_administer: true,
            can_teach: true,
        },
    };
    const capabilityError = { status: 'error', capabilities: null, message: 'unavailable' };
    assert.equal(resolveIeltsDashboardMode({ profile: { role: 'student' }, profileError: null, capabilityResolution: noMembership }), 'student');
    assert.equal(resolveIeltsDashboardMode({ profile: { role: 'school_admin' }, profileError: null, capabilityResolution: noMembership }), 'student', 'a stale school_admin profile role must not grant access');
    assert.equal(resolveIeltsDashboardMode({ profile: { role: 'admin' }, profileError: null, capabilityResolution: capabilityError }), 'admin', 'a verified platform admin remains authorized');
    assert.equal(resolveIeltsDashboardMode({ profile: { role: 'teacher' }, profileError: null, capabilityResolution: delegatedMembership }), 'admin', 'an active delegated administrator is authorized');
    assert.equal(resolveIeltsDashboardMode({ profile: { role: 'student' }, profileError: null, capabilityResolution: capabilityError }), 'error', 'unverified capability must fail closed');
});
test('tier lookup failure degrades only Prime access, not the whole dashboard', () => {
    assert.match(page, /getUserTier\(\)\.catch\(\(\) => null\)/, 'tier rejection should resolve to the free-tier fallback');
    assert.match(page, /setUserTier\(tierResult \|\| 'free'\)/, 'the dashboard should continue with free-tier access');
});
test('next action avoids fake completion phrasing', () => {
    assert.doesNotMatch(page, /Next: All tasks complete/);
    assert.match(page, /No active IELTS assignments right now\./);
    assert.match(page, /View your latest results and feedback\./);
});
test('light theme and band readiness section are present', () => {
    assert.match(page, /background:\s*'#f8fafc'/);
    assert.match(page, /Readiness overview/);
    assert.match(page, /Overall/);
    assert.match(page, /Not enough data yet/);
});
test('status labels are humanized and no raw in_progress token appears in UI copy', () => {
    assert.match(page, /In progress/);
    assert.doesNotMatch(page, /Status:\s*\{item\.status\b/);
});
test('assignment cards show only actual assigned skills and no Not assigned rows', () => {
    assert.match(page, /orderedSkills\.filter\(\(skill\) => \(item\.skills \?\? \[\]\)\.includes\(skill\)\)/);
    assert.doesNotMatch(page, /Not assigned/);
});
test('result and feedback CTA gating exists for objective vs productive skills', () => {
    assert.match(page, /View result/);
    assert.match(page, /View feedback/);
    assert.match(page, /Review pending/);
    assert.doesNotMatch(page, /generic mixed View feedback/i);
});
