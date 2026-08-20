import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const teacherPortal = readFileSync('components/TeacherPortal.tsx', 'utf8');
const teacherPortalShell = readFileSync('components/TeacherPortalShell.tsx', 'utf8');
const vite = readFileSync('vite.config.ts', 'utf8');
const academicProfiles = readFileSync('components/student-progress/TeacherAcademicProfilesPage.tsx', 'utf8');
const interventions = readFileSync('components/student-progress/TeacherInterventionIntelligencePage.tsx', 'utf8');
test('teacher workspace exposes academic profiles and interventions', () => {
    assert.match(teacherPortal, /label: 'Academic Profiles'/);
    assert.match(teacherPortal, /label: 'Interventions'/);
});
test('teacher academic tools stay inside the teacher workspace shell', () => {
    assert.match(vite, /teacher-academic-workspace-shell/);
    assert.match(vite, /components\/TeacherPortalShell\.tsx/);
    assert.match(teacherPortalShell, /\.teacher-main-panel/);
    assert.match(teacherPortalShell, /event\.preventDefault\(\)/);
    assert.match(teacherPortalShell, /event\.stopPropagation\(\)/);
    assert.match(teacherPortalShell, /TeacherAcademicProfilesPage onBack=\{closeAcademicTool\}/);
    assert.match(teacherPortalShell, /TeacherInterventionIntelligencePage onBack=\{closeAcademicTool\}/);
    assert.match(academicProfiles, /onBack=\{onBack\}/);
    assert.match(interventions, /onBack=\{onBack\}/);
});
test('teacher academic tools share the performance-report entitlement boundary', () => {
    assert.match(teacherPortal, /'academic-profiles': 'Performance Reports'/);
    assert.match(teacherPortal, /interventions: 'Performance Reports'/);
});
