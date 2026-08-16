import React, { useState, useEffect } from 'react';
import * as AuthService from '../../services/authService';
import type { Batch, Grade } from '../../types';
import SchoolRequestModal from '../SchoolRequestModal';
import { updateOnboardingState, fetchOnboardingProfile, getOnboardingState, readOnboardingResolution } from '../../src/features/onboarding/onboardingService';
import { buildSetupCompletionOnboardingSeed, buildSetupProfileFallback } from '../../src/features/onboarding/setupCompletion';
import { isOnboardingDebugEnabled, logOnboardingDebug } from '../../src/features/onboarding/featureFlags';
import { classMatchesConfiguredGrade, getConfiguredSchoolGrades } from '../../src/features/onboarding/schoolGradeOptions';

interface SetupWizardProps {
  onComplete: () => void;
  onLogout: () => void;
  initialUsername?: string;
}

type SetupStep = 'invite_code' | 'student_details' | 'submitting';
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

const SOLO_GRADES: Grade[] = [6, 7, 8, 9, 10, 11, 12];

const SetupWizard: React.FC<SetupWizardProps> = ({ onComplete, onLogout, initialUsername }) => {
  const [step, setStep] = useState<SetupStep>('invite_code');
  const [path, setPath] = useState<SetupPath>('school');
  const [inviteCode, setInviteCode] = useState('');
  const [grade, setGrade] = useState('');
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

  const soloGrade = path === 'individual' && grade
    ? SOLO_GRADES.find((value) => String(value) === grade) ?? null
    : null;
  const batchOptions: Batch[] = soloGrade ? GRADE_TO_BATCH[soloGrade] : ['N/A'];
  const schoolGradeOptions = getConfiguredSchoolGrades(approvedClasses);
  const schoolHasConfiguredGrades = schoolGradeOptions.length > 0;
  const studentGradeRequired = path === 'individual' || schoolHasConfiguredGrades;

  const getStepNumber = (): number => {
    if (step === 'invite_code') return 1;
    if (step === 'student_details') return 2;
    return 1;
  };

  const startIndependentSetup = () => {
    setPath('individual');
    setInviteCode('');
    setSchoolName(null);
    setSchoolId(null);
    setApprovedClasses([]);
    setSelectedClassId('');
    setGrade('');
    setBatch('N/A');
    setError(null);
    setStep('student_details');
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
      // Accounts created through this signup are already student accounts.
      // Continue straight to the only details the school actually needs.
      setPath('school');
      setStep('student_details');
    } catch (err) {
      setError('Failed to validate invite code. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSchoolApplicationOpen = () => {
    // A new-school application is reserved for an authorised school
    // decision-maker. Treat the applicant as staff until approval provisions
    // the protected School Head membership.
    setError(null);
    setShowRequestModal(true);
  };

  const handleSubmit = async () => {
    const finalRole = 'student' as const;
    const selectedSchoolClass = approvedClasses.find((item) => item.id === selectedClassId);
    
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
        // School membership must be created through the governed invite-code flow.
        // The server keeps membership + profile completion atomic and never trusts
        // a browser-provided school_id as authority.
        const { data: schoolSetupResult, error: schoolSetupError } = await AuthService.supabase.rpc(
          'complete_school_setup_by_code',
          {
            p_invite_code: inviteCodeNormalized,
            p_role: finalRole,
            // School grade and class are derived from the approved class on the
            // server. Never apply the solo-learning grade range to school data.
            p_grade: null,
            p_batch: null,
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
          grade: finalRole === 'student' ? soloGrade || undefined : undefined,
          batch: finalRole === 'student' && batch !== 'N/A' ? batch : undefined,
          username: username || undefined,
        });

        if (!setupResult.success) {
          setError(setupResult.error || 'Failed to complete setup');
          setStep('student_details');
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
        schoolGrade: path === 'school' ? grade || null : null,
        schoolClassCode: path === 'school' ? selectedSchoolClass?.class_code ?? null : null,
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
      setStep(path === 'school' ? 'invite_code' : 'student_details');
    } finally {
      setIsLoading(false);
    }
  };

  const renderStepIndicator = () => {
    const currentStep = getStepNumber();
    const totalSteps = 2;

    return (
      <div className="flex items-center justify-center gap-2 mb-8">
        {Array.from({ length: totalSteps }).map((_, index) => (
          <div
            key={index}
            className={`h-2 rounded-full transition-all duration-300 ${
              index < currentStep - 1
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

  const renderInviteCodeStep = () => (
    <div className="space-y-6 animate-slide-up">
      <div className="text-center mb-6">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-300/30 bg-cyan-300/10 text-3xl shadow-[0_0_28px_rgba(34,211,238,0.18)]" aria-hidden>
          🏫
        </div>
        <h2 className="font-heading text-2xl font-bold text-white mb-2">
          Join your school
        </h2>
        <p className="text-gray-400">
          Enter the activation code your school gave you. That’s all we need to find your school.
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
          onClick={startIndependentSetup}
          className="w-full py-3 text-gray-400 hover:text-white transition-colors"
          disabled={isLoading}
        >
          Learn independently instead
        </button>

        <div className="pt-4 border-t border-gray-700">
          <button
            onClick={handleSchoolApplicationOpen}
            className="w-full text-center text-sm text-amber-200 hover:text-amber-100 transition-colors"
          >
            School owner or principal? Apply to add your school →
          </button>
        </div>
      </div>
    </div>
  );

  const renderStudentDetails = () => (
    <div className="space-y-6 animate-slide-up">
      <div className="text-center mb-6">
        <h2 className="font-heading text-2xl font-bold text-white mb-2">
          One last step
        </h2>
        <p className="text-gray-400">
          {path === 'school' && schoolName
            ? `Choose the grade and class ${schoolName} already configured for you.`
            : 'Add the essentials for your learner profile.'}
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
            value={grade}
            onChange={(e) => {
              setGrade(e.target.value);
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
            {(path === 'school' ? schoolGradeOptions : SOLO_GRADES.map(String)).map((g) => (
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
            {approvedClasses.filter((item) => classMatchesConfiguredGrade(item, grade)).map((item) => (
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
          onClick={() => {
            setPath('school');
            setGrade('');
            setBatch('N/A');
            setError(null);
            setStep('invite_code');
          }}
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
            {step === 'invite_code' && renderInviteCodeStep()}
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
          requesterRole="teacher"
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
