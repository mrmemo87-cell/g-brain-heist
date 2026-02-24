/**
 * restructure-school-admin.cjs
 *
 * Programmatically splits SchoolAdminPortal.tsx (3453 lines) into:
 *   - SchoolAdminContext.tsx  (context + useSchoolAdmin hook)
 *   - 11 tab components       (school-admin/tabs/*.tsx)
 *   - 2 modal components      (school-admin/modals/*.tsx)
 *   - BillingTabUI.tsx         (standalone billing component with own props)
 *   - SchoolAdminPortal.tsx    (thin shell with all state + context provider)
 *
 * Preserves EXACT JSX — zero functional changes.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC  = path.join(ROOT, 'components', 'SchoolAdminPortal.tsx');
const BAK  = SRC + '.bak';

// 1. Backup
if (!fs.existsSync(BAK)) {
  fs.copyFileSync(SRC, BAK);
  console.log('✅ Backup created:', BAK);
} else {
  console.log('ℹ️  Backup already exists');
}

const src   = fs.readFileSync(SRC, 'utf-8');
const lines = src.split('\n');
console.log(`Source: ${lines.length} lines`);

// ========================================================================
// Helpers
// ========================================================================

/** Find first 0-indexed line containing `needle` starting from `from`. */
function findLine(needle, from = 0) {
  for (let i = from; i < lines.length; i++) {
    if (lines[i] && lines[i].includes(needle)) return i;
  }
  return -1;
}

