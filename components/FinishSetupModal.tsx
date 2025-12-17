import React, { useState, useEffect, useMemo } from 'react';
import * as AuthService from '../services/authService';
import type { School } from '../services/authService';
import type { Batch, Grade } from '../types';

interface FinishSetupModalProps {
    onComplete: () => void;
    onLogout: () => void;
    initialUsername?: string;
}

const FinishSetupModal: React.FC<FinishSetupModalProps> = ({ 
    onComplete, 
    onLogout,
    initialUsername 
}) => {
    const [step, setStep] = useState<'school' | 'role' | 'details'>('school');
    const [schools, setSchools] = useState<School[]>([]);
    const [selectedSchool, setSelectedSchool] = useState<School | null>(null);
    const [inviteCode, setInviteCode] = useState('');
    const [useInviteCode, setUseInviteCode] = useState(false);
    const [role, setRole] = useState<'student' | 'teacher'>('student');
    const [grade, setGrade] = useState<Grade | null>(null);
    const [batch, setBatch] = useState<Batch | ''>('');
    const [username, setUsername] = useState(initialUsername || '');
    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingSchools, setIsLoadingSchools] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Fetch available schools on mount
    useEffect(() => {
        const fetchSchools = async () => {
            setIsLoadingSchools(true);
            try {
                const schoolList = await AuthService.getAvailableSchools();
                setSchools(schoolList);
                
                // Auto-select if only one school
                if (schoolList.length === 1) {
                    setSelectedSchool(schoolList[0]);
                }
            } catch (err) {
                console.error('Failed to load schools:', err);
                setError('Failed to load schools. Please try again.');
            } finally {
                setIsLoadingSchools(false);
            }
        };
        
        fetchSchools();
    }, []);

    const gradeChoices = useMemo<Grade[]>(() => [6, 7, 8, 9, 10, 11, 12], []);
    
    const gradeOptions: Record<Grade, Batch[]> = useMemo(() => {
        const classLetters: Array<'A' | 'B' | 'C'> = ['A', 'B', 'C'];
        return gradeChoices.reduce((acc, currentGrade) => {
            acc[currentGrade] = classLetters.map((letter) => `${currentGrade}${letter}` as Batch);
            return acc;
        }, {} as Record<Grade, Batch[]>);
    }, [gradeChoices]);

    const availableBatches = grade ? gradeOptions[grade] : [];

    const handleGradeChange = (value: string) => {
        if (!value) {
            setGrade(null);
            setBatch('');
            return;
        }
        const parsedGrade = Number(value) as Grade;
        setGrade(parsedGrade);
        
        const batches = gradeOptions[parsedGrade];
        if (!batches.includes(batch as Batch)) {
            setBatch(batches[0]);
        }
    };

    const handleInviteCodeSubmit = async () => {
        if (!inviteCode.trim()) {
            setError('Please enter an invite code');
            return;
        }
        
        setIsLoading(true);
        setError(null);
        
        try {
            const result = await AuthService.validateInviteCode(inviteCode.trim());
            
            if (!result.valid) {
                setError(result.error || 'Invalid invite code');
                return;
            }
            
            // Find the school in our list or create a temp object
            const school = schools.find(s => s.id === result.school_id) || {
                id: result.school_id!,
                name: result.school_name!,
                slug: result.school_slug!,
                logo_url: null,
                allow_student_signup: true,
                allow_teacher_signup: true,
            };
            
            setSelectedSchool(school);
            setStep('role');
        } catch (err) {
            setError('Failed to validate invite code');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSchoolSelect = (school: School) => {
        setSelectedSchool(school);
        setStep('role');
    };

    const handleRoleSelect = (selectedRole: 'student' | 'teacher') => {
        // Check if school allows this role
        if (selectedRole === 'student' && !selectedSchool?.allow_student_signup) {
            setError('This school is not accepting student signups');
            return;
        }
        if (selectedRole === 'teacher' && !selectedSchool?.allow_teacher_signup) {
            setError('This school is not accepting teacher signups');
            return;
        }
        
        setRole(selectedRole);
        setError(null);
        
        // Teachers can skip to completion, students need grade/batch
        if (selectedRole === 'teacher') {
            handleComplete(selectedRole);
        } else {
            setStep('details');
        }
    };

    const handleComplete = async (finalRole?: 'student' | 'teacher') => {
        const roleToUse = finalRole || role;
        
        if (!selectedSchool) {
            setError('Please select a school');
            return;
        }
        
        if (roleToUse === 'student' && (!grade || !batch)) {
            setError('Please select your grade and class');
            return;
        }
        
        setIsLoading(true);
        setError(null);
        
        try {
            const result = await AuthService.bootstrapProfile(
                selectedSchool.id,
                roleToUse,
                roleToUse === 'student' ? grade! : undefined,
                roleToUse === 'student' ? batch as Batch : undefined,
                username || undefined
            );
            
            if (!result.success) {
                setError(result.error || 'Failed to complete setup');
                return;
            }
            
            onComplete();
        } catch (err: any) {
            setError(err.message || 'Failed to complete setup');
        } finally {
            setIsLoading(false);
        }
    };

    const renderSchoolStep = () => (
        <div className="space-y-6">
            <div className="text-center">
                <h2 className="text-2xl font-bold text-white mb-2">Welcome, Agent! 🎮</h2>
                <p className="text-gray-400">
                    Let's get you set up. First, select your school.
                </p>
            </div>

            {isLoadingSchools ? (
                <div className="text-center py-8">
                    <div className="animate-spin h-8 w-8 border-2 border-cyan-400 border-t-transparent rounded-full mx-auto mb-2" />
                    <p className="text-gray-400">Loading schools...</p>
                </div>
            ) : (
                <>
                    {/* School List */}
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                        {schools.map((school) => (
                            <button
                                key={school.id}
                                onClick={() => handleSchoolSelect(school)}
                                className="w-full p-4 rounded-lg border-2 border-gray-600 bg-gray-800/50 text-left hover:border-cyan-400 hover:bg-cyan-400/10 transition-all group"
                            >
                                <div className="flex items-center gap-3">
                                    {school.logo_url ? (
                                        <img 
                                            src={school.logo_url} 
                                            alt={school.name}
                                            className="w-10 h-10 rounded-full object-cover"
                                        />
                                    ) : (
                                        <div className="w-10 h-10 rounded-full bg-cyan-400/20 flex items-center justify-center text-cyan-400 text-lg font-bold">
                                            {school.name.charAt(0)}
                                        </div>
                                    )}
                                    <div>
                                        <div className="font-semibold text-white group-hover:text-cyan-400 transition-colors">
                                            {school.name}
                                        </div>
                                        <div className="text-xs text-gray-500">
                                            {school.allow_student_signup && school.allow_teacher_signup 
                                                ? 'Students & Teachers'
                                                : school.allow_student_signup 
                                                    ? 'Students only'
                                                    : 'Teachers only'
                                            }
                                        </div>
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>

                    {/* Invite Code Option */}
                    <div className="border-t border-gray-700 pt-4">
                        {!useInviteCode ? (
                            <button
                                onClick={() => setUseInviteCode(true)}
                                className="w-full text-center text-cyan-400 hover:text-cyan-300 text-sm py-2"
                            >
                                Have an invite code? Click here
                            </button>
                        ) : (
                            <div className="space-y-3">
                                <label className="block text-sm font-medium text-gray-300">
                                    Enter Invite Code
                                </label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={inviteCode}
                                        onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                                        placeholder="XXXXXXXX"
                                        className="flex-1 bg-gray-800 border border-gray-600 rounded-md p-3 text-white uppercase tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-cyan-400"
                                        maxLength={8}
                                    />
                                    <button
                                        onClick={handleInviteCodeSubmit}
                                        disabled={isLoading || !inviteCode.trim()}
                                        className="px-4 py-2 bg-cyan-400 text-gray-900 rounded-md font-semibold hover:bg-cyan-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    >
                                        {isLoading ? '...' : 'Join'}
                                    </button>
                                </div>
                                <button
                                    onClick={() => {
                                        setUseInviteCode(false);
                                        setInviteCode('');
                                    }}
                                    className="text-gray-500 hover:text-gray-400 text-xs"
                                >
                                    ← Back to school list
                                </button>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );

    const renderRoleStep = () => (
        <div className="space-y-6">
            <div className="text-center">
                <button
                    onClick={() => {
                        setStep('school');
                        setSelectedSchool(null);
                    }}
                    className="text-cyan-400 hover:text-cyan-300 text-sm mb-4"
                >
                    ← Change school
                </button>
                <h2 className="text-2xl font-bold text-white mb-2">What's your role?</h2>
                <p className="text-gray-400">
                    Joining <span className="text-cyan-400 font-semibold">{selectedSchool?.name}</span>
                </p>
            </div>

            <div className="flex gap-4">
                <button
                    onClick={() => handleRoleSelect('student')}
                    disabled={!selectedSchool?.allow_student_signup}
                    className={`flex-1 py-6 px-4 rounded-xl border-2 transition-all ${
                        selectedSchool?.allow_student_signup
                            ? 'border-cyan-400/50 bg-cyan-400/10 text-white hover:border-cyan-400 hover:bg-cyan-400/20'
                            : 'border-gray-700 bg-gray-800/30 text-gray-500 cursor-not-allowed'
                    }`}
                >
                    <div className="text-4xl mb-2">🎓</div>
                    <div className="font-bold text-lg">Student</div>
                    <div className="text-xs text-gray-400 mt-1">
                        Join classes & compete
                    </div>
                </button>

                <button
                    onClick={() => handleRoleSelect('teacher')}
                    disabled={!selectedSchool?.allow_teacher_signup}
                    className={`flex-1 py-6 px-4 rounded-xl border-2 transition-all ${
                        selectedSchool?.allow_teacher_signup
                            ? 'border-purple-400/50 bg-purple-400/10 text-white hover:border-purple-400 hover:bg-purple-400/20'
                            : 'border-gray-700 bg-gray-800/30 text-gray-500 cursor-not-allowed'
                    }`}
                >
                    <div className="text-4xl mb-2">👨‍🏫</div>
                    <div className="font-bold text-lg">Teacher</div>
                    <div className="text-xs text-gray-400 mt-1">
                        Create content & manage
                    </div>
                </button>
            </div>
        </div>
    );

    const renderDetailsStep = () => (
        <div className="space-y-6">
            <div className="text-center">
                <button
                    onClick={() => setStep('role')}
                    className="text-cyan-400 hover:text-cyan-300 text-sm mb-4"
                >
                    ← Change role
                </button>
                <h2 className="text-2xl font-bold text-white mb-2">Almost there!</h2>
                <p className="text-gray-400">
                    Just a few more details, Agent.
                </p>
            </div>

            {/* Username (optional edit) */}
            <div>
                <label htmlFor="setup-username" className="block text-sm font-medium text-gray-300">
                    Your Codename
                </label>
                <input
                    id="setup-username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="mt-1 block w-full bg-gray-800 border border-gray-600 rounded-md p-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                    placeholder="Enter a username"
                />
            </div>

            {/* Grade Selection */}
            <div>
                <label htmlFor="setup-grade" className="block text-sm font-medium text-gray-300">
                    Grade
                </label>
                <select
                    id="setup-grade"
                    value={grade ?? ''}
                    onChange={(e) => handleGradeChange(e.target.value)}
                    className="mt-1 block w-full bg-gray-800 border border-gray-600 rounded-md p-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-400"
                >
                    <option value="">Select your grade</option>
                    {gradeChoices.map((g) => (
                        <option key={g} value={g}>Grade {g}</option>
                    ))}
                </select>
            </div>

            {/* Batch Selection */}
            <div>
                <label htmlFor="setup-batch" className="block text-sm font-medium text-gray-300">
                    Class
                </label>
                <select
                    id="setup-batch"
                    value={batch}
                    onChange={(e) => setBatch(e.target.value as Batch)}
                    disabled={!grade}
                    className="mt-1 block w-full bg-gray-800 border border-gray-600 rounded-md p-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <option value="">{grade ? 'Select your class' : 'Choose a grade first'}</option>
                    {availableBatches.map((b) => {
                        const classLetter = b.replace(String(grade ?? ''), '');
                        return (
                            <option key={b} value={b}>Class {classLetter} ({b})</option>
                        );
                    })}
                </select>
            </div>

            {/* Complete Button */}
            <button
                onClick={() => handleComplete()}
                disabled={isLoading || !grade || !batch}
                className="w-full py-3 px-4 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-lg font-bold text-lg hover:from-cyan-400 hover:to-blue-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-cyan-500/25"
            >
                {isLoading ? (
                    <span className="flex items-center justify-center gap-2">
                        <span className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
                        Setting up...
                    </span>
                ) : (
                    '🚀 Start Playing!'
                )}
            </button>
        </div>
    );

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="w-full max-w-md bg-gray-900 border border-gray-700 rounded-2xl p-6 shadow-2xl shadow-cyan-500/10">
                {/* Logo */}
                <div className="text-center mb-6">
                    <img 
                        src="/logo.png" 
                        alt="Brains Heist" 
                        className="w-16 h-16 mx-auto mb-2 drop-shadow-[0_0_10px_rgba(59,130,246,0.5)]"
                    />
                </div>

                {/* Error Display */}
                {error && (
                    <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm text-center">
                        {error}
                    </div>
                )}

                {/* Step Content */}
                {step === 'school' && renderSchoolStep()}
                {step === 'role' && renderRoleStep()}
                {step === 'details' && renderDetailsStep()}

                {/* Logout Option */}
                <div className="mt-6 text-center border-t border-gray-700 pt-4">
                    <button
                        onClick={onLogout}
                        className="text-gray-500 hover:text-gray-400 text-sm"
                    >
                        Sign out and use a different account
                    </button>
                </div>
            </div>
        </div>
    );
};

export default FinishSetupModal;
