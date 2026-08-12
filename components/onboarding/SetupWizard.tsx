import React, { useState, useEffect } from 'react';
import * as AuthService from '../../services/authService';
import type { Batch, Grade } from '../../types';
import SchoolRequestModal from '../SchoolRequestModal';
import { updateOnboardingState, fetchOnboardingProfile, getOnboardingState, readOnboardingResolution } from '../../src/features/onboarding/onboardingService';
import { buildSetupCompletionOnboardingSeed, buildSetupProfileFallback } from '../../src/features/onboarding/setupCompletion';
import { isOnboardingDebugEnabled, logOnboardingDebug } from '../../src/features/onboarding/featureFlags';

interface SetupWizardProps {
  onComplete: () => void;
  onLogout: () => void;
  initialUsername?: string;
}

type SetupStep = 'path' | 'invite_code' | 'role' | 'student_details' | 'submitting';
type SetupPath = 'school' | 'individual' | null;

const GRADE_TO_BATCH: Record<Grade, Batch[]> = {
  6: ['6A', '6B', '6C', 'N/A'],
  7: ['7A', '7B', '7C', 'N/A'],
  8: ['8A', '8B', '8C', 'N/A'],
  9: ['9A', '9B', '9C', 'N/A'],
  10: ['10A', '10B', '10C', 'N/A'],
  11: ['11A', '11B', '11C', 'N/A'],
  12: ['12A', '12B', '12C', 'N/A'],
};

