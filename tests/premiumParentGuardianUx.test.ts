import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const read = (path: string) => fs.readFileSync(path, 'utf8');

test('guardian invitation preview is token-scoped and minimises pre-auth data', () => {
  const migration = read('supabase/migrations/20260810110000_guardian_invitation_brand_preview.sql');
  assert.match(migration, /rpc_guardian_invitation_preview/);
  assert.match(migration, /token_hash = extensions\.digest/);
  assert.match(migration, /invited_email_hint/);
  assert.doesNotMatch(migration, /'id', v_student\.id/);
  assert.doesNotMatch(migration, /'id', v_school\.id/);
  assert.doesNotMatch(migration, /'invited_email', v_inv\.invited_email/);
  assert.match(migration, /grant execute on function public\.rpc_guardian_invitation_preview\(text\) to anon, authenticated, service_role/);
});

test('guardian invitation preview reports only whether the signed-in account matches', () => {
  const migration = read('supabase/migrations/20260815044500_guardian_invitation_account_match_preview.sql');
  assert.match(migration, /email_matches_current_account/);
  assert.match(migration, /v_current_email = v_inv\.invited_email/);
  assert.match(migration, /case when v_caller is null then null else v_email_matches end/);
  assert.doesNotMatch(migration, /'invited_email',\s*v_inv\.invited_email/);
});

test('parent invitation experience is school and Brains Heist co-branded', () => {
  const parent = read('components/guardian/ParentPortal.tsx');
  const admin = read('components/guardian/GuardianManagementPage.tsx');
  assert.match(parent, /SchoolBrand/);
  assert.match(parent, /PRODUCT_LOGO_URL/);
  assert.match(parent, /PRODUCT_NAME/);
  assert.match(parent, /You’ve been invited to follow/);
  assert.match(parent, /Secure parent access/);
  assert.match(admin, /Manual sharing backup/);
  assert.match(admin, /Copy backup message/);
  assert.match(admin, /school-approved marks/);
});

test('signed-in parent dashboard is a light tabbed academic experience without attendance placeholders', () => {
  const parent = read('components/guardian/ParentPortal.tsx');
  const dashboard = read('components/guardian/ParentDashboardPremium.tsx');
  const baseCss = read('components/guardian/ParentDashboardPremium.css');
  const tabsCss = read('components/guardian/ParentDashboardPremiumTabs.css');

  assert.match(parent, /ParentDashboardPremium/);
  assert.match(dashboard, /Academic snapshot/);
  assert.match(dashboard, /Subject performance/);
  assert.match(dashboard, /Areas needing support/);
  assert.match(dashboard, /Recent assessments/);
  assert.match(dashboard, /Recommended focus/);
  assert.match(dashboard, /ParentLearningTrendChart/);
  assert.match(dashboard, /AnimatedChecklist/);
  assert.match(dashboard, /type ParentTab = 'home' \| 'academics' \| 'progress' \| 'focus' \| 'account'/);
  assert.doesNotMatch(dashboard, /PerformanceSparkline/);
  assert.doesNotMatch(dashboard, /Attendance/i);
  assert.match(baseCss, /pp-pen-write/);
  assert.match(baseCss, /pp-check-draw/);
  assert.match(tabsCss, /parent-premium-tab-panel/);
  assert.match(tabsCss, /prefers-reduced-motion/);
});

test('parent progress uses the governed smart evidence chart rather than a six-point sparkline', () => {
  const dashboard = read('components/guardian/ParentDashboardPremium.tsx');
  const chart = read('components/guardian/ParentLearningTrendChart.tsx');

  assert.match(dashboard, /Smart progress intelligence/);
  assert.match(chart, /progress\.timeline/);
  assert.match(chart, /observationSignal/);
  assert.match(chart, /assignment_result/);
  assert.match(chart, /writing_attempt/);
  assert.match(chart, /Needs support/);
  assert.match(chart, /Developing/);
  assert.match(chart, /Strong/);
  assert.match(chart, /tabIndex=\{0\}/);
  assert.match(chart, /onMouseEnter/);
  assert.match(chart, /onFocus/);
  assert.match(chart, /edge-/);
});

test('parent mobile navigation reuses the School Admin smart collapse behavior', () => {
  const dashboard = read('components/guardian/ParentDashboardPremium.tsx');
  const tabsCss = read('components/guardian/ParentDashboardPremiumTabs.css');
  const hook = read('src/hooks/useSmartCollapsedNavigation.ts');

  assert.match(dashboard, /useSmartCollapsedNavigation\(activeTab, '\(max-width: 768px\)'\)/);
  assert.match(dashboard, /revealNavigation/);
  assert.match(dashboard, /window\.history/);
  assert.match(dashboard, /popstate/);
  assert.match(dashboard, /aria-current/);
  assert.match(tabsCss, /--smart-nav-translate-y/);
  assert.match(tabsCss, /data-reveal-visible/);
  assert.match(hook, /DIRECT_SCROLL_PORTION = 2 \/ 3/);
  assert.match(hook, /NAVIGATION_PEEK_HEIGHT = 15/);
});

