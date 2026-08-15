import { readFileSync } from 'node:fs';

const PORTAL_PATH = 'components/SchoolAdminPortal.tsx';
const portal = readFileSync(PORTAL_PATH, 'utf8');

const requiredContracts = [
  {
    name: 'school branding shell',
    patterns: ["import { SchoolBrand } from '../src/components/SchoolBrand';", 'createSchoolBrand'],
  },
  {
    name: 'friendly admin error presentation',
    patterns: ["import { friendlySchoolAdminError } from '../src/lib/schoolAdminPresentation';", 'friendlySchoolAdminError'],
  },
  {
    name: 'mobile collapsed navigation polish',
    patterns: ["import { useSmartCollapsedNavigation } from '../src/hooks/useSmartCollapsedNavigation';", 'revealMobileAdminNavigation', 'mobileAdminMenuOpen'],
  },
  {
    name: 'URL-backed school-admin navigation',
    patterns: ['buildSchoolAdminNavigationUrl', 'parseSchoolAdminNavigation', "window.addEventListener('popstate'"],
  },
  {
    name: 'current admin navigation structure',
    patterns: [
      "id: 'members'",
      "id: 'teachers'",
      "id: 'classes'",
      "id: 'subjects'",
      "id: 'documents'",
      "id: 'admissions'",
      "id: 'cambridge'",
      "id: 'ielts'",
      "id: 'billing'",
      "id: 'settings'",
    ],
  },
  {
    name: 'modular admin tabs',
    patterns: [
      "import DashboardTab from './school-admin/tabs/DashboardTab';",
      "import MembersTab from './school-admin/tabs/MembersTab';",
      "import TeachersTab from './school-admin/tabs/TeachersTab';",
      "import OrganisationTab from './school-admin/tabs/OrganisationTab';",
      "import SubjectsTab from './school-admin/tabs/SubjectsTab';",
      "import BillingTab from './school-admin/tabs/BillingTab';",
      "import SettingsTab from './school-admin/tabs/SettingsTab';",
      "import CambridgeTab from './school-admin/tabs/CambridgeTab';",
      "import DocumentsTab from './school-admin/tabs/DocumentsTab';",
    ],
  },
  {
    name: 'admissions integration',
    patterns: ["import AdmissionHub from './AdmissionHub';"],
  },
  {
    name: 'IELTS admin guards and tools',
    patterns: [
      "import IeltsReviewAdminGuard from './ielts/IeltsReviewAdminGuard';",
      "import IeltsExamModeAdminGuard from './ielts/IeltsExamModeAdminGuard';",
      "id: 'ielts-reviews'",
      "id: 'ielts-student-progress'",
      "id: 'ielts-settings'",
    ],
  },
  {
    name: 'render-safe RPC collection normalization',
    patterns: [
      'Array.isArray(classList)',
      'Array.isArray(teacherList)',
      'Array.isArray(allocationsList)',
      'Array.isArray(studentList)',
      'Array.isArray(subjectList)',
      'Array.isArray(adminList)',
    ],
  },
];

const failures = requiredContracts.flatMap(({ name, patterns }) => {
  const missing = patterns.filter((pattern) => !portal.includes(pattern));
  return missing.length ? [{ name, missing }] : [];
});

if (failures.length > 0) {
  console.error('\nSchoolAdminPortal integrity guard FAILED.');
  console.error('This usually means components/SchoolAdminPortal.tsx was overwritten from a stale branch or older snapshot.');
  console.error('Start from the current main version of SchoolAdminPortal.tsx and re-apply only the intended surgical changes.\n');

  for (const failure of failures) {
    console.error(`Missing contract: ${failure.name}`);
    for (const pattern of failure.missing) console.error(`  - ${pattern}`);
  }

  console.error('\nIf a protected contract is intentionally redesigned, update this guard in the SAME pull request and explain the replacement.');
  process.exit(1);
}

console.log(`SchoolAdminPortal integrity guard passed (${requiredContracts.length} protected contracts).`);
