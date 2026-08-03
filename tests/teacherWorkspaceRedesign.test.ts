import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const portal = readFileSync('components/TeacherPortal.tsx', 'utf8');
const wizard = readFileSync('components/teacher/AssignmentWizard.tsx', 'utf8');
const wizardStyles = readFileSync('components/teacher/AssignmentWizard.css', 'utf8');
const questionBank = readFileSync('components/teacher/QuestionBank.tsx', 'utf8');
const teacherTheme = readFileSync('src/styles/teacher-theme.css', 'utf8');

test('teacher navigation uses the requested labels and order', () => {
  assert.match(portal, /label: 'My Classes'/);
  assert.match(portal, /label: 'Assignments'[\s\S]*label: 'Reports'[\s\S]*label: 'Question Bank'/);
  assert.doesNotMatch(portal, /label: 'Quest Builder'/);
  assert.match(portal, /label: 'Cambridge Tests'[\s\S]*label: 'Clan Wars'/);
  assert.doesNotMatch(portal, /label: 'My Students'/);
  assert.match(portal, /<th>Subject<\/th>\s*<th>Title<\/th>\s*<th>Topic<\/th>/);
});

test('writing hub is limited to English teachers', () => {
  assert.match(portal, /const teachesEnglish = teacherAssignedSubjects\.some/);
  assert.match(portal, /profile\.role === 'teacher' && teachesEnglish/);
});

test('assignment wizard follows the subject-first light workflow', () => {
  assert.match(wizard, /\{ id: 1, short: 'Subject', question: 'What subject\?'/);
  assert.match(wizard, /\{ id: 2, short: 'Audience', question: 'Who is this for\?'/);
  assert.match(wizard, /question: 'Add Title and Description'/);
  assert.match(wizard, /Brains Heist Pool/);
  assert.match(wizard, />Select all</);
  assert.match(wizard, /Available questions/);
  assert.match(wizard, /Selected questions/);
  assert.match(wizard, /Leave assignment setup\?/);
  assert.doesNotMatch(wizard, /Preview selection/);
  assert.match(wizardStyles, /background: linear-gradient\(180deg, #f8fafc, #eef2f7\)/);
  assert.match(wizardStyles, /\.aw-step-footer/);
  assert.match(wizardStyles, /\.aw-step-nav/);
  assert.doesNotMatch(wizard, /Live summary/i);
  assert.match(wizard, /scrollIntoView\(\{ behavior: 'smooth', block: 'start' \}\)/);
  assert.doesNotMatch(wizard, /window\.scrollTo/);
});

test('question bank uses formal official and teacher-owned pools', () => {
  assert.match(questionBank, />Brains Heist Pool</);
  assert.match(questionBank, />My Pool</);
  assert.match(questionBank, /Curriculum workspace/);
  assert.doesNotMatch(questionBank, /Mission|Loadout|Quest-ready|🎮/i);
  assert.match(questionBank, /isBrainsHeistPoolQuestion/);
  assert.match(questionBank, /Protected app pool/);
  assert.match(questionBank, /Rename topic/);
  assert.match(questionBank, /Delete topic/);
});

test('desktop navigation can collapse to create more workspace', () => {
  assert.match(portal, /desktopSidebarCollapsed/);
  assert.match(portal, /aria-label=\{desktopSidebarCollapsed \? 'Expand side navigation' : 'Collapse side navigation'\}/);
  assert.match(teacherTheme, /\.teacher-workspace-shell\.is-sidebar-collapsed/);
  assert.match(teacherTheme, /\.teacher-sidebar\.is-collapsed \.teacher-nav-text/);
  assert.match(teacherTheme, /\.teacher-sidebar\.is-collapsed \.teacher-nav-btn\s*\{[^}]*width: 3\.5rem;[^}]*justify-self: center;/s);
  assert.match(teacherTheme, /\.teacher-sidebar\.is-collapsed \.teacher-nav-grid--sidebar\s*\{\s*grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(teacherTheme, /content: attr\(data-label\)/);
  assert.match(portal, /data-label=\{tab\.label\}/);
});

test('teacher navigation has a clean tablet breakpoint and an independently scrollable sidebar', () => {
  assert.match(teacherTheme, /\.teacher-sidebar\s*\{[^}]*max-height: calc\(100dvh - 104px\);[^}]*overflow-y: auto;[^}]*overscroll-behavior: contain;/s);
  assert.match(teacherTheme, /\.teacher-sidebar-toggle\s*\{[^}]*position: sticky;[^}]*top: 0;[^}]*z-index: 6;/s);
  assert.match(teacherTheme, /@media \(max-width: 1024px\)\s*\{[\s\S]*?\.teacher-desktop-sidebar\s*\{\s*display: none;\s*\}/);
  assert.doesNotMatch(teacherTheme, /@media \(max-width: 1023px\)\s*\{\s*\.teacher-portal-container/);
});
