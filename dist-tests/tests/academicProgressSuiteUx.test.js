import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
const read = (relative) => fs.readFileSync(relative, 'utf8');
test('Academic Progress Suite uses Grade → Class → Student before subject', () => {
    const source = read('components/student-progress/AcademicProgressSuite.tsx');
    const grade = source.indexOf('<b>1</b> Grade');
    const classStep = source.indexOf('<b>2</b> Class');
    const student = source.indexOf('<b>3</b> Student');
    const subject = source.indexOf('<b>4</b> {subjectLabel}');
    assert.ok(grade >= 0);
    assert.ok(classStep > grade);
    assert.ok(student > classStep);
    assert.ok(subject > student);
    assert.match(source, /disabled={!grade}/);
    assert.match(source, /disabled={!className}/);
    assert.match(source, /disabled={!studentId}/);
});
test('Academic Progress Suite is school branded and viewer aware', () => {
    const header = read('components/student-progress/AcademicProgressSuite.tsx');
    const context = read('services/academicProgressExperienceService.ts');
    assert.match(header, /SchoolBrand/);
    assert.match(header, /createSchoolBrand/);
    assert.match(header, /academicProgressViewerLabel/);
    assert.match(context, /case 'school_admin'/);
    assert.match(context, /case 'school_head'/);
    assert.match(context, /case 'student'/);
    assert.match(context, /Back to School Administration/);
    assert.match(context, /Back to Academic Performance/);
    assert.match(context, /Back to Teacher Workspace/);
});
test('shared profile experience has no hard-coded teacher-only return copy', () => {
    const directory = read('components/student-progress/TeacherAcademicProfilesPage.tsx');
    const profile = read('components/student-progress/StudentAcademicProfile.tsx');
    assert.doesNotMatch(directory, /Back to teacher portal/i);
    assert.doesNotMatch(profile, /Back to teacher portal/i);
    assert.match(directory, /Student Academic Profiles/);
    assert.match(profile, /Generate individual report/);
});
test('support plans use school language rather than implementation-phase language', () => {
    const source = read('components/student-progress/TeacherInterventionIntelligencePage.tsx');
    assert.doesNotMatch(source, /Phase 7/);
    assert.doesNotMatch(source, /Intervention Intelligence/);
    assert.match(source, /Student Support Plans/);
    assert.match(source, /Create support plan/);
    assert.match(source, /AcademicStudentPicker/);
});
test('parent onboarding is explicit and child-specific', () => {
    const admin = read('components/guardian/GuardianManagementPage.tsx');
    const parent = read('components/guardian/ParentPortal.tsx');
    const dashboard = read('components/guardian/ParentDashboardPremium.tsx');
    assert.match(admin, /same invited email|same email/);
    assert.match(admin, /marks, subject performance, strengths/);
    assert.match(admin, /Private teacher notes and raw internal evidence stay hidden/);
    assert.match(parent, /Your child’s progress/);
    assert.match(parent, /ParentDashboardPremium/);
    assert.match(parent, /SchoolBrand/);
    assert.match(dashboard, /Areas needing support/);
    assert.match(dashboard, /School-approved academic progress/);
});
test('academic reports are school-branded, reproducible and evidence-governed', () => {
    const report = read('components/student-progress/AcademicReportBuilder.tsx');
    assert.match(report, /createSchoolBrand/);
    assert.match(report, /Confidential academic report/);
    assert.match(report, /Reproducible academic reports/);
    assert.match(report, /Attainment, progress and evidence confidence/);
    assert.match(report, /Reporting disclosures/);
    assert.match(report, /Payload/);
    assert.match(report, /Sources/);
});
test('School Head can use the secure student progress contract', () => {
    const migration = read('supabase/migrations/20260809179000_academic_progress_experience.sql');
    assert.match(migration, /rpc_academic_progress_experience_context/);
    assert.match(migration, /public\.is_school_owner\(v_school_id\)/);
    assert.match(migration, /v_is_school_head boolean := false/);
    assert.match(migration, /when v_is_school_head then 'school_head'/);
    assert.match(migration, /revoke all on function public\.rpc_academic_progress_experience_context\(uuid\) from public, anon/);
});
test('grade-first pickers prefer the active class grade and preserve fallbacks', () => {
    const migration = read('supabase/migrations/20260809179100_academic_progress_picker_grade_normalization.sql');
    assert.match(migration, /coalesce\(c\.grade_level::text, nullif\(trim\(u\.grade::text\), ''\)\)/);
    assert.match(migration, /rpc_school_guardian_management_snapshot/);
    assert.match(migration, /rpc_teacher_academic_profile_students/);
});
