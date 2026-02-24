/**
 * Restructure AdminPortal.tsx into a thin shell + extracted tab/modal components.
 * 
 * This script:
 * 1. Reads the original AdminPortal.tsx
 * 2. Extracts each tab's JSX into components/admin/tabs/XTab.tsx
 * 3. Extracts each modal's JSX into components/admin/modals/XModal.tsx
 * 4. Rewrites AdminPortal.tsx as a shell that holds state/logic and renders components
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const adminPath = path.join(root, 'components', 'AdminPortal.tsx');
const original = fs.readFileSync(adminPath, 'utf-8');
const lines = original.split('\n');

// ─── HELPERS ────────────────────────────────────────────
function findLine(search, startFrom = 0) {
  for (let i = startFrom; i < lines.length; i++) {
    if (lines[i].includes(search)) return i; // 0-indexed
  }
  return -1;
}

// Count parens from a start line to find matching close
function findMatchingParen(startLine) {
  let depth = 0;
  let started = false;
  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i];
    // Simple paren counter — works for JSX with balanced parens
    for (let j = 0; j < line.length; j++) {
      if (line[j] === '(') { depth++; started = true; }
      if (line[j] === ')') {
        depth--;
        if (started && depth === 0) return i;
      }
    }
  }
  return -1;
}

// ─── DISCOVER LINE MARKERS (0-indexed) ─────────────────
const tabNames = ['dashboard','users','schools','applications','game','clans','analytics','cambridge','ielts','system'];
const tabStarts = {};
tabNames.forEach(tab => {
  tabStarts[tab] = findLine(`activeTab === '${tab}' && (`);
});

const tabEnds = {};
tabNames.forEach(tab => {
  tabEnds[tab] = findMatchingParen(tabStarts[tab]);
});

const styleStart = findLine('{/* Custom Styles */}');
const styleEnd = findLine('`}</style>');
const reportModalComment = findLine('{/* Performance Report Modal */}');
const answerReflComment = findLine('{/* Answer Reflection Modal */}');
const announcementModalStart = findLine('showAnnouncementComposer && (', reportModalComment);
const returnLine = (() => {
  for (let i = 1500; i < 1600; i++) {
    if (lines[i] && lines[i].trim() === 'return (') return i;
  }
  return -1;
})();

const maxW7xlLine = findLine('max-w-7xl mx-auto');
const tabContentCommentLine = findLine('{/* Tab Content */}');

console.log('=== Line markers (0-indexed) ===');
console.log('return:', returnLine);
console.log('tabContentComment:', tabContentCommentLine);
console.log('maxW7xl:', maxW7xlLine);
tabNames.forEach(t => console.log(`  ${t}: ${tabStarts[t]}-${tabEnds[t]} (${tabEnds[t]-tabStarts[t]+1} lines)`));
console.log('styleBlock:', styleStart, '-', styleEnd);
console.log('reportModal:', reportModalComment);
console.log('answerRefl:', answerReflComment);
console.log('announceModal:', announcementModalStart);

// ─── 1. BUILD NEW AdminPortal.tsx ───────────────────────

const newImports = [
  "import AdminContext from './admin/AdminContext';",
  "import DashboardTab from './admin/tabs/DashboardTab';",
  "import UsersTab from './admin/tabs/UsersTab';",
  "import SchoolsTab from './admin/tabs/SchoolsTab';",
  "import ApplicationsTab from './admin/tabs/ApplicationsTab';",
  "import GameTab from './admin/tabs/GameTab';",
  "import ClansTab from './admin/tabs/ClansTab';",
  "import AnalyticsTab from './admin/tabs/AnalyticsTab';",
  "import CambridgeTab from './admin/tabs/CambridgeTab';",
  "import IeltsTab from './admin/tabs/IeltsTab';",
  "import SystemTab from './admin/tabs/SystemTab';",
  "import ReportModal from './admin/modals/ReportModal';",
  "import AnswerReflectionModal from './admin/modals/AnswerReflectionModal';",
  "import AnnouncementModal from './admin/modals/AnnouncementModal';",
];

