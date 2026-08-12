import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');
const dashboard = read('components/school-admin/tabs/DashboardTab.tsx');
const academicSetup = read('components/school-admin/AcademicSetupPanel.tsx');
const classes = read('components/school-admin/tabs/ClassesTab.tsx');
const organisation = read('components/school-admin/tabs/OrganisationTab.tsx');
const settings = read('components/school-admin/tabs/SettingsTab.tsx');
const placement = read('components/school-admin/PlacementExceptionQueue.tsx');
const documents = read('src/components/SchoolDocumentCenter.tsx');
const billing = read('components/school-admin/BillingTabUI.tsx');
const migration = read('supabase/migrations/20260812130000_polish_school_admin_setup.sql');
const sourceOfTruthMigration = read('supabase/migrations/20260812143000_school_admin_source_of_truth.sql');
const teachingStaffMigration = read('supabase/migrations/20260812153000_teaching_staff_assignment_contract.sql');

test('new school overview excludes admin-only accounts and unused local labels from active totals', () => {
  assert.match(dashboard, /teachers\.filter\(\(item: any\) => item\.can_teach\)/);
  assert.match(dashboard, /label: 'Subjects', value: curriculumSubjects\.size/);
  assert.doesNotMatch(dashboard, /local.*labels.*available/);
  assert.match(dashboard, /No teaching staff have joined yet/);
});

test('academic setup guides a valid year, known systems, grade subjects, and default class creation', () => {
  assert.match(academicSetup, /previous} — closed/);
  assert.match(academicSetup, /current} — available/);
  assert.match(academicSetup, /The end date must be later than the start date/);
  assert.match(academicSetup, /SetupSection id="year"/);
  for (const system of ['Cambridge International', 'American Standards']) {
    assert.match(academicSetup, new RegExp(system.replace(/[()]/g, '\\$&')));
  }
  assert.doesNotMatch(academicSetup, /Not published yet/);
  assert.match(academicSetup, /ensureGradeClass/);
  assert.match(academicSetup, /Save Grade \$\{activeGrade\} plan/);
  assert.match(academicSetup, /This does not create student accounts/);
  assert.match(academicSetup, /Find registered student/);
});

test('class and placement UX follows the academic plan and hides repair tooling by default', () => {
  assert.match(classes, /fetchSchoolAcademicSetup/);
  assert.match(classes, /class-creation-wizard/);
  assert.match(classes, /Only grade levels configured/);
  assert.match(classes, /Ready for enrolment/);
  assert.match(organisation, /1\. Class setup/);
  assert.match(organisation, /2\. Student placement/);
  assert.match(placement, /PGRST202/);
  assert.match(placement, /Advanced check temporarily unavailable/);
});

test('executive staffing and subject totals come from explicit school records', () => {
  assert.match(teachingStaffMigration, /sm\.role_in_school = 'teacher' or sm\.can_teach or exists/);
  assert.match(teachingStaffMigration, /class_teacher_assignments/);
  assert.match(teachingStaffMigration, /school_curriculum_scope_mappings/);
  assert.match(teachingStaffMigration, /y\.status = 'current'/);
  assert.match(teachingStaffMigration, /item->>'id' <> 'unassigned_teachers'/);
  assert.match(teachingStaffMigration, /v_teachers = 0 and item->>'id' = 'uncovered_classes'/);
  assert.doesNotMatch(teachingStaffMigration, /count\(\*\) filter \(where sm\.can_teach\)/);
});

test('saving a grade plan archives subjects the administrator removed', () => {
  assert.match(sourceOfTruthMigration, /set status = 'archived'/);
  assert.match(sourceOfTruthMigration, /not exists \(\s*select 1 from jsonb_array_elements\(p_offerings\)/);
});

test('school identity is immutable to school admins and the supporting portal tabs use formal surfaces', () => {
  assert.match(settings, /Confirm school identity/);
  assert.match(settings, /Request identity change/);
  assert.match(settings, /type="file"/);
  assert.match(sourceOfTruthMigration, /School identity is already confirmed/);
  assert.match(sourceOfTruthMigration, /school_identity_confirmed/);
  assert.match(migration, /school_identity_change_requires_platform_approval/);
  assert.match(migration, /public\.is_superadmin/);
  assert.match(migration, /notify pgrst, 'reload schema'/);
  assert.match(documents, /school-document-center/);
  assert.match(billing, /billing-on-dark/);
});

test('the repository consistently uses the Brains Heist product name', () => {
  const pattern = new RegExp('\\bBrain ' + 'Heist\\b');
  const matches: string[] = [];

  function scanDir(dir: string): void {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry);
      if (entry.endsWith('.bak')) continue;
      const st = statSync(full);
      if (st.isDirectory()) {
        scanDir(full);
      } else {
        const content = readFileSync(full, 'utf8');
        const lines = content.split('\n');
        lines.forEach((line, idx) => {
          if (pattern.test(line)) {
            matches.push(`${full}:${idx + 1}:${line}`);
          }
        });
      }
    }
  }

  for (const directory of ['components', 'src', 'services', 'supabase', 'tests', 'docs']) {
    scanDir(directory);
  }

  assert.deepEqual(matches, []);
});
