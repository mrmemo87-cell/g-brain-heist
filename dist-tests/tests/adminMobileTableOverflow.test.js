import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const admissionHub = readFileSync('components/AdmissionHub.tsx', 'utf8');
const studentsTab = readFileSync('components/school-admin/tabs/StudentsTab.tsx', 'utf8');
const classesTab = readFileSync('components/school-admin/tabs/ClassesTab.tsx', 'utf8');
const cambridgeTab = readFileSync('components/school-admin/tabs/CambridgeTab.tsx', 'utf8');
const ieltsResultsTab = readFileSync('components/school-admin/tabs/IeltsResultsTab.tsx', 'utf8');
const dashboardTab = readFileSync('components/school-admin/tabs/DashboardTab.tsx', 'utf8');
const subjectsTab = readFileSync('components/school-admin/tabs/SubjectsTab.tsx', 'utf8');
const teachersTab = readFileSync('components/school-admin/tabs/TeachersTab.tsx', 'utf8');
const membersTab = readFileSync('components/school-admin/tabs/MembersTab.tsx', 'utf8');
const styles = readFileSync('src/index.css', 'utf8');
test('candidate directory keeps its wide table inside a touch-scrollable region', () => {
    assert.match(admissionHub, /className="admission-candidate-directory admin-table-scroll"[\s\S]*?role="region"[\s\S]*?aria-label="Candidates table"[\s\S]*?tabIndex=\{0\}/);
    assert.match(admissionHub, /className="admission-candidate-table w-full text-sm"/);
    assert.match(styles, /\.admission-candidate-directory\{border:[^}]+\}/);
    assert.doesNotMatch(styles, /\.admission-candidate-directory\{[^}]*overflow:\s*hidden/);
});
test('shared admin table scrolling remains touch-safe and width constrained', () => {
    assert.match(styles, /\.admin-table-scroll\s*\{[^}]*max-width:100%;[^}]*min-width:0;[^}]*overflow-x:auto;[^}]*overflow-y:hidden;[^}]*overscroll-behavior-x:contain;[^}]*-webkit-overflow-scrolling:touch;/s);
    assert.match(styles, /\.admin-table-scroll::-webkit-scrollbar\s*\{\s*height:6px;/);
});
test('wide school admin tables use the shared mobile scroll region', () => {
    const studentsTable = studentsTab.match(/className="admin-table-scroll"[^>]*aria-label="Students table"[^>]*tabIndex=\{0\}[\s\S]*?<table className="min-w-\[(\d+)px\] w-full">/);
    assert.ok(studentsTable, 'Students table must stay inside the shared mobile scroll region with an explicit minimum width');
    assert.ok(Number(studentsTable[1]) >= 640, 'Students table minimum width must remain at least 640px');
    assert.match(classesTab, /className="admin-table-scroll"[^>]*role="region"[^>]*aria-label=\{`\$\{grade[\s\S]*?classes table`\}[^>]*tabIndex=\{0\}[\s\S]*?<table className="min-w-\[760px\] w-full">/);
    assert.match(cambridgeTab, /className="admin-table-scroll"[^>]*aria-label="Cambridge results table"[^>]*tabIndex=\{0\}[\s\S]*?<table className="min-w-\[900px\] w-full">/);
    assert.match(ieltsResultsTab, /className="admin-table-scroll mt-5"[^>]*aria-label="IELTS results table"[^>]*tabIndex=\{0\}[\s\S]*?<table className="min-w-\[920px\]/);
    assert.doesNotMatch(dashboardTab, /className="admin-table-scroll"/);
    assert.doesNotMatch(subjectsTab, /local subject labels|className="admin-table-scroll"/);
    assert.match(teachersTab, /className="admin-table-scroll"/);
    assert.match(membersTab, /className="community-table-wrap community-table-desktop"/);
    assert.match(membersTab, /className="community-mobile-list"/);
});
