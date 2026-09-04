import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const shell = readFileSync('components/admin/SuperadminShell.tsx', 'utf8');
const usersTab = readFileSync('components/admin/tabs/UsersTab.tsx', 'utf8');
const userIntelligencePanel = readFileSync('components/admin/users/UserIntelligencePanel.tsx', 'utf8');
const userIntelligenceService = readFileSync('services/superadminUserIntelligenceService.ts', 'utf8');
const userIntelligenceMigration = readFileSync('supabase/migrations/20260904070000_superadmin_user_intelligence.sql', 'utf8');
const dashboardTab = readFileSync('components/admin/tabs/DashboardTab.tsx', 'utf8');
const adminPortal = readFileSync('components/AdminPortal.tsx', 'utf8');

test('superadmin navigation is grouped into a professional control-center hierarchy', () => {
  for (const heading of ['Core Management', 'Operations', 'Product & Learning', 'Insights', 'Platform']) {
    assert.match(shell, new RegExp(heading.replace('&', '&')));
  }
  for (const tab of ['Dashboard', 'Users', 'Schools', 'Question Bank', 'Applications', 'Identity Requests', 'Booked Appointments', 'Billing', 'Game', 'Clans', 'Analytics', 'Cambridge', 'IELTS', 'System']) {
    assert.match(shell, new RegExp(`label: '${tab.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`));
  }
  assert.match(shell, /Search admin sections/);
  assert.match(shell, /Last updated/);
  assert.match(shell, /onToggleAdminVisibility/);
  assert.match(shell, /applicationsUnreadTotal/);
});

test('visited superadmin views stay mounted and explicit refresh can refresh only the active view', () => {
  assert.match(adminPortal, /visitedTabs/);
  assert.match(adminPortal, /viewRefreshVersions/);
  assert.match(adminPortal, /const refreshActiveView = useCallback/);
  assert.match(adminPortal, /Array\.from\(visitedTabs\)\.map/);
  assert.match(adminPortal, /hidden=\{tab !== activeTab\}/);
  assert.match(adminPortal, /onRefresh=\{refreshActiveView\}/);
});

test('users tab uses table management, filters, refresh and a contextual details drawer', () => {
  for (const heading of ['User', 'Role', 'School', 'Grade / Class', 'Status', 'XP / Coins', 'Last active', 'Manage']) {
    assert.match(usersTab, new RegExp(heading.replace('/', '\\/')));
  }
  assert.match(usersTab, /All roles/);
  assert.match(usersTab, /All grades/);
  assert.match(usersTab, /All schools/);
  assert.match(usersTab, /All statuses/);
  assert.match(usersTab, /Sort: last active/);
  assert.match(usersTab, /Refresh list/);
  assert.match(usersTab, /User details/);
  assert.match(usersTab, /UserIntelligencePanel/);
  assert.match(usersTab, /Placement & role/);
  assert.match(usersTab, /Quick actions/);
  assert.match(usersTab, /Account controls/);
  assert.match(usersTab, /Delete user permanently/);
  assert.match(usersTab, /_430px/);
});

test('user intelligence panel exposes governed identity, integrity, activity and access views', () => {
  assert.match(userIntelligencePanel, /Account intelligence/);
  assert.match(userIntelligencePanel, /Identity, integrity, usage and access signals/);
  assert.match(userIntelligencePanel, /overview/);
  assert.match(userIntelligencePanel, /activity/);
  assert.match(userIntelligencePanel, /access/);
  assert.match(userIntelligencePanel, /Placement integrity/);
  assert.match(userIntelligencePanel, /Google name/);
  assert.match(userIntelligencePanel, /IELTS breakdown/);
  assert.match(userIntelligencePanel, /Latest authenticated session/);
  assert.match(userIntelligencePanel, /No product activity/);
});

test('user intelligence data stays behind a superadmin-only on-demand RPC', () => {
  assert.match(userIntelligenceService, /rpc_superadmin_user_intelligence/);
  assert.match(userIntelligenceMigration, /security definer/i);
  assert.match(userIntelligenceMigration, /public\.is_superadmin\(v_actor\)/);
  assert.match(userIntelligenceMigration, /platform_administrator_access_required/);
  assert.match(userIntelligenceMigration, /school_claim_without_link/);
  assert.match(userIntelligenceMigration, /auth_name_not_synced/);
  assert.match(userIntelligenceMigration, /auth\.sessions/);
  assert.match(userIntelligenceMigration, /revoke all on function public\.rpc_superadmin_user_intelligence\(uuid\) from public, anon/);
  assert.match(userIntelligenceMigration, /grant execute on function public\.rpc_superadmin_user_intelligence\(uuid\) to authenticated/);
});

test('dashboard removes game-like god-mode presentation and isolates destructive operations', () => {
  assert.match(dashboardTab, /Operations/);
  assert.match(dashboardTab, /Loaded user sample/);
  assert.match(dashboardTab, /Danger zone/);
  assert.doesNotMatch(dashboardTab, /God Mode/);
  assert.doesNotMatch(dashboardTab, /Godly Cards/);
});


test('superadmin user filters are server-backed and the wide table owns horizontal scroll', () => {
  assert.match(adminPortal, /rpc_superadmin_list_users/);
  assert.match(adminPortal, /userRoleFilter/);
  assert.match(adminPortal, /userSchoolFilter/);
  assert.match(usersTab, /overscroll-x-contain/);
  assert.match(usersTab, /min-w-\[1180px\]/);
  assert.match(usersTab, /full platform dataset/);
});

test('Cambridge reports keep the hardened RPC boundary without direct table fallback', () => {
  assert.match(adminPortal, /get_school_cambridge_scores/);
  assert.doesNotMatch(adminPortal, /from\('quiz_scores'\)\s*\.select\('\*'\)/);
});