// Context value definition — expose ALL state + functions to children
const contextValueLines = [
  '',
  '  // ─── Context value for child components ──────────────',
  '  const contextValue = {',
  '    // Props & externals',
  '    profile, addToast, supabase,',
  '    // State',
  '    stats, statsLoading, statsError, users, usersLoading, usersError,',
  '    searchQuery, setSearchQuery, userPage, setUserPage, hasNextPage, PAGE_SIZE,',
  '    adminVisible, setAdminVisible,',
  '    showAnnouncementComposer, setShowAnnouncementComposer,',
  '    announcementText, setAnnouncementText, announcementExpiry, setAnnouncementExpiry,',
  '    customAnnouncementExpiry, setCustomAnnouncementExpiry, isSendingAnnouncement,',
  '    isResettingAll, setIsResettingAll,',
  '    quizScores, quizScoresLoading, quizFilter, setQuizFilter, classFilter, setClassFilter,',
  '    showReportModal, setShowReportModal, reportStudent,',
  '    showAnswerReflection, setShowAnswerReflection,',
  '    featureToggles, setFeatureToggles,',
  '    activeTab, setActiveTab,',
  '    clanList, setClanList, selectedClan, setSelectedClan,',
  '    clanMembers, setClanMembers, clanMembersLoading,',
  '    clanEditName, setClanEditName, clanEditDescription, setClanEditDescription,',
  '    analyticsData, analyticsLoading,',
  '    schoolAdminSchoolId, setSchoolAdminSchoolId, schoolOptions,',
  '    schoolMembers, setSchoolMembers, schoolMembersLoading, schoolMembersError, setSchoolMembersError,',
  '    schoolMemberSearch, setSchoolMemberSearch,',
  '    schoolQuotas, setSchoolQuotas, schoolQuotasLoading,',
  '    quotaEditFeature, setQuotaEditFeature, quotaEditValue, setQuotaEditValue,',
  '    quotaActionLoading, pilotTrialEnd, setPilotTrialEnd, extendDays, setExtendDays,',
  '    schoolAdminActionLoading,',
  '    schoolRequestSearch, setSchoolRequestSearch, schoolRequestStatus, setSchoolRequestStatus,',
  '    schoolRequestsLoading, schoolRequestsError, schoolRequestActionLoading,',
  '    schoolRequestNotes, setSchoolRequestNotes,',
  '    schoolRequestDuplicates, setSchoolRequestDuplicates,',
  '    schoolRequestMessagesOpen, setSchoolRequestMessagesOpen,',
  '    schoolRequestMessages, schoolRequestMessagesLoading,',
  '    schoolRequestMessagesError, schoolRequestMessagesUnavailable,',
  '    existingAnnouncements, announcementsLoading,',
  '    showCustomGrant, setShowCustomGrant,',
  '    customCoinAmount, setCustomCoinAmount, customXpAmount, setCustomXpAmount,',
  '    customLevelAmount, setCustomLevelAmount, roleChangeLoading,',
  '    // Derived state',
  '    uniqueQuizNames, uniqueClasses, filteredQuizScores, quizStats,',
  '    filteredSchoolRequests, filteredSchoolMembers, currentSchoolAdmin,',
  '    playerUsers, isSuperadmin, requestStatusStyles,',
  '    // Functions',
  '    refreshAdminData, resetAllProgress, fetchQuizScores, exportCSV,',
  '    openReport, openAnswerReflection, sendAnnouncement,',
  '    fetchAnnouncements, deleteAnnouncement, grantCoins, grantXP,',
  '    setUserLevel, resetUserAP, resetUserProgress, resetUserAcademics,',
  '    setUserBanState, deleteUser, grantCustomCoins, grantCustomXP,',
  '    setCustomLevel, changeUserRole, handleGradeChange, handleBatchChange,',
  '    toggleAdminVisibility, loadSchoolMembers, loadSchoolQuotas,',
  '    handleResetQuotas, handleSetQuota, handleExtendTrial, handleSetSchoolAdmin,',
  '    handleSchoolRequestAction, loadSchoolRequests, loadSchoolRequestMessages,',
  '    loadClanMembers, removeClanMember, transferClanLeadership, fetchAnalytics,',
  '    deleteQuizScore, reportRpcError, fetchUsers,',
  '    // Utilities',
  '    resolveUserLabel, resolveUserEmail, formatTime,',
  '    correctAnswers, getScienceAnswerKey, analyzeSkillPerformance,',
  '    getGrade, getEncouragement, actionPlans, testSections,',
  '    // Constants',
  '    SCHOOL_PLANS, gradeOptions, batchByGrade,',
  '  };',
  '',
];

