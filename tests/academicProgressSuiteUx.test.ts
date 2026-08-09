import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relative: string) => fs.readFileSync(path.resolve(process.cwd(), relative), 'utf8');

describe('Academic Progress Suite UX', () => {
  it('uses Grade → Class → Student before subject', () => {
    const source = read('components/student-progress/AcademicProgressSuite.tsx');
    const grade = source.indexOf('<b>1</b> Grade');
    const classStep = source.indexOf('<b>2</b> Class');
    const student = source.indexOf('<b>3</b> Student');
    const subject = source.indexOf('<b>4</b> {subjectLabel}');
    expect(grade).toBeGreaterThan(-1);
    expect(classStep).toBeGreaterThan(grade);
    expect(student).toBeGreaterThan(classStep);
    expect(subject).toBeGreaterThan(student);
    expect(source).toContain("disabled={!grade}");
    expect(source).toContain("disabled={!className}");
    expect(source).toContain("disabled={!studentId}");
  });

  it('makes progress pages school branded and viewer aware', () => {
    const header = read('components/student-progress/AcademicProgressSuite.tsx');
    const context = read('services/academicProgressExperienceService.ts');
    expect(header).toContain('SchoolBrand');
    expect(header).toContain('createSchoolBrand');
    expect(header).toContain('academicProgressViewerLabel');
    expect(context).toContain("case 'school_admin'");
    expect(context).toContain("case 'school_head'");
    expect(context).toContain("case 'student'");
    expect(context).toContain('Back to School Administration');
    expect(context).toContain('Back to Academic Performance');
    expect(context).toContain('Back to Teacher Workspace');
  });

  it('removes teacher-only navigation language from the shared profile experience', () => {
    const directory = read('components/student-progress/TeacherAcademicProfilesPage.tsx');
    const profile = read('components/student-progress/StudentAcademicProfile.tsx');
    expect(directory).not.toContain('Back to teacher portal');
    expect(profile).not.toContain('Back to teacher portal');
    expect(directory).toContain('Student Progress & Reports');
    expect(profile).toContain('Generate school report');
  });

  it('uses school language rather than implementation-phase language for support plans', () => {
    const source = read('components/student-progress/TeacherInterventionIntelligencePage.tsx');
    expect(source).not.toContain('Phase 7');
    expect(source).not.toContain('Intervention Intelligence');
    expect(source).toContain('Student Support Plans');
    expect(source).toContain('Create support plan');
    expect(source).toContain('AcademicStudentPicker');
  });

  it('makes parent onboarding explicit and child-specific', () => {
    const admin = read('components/guardian/GuardianManagementPage.tsx');
    const parent = read('components/guardian/ParentPortal.tsx');
    expect(admin).toContain('The account is not created by the school');
    expect(admin).toContain('same email');
    expect(admin).toContain('marks, subject performance, strengths');
    expect(admin).toContain('Private teacher notes and raw internal evidence stay hidden');
    expect(parent).toContain('Your child’s progress');
    expect(parent).toContain('Current areas for development');
    expect(parent).toContain('SchoolBrand');
  });

  it('creates an official school-branded report with only discreet product attribution', () => {
    const report = read('components/student-progress/IndividualStudentAcademicReport.tsx');
    expect(report).toContain('createSchoolBrand');
    expect(report).toContain('Official academic progress report');
    expect(report).toContain('Student Progress Report');
    expect(report).toContain('Areas for development');
    expect(report).toContain('Generated securely through Brain Heist');
    expect(report).not.toContain('Brain Heist School Report');
  });

  it('allows School Head profile access while retaining secure viewer context', () => {
    const migration = read('supabase/migrations/20260809179000_academic_progress_experience.sql');
    expect(migration).toContain('rpc_academic_progress_experience_context');
    expect(migration).toContain('public.is_school_owner(v_school_id)');
    expect(migration).toContain("v_is_school_head boolean := false");
    expect(migration).toContain("when v_is_school_head then 'school_head'");
    expect(migration).toContain('revoke all on function public.rpc_academic_progress_experience_context(uuid) from public, anon');
  });

  it('normalises grade from active class before the user profile', () => {
    const migration = read('supabase/migrations/20260809179100_academic_progress_picker_grade_normalization.sql');
    expect(migration).toContain("coalesce(c.grade_level::text, nullif(trim(u.grade::text), ''))");
    expect(migration).toContain('rpc_school_guardian_management_snapshot');
    expect(migration).toContain('rpc_teacher_academic_profile_students');
  });
});
