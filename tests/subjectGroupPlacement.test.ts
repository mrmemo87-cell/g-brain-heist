import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { groupNameKey } from '../services/subjectGroupNameKey.js';

// Regression contract for the 2026-11-02 incident: a student selected for a selective
// subject in the Subjects editor never reached the custom teaching group, so the subject
// teacher could not see them. These checks pin the three layers of the fix together.

const read = (path: string) => readFileSync(path, 'utf8');
const migration = read('supabase/migrations/20261102150000_subject_group_placement_safety.sql');
const sqlTest = read('supabase/tests/subject_group_placement.sql');
const catalogService = read('services/schoolSubjectCatalogService.ts');
const groupService = read('services/schoolSubjectGroupService.ts');
const subjectsManager = read('components/school-admin/SchoolSubjectsManager.tsx');
const groupsPanel = read('components/school-admin/SubjectTeachingGroupsPanel.tsx');

test('subject save seats newly selected students in the sole custom teaching group and reports it', () => {
  assert.match(migration, /create or replace function public\.rpc_school_admin_save_school_subject/i);
  assert.match(migration, /if v_custom_group_count=1 then/i);
  assert.match(migration, /insert into public\.school_subject_group_students/i);
  assert.match(migration, /'placedGroupName',case when v_placed_count>0 then v_sole_group_name end/i);
  assert.match(migration, /'unplacedCount',v_unplaced_count/i);
  assert.match(migration, /'placement',v_placement/i);
  // Deselecting a student from the subject must also withdraw their group membership.
  assert.match(migration, /update public\.school_subject_group_students m\s+set status='withdrawn'/i);
});

test('placement overview RPC exists, is admin-gated and lists students outside every custom group', () => {
  assert.match(migration, /create or replace function public\.rpc_school_admin_offering_placement/i);
  assert.match(migration, /school_administrator_access_required/i);
  assert.match(migration, /'unplaced', case/i);
  assert.match(migration, /private\.subject_offering_eligible_students\(v_offering\.id\)/i);
  assert.match(migration, /revoke all on function public\.rpc_school_admin_offering_placement\(uuid,uuid\) from public,anon/i);
});

test('near-duplicate custom group names are refused unless explicitly allowed, without dropping the old signature', () => {
  assert.match(migration, /create or replace function private\.subject_group_name_key/i);
  assert.match(migration, /similar_custom_group_exists/i);
  assert.match(migration, /p_allow_similar boolean\s*\)/i);
  // The 6-argument contract stays callable and always applies the guard.
  assert.match(migration, /p_registration_class_id,p_group_id,false/i);
  assert.doesNotMatch(migration, /drop function/i);
});

test('SQL regression covers auto placement, deselection, duplicate guard and multi-group reporting', () => {
  assert.match(sqlTest, /sole-group auto placement/);
  assert.match(sqlTest, /deselected student lingered on roster/);
  assert.match(sqlTest, /near-duplicate group accepted/);
  assert.match(sqlTest, /multi-group placement should not guess/);
  assert.match(sqlTest, /gap not cleared by roster save/);
});

test('services expose placement data and the duplicate-group error to the UI', () => {
  assert.match(catalogService, /export interface SchoolSubjectPlacementSummary/);
  assert.match(catalogService, /placement\?: SchoolSubjectPlacementSummary \| null/);
  assert.match(groupService, /rpc_school_admin_offering_placement/);
  assert.match(groupService, /export class SimilarGroupExistsError/);
  assert.match(groupService, /\['p_allow_similar'\] = true/);
});

test('Subjects editor keeps the dialog open and explains placement instead of closing on a half-done save', () => {
  assert.match(subjectsManager, /placementAttention/);
  assert.match(subjectsManager, /placement\.deliveryMode === 'custom_groups'/);
  assert.match(subjectsManager, /placement\.unplacedCount > 0/);
  assert.match(subjectsManager, /placed in \$\{placement\.placedGroupName\}/);
  assert.match(subjectsManager, /A teacher sees a student through a teaching group/);
});

test('teaching-groups panel shows the not-yet-in-a-group tray and asks before creating a look-alike group', () => {
  assert.match(groupsPanel, /data-testid="unplaced-students-tray"/);
  assert.match(groupsPanel, /Not yet in a teaching group/);
  assert.match(groupsPanel, /fetchOfferingPlacement\(schoolId, offering\.id\)/);
  assert.match(groupsPanel, /groupNameKey\(group\.name\) === groupNameKey\(groupName\)/);
  assert.match(groupsPanel, /cancelLabel: 'Use the existing group'/);
  assert.match(groupsPanel, /SimilarGroupExistsError/);
});

test('client-side group name key mirrors the database normalisation', () => {
  assert.equal(groupNameKey('Grade 7 ESL'), '7 esl');
  assert.equal(groupNameKey('7 ESL'), '7 esl');
  assert.equal(groupNameKey('G7 ESL'), '7 esl');
  assert.equal(groupNameKey('ESL grade 7'), '7 esl');
  assert.notEqual(groupNameKey('Grade 7 ESL'), groupNameKey('Grade 8 ESL'));
  assert.notEqual(groupNameKey('Grade 7 ESL'), groupNameKey('ESL Support (Gr 7)'));
});