// Tab component calls
const tabCallLines = [
  '          {activeTab === \'dashboard\' && <DashboardTab />}',
  '          {activeTab === \'users\' && <UsersTab />}',
  '          {activeTab === \'schools\' && <SchoolsTab />}',
  '          {activeTab === \'applications\' && <ApplicationsTab />}',
  '          {activeTab === \'game\' && <GameTab />}',
  '          {activeTab === \'clans\' && <ClansTab />}',
  '          {activeTab === \'analytics\' && <AnalyticsTab />}',
  '          {activeTab === \'cambridge\' && <CambridgeTab />}',
  '          {activeTab === \'ielts\' && <IeltsTab />}',
  '          {activeTab === \'system\' && <SystemTab />}',
];

// Modal component calls  
const modalCallLines = [
  '',
  '      {/* Modals */}',
  '      <ReportModal />',
  '      <AnswerReflectionModal />',
  '      <AnnouncementModal />',
  '',
];

// Build the shell
const shell = [];

// Lines 1-14: Original imports (0-indexed: 0-13)
for (let i = 0; i <= 13; i++) shell.push(lines[i]);
shell.push('');
newImports.forEach(imp => shell.push(imp));

// Lines 15 through end of functions (before return)
// returnLine is the 0-indexed line of `return (`
for (let i = 14; i < returnLine; i++) shell.push(lines[i]);

// Insert context value
contextValueLines.forEach(l => shell.push(l));

// return (
shell.push(lines[returnLine]); // `  return (`

// Insert provider wrapper
shell.push('    <AdminContext.Provider value={contextValue}>');

// Lines after return( up to and including the maxW7xl line
// returnLine+1 is the <div className="admin-portal..."> line
// We keep everything from returnLine+1 through maxW7xlLine (tab content div)
for (let i = returnLine + 1; i <= maxW7xlLine; i++) shell.push(lines[i]);

// Tab component calls (replacing everything from first tab to end of last tab)
tabCallLines.forEach(l => shell.push(l));

// Closing divs after the tabs:
// After the last tab (tabEnds.system), the next lines close the max-w-7xl and admin-portal-content divs
const afterLastTab = tabEnds.system + 1;
// These should be </div> lines
shell.push(lines[afterLastTab]);     // </div> closes max-w-7xl
shell.push(lines[afterLastTab + 1]); // </div> closes admin-portal-content

// Blank line
shell.push('');

// Style block (unchanged)
for (let i = styleStart; i <= styleEnd; i++) shell.push(lines[i]);

// Modal component calls (replacing all 3 modals)
modalCallLines.forEach(l => shell.push(l));

// Close the admin-portal div, provider, return, and component
// Find the original closing </div> for admin-portal (line 3849 = 0-indexed 3848)
const closingDivLine = findLine('    </div>', styleEnd + 1);
shell.push(lines[closingDivLine]); // </div> for admin-portal
shell.push('    </AdminContext.Provider>');
shell.push('  );');
shell.push('};');
shell.push('');
shell.push('export default AdminPortal;');
shell.push('');

// Write shell
fs.writeFileSync(adminPath, shell.join('\n'));
console.log(`\n✅ AdminPortal.tsx rewritten: ${shell.length} lines (was ${lines.length})`);