test('verified guardians receive the real student avatar and can switch linked children', () => {
  const dashboard = read('components/guardian/ParentDashboardPremium.tsx');
  const service = read('services/guardianService.ts');
  const migration = read('supabase/migrations/20260823112000_guardian_child_avatar.sql');

  assert.match(service, /avatar_url\?: string \| null/);
  assert.match(migration, /'avatar_url',u\.avatar_url/);
  assert.match(migration, /r\.guardian_user_id=v_caller and r\.status='active'/);
  assert.match(migration, /revoke all on function public\.rpc_guardian_my_children\(\) from public, anon, authenticated/);
  assert.match(dashboard, /child\.avatar_url/);
  assert.match(dashboard, /Show other linked children/);
  assert.match(dashboard, /parent-premium-child-menu/);
  assert.doesNotMatch(dashboard, /<select value=\{selectedId/);
});

test('portrait parent dashboard keeps school branding visible and separates workspace switching from child switching', () => {
  const dashboard = read('components/guardian/ParentDashboardPremium.tsx');
  const tabsCss = read('components/guardian/ParentDashboardPremiumTabs.css');

  assert.match(dashboard, /parent-premium-school-row/);
  assert.match(dashboard, /Linked children/);
  assert.match(dashboard, /Available workspaces/);
  assert.match(dashboard, /Switch Brains Heist workspace/);
  assert.match(tabsCss, /\.parent-premium-school-row\{display:flex!important/);
  assert.match(tabsCss, /\.parent-premium-school-logo\{display:block!important/);
});

test('parent portal blocks wrong-account claims and offers a safe account switch', () => {
  const parent = read('components/guardian/ParentPortal.tsx');
  const service = read('services/guardianService.ts');
  assert.match(parent, /email_matches_current_account === false/);
  assert.match(parent, /This invitation belongs to another account/);
  assert.match(parent, /Switch account/);
  assert.match(parent, /await parentSignOut\(\)/);
  assert.match(parent, /Your invitation remains active while you switch accounts/);
  assert.match(service, /This invitation belongs to a different email account/);
});

test('school transactional email header includes both school and Brains Heist logos', () => {
  const branding = read('supabase/functions/_shared/email.ts');
  const dispatcher = read('supabase/functions/school_email_dispatcher/index.ts');
  assert.match(branding, /PRODUCT_LOGO_URL = "https:\/\/www\.brainsheist\.com\/logo\.png"/);
  assert.match(branding, /alt=\"Brains Heist logo\"/);
  assert.match(branding, /school\.logo_url/);
  assert.match(branding, /School communication/);
  assert.match(branding, />×</);
  assert.match(branding, /Academic progress platform/);
  assert.match(dispatcher, /renderBrandedEmail/);
});

test('guardian send confirmation uses the standalone guardian modal instead of Tailwind Toast utilities', () => {
  const admin = read('components/guardian/GuardianManagementPage.tsx');
  const css = read('components/guardian/GuardianManagementPage.css');

  assert.match(admin, /guardian-modal-backdrop/);
  assert.match(admin, /guardian-modal-details/);
  assert.match(admin, /Send this parent invitation\?/);
  assert.match(admin, /Parent \/ guardian/);
  assert.match(admin, /Relationship/);
  assert.match(admin, /PRODUCT_NAME/);
  assert.doesNotMatch(admin, /import Toast from/);
  assert.doesNotMatch(admin, /className="fixed inset-0/);

  assert.match(css, /\.guardian-modal-backdrop/);
  assert.match(css, /position:fixed/);
  assert.match(css, /inset:0/);
  assert.match(css, /\.guardian-modal-brand img/);
  assert.match(css, /width:46px!important/);
  assert.match(css, /height:46px!important/);
});

test('new academic and parent surfaces consistently spell Brains Heist', () => {
  const files = [
    'parent-portal.html',
    'guardian-management.html',
    'teacher-academic-profiles.html',
    'academic-profile.html',
    'teacher-interventions.html',
    'school-head-learning-intelligence.html',
    'components/guardian/ParentPortal.tsx',
    'components/guardian/ParentDashboardPremium.tsx',
    'components/guardian/ParentLearningTrendChart.tsx',
    'components/guardian/GuardianManagementPage.tsx',
    'components/student-progress/IndividualStudentAcademicReport.tsx',
    'components/student-progress/IndividualStudentAcademicReportV2.tsx',
  ];
  for (const file of files) {
    const source = read(file);
    assert.doesNotMatch(source, new RegExp('\\bBrain ' + 'Heist\\b'), `${file} must not use the singular product name`);
  }
  assert.match(read('parent-portal.html'), /Brains Heist/);
  assert.match(read('components/student-progress/IndividualStudentAcademicReportV2.tsx'), /Generated securely through Brains Heist/);
});

test('academic progress services do not expose raw network and authorization errors', () => {
  const mapper = read('services/userFacingError.ts');
  const guardian = read('services/guardianService.ts');
  const profile = read('services/studentAcademicProfileService.ts');
  const support = read('services/studentInterventionService.ts');
  const directory = read('services/teacherAcademicProfileDirectoryService.ts');
  assert.match(mapper, /load failed/);
  assert.match(mapper, /We could not connect just now/);
  assert.match(mapper, /You do not currently have access/);
  assert.doesNotMatch(profile, /if \(error\) throw error/);
  assert.doesNotMatch(directory, /if \(error\) throw error/);
  assert.match(support, /userFacingError/);
  assert.match(guardian, /friendlyError/);
});