const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const lines = fs.readFileSync(path.join(root, 'components', 'SchoolAdminPortal.tsx'), 'utf-8').split('\n');

function findMatchingParen(startLine) {
  let depth = 0;
  let started = false;
  for (let i = startLine; i < lines.length; i++) {
    if (!lines[i]) continue;
    for (let j = 0; j < lines[i].length; j++) {
      if (lines[i][j] === '(') { depth++; started = true; }
      if (lines[i][j] === ')') {
        depth--;
        if (started && depth === 0) return i;
      }
    }
  }
  return -1;
}

function findLine(search, startFrom) {
  for (let i = (startFrom || 0); i < lines.length; i++) {
    if (lines[i] && lines[i].includes(search)) return i;
  }
  return -1;
}

console.log('Total lines:', lines.length);

// All tabs
const allTabs = ['dashboard','members','classes','roster','subjects','teachers','students','invites','billing','settings','cambridge'];
const tabSections = {};
allTabs.forEach(tab => {
  const start = findLine("activeTab === '" + tab + "' && ");
  if (start === -1) { console.log(tab + ': NOT FOUND'); return; }
  const end = findMatchingParen(start);
  tabSections[tab] = { start, end };
  console.log(tab + ': ' + start + '-' + end + ' (' + (end - start + 1) + ' lines)');
});

// Main return
const mainReturn = findLine('school-admin-portal min-h-screen');
console.log('\nMain return JSX start:', mainReturn);

// Tab nav area
const tabNavLine = findLine("'dashboard', 'members'");
console.log('Tab nav line:', tabNavLine);

// Max-w wrapper for tab content
const maxWLine = findLine('max-w-7xl mx-auto', mainReturn);
console.log('max-w-7xl wrapper:', maxWLine);

// Portals
const portal1 = findLine('showMemberActionModal && selectedMember && ReactDOM');
const portal1End = findMatchingParen(portal1);
console.log('\nMemberAction portal:', portal1, '-', portal1End);

const portal2 = findLine('confirmDialog && ReactDOM');
const portal2End = findMatchingParen(portal2);
console.log('ConfirmDialog portal:', portal2, '-', portal2End);

// Style block
const styleStart = findLine('<style>');
const styleEnd = findLine('</style>');
console.log('\nStyle:', styleStart, '-', styleEnd);

// Before/after tab content
console.log('\n--- Lines around maxW ---');
for (let i = Math.max(0, maxWLine - 2); i <= maxWLine + 2; i++) {
  console.log('L' + (i + 1) + ': ' + (lines[i] || '').substring(0, 70));
}

// After last tab section
const lastTabEnd = Object.values(tabSections).reduce((max, s) => Math.max(max, s.end), 0);
console.log('\n--- After last tab (line ' + (lastTabEnd + 1) + ') ---');
for (let i = lastTabEnd; i <= lastTabEnd + 5; i++) {
  console.log('L' + (i + 1) + ': ' + (lines[i] || '').substring(0, 70));
}

// Closing structure
console.log('\n--- End of main return ---');
for (let i = 3155; i <= 3165; i++) {
  console.log('L' + (i + 1) + ': ' + (lines[i] || '').substring(0, 70));
}

// BillingTab internal component
const billingTabDef = findLine('const BillingTab');
console.log('\nBillingTab component def:', billingTabDef);
const billingTabEnd = findLine('export default SchoolAdminPortal');
console.log('Export:', billingTabEnd);