// ─── 2. EXTRACT TAB COMPONENTS ─────────────────────────

// For each tab, extract the inner JSX (between the `&& (` and matching `)}`),
// scan for which context properties are referenced, and write the component file.

// All known context property names (for auto-detection)
const allProps = [
  'profile','addToast','supabase',
  'stats','statsLoading','statsError','users','usersLoading','usersError',
  'searchQuery','setSearchQuery','userPage','setUserPage','hasNextPage','PAGE_SIZE',
  'adminVisible','setAdminVisible',
  'showAnnouncementComposer','setShowAnnouncementComposer',
  'announcementText','setAnnouncementText','announcementExpiry','setAnnouncementExpiry',
  'customAnnouncementExpiry','setCustomAnnouncementExpiry','isSendingAnnouncement',
  'isResettingAll','setIsResettingAll',
  'quizScores','quizScoresLoading','quizFilter','setQuizFilter','classFilter','setClassFilter',
  'showReportModal','setShowReportModal','reportStudent',
  'showAnswerReflection','setShowAnswerReflection',
  'featureToggles','setFeatureToggles',
  'activeTab','setActiveTab',
  'clanList','setClanList','selectedClan','setSelectedClan',
  'clanMembers','setClanMembers','clanMembersLoading',
  'clanEditName','setClanEditName','clanEditDescription','setClanEditDescription',
  'analyticsData','analyticsLoading',
  'schoolAdminSchoolId','setSchoolAdminSchoolId','schoolOptions',
  'schoolMembers','setSchoolMembers','schoolMembersLoading','schoolMembersError','setSchoolMembersError',
  'schoolMemberSearch','setSchoolMemberSearch',
  'schoolQuotas','setSchoolQuotas','schoolQuotasLoading',
  'quotaEditFeature','setQuotaEditFeature','quotaEditValue','setQuotaEditValue',
  'quotaActionLoading','pilotTrialEnd','setPilotTrialEnd','extendDays','setExtendDays',
  'schoolAdminActionLoading',
  'schoolRequestSearch','setSchoolRequestSearch','schoolRequestStatus','setSchoolRequestStatus',
  'schoolRequestsLoading','schoolRequestsError','schoolRequestActionLoading',
  'schoolRequestNotes','setSchoolRequestNotes',
  'schoolRequestDuplicates','setSchoolRequestDuplicates',
  'schoolRequestMessagesOpen','setSchoolRequestMessagesOpen',
  'schoolRequestMessages','schoolRequestMessagesLoading',
  'schoolRequestMessagesError','schoolRequestMessagesUnavailable',
  'existingAnnouncements','announcementsLoading',
  'showCustomGrant','setShowCustomGrant',
  'customCoinAmount','setCustomCoinAmount','customXpAmount','setCustomXpAmount',
  'customLevelAmount','setCustomLevelAmount','roleChangeLoading',
  'uniqueQuizNames','uniqueClasses','filteredQuizScores','quizStats',
  'filteredSchoolRequests','filteredSchoolMembers','currentSchoolAdmin',
  'playerUsers','isSuperadmin','requestStatusStyles',
  'refreshAdminData','resetAllProgress','fetchQuizScores','exportCSV',
  'openReport','openAnswerReflection','sendAnnouncement',
  'fetchAnnouncements','deleteAnnouncement','grantCoins','grantXP',
  'setUserLevel','resetUserAP','resetUserProgress','resetUserAcademics',
  'setUserBanState','deleteUser','grantCustomCoins','grantCustomXP',
  'setCustomLevel','changeUserRole','handleGradeChange','handleBatchChange',
  'toggleAdminVisibility','loadSchoolMembers','loadSchoolQuotas',
  'handleResetQuotas','handleSetQuota','handleExtendTrial','handleSetSchoolAdmin',
  'handleSchoolRequestAction','loadSchoolRequests','loadSchoolRequestMessages',
  'loadClanMembers','removeClanMember','transferClanLeadership','fetchAnalytics',
  'deleteQuizScore','reportRpcError','fetchUsers',
  'resolveUserLabel','resolveUserEmail','formatTime',
  'correctAnswers','getScienceAnswerKey','analyzeSkillPerformance',
  'getGrade','getEncouragement','actionPlans','testSections',
  'SCHOOL_PLANS','gradeOptions','batchByGrade',
];