/** Count matching paren from opening `(` on startLine. Returns 0-indexed end line. */
function findMatchingParen(startLine) {
  let depth = 0;
  let started = false;
  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
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

// ========================================================================
// Locate boundaries
// ========================================================================

// Tab boundaries (0-indexed)
const TAB_NAMES = ['dashboard','members','classes','roster','subjects','teachers','students','invites','billing','settings','cambridge'];
const tabs = {};
TAB_NAMES.forEach(name => {
  const start = findLine(`activeTab === '${name}' && `);
  if (start === -1) { console.error(`❌ Tab not found: ${name}`); process.exit(1); }
  const end = findMatchingParen(start);
  if (end === -1) { console.error(`❌ No matching paren for tab: ${name}`); process.exit(1); }
  tabs[name] = { start, end };
  console.log(`  Tab ${name}: ${start}-${end} (${end - start + 1} lines)`);
});

// Portal/modal boundaries
const memberActionStart = findLine('showMemberActionModal && selectedMember && ReactDOM');
const memberActionEnd = findMatchingParen(memberActionStart);
console.log(`  MemberAction portal: ${memberActionStart}-${memberActionEnd}`);

const confirmDialogStart = findLine('confirmDialog && ReactDOM');
const confirmDialogEnd = findMatchingParen(confirmDialogStart);
console.log(`  ConfirmDialog portal: ${confirmDialogStart}-${confirmDialogEnd}`);

// Internal BillingTab component (has its own interface + definition, sits after main component)
const billingInterfaceLine = findLine('interface BillingTabProps');
const billingExportLine = findLine('export default SchoolAdminPortal');
console.log(`  BillingTab internal: ${billingInterfaceLine}-${billingExportLine - 1}`);

// Main return location
const mainReturnLine = findLine('school-admin-portal min-h-screen');
console.log(`  Main return JSX: ${mainReturnLine}`);

// ========================================================================
// Extract JSX
// ========================================================================

/** Extract just the inner JSX of a tab (between the opening paren and closing paren). */
function extractTabJSX(name) {
  const { start, end } = tabs[name];
  // Inner JSX is from start+1 to end-1 (exclusive of the {activeTab && ( and )} wrappers)
  const jsxLines = lines.slice(start + 1, end);
  return jsxLines.join('\n');
}

/** Extract portal JSX (the whole {condition && ReactDOM.createPortal( ... )} block). */
function extractPortalJSX(startIdx, endIdx) {
  return lines.slice(startIdx, endIdx + 1).join('\n');
}

/** Detect which context properties a JSX snippet uses. */
function detectContextUsage(jsx) {
  // Collect all known state/setter/function/computed names from the component
  const allProps = new Set();

  // useState declarations
  for (let i = 38; i < mainReturnLine; i++) {
    const line = lines[i];
    if (!line) continue;
    // Match: const [xxx, setXxx] = useState
    const stateMatch = line.match(/const\s+\[(\w+),\s+(set\w+)\]\s*=\s*useState/);
    if (stateMatch) { allProps.add(stateMatch[1]); allProps.add(stateMatch[2]); }

    // Match: const xxx = useCallback / async / regular function
    const funcMatch = line.match(/const\s+(\w+)\s*=\s*(useCallback|async|\()/);
    if (funcMatch && funcMatch[1] !== 'SchoolAdminPortal') allProps.add(funcMatch[1]);

    // Match: const xxx = someArray / computed values
    const computedMatch = line.match(/^\s+const\s+(\w+)\s*=/);
    if (computedMatch
        && !computedMatch[1].startsWith('SchoolAdminPortal')
        && computedMatch[1] !== 'result'
        && computedMatch[1] !== 'details'
        && computedMatch[1] !== 'schoolData'
        && computedMatch[1] !== 'trimmedCode'
        && computedMatch[1] !== 'trimmedName'
        && computedMatch[1] !== 'gradeValue'
        && computedMatch[1] !== 'enrolledStudentId'
        && computedMatch[1] !== 'enrolledClassId'
        && computedMatch[1] !== 'selectedMembers'
        && computedMatch[1] !== 'namesPreview'
        && computedMatch[1] !== 'moreCount'
        && computedMatch[1] !== 'classIds'
        && computedMatch[1] !== 'studentRows'
        && computedMatch[1] !== 'assignmentMap'
        && computedMatch[1] !== 'role'
        && computedMatch[1] !== 'next'
    ) {
      allProps.add(computedMatch[1]);
    }
  }

  // Also add props: onComplete, onLogout, onNavigate, addToast
  allProps.add('onComplete');
  allProps.add('onLogout');
  allProps.add('onNavigate');
  allProps.add('addToast');
  // school is frequently used
  allProps.add('school');

  // Now check which ones appear in the jsx
  const used = [];
  for (const prop of allProps) {
    // Use word boundary to avoid false positives (e.g. 'loading' matching 'billingLoading')
    const regex = new RegExp(`\\b${prop}\\b`);
    if (regex.test(jsx)) {
      used.push(prop);
    }
  }
  return used.sort();
}

// ========================================================================
// Create directory structure
// ========================================================================

const TABS_DIR = path.join(ROOT, 'components', 'school-admin', 'tabs');
const MODALS_DIR = path.join(ROOT, 'components', 'school-admin', 'modals');

fs.mkdirSync(TABS_DIR, { recursive: true });
fs.mkdirSync(MODALS_DIR, { recursive: true });

// ========================================================================
// 1. SchoolAdminContext.tsx
// ========================================================================

const contextFile = [
  '/**',
  ' * SchoolAdminContext \u2014 Shared state context for all SchoolAdminPortal tab/modal components.',
  ' *',
  ' * The provider lives in SchoolAdminPortal.tsx (the orchestrator).',
  ' * Each tab component calls `useSchoolAdmin()` to read/write shared state.',
  ' */',
  "import { createContext, useContext } from 'react';",
  '',
  '// eslint-disable-next-line @typescript-eslint/no-explicit-any',
  'const SchoolAdminContext = createContext<any>(null);',
  '',
  'export function useSchoolAdmin() {',
  '  const ctx = useContext(SchoolAdminContext);',
  "  if (!ctx) throw new Error('useSchoolAdmin() must be used inside <SchoolAdminPortal />');",
  '  return ctx;',
  '}',
  '',
  'export default SchoolAdminContext;',
  '',
].join('\n');

fs.writeFileSync(
  path.join(ROOT, 'components', 'school-admin', 'SchoolAdminContext.tsx'),
  contextFile,
);
console.log('✅ SchoolAdminContext.tsx');

// ========================================================================
// 2. Tab components
// ========================================================================

function pascalCase(name) {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** De-indent JSX so the outermost element has 4 spaces of indentation (return body). */
function normalizeIndent(jsx) {
  const jsxLines = jsx.split('\n');
  // Find minimum non-empty indentation
  let minIndent = Infinity;
  for (const l of jsxLines) {
    if (l.trim().length === 0) continue;
    const indent = l.match(/^(\s*)/)[1].length;
    if (indent < minIndent) minIndent = indent;
  }
  // We want the outermost to have 4 spaces
  const shift = 4 - minIndent;
  return jsxLines.map(l => {
    if (l.trim().length === 0) return '';
    if (shift > 0) return ' '.repeat(shift) + l;
    if (shift < 0) return l.substring(-shift);
    return l;
  }).join('\n');
}

// Special handling for each tab
TAB_NAMES.forEach(name => {
  if (name === 'billing') return; // Handle billing separately

  const jsx = extractTabJSX(name);
  const normalizedJSX = normalizeIndent(jsx);
  const used = detectContextUsage(jsx);

  // Component name
  const compName = pascalCase(name) + 'Tab';

  // Check if tab needs extra imports
  let extraImports = '';
  if (jsx.includes('ClassRoster')) {
    extraImports += "import ClassRoster from '../../ClassRoster';\n";
  }
  if (jsx.includes('SchoolAdminService')) {
    extraImports += "import * as SchoolAdminService from '../../../services/schoolAdminService';\n";
  }
  if (jsx.includes('ReactDOM')) {
    extraImports += "import ReactDOM from 'react-dom';\n";
  }

  // Build destructure
  const destructure = used.length > 0
    ? `  const {\n    ${used.join(', ')},\n  } = useSchoolAdmin();\n\n`
    : '';

  const fileContent = `import React from 'react';
import { useSchoolAdmin } from '../SchoolAdminContext';
${extraImports}
const ${compName}: React.FC = () => {
${destructure}  return (
${normalizedJSX}
  );
};

export default ${compName};
`;

  fs.writeFileSync(path.join(TABS_DIR, compName + '.tsx'), fileContent);
  console.log(`✅ tabs/${compName}.tsx (${used.length} context props, ${normalizedJSX.split('\n').length} JSX lines)`);
});

// ========================================================================
// 2b. Billing tab wrapper
// ========================================================================

// The billing tab section renders <BillingTab> with explicit props including inline handlers
// We extract it as a wrapper that pulls state from context and passes props to BillingTabUI
const billingJSX = extractTabJSX('billing');
const billingUsed = detectContextUsage(billingJSX);
// Also need tier service imports since inline handlers use them
const billingNormalized = normalizeIndent(billingJSX);

const billingWrapperContent = `import React from 'react';
import { useSchoolAdmin } from '../SchoolAdminContext';
import BillingTabUI from '../BillingTabUI';
import {
  fetchSchoolPlanDetails,
  startPilot,
  createCheckoutSession,
  invalidateTierCache,
  type PlanInfo,
} from '../../../services/tierService';

const BillingTab: React.FC = () => {
  const {
    ${billingUsed.join(', ')},
  } = useSchoolAdmin();

  return (
${billingNormalized}
  );
};

export default BillingTab;
`;

fs.writeFileSync(path.join(TABS_DIR, 'BillingTab.tsx'), billingWrapperContent);
console.log(`✅ tabs/BillingTab.tsx (wrapper, ${billingUsed.length} context props)`);

// ========================================================================
// 3. BillingTabUI.tsx (the original internal BillingTab component)
// ========================================================================

// Extract from the interface line to the line before export
const billingTabSrc = lines.slice(billingInterfaceLine, billingExportLine - 1).join('\n');

const billingTabUIContent = `import React, { useEffect } from 'react';
import {
  PAID_PLANS,
  PILOT_PLAN,
  type SchoolPlanDetails,
  type PlanInfo,
} from '../../services/tierService';

${billingTabSrc}

export default BillingTab;
`;

fs.writeFileSync(
  path.join(ROOT, 'components', 'school-admin', 'BillingTabUI.tsx'),
  billingTabUIContent,
);
console.log(`✅ school-admin/BillingTabUI.tsx (${billingTabSrc.split('\n').length} lines)`);

// ========================================================================
// 4. Modal components
// ========================================================================

// MemberActionModal
const memberActionJSX = extractPortalJSX(memberActionStart, memberActionEnd);
const memberActionUsed = detectContextUsage(memberActionJSX);

const memberActionContent = `import React from 'react';
import ReactDOM from 'react-dom';
import { useSchoolAdmin } from '../SchoolAdminContext';

const MemberActionModal: React.FC = () => {
  const {
    ${memberActionUsed.join(', ')},
  } = useSchoolAdmin();

  return (
    <>
${normalizeIndent(memberActionJSX)}
    </>
  );
};

export default MemberActionModal;
`;

fs.writeFileSync(path.join(MODALS_DIR, 'MemberActionModal.tsx'), memberActionContent);
console.log(`✅ modals/MemberActionModal.tsx (${memberActionUsed.length} context props)`);

// ConfirmDialogModal
const confirmDialogJSX = extractPortalJSX(confirmDialogStart, confirmDialogEnd);
const confirmDialogUsed = detectContextUsage(confirmDialogJSX);

const confirmDialogContent = `import React from 'react';
import ReactDOM from 'react-dom';
import { useSchoolAdmin } from '../SchoolAdminContext';

const ConfirmDialogModal: React.FC = () => {
  const {
    ${confirmDialogUsed.join(', ')},
  } = useSchoolAdmin();

  return (
    <>
${normalizeIndent(confirmDialogJSX)}
    </>
  );
};

export default ConfirmDialogModal;
`;

fs.writeFileSync(path.join(MODALS_DIR, 'ConfirmDialogModal.tsx'), confirmDialogContent);
console.log(`✅ modals/ConfirmDialogModal.tsx (${confirmDialogUsed.length} context props)`);

// ========================================================================
// 5. Rebuild SchoolAdminPortal.tsx shell
// ========================================================================

// Part A: Original imports (lines 0 to 27, 0-indexed) — we'll add new imports after
const originalImports = lines.slice(0, 28).join('\n');

// Build new import block
const newImports = `
import SchoolAdminContext from './school-admin/SchoolAdminContext';
import DashboardTab from './school-admin/tabs/DashboardTab';
import MembersTab from './school-admin/tabs/MembersTab';
import ClassesTab from './school-admin/tabs/ClassesTab';
import RosterTab from './school-admin/tabs/RosterTab';
import SubjectsTab from './school-admin/tabs/SubjectsTab';
import TeachersTab from './school-admin/tabs/TeachersTab';
import StudentsTab from './school-admin/tabs/StudentsTab';
import InvitesTab from './school-admin/tabs/InvitesTab';
import BillingTab from './school-admin/tabs/BillingTab';
import SettingsTab from './school-admin/tabs/SettingsTab';
import CambridgeTab from './school-admin/tabs/CambridgeTab';
import MemberActionModal from './school-admin/modals/MemberActionModal';
import ConfirmDialogModal from './school-admin/modals/ConfirmDialogModal';`;

// Part B: Interface + component start through all state/logic up to early returns
// This is lines 28 (interface) through 1130 (just before "if (loading)")
const stateAndLogic = lines.slice(28, 1131).join('\n');

// Part C: Early returns (loading + no school)
const earlyReturns = lines.slice(1131, 1151).join('\n');

// Part D: Build context value
// Collect all context properties
const allContextProps = new Set();
[...TAB_NAMES, 'memberAction', 'confirmDialog'].forEach(section => {
  let jsx;
  if (section === 'memberAction') {
    jsx = memberActionJSX;
  } else if (section === 'confirmDialog') {
    jsx = confirmDialogJSX;
  } else {
    jsx = extractTabJSX(section);
  }
  detectContextUsage(jsx).forEach(p => allContextProps.add(p));
});

const contextPropsArr = [...allContextProps].sort();
const contextValueStr = contextPropsArr.map(p => `      ${p},`).join('\n');

// Part E: Build the return JSX (header + tab nav + tab components + modals)
// Pull header & tab nav from original (lines mainReturnLine to first tab start)
const firstTabStart = tabs['dashboard'].start;
const headerAndNav = lines.slice(mainReturnLine, firstTabStart).join('\n');

// Each tab conditional (one-liner in shell)
const tabComponents = TAB_NAMES.map(name => {
  // Find the original condition from the source line
  const origLine = lines[tabs[name].start];
  // Extract the condition between { and (
  const condMatch = origLine.match(/\{(.+?)\s*&&\s*\(/);
  if (!condMatch) {
    console.error(`Could not parse condition for tab: ${name} from line: ${origLine}`);
    process.exit(1);
  }
  const condition = condMatch[1].trim();
  const compName = pascalCase(name) + 'Tab';
  return `      {${condition} && <${compName} />}`;
}).join('\n');

// After last tab, before portals — there are blank lines and comments
const lastTabEnd = tabs['cambridge'].end;
// Portals are now components
const portalComponents = `
      {/* Modals */}
      <MemberActionModal />
      <ConfirmDialogModal />`;

// Closing of the return: </div> + ); + };
const returnClose = `    </div>
    </SchoolAdminContext.Provider>
  );
};`;

// Part F: Assemble shell
const shellContent = `${originalImports}
${newImports}

${stateAndLogic}

${earlyReturns}

  // ── Context value (every state/setter/handler exposed to child components) ──
  const contextValue = {
${contextValueStr}
  };

  return (
    <SchoolAdminContext.Provider value={contextValue}>
${headerAndNav}

      {/* Tab Content */}
${tabComponents}

${portalComponents}
${returnClose}


export default SchoolAdminPortal;
`;

fs.writeFileSync(SRC, shellContent);

const shellLines = shellContent.split('\n').length;
console.log(`\n✅ SchoolAdminPortal.tsx rebuilt: ${shellLines} lines (was ${lines.length})`);
console.log(`   Reduction: ${lines.length - shellLines} lines removed from main file`);

// Summary
console.log('\n=== RESTRUCTURE COMPLETE ===');
console.log('Files created:');
console.log('  components/school-admin/SchoolAdminContext.tsx');
TAB_NAMES.forEach(n => console.log(`  components/school-admin/tabs/${pascalCase(n)}Tab.tsx`));
console.log('  components/school-admin/BillingTabUI.tsx');
console.log('  components/school-admin/modals/MemberActionModal.tsx');
console.log('  components/school-admin/modals/ConfirmDialogModal.tsx');
console.log(`  components/SchoolAdminPortal.tsx (shell: ${shellLines} lines)`);
