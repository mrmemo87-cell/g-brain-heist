import { readFileSync, writeFileSync } from 'node:fs';

const file = 'components/onboarding/SetupWizard.tsx';
const source = readFileSync(file, 'utf8');
const pattern = /      if \(path === 'school'\) \{[\s\S]*?      \} else if \(path === 'individual'\) \{/;

if (!pattern.test(source)) {
  throw new Error('Could not find the SetupWizard school submit branch to patch.');
}

const replacement = `      if (path === 'school') {
        const schoolBatch = finalRole === 'student'
          ? (approvedClasses.find((item) => item.id === selectedClassId)?.class_code as Batch | undefined) ?? 'N/A'
          : undefined;

        // School membership must be created through the governed invite-code flow.
        // The server keeps membership + profile completion atomic and never trusts
        // a browser-provided school_id as authority.
        const { data: schoolSetupResult, error: schoolSetupError } = await AuthService.supabase.rpc(
          'complete_school_setup_by_code',
          {
            p_invite_code: inviteCodeNormalized,
            p_role: finalRole,
            p_grade: finalRole === 'student' ? (grade ?? null) : null,
            p_batch: finalRole === 'student' ? schoolBatch : null,
            p_username: username.trim() || null,
          },
        );

        if (schoolSetupError || !schoolSetupResult?.success) {
          console.error('School setup failed:', schoolSetupError ?? schoolSetupResult);
          setError(
            schoolSetupResult?.error
              || 'We could not finish joining this school. Please check the invite code and try again.',
          );
          setStep('invite_code');
          return;
        }

        if (finalRole === 'student' && grade && selectedClassId) {
          const classEnrollmentResult = await AuthService.enrollInApprovedSchoolClass(selectedClassId);
          if (!classEnrollmentResult.success) {
            console.error('Approved class enrollment failed after school setup:', classEnrollmentResult.error);
            const placementResult = await AuthService.requestSchoolClassPlacement(String(grade), requestedClass);
            if (!placementResult.success) console.error('Placement request failed:', placementResult.error);
          }
        } else if (finalRole === 'student' && grade) {
          const placementResult = await AuthService.requestSchoolClassPlacement(String(grade), requestedClass);
          if (!placementResult.success) console.error('Placement request failed:', placementResult.error);
        }
      } else if (path === 'individual') {`;

writeFileSync(file, source.replace(pattern, replacement));