function detectUsedProps(jsxText) {
  const used = new Set();
  allProps.forEach(prop => {
    // Match whole word (not part of a longer identifier)
    const regex = new RegExp('\\b' + prop + '\\b');
    if (regex.test(jsxText)) used.add(prop);
  });
  return [...used].sort();
}

// External imports needed per tab
function detectExternalImports(jsxText) {
  const imports = [];
  if (/\bCompetitionService\b/.test(jsxText)) {
    imports.push("import * as CompetitionService from '../../../services/competitionService';");
  }
  if (/\bClickableUsername\b/.test(jsxText)) {
    imports.push("import ClickableUsername from '../../ClickableUsername';");
  }
  if (/\bIeltsAdminDashboard\b/.test(jsxText)) {
    imports.push("import IeltsAdminDashboard from '../../IeltsAdminDashboard';");
  }
  if (/\bSchoolMember\b/.test(jsxText)) {
    imports.push("import { SchoolMember } from '../../../services/schoolAdminService';");
  }
  return imports;
}

const tabsDir = path.join(root, 'components', 'admin', 'tabs');

tabNames.forEach(tab => {
  const start = tabStarts[tab];
  const end = tabEnds[tab];
  
  // Extract INNER JSX: everything between the opening `(` line and closing `)}`
  // The first line is `{activeTab === 'xxx' && (` — content starts from next line
  // The last line is `          )}` — content ends at previous line
  const innerLines = lines.slice(start + 1, end);
  // Remove the closing `)}` if it's the last line content
  // Actually, the inner content is between start+1 and end-1 because end is the line with `)}` 
  // But we need to check: the end line contains `)}` — is there content before it?
  // Looking at structure: the end line is `          )}` which is just the close.
  // So inner JSX is from start+1 to end-1 (exclusive of end)
  
  const jsxContent = lines.slice(start + 1, end).join('\n');
  
  // Detect used context props
  const usedProps = detectUsedProps(jsxContent);
  const externalImports = detectExternalImports(jsxContent);
  
  // Build the component file
  const componentName = tab.charAt(0).toUpperCase() + tab.slice(1) + 'Tab';
  const componentLines = [
    "import React from 'react';",
    "import { useAdmin } from '../AdminContext';",
  ];
  externalImports.forEach(imp => componentLines.push(imp));
  componentLines.push('');
  componentLines.push(`const ${componentName}: React.FC = () => {`);
  
  // Destructure used props (wrap at ~100 chars)
  if (usedProps.length > 0) {
    componentLines.push('  const {');
    let currentLine = '    ';
    usedProps.forEach((prop, i) => {
      const addition = prop + (i < usedProps.length - 1 ? ', ' : ',');
      if (currentLine.length + addition.length > 100) {
        componentLines.push(currentLine);
        currentLine = '    ' + addition;
      } else {
        currentLine += addition;
      }
    });
    componentLines.push(currentLine);
    componentLines.push('  } = useAdmin();');
  }
  
  componentLines.push('');
  componentLines.push('  return (');
  
  // The inner JSX — dedent by the common prefix
  const innerJsxLines = lines.slice(start + 1, end);
  // Find minimum indentation
  const nonEmptyLines = innerJsxLines.filter(l => l.trim().length > 0);
  const minIndent = nonEmptyLines.reduce((min, l) => {
    const indent = l.match(/^(\s*)/)[1].length;
    return Math.min(min, indent);
  }, Infinity);
  // Re-indent: remove common prefix, add 4 spaces (2 for function + 2 for return)
  innerJsxLines.forEach(l => {
    if (l.trim().length === 0) {
      componentLines.push('');
    } else {
      componentLines.push('    ' + l.substring(minIndent));
    }
  });
  
  componentLines.push('  );');
  componentLines.push('};');
  componentLines.push('');
  componentLines.push(`export default ${componentName};`);
  componentLines.push('');
  
  const tabFilePath = path.join(tabsDir, `${componentName}.tsx`);
  fs.writeFileSync(tabFilePath, componentLines.join('\n'));
  console.log(`✅ ${componentName}.tsx: ${componentLines.length} lines, ${usedProps.length} context props`);
});


