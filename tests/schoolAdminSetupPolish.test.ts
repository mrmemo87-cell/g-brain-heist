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

test('new school overview excludes admin-only accounts and unused local labels from active totals', () => {
  assert.match(dashboard, /role_in_school === 'teacher'/);
  assert.match(dashboard, /label: 'Subjects', value: assignedSubjectNames\.size/);
  assert.match(dashboard, /No teaching staff added yet/);
});

test('academic setup guides a valid year, known systems, grade subjects, and default class creation', () => {
  assert.match(academicSetup, /previous} — closed/);
  assert.match(academicSetup, /current} — available/);
  assert.match(academicSetup, /The end date must be later than the start date/);
  assert.match(academicSetup, /setYearCollapsed\(true\)/);
  for (const system of ['Cambridge International', 'American Standards', 'British National Curriculum', 'International Baccalaureate']) {
    assert.match(academicSetup, new RegExp(system.replace(/[()]/g, '\\$&')));
  }
  assert.match(academicSetup, /ensureGradeClass/);
  assert.match(academicSetup, /Save Grade \$\{activeGrade\} & create class/);
  assert.match(academicSetup, /This does not create students/);
  assert.match(academicSetup, /Find registered student/);
});

test('class and placement UX follows the academic plan and hides repair tooling by default', () => {
  assert.match(classes, /fetchSchoolAcademicSetup/);
  assert.match(classes, /class-creation-wizard/);
  assert.match(classes, /Only grades already configured/);
  assert.match(organisation, /1\. Class setup/);
  assert.match(organisation, /2\. Student placement/);
  assert.match(placement, /PGRST202/);
  assert.match(placement, /Advanced check temporarily unavailable/);
});

test('school identity is immutable to school admins and the supporting portal tabs use formal surfaces', () => {
  assert.match(settings, /Verified school identity/);
  assert.match(settings, /Request identity change/);
  assert.doesNotMatch(settings, /type="file"/);
  assert.match(migration, /school_identity_change_requires_platform_approval/);
  assert.match(migration, /public\.is_superadmin/);
  assert.match(migration, /notify pgrst, 'reload schema'/);
  assert.match(documents, /school-document-center/);
  assert.match(billing, /billing-on-dark/);
});

test('user-facing application code consistently uses the Brains Heist product name', () => {
  const pattern = /\bBrain Heist\b/;
  const matches: string[] = [];

  function scanDir(dir: string): void {
    let entries: ReturnType<typeof readdirSync>;
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

  for (const directory of ['components', 'src', 'services']) {
    scanDir(directory);
  }

  assert.deepEqual(matches, []);
});
