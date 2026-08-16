import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync('App.tsx', 'utf8');
const schoolAdminPortal = readFileSync('components/SchoolAdminPortal.tsx', 'utf8');
const teacherPortal = readFileSync('components/TeacherPortal.tsx', 'utf8');
const supabaseClient = readFileSync('services/supabaseClient.ts', 'utf8');
const membershipCapabilities = readFileSync(
  'supabase/migrations/20260801173000_school_membership_capabilities.sql',
  'utf8',
);
const privateDocuments = readFileSync(
  'supabase/migrations/20260802133000_private_school_document_center.sql',
  'utf8',
);

test('dual-role workspace preference is isolated by school and restricted to authorised portals', () => {
  assert.match(app, /localStorage\.setItem\(`school_workspace:\$\{schoolCapabilities\.school_id\}`,[\s\S]*?nextView\)/);
  assert.match(app, /localStorage\.getItem\(`school_workspace:\$\{schoolId\}`\)/);
  assert.match(app, /available\.push\('school_admin'\)/);
  assert.match(app, /available\.push\('teacher'\)/);
  assert.match(app, /available\.includes\(requested\)/);
  assert.match(app, /const allowedSchoolAdminViews = \['school_admin', 'cambridge', 'ielts'\]/);
});

test('teacher desktop navigation remains persistent, accessible, and user-collapsible', () => {
  assert.match(teacherPortal, /TEACHER_SIDEBAR_STORAGE_KEY = 'brains-heist:teacher-sidebar-collapsed'/);
  assert.match(teacherPortal, /window\.localStorage\.getItem\(TEACHER_SIDEBAR_STORAGE_KEY\)/);
  assert.match(teacherPortal, /window\.localStorage\.setItem\(TEACHER_SIDEBAR_STORAGE_KEY, String\(nextCollapsed\)\)/);
  assert.match(teacherPortal, /className=\{`teacher-sidebar teacher-desktop-sidebar/);
  assert.match(teacherPortal, /aria-label=\{desktopSidebarCollapsed \? 'Expand side navigation' : 'Collapse side navigation'\}/);
  assert.match(teacherPortal, /aria-controls="teacher-primary-navigation"/);
  assert.match(teacherPortal, /id="teacher-primary-navigation"/);
});

test('school administration features stay within one complete portal shell', () => {
  const expectedTabs = [
    ['dashboard', 'Overview'],
    ['members', 'Staff & Students'],
    ['teachers', 'Teacher Allocation'],
    ['classes', 'Classes & Registration'],
    ['subjects', 'Curriculum & Subjects'],
    ['documents', 'Document Center'],
    ['admissions', 'Admissions'],
    ['cambridge', 'Cambridge Assessments'],
    ['ielts', 'IELTS Programme'],
    ['billing', 'Plan & Billing'],
    ['settings', 'School Settings'],
  ] as const;

  for (const [id, label] of expectedTabs) {
    assert.match(
      schoolAdminPortal,
      new RegExp(`id: '${id}'[^\\n]+label: '${label}'`),
      `${label} must remain in the school administration navigation`,
    );
    assert.match(
      schoolAdminPortal,
      new RegExp(`activeTab === '${id}'`),
      `${label} must render inside the school administration shell`,
    );
  }
});

test('school membership capabilities use active school membership and audited role changes', () => {
  assert.match(membershipCapabilities, /create unique index if not exists school_members_one_owner_per_school_idx/);
  assert.match(membershipCapabilities, /where sm\.school_id = p_school_id and sm\.user_id = auth\.uid\(\)[\s\S]*?sm\.status = 'active'/);
  assert.match(membershipCapabilities, /alter table public\.school_member_role_audit enable row level security/);
  assert.match(membershipCapabilities, /for select to authenticated using \(public\.can_administer_school\(school_id\)\)/);
  assert.match(membershipCapabilities, /insert into public\.school_member_role_audit/);

  for (const signature of [
    'public.can_administer_school\\(uuid\\)',
    'public.can_teach_in_school\\(uuid\\)',
    'public.is_school_owner\\(uuid\\)',
    'public.school_admin_transition_member_role\\(uuid,uuid,text,boolean,text\\)',
  ]) {
    assert.match(membershipCapabilities, new RegExp(`revoke execute on function ${signature} from public, anon`));
    assert.match(membershipCapabilities, new RegExp(`grant execute on function ${signature} to authenticated`));
  }
});

test('school documents are private by default with explicit, school-scoped access', () => {
  assert.match(privateDocuments, /visibility_scope text not null default 'private'/);
  assert.match(privateDocuments, /alter table public\.school_document_records enable row level security/);
  assert.match(privateDocuments, /alter table public\.school_document_access_grants enable row level security/);
  assert.match(privateDocuments, /cta\.school_id = p_school_id and cta\.class_id = p_class_id/);
  assert.match(privateDocuments, /sm\.school_id = p_school_id and sm\.user_id = \(select auth\.uid\(\)\)/);
  assert.match(privateDocuments, /revoke all on table public\.school_document_records from public, anon/);
  assert.match(privateDocuments, /grant select, insert, delete on table public\.school_document_records to authenticated/);
  assert.doesNotMatch(privateDocuments, /grant all on table public\.school_document_records to authenticated/);
});

test('browser Supabase client is limited to the publishable anonymous credential', () => {
  assert.match(supabaseClient, /getEnvVar\('VITE_SUPABASE_URL'\)/);
  assert.match(supabaseClient, /getEnvVar\('VITE_SUPABASE_ANON_KEY'\)/);
  assert.doesNotMatch(supabaseClient, /SERVICE_ROLE|service_role|SUPABASE_SERVICE_KEY/);
});