// ─── 3. EXTRACT MODAL COMPONENTS ───────────────────────

const modalsDir = path.join(root, 'components', 'admin', 'modals');

// Report Modal: from reportModalComment to answerReflComment-1
const reportModalJSX = lines.slice(reportModalComment, answerReflComment).join('\n');
// Answer Reflection Modal: from answerReflComment to announcementModalStart-1  
const answerReflJSX = lines.slice(answerReflComment, announcementModalStart).join('\n');
// Announcement Modal: from announcementModalStart to closingDivLine-1
const announceEnd = findLine('    </div>', announcementModalStart);
const announceModalJSX = lines.slice(announcementModalStart, announceEnd).join('\n');

const modals = [
  { name: 'ReportModal', jsx: reportModalJSX, startLine: reportModalComment, endLine: answerReflComment - 1 },
  { name: 'AnswerReflectionModal', jsx: answerReflJSX, startLine: answerReflComment, endLine: announcementModalStart - 1 },
  { name: 'AnnouncementModal', jsx: announceModalJSX, startLine: announcementModalStart, endLine: announceEnd - 1 },
];

modals.forEach(({ name, startLine, endLine }) => {
  const jsxLines = lines.slice(startLine, endLine + 1);
  const jsxContent = jsxLines.join('\n');
  const usedProps = detectUsedProps(jsxContent);
  const externalImports = detectExternalImports(jsxContent);
  
  const componentLines = [
    "import React from 'react';",
    "import { useAdmin } from '../AdminContext';",
  ];
  externalImports.forEach(imp => componentLines.push(imp));
  componentLines.push('');
  componentLines.push(`const ${name}: React.FC = () => {`);
  
  if (usedProps.length > 0) {
    componentLines.push('  const {');
    let currentLine = '    ';
    usedProps.forEach((prop, i) => {
      const addition = prop + (i < usedProps.length - 1 ? ', ' : ',');
      if (currentLine.length + addition.length > 100) {
        componentLines.push(currentLine);
        currentLine = '    ' + addition;
      } else {
        currentLine += addition;
      }
    });
    componentLines.push(currentLine);
    componentLines.push('  } = useAdmin();');
  }
  
  componentLines.push('');
  componentLines.push('  return (');
  componentLines.push('    <>');
  
  // Re-indent JSX
  const nonEmptyLines = jsxLines.filter(l => l.trim().length > 0);
  const minIndent = nonEmptyLines.reduce((min, l) => {
    const indent = l.match(/^(\s*)/)[1].length;
    return Math.min(min, indent);
  }, Infinity);
  jsxLines.forEach(l => {
    if (l.trim().length === 0) {
      componentLines.push('');
    } else {
      componentLines.push('      ' + l.substring(minIndent));
    }
  });
  
  componentLines.push('    </>');
  componentLines.push('  );');
  componentLines.push('};');
  componentLines.push('');
  componentLines.push(`export default ${name};`);
  componentLines.push('');
  
  const modalFilePath = path.join(modalsDir, `${name}.tsx`);
  fs.writeFileSync(modalFilePath, componentLines.join('\n'));
  console.log(`✅ ${name}.tsx: ${componentLines.length} lines, ${usedProps.length} context props`);
});

console.log('\n🎉 AdminPortal restructure complete!');
console.log(`   Shell: ~${shell.length} lines`);
console.log(`   Tab components: ${tabNames.length} files`);
console.log(`   Modal components: ${modals.length} files`);
