const fs = require('fs');
const path = require('path');
const lines = fs.readFileSync(path.join(__dirname, '..', 'components', 'AdminPortal.tsx.bak'), 'utf-8').split('\n');

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
  'featureToggles','setFeatureToggles','activeTab','setActiveTab',
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
    const regex = new RegExp('\\b' + prop + '\\b');
    if (regex.test(jsxText)) used.add(prop);
  });
  return [...used].sort();
}

function buildModal(name, startIdx, endIdx) {
  const jsxLines = lines.slice(startIdx, endIdx + 1);
  const jsxContent = jsxLines.join('\n');
  const usedProps = detectUsedProps(jsxContent);

  const result = [];
  result.push("import React from 'react';");
  result.push("import { useAdmin } from '../AdminContext';");
  result.push('');
  result.push(`const ${name}: React.FC = () => {`);

  if (usedProps.length > 0) {
    result.push('  const {');
    let currentLine = '    ';
    usedProps.forEach((prop, i) => {
      const addition = prop + (i < usedProps.length - 1 ? ', ' : ',');
      if (currentLine.length + addition.length > 100) {
        result.push(currentLine);
        currentLine = '    ' + addition;
      } else {
        currentLine += addition;
      }
    });
    result.push(currentLine);
    result.push('  } = useAdmin();');
  }

  result.push('');
  result.push('  return (');
  result.push('    <>');

  const nonEmpty = jsxLines.filter(l => l.trim().length > 0);
  const minIndent = nonEmpty.reduce((min, l) => Math.min(min, l.match(/^(\s*)/)[1].length), Infinity);
  jsxLines.forEach(l => {
    if (l.trim().length === 0) result.push('');
    else result.push('      ' + l.substring(minIndent));
  });

  result.push('    </>');
  result.push('  );');
  result.push('};');
  result.push('');
  result.push(`export default ${name};`);
  result.push('');

  return result;
}

// Correct boundaries (0-indexed), from backup file analysis
const modals = [
  { name: 'ReportModal', start: 3471, end: 3590 },
  { name: 'AnswerReflectionModal', start: 3591, end: 3779 },
  { name: 'AnnouncementModal', start: 3780, end: 3847 },
];

modals.forEach(m => {
  const content = buildModal(m.name, m.start, m.end);
  const filePath = path.join(__dirname, '..', 'components', 'admin', 'modals', `${m.name}.tsx`);
  fs.writeFileSync(filePath, content.join('\n'));
  console.log(`✅ ${m.name}.tsx: ${content.length} lines written`);
});
