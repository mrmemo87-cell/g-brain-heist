import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { isAssignedTo } from '../src/lib/collectiveReportScope.js';
const report = readFileSync('components/CollectiveAssignmentReport.tsx', 'utf8');
const portal = readFileSync('components/TeacherPortal.tsx', 'utf8');
const service = readFileSync('services/gameService.ts', 'utf8');
const migration = readFileSync('supabase/migrations/20261118160000_teacher_assignment_reports_bulk.sql', 'utf8');
test('a student is only expected to submit work that was set for them', () => {
    const targeted = { id: 'a', assignment_mode: 'custom', student_ids: ['s1'] };
    assert.equal(isAssignedTo(targeted, 's1', false), true);
    assert.equal(isAssignedTo(targeted, 's2', false), false);
    // A recorded score always counts, even if the recipient list is stale.
    assert.equal(isAssignedTo(targeted, 's2', true), true);
    // Without a recipient list the column applies to the class shown.
    assert.equal(isAssignedTo({ id: 'b', student_ids: [] }, 's9', false), true);
    assert.equal(isAssignedTo({ id: 'c' }, 's9', false), true);
});
test('collective report shows "not assigned" apart from "not submitted" and counts completion per student', () => {
    assert.match(report, /row\.assignedIds\.has\(assignment\.id\) \? <span className="collective-not-submitted">Not submitted<\/span>/);
    assert.match(report, /aria-label="Not assigned"/);
    assert.match(report, /const totalPossible = displayRows\.reduce\(\(s, r\) => s \+ r\.assignedCount, 0\)/);
    assert.match(report, /row\.completedCount < row\.assignedCount/);
    assert.doesNotMatch(report, /\{row\.completedCount\}\/\{filteredAssignments\.length\}/);
    assert.match(report, /'Not submitted' : 'Not assigned'/);
});
test('collective report leaves targeted practice out and loads in one request', () => {
    assert.match(portal, /<CollectiveAssignmentReport\s+assignments=\{classAssignments\}/);
    assert.match(service, /rpc_teacher_assignment_reports_bulk/);
    assert.match(service, /Bulk assignment report unavailable; loading reports one by one/);
    assert.doesNotMatch(report, /progress\.done\}\/\{progress\.total\}/);
});
test('bulk report RPC keeps the single-report authorization rules', () => {
    assert.match(migration, /v_teacher_user is distinct from v_actor/i);
    assert.match(migration, /owned\.teacher_id=p_teacher_id/i);
    assert.match(migration, /private\.assignment_logical_member_ids\(requested\.id\)/i);
    assert.match(migration, /legacy_quarantined_assignment_students/i);
    assert.match(migration, /cardinality\(p_assignment_ids\),0\)>500/i);
    assert.match(migration, /revoke all on function public\.rpc_teacher_assignment_reports_bulk\(uuid,uuid\[\]\)\s+from public,anon/i);
    assert.match(migration, /grant execute on function public\.rpc_teacher_assignment_reports_bulk\(uuid,uuid\[\]\)\s+to authenticated,service_role/i);
});