const SetupWizard: React.FC<SetupWizardProps> = ({ onComplete, onLogout, initialUsername }) => {
  const [step, setStep] = useState<SetupStep>('path');
  const [path, setPath] = useState<SetupPath>(null);
  const [inviteCode, setInviteCode] = useState('');
  const [role, setRole] = useState<'student' | 'teacher'>('student');
  const [grade, setGrade] = useState<Grade | null>(null);
  const [batch, setBatch] = useState<Batch>('N/A');
  const [username, setUsername] = useState(initialUsername || '');
  const [fullName, setFullName] = useState('');
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [schoolName, setSchoolName] = useState<string | null>(null);
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [approvedClasses, setApprovedClasses] = useState<AuthService.ApprovedSignupClass[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [requestedClass, setRequestedClass] = useState('');
  const [classesLoading, setClassesLoading] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);

  useEffect(() => {
    // Add wizard animation class
    document.body.classList.add('setup-wizard-active');
    return () => {
      document.body.classList.remove('setup-wizard-active');
    };
  }, []);

  const normalizeInviteCode = (code: string) => code.replace(/\s+/g, '').toUpperCase();
  const inviteCodeNormalized = normalizeInviteCode(inviteCode);
  const inviteCodeReady = inviteCodeNormalized.length >= 6;

  const batchOptions = grade ? GRADE_TO_BATCH[grade] : ['N/A'];
  const schoolGradeOptions = Array.from(new Set(
    approvedClasses
      .map((item) => Number(item.grade_level))
      .filter((value) => Number.isInteger(value) && value >= 6 && value <= 12),
  )).sort((a, b) => a - b) as Grade[];
  const schoolHasConfiguredGrades = schoolGradeOptions.length > 0;
  const studentGradeRequired = path === 'individual' || schoolHasConfiguredGrades;

  const getStepNumber = (): number => {
    if (step === 'path') return 1;
    if (step === 'invite_code') return 2;
    if (step === 'role') return path === 'school' ? 3 : 2;
    if (step === 'student_details') return path === 'school' ? 4 : 3;
    return 1;
  };

  const getTotalSteps = (): number => {
    if (path === 'school') return role === 'student' ? 4 : 3;
    if (path === 'individual') return role === 'student' ? 3 : 2;
    return 3; // Default
  };

  const handlePathSelect = (selectedPath: SetupPath) => {
    setPath(selectedPath);
    setError(null);
    
    if (selectedPath === 'school') {
      setStep('invite_code');
    } else if (selectedPath === 'individual') {
      setStep('role');
    }
  };

  const handleInviteCodeValidate = async () => {
    if (!inviteCodeReady) {
      setError('Please enter a valid invite code');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Check email verification before allowing school join
      const verificationStatus = await AuthService.checkEmailVerification();
      if (!verificationStatus.isVerified) {
        setError('Please verify your email before joining a school. Check your inbox for the verification link.');
        setIsLoading(false);
        return;
      }

      const result = await AuthService.validateInviteCode(inviteCodeNormalized);
      
      if (!result.valid) {
        setError('Invalid or expired invite code. Please check and try again.');
        return;
      }

      setSchoolName(result.school_name || 'School');
      setSchoolId(result.school_id || null);
      setClassesLoading(true);
      const classesResult = await AuthService.listApprovedSignupClasses(inviteCodeNormalized);
      setClassesLoading(false);
      setApprovedClasses(classesResult.success ? classesResult.classes : []);
      setSelectedClassId('');
      setStep('role');
    } catch (err) {
      setError('Failed to validate invite code. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRoleSelect = (selectedRole: 'student' | 'teacher') => {
    setRole(selectedRole);
    setError(null);

    if (selectedRole === 'student') {
      setStep('student_details');
    } else {
      // Teacher path - submit immediately
      handleSubmit(selectedRole);
    }
  };

  const handleSchoolApplicationOpen = () => {
    // A new-school application is reserved for an authorised school
    // decision-maker. Treat the applicant as staff until approval provisions
    // the protected School Head membership.
    setRole('teacher');
    setError(null);
    setShowRequestModal(true);
  };

  const handleSubmit = async (submittedRole?: 'student' | 'teacher') => {
    const finalRole = submittedRole || role;
    
    if (finalRole === 'student' && studentGradeRequired && !grade) {
      setError(path === 'school'
        ? 'Please select a grade configured by your school.'
        : 'Please select your grade and class');
      return;
    }
    if (finalRole === 'student' && (fullName.trim().length < 5 || !fullName.trim().includes(' '))) {
      setError('Please enter your real first and last name');
      return;
    }

    setIsLoading(true);
    setError(null);
    setStep('submitting');

    try {
      if (path === 'school') {
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
      } else if (path === 'individual') {
        // Individual setup
        const setupResult = await AuthService.completeIndividualSetup({
          role: finalRole,
          grade: finalRole === 'student' ? grade || undefined : undefined,
          batch: finalRole === 'student' && batch !== 'N/A' ? batch : undefined,
          username: username || undefined,
        });

        if (!setupResult.success) {
          setError(setupResult.error || 'Failed to complete setup');
          setStep('role');
          return;
        }
      }

      if (finalRole === 'student') {
        const { data: nameResult, error: nameError } = await AuthService.supabase.rpc('submit_my_full_name', {
          p_full_name: fullName.trim(),
        });
        if (nameError || !nameResult?.success) {
          setError(nameResult?.error || nameError?.message || 'Could not save your real name');
          setStep('student_details');
          return;
        }
      }

      // Success! Seed Phase 1A learner FTUE state for new students only.
      // Teachers/admins keep existing routes until their onboarding flows are built.
      const seedPatch = buildSetupCompletionOnboardingSeed({
        role: finalRole,
        path,
        schoolId,
        schoolName,
      });
      const seededOnboardingRow = seedPatch ? await updateOnboardingState(seedPatch) : null;
      const { data: { user } } = await AuthService.supabase.auth.getUser();
      const [savedProfileFromRead, onboardingRowAfterSeed] = await Promise.all([
        fetchOnboardingProfile(user?.id),
        getOnboardingState(user?.id),
      ]);
      const savedProfile = savedProfileFromRead ?? buildSetupProfileFallback({
        userId: user?.id,
        selectedRole: finalRole,
        onboardingState: onboardingRowAfterSeed ?? seededOnboardingRow,
      });
      const resolverResult = await readOnboardingResolution({ userId: user?.id, profile: savedProfile });
      const shouldRenderLearnerShell = Boolean(
        resolverResult.eligible
        && !resolverResult.isComplete
        && (resolverResult.segment === 'school_student' || resolverResult.segment === 'solo_learner'),
      );

      const debugSnapshot = {
        selectedRole: finalRole,
        savedProfileRole: savedProfile?.role ?? null,
        profile_fallback_used: !savedProfileFromRead && Boolean(savedProfile),
        needs_setup: savedProfile?.needs_setup ?? null,
        school_id: savedProfile?.school_id ?? null,
        tutorial_completed: savedProfile?.tutorial_completed ?? null,
        seeded_onboarding_row: seededOnboardingRow ? {
          segment: seededOnboardingRow.segment,
          current_step: seededOnboardingRow.current_step,
          core_completed_at: seededOnboardingRow.core_completed_at,
          completed_steps: seededOnboardingRow.completed_steps,
        } : null,
        onboarding_row_after_seed: onboardingRowAfterSeed ? {
          segment: onboardingRowAfterSeed.segment,
          current_step: onboardingRowAfterSeed.current_step,
          core_completed_at: onboardingRowAfterSeed.core_completed_at,
          completed_steps: onboardingRowAfterSeed.completed_steps,
        } : null,
        resolver_result: {
          ftue_enabled: resolverResult.reason !== 'ftue_disabled',
          segment: resolverResult.segment,
          eligible: resolverResult.eligible,
          isComplete: resolverResult.isComplete,
          current_step: resolverResult.state?.current_step ?? resolverResult.nextStep,
          reason: resolverResult.reason,
        },
        shouldRenderLearnerShell,
      };

      logOnboardingDebug('[ftue:setup-complete]', debugSnapshot);
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem('brains_heist_last_setup_role', finalRole);
        if (isOnboardingDebugEnabled()) {
          window.sessionStorage.setItem('brains_heist_last_setup_ftue_debug', JSON.stringify(debugSnapshot));
        } else {
          window.sessionStorage.removeItem('brains_heist_last_setup_ftue_debug');
        }
      }

      onComplete();
    } catch (err) {
      console.error('Setup error:', err);
      setError('An unexpected error occurred. Please try again.');
      setStep(path === 'school' ? 'invite_code' : 'role');
    } finally {
      setIsLoading(false);
    }
  };

  const renderStepIndicator = () => {
    const currentStep = getStepNumber();
    const totalSteps = getTotalSteps();

    return (
      <div className="flex items-center justify-center gap-2 mb-8">
        {Array.from({ length: totalSteps }).map((_, index) => (
          <div
            key={index}
            className={`h-2 rounded-full transition-all duration-300 ${
              index < currentStep
                ? 'w-8 bg-cyan-400'
                : index === currentStep - 1
                ? 'w-12 bg-cyan-400'
                : 'w-8 bg-gray-700'
            }`}
          />
        ))}
        <span className="ml-2 text-sm text-gray-400">
          Step {currentStep} of {totalSteps}
        </span>
      </div>
    );
  };

  const renderPathSelection = () => (
    <div className="space-y-6 animate-slide-up">
      <div className="text-center mb-8">
        <h2 className="font-heading text-3xl font-bold text-white mb-3">
          Welcome, Agent
        </h2>
        <p className="text-gray-400">
          How do you want to start your mission?
        </p>
      </div>

      <div className="grid gap-4">
        <button
          onClick={() => handlePathSelect('school')}
          className="group relative overflow-hidden rounded-xl border-2 border-cyan-500/30 bg-gradient-to-br from-slate-900/90 to-slate-800/90 p-6 text-left transition-all duration-300 hover:border-cyan-400 hover:scale-[1.02] active:scale-[0.98]"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/0 to-cyan-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-lg bg-cyan-500/20 flex items-center justify-center text-2xl border border-cyan-500/40">
                🏫
              </div>
              <h3 className="font-heading text-2xl font-bold text-white">Join a School</h3>
            </div>
            
            <p className="text-gray-300 mb-4">
              Use an invite code from your school. Compete with classmates and access school leaderboards.
            </p>
            
            <div className="flex items-center gap-2 text-cyan-400 font-semibold">
              <span>Enter invite code</span>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={handleSchoolApplicationOpen}
          disabled={isLoading}
          className="group relative overflow-hidden rounded-xl border-2 border-amber-400/30 bg-gradient-to-br from-slate-900/90 to-slate-800/90 p-6 text-left transition-all duration-300 hover:border-amber-300 hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-amber-400/0 to-amber-400/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-lg bg-amber-300/15 flex items-center justify-center text-2xl border border-amber-300/40">
                🏛️
              </div>
              <h3 className="font-heading text-2xl font-bold text-white">Apply to add your school</h3>
            </div>

            <p className="text-gray-300 mb-4">
              For school owners, principals, directors, and authorised decision-makers. No invite code needed.
            </p>

            <div className="flex items-center gap-2 text-amber-200 font-semibold">
              <span>Start school application</span>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </div>
          </div>
        </button>

        <button
          onClick={() => handlePathSelect('individual')}
          className="group relative overflow-hidden rounded-xl border-2 border-purple-500/30 bg-gradient-to-br from-slate-900/90 to-slate-800/90 p-6 text-left transition-all duration-300 hover:border-purple-400 hover:scale-[1.02] active:scale-[0.98]"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/0 to-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-lg bg-purple-500/20 flex items-center justify-center text-2xl border border-purple-500/40">
                🎯
              </div>
              <h3 className="font-heading text-2xl font-bold text-white">Continue Solo</h3>
            </div>
            
            <p className="text-gray-300 mb-4">
              Play individually. You can join a school later from your dashboard.
            </p>
            
            <div className="flex items-center gap-2 text-purple-400 font-semibold">
              <span>Start playing</span>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </div>
          </div>
        </button>
      </div>
    </div>
  );

  const renderInviteCodeStep = () => (
    <div className="space-y-6 animate-slide-up">
      <div className="text-center mb-6">
        <h2 className="font-heading text-2xl font-bold text-white mb-2">
          Enter Invite Code
        </h2>
        <p className="text-gray-400">
          Get this code from your school administrator or teacher
        </p>
      </div>

      <div className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-gray-300 mb-2 block">Invite Code</span>
          <input
            type="text"
            value={inviteCode}
            onChange={(e) => {
              setInviteCode(normalizeInviteCode(e.target.value));
              setError(null);
            }}
            placeholder="XXXXXXXX"
            className="w-full bg-gray-800 border border-gray-600 rounded-lg p-4 text-white text-center uppercase tracking-widest text-lg focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition-all"
            maxLength={10}
            disabled={isLoading}
          />
        </label>

        <button
          onClick={handleInviteCodeValidate}
          disabled={!inviteCodeReady || isLoading}
          className="w-full py-4 rounded-lg font-bold text-lg bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-600 hover:to-cyan-700 disabled:from-gray-700 disabled:to-gray-700 disabled:cursor-not-allowed transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] disabled:scale-100"
        >
          {isLoading ? 'Validating...' : 'Continue'}
        </button>

        <button
          onClick={() => {
            setStep('path');
            setInviteCode('');
            setError(null);
          }}
          className="w-full py-3 text-gray-400 hover:text-white transition-colors"
          disabled={isLoading}
        >
          ← Back
        </button>

        <div className="pt-4 border-t border-gray-700">
          <button
            onClick={() => setShowRequestModal(true)}
            className="w-full text-center text-sm text-cyan-400 hover:text-cyan-300 transition-colors"
          >
            Don't have a code? Request school access →
          </button>
        </div>
      </div>
    </div>
  );

  const renderRoleSelection = () => (
    <div className="space-y-6 animate-slide-up">
      <div className="text-center mb-6">
        <h2 className="font-heading text-2xl font-bold text-white mb-2">
          {path === 'school' && schoolName ? `Joining ${schoolName}` : 'Select Your Role'}
        </h2>
        <p className="text-gray-400">
          Are you a student or a teacher?
        </p>
      </div>

      <div className="grid gap-4">
        <button
          onClick={() => handleRoleSelect('student')}
          disabled={isLoading}
          className="group relative overflow-hidden rounded-xl border-2 border-cyan-500/30 bg-gradient-to-br from-slate-900/90 to-slate-800/90 p-6 text-left transition-all duration-300 hover:border-cyan-400 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/0 to-cyan-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          
          <div className="relative z-10 flex items-center gap-4">
            <div className="w-14 h-14 rounded-lg bg-cyan-500/20 flex items-center justify-center text-3xl border border-cyan-500/40">
              🎓
            </div>
            <div className="flex-1">
              <h3 className="font-heading text-xl font-bold text-white mb-1">Student</h3>
              <p className="text-sm text-gray-400">Complete quests, earn rewards, compete with peers</p>
            </div>
            <svg className="w-6 h-6 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </button>

        <button
          onClick={() => handleRoleSelect('teacher')}
          disabled={isLoading}
          className="group relative overflow-hidden rounded-xl border-2 border-purple-500/30 bg-gradient-to-br from-slate-900/90 to-slate-800/90 p-6 text-left transition-all duration-300 hover:border-purple-400 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/0 to-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          
          <div className="relative z-10 flex items-center gap-4">
            <div className="w-14 h-14 rounded-lg bg-purple-500/20 flex items-center justify-center text-3xl border border-purple-500/40">
              👨‍🏫
            </div>
            <div className="flex-1">
              <h3 className="font-heading text-xl font-bold text-white mb-1">Teacher</h3>
              <p className="text-sm text-gray-400">Create assignments, monitor progress, manage classes</p>
            </div>
            <svg className="w-6 h-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </button>
      </div>


      <button
        onClick={() => setStep(path === 'school' ? 'invite_code' : 'path')}
        className="w-full py-3 text-gray-400 hover:text-white transition-colors"
        disabled={isLoading}
      >
        ← Back
      </button>
    </div>
  );

  const renderStudentDetails = () => (
    <div className="space-y-6 animate-slide-up">
      <div className="text-center mb-6">
        <h2 className="font-heading text-2xl font-bold text-white mb-2">
          Student Details
        </h2>
        <p className="text-gray-400">
          Help us place you on the right leaderboards
        </p>
      </div>

      <div className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-gray-300 mb-2 block">Real full name *</span>
          <input
            type="text"
            value={fullName}
            onChange={(e) => { setFullName(e.target.value); setError(null); }}
            autoComplete="name"
            placeholder="First and last name"
            className="w-full bg-gray-800 border border-gray-600 rounded-lg p-4 text-white focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition-all"
            disabled={isLoading}
          />
          <p className="mt-1 text-xs text-gray-400">Used on school exams after your school administrator confirms it. Your codename stays public in the game.</p>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-gray-300 mb-2 block">
            {path === 'school' && !schoolHasConfiguredGrades ? 'Grade' : 'Grade *'}
          </span>
          <select
            value={grade || ''}
            onChange={(e) => {
              const newGrade = e.target.value ? (parseInt(e.target.value) as Grade) : null;
              setGrade(newGrade);
              setSelectedClassId('');
              setBatch('N/A');
              setError(null);
            }}
            className="w-full bg-gray-800 border border-gray-600 rounded-lg p-4 text-white focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition-all"
            disabled={isLoading || (path === 'school' && !schoolHasConfiguredGrades)}
          >
            <option value="">
              {path === 'school' && !schoolHasConfiguredGrades ? 'School will assign your grade' : 'Select your grade'}
            </option>
            {(path === 'school' ? schoolGradeOptions : [6, 7, 8, 9, 10, 11, 12]).map((g) => (
              <option key={g} value={g}>
                Grade {g}
              </option>
            ))}
          </select>
          {path === 'school' && !schoolHasConfiguredGrades && (
            <div className="mt-3 rounded-xl border border-cyan-400/30 bg-cyan-400/10 p-3">
              <p className="text-xs leading-relaxed text-cyan-100">
                Your school has not configured grades or classes yet. You can finish registration now; your school administrator can place you later.
              </p>
            </div>
          )}
        </label>

        {path === 'school' ? <label className="block">
          <span className="text-sm font-medium text-gray-300 mb-2 block">Approved class</span>
          <select
            value={selectedClassId}
            onChange={(e) => {
              setSelectedClassId(e.target.value);
              setError(null);
            }}
            className="w-full bg-gray-800 border border-gray-600 rounded-lg p-4 text-white focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition-all"
            disabled={isLoading || classesLoading || !grade}
          >
            <option value="">{classesLoading ? 'Loading approved classes…' : 'My class is not listed'}</option>
            {approvedClasses.filter((item) => item.grade_level === String(grade)).map((item) => (
              <option key={item.id} value={item.id}>{item.class_code}{item.class_name !== item.class_code ? ` · ${item.class_name}` : ''}</option>
            ))}
          </select>
          {!grade && schoolHasConfiguredGrades && (
            <p className="mt-1 text-xs text-gray-500">Select a grade first</p>
          )}
          {grade && !selectedClassId && <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3">
            <p className="text-xs leading-relaxed text-amber-100">You can finish registration now. Your school administrator will see you in the Awaiting Placement queue.</p>
            <input value={requestedClass} onChange={(event) => setRequestedClass(event.target.value)} placeholder="Optional: type your class name" className="mt-2 w-full rounded-lg border border-amber-300/30 bg-slate-900 p-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-300" />
          </div>}
        </label> : <label className="block">
          <span className="text-sm font-medium text-gray-300 mb-2 block">Class / Batch *</span>
          <select value={batch} onChange={(event) => setBatch(event.target.value as Batch)} className="w-full bg-gray-800 border border-gray-600 rounded-lg p-4 text-white focus:outline-none focus:ring-2 focus:ring-cyan-400" disabled={isLoading || !grade}>
            {batchOptions.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>}

        <button
          onClick={() => handleSubmit()}
          disabled={(studentGradeRequired && !grade) || fullName.trim().length < 5 || !fullName.trim().includes(' ') || isLoading}
          className="w-full py-4 rounded-lg font-bold text-lg bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-600 hover:to-cyan-700 disabled:from-gray-700 disabled:to-gray-700 disabled:cursor-not-allowed transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] disabled:scale-100"
        >
          {isLoading ? 'Setting up...' : 'Complete Setup'}
        </button>

        <button
          onClick={() => setStep('role')}
          className="w-full py-3 text-gray-400 hover:text-white transition-colors"
          disabled={isLoading}
        >
          ← Back
        </button>
      </div>
    </div>
  );

  const renderSubmitting = () => (
    <div className="text-center space-y-6 animate-fade-in">
      <div className="w-20 h-20 mx-auto rounded-full border-4 border-cyan-400/30 border-t-cyan-400 animate-spin" />
      <div>
        <h2 className="font-heading text-2xl font-bold text-white mb-2">
          Setting up your mission...
        </h2>
        <p className="text-gray-400">
          This will only take a moment
        </p>
      </div>
    </div>
  );

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gradient-to-br from-[#0a0a1a] via-[#1a1a2e] to-[#0a0a1a]">
        {/* Animated background */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl animate-pulse-slow" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse-slow" style={{ animationDelay: '1s' }} />
        </div>

        <div className="w-full max-w-2xl relative z-10">
          <div className="bg-slate-900/95 backdrop-blur-xl rounded-2xl border border-slate-800/60 shadow-2xl p-8">
            {/* Logo */}
            <div className="text-center mb-6">
              <img 
                src="/logo.png" 
                alt="Brains Heist" 
                className="w-16 h-16 mx-auto mb-2 drop-shadow-[0_0_10px_rgba(0,212,255,0.5)]"
              />
            </div>

            {/* Step indicator */}
            {step !== 'submitting' && renderStepIndicator()}

            {/* Error message */}
            {error && (
              <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/50 text-red-400 text-sm animate-shake">
                {error}
              </div>
            )}

            {/* Step content */}
            {step === 'path' && renderPathSelection()}
            {step === 'invite_code' && renderInviteCodeStep()}
            {step === 'role' && renderRoleSelection()}
            {step === 'student_details' && renderStudentDetails()}
            {step === 'submitting' && renderSubmitting()}

            {/* Logout option */}
            {step !== 'submitting' && (
              <div className="mt-8 pt-6 border-t border-gray-800 text-center">
                <button
                  onClick={onLogout}
                  className="text-gray-500 hover:text-gray-400 text-sm transition-colors"
                >
                  Sign out and use a different account
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* School Request Modal */}
      {showRequestModal && (
        <SchoolRequestModal
          isOpen={showRequestModal}
          onClose={() => setShowRequestModal(false)}
          requesterRole={role}
        />
      )}

      <style>{`
        @keyframes pulse-slow {
          0%, 100% {
            opacity: 0.2;
            transform: scale(1);
          }
          50% {
            opacity: 0.4;
            transform: scale(1.1);
          }
        }

        @keyframes slide-up {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes fade-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes shake {
          0%, 100% {
            transform: translateX(0);
          }
          25% {
            transform: translateX(-5px);
          }
          75% {
            transform: translateX(5px);
          }
        }

        .animate-pulse-slow {
          animation: pulse-slow 4s ease-in-out infinite;
        }

        .animate-slide-up {
          animation: slide-up 0.5s ease-out;
        }

        .animate-fade-in {
          animation: fade-in 0.5s ease-out;
        }

        .animate-shake {
          animation: shake 0.3s ease-in-out;
        }
      `}</style>
    </>
  );
};

export default SetupWizard;
