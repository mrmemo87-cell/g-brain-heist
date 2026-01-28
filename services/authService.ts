import { supabase } from './supabaseClient';
import { createTeacherProfile } from './rpcGateway';
import { getAuthRedirectUrl } from './env';
import { BAN_MESSAGE, isBannedFlag, storeBanMessage } from './banMessage';
import type { Batch, Grade } from '../types';

// ============================================
// Multi-Tenant Types
// ============================================
export interface School {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
    allow_student_signup: boolean;
    allow_teacher_signup: boolean;
}

export interface UserSetupStatus {
    authenticated: boolean;
    needs_setup: boolean;
    reason?: 'no_profile' | 'incomplete_profile';
    has_username?: boolean;
    has_role?: boolean;
    user_id?: string;
    username?: string;
    role?: string;
    school_id?: string;
}

export interface ProfileBootstrapResult {
    success: boolean;
    error?: string;
    user_id?: string;
    school_id?: string;
    role?: string;
    username?: string;
}

export interface IndividualSetupPayload {
    role: 'student' | 'teacher';
    grade?: Grade;
    batch?: Batch;
    username?: string;
}

export interface InviteCodeResult {
    valid: boolean;
    error?: string;
    school_id?: string;
    school_name?: string;
    school_slug?: string;
}

export interface JoinSchoolByCodeResult {
    success: boolean;
    error?: string;
    message?: string;
    school?: {
        id: string;
        name: string;
        slug: string;
    };
}

export const login = async (email: string, password: string): Promise<{ success: boolean }> => {
    console.log(`Attempting login for ${email}`);
    
    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
    });
    
    if (error) {
        console.error('Login error:', error.message);
        throw new Error(error.message);
    }
    
    if (data.user) {
        try {
            const { data: profile, error: profileError } = await supabase
                .from('users')
                .select('is_banned')
                .eq('id', data.user.id)
                .single();

            // If profile doesn't exist (PGRST116 = no rows), create it
            if (profileError && profileError.code === 'PGRST116') {
                console.log('Profile not found, creating profile for existing auth user...');
                await createOAuthProfile();
                console.log('Profile created successfully');
            } else if (profileError) {
                console.error('Profile lookup error during login:', profileError.message);
                throw new Error('Unable to load user profile. Please try again later.');
            } else if (isBannedFlag(profile?.is_banned)) {
                await supabase.auth.signOut();
                storeBanMessage(BAN_MESSAGE);
                throw new Error(BAN_MESSAGE);
            }
        } catch (lookupError) {
            if (lookupError instanceof Error && lookupError.message === BAN_MESSAGE) {
                throw lookupError;
            }
            console.error('Login post-check failed:', lookupError);
            throw lookupError instanceof Error
                ? lookupError
                : new Error('Login failed due to an unexpected error.');
        }

        console.log('Login successful:', data.user.email);
        return { success: true };
    }
    
    throw new Error('Login failed');
};

export const signup = async (
    email: string,
    password: string,
    username: string,
    role: 'student' | 'teacher',
    grade?: Grade,
    batch?: Batch,
    school?: string,
    schoolId?: string  // New: school UUID for multi-tenant
): Promise<{ success: boolean }> => {
    console.log(`Attempting signup for ${email} as ${role}`);
    
    // Sign up with Supabase Auth
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            emailRedirectTo: getAuthRedirectUrl(),
            data: {
                username,
                role,
                grade,
                batch: role === 'student' ? batch : undefined,
                school,
                school_id: schoolId,
            }
        }
    });
    
    if (error) {
        console.error('Signup error:', error.message);
        throw new Error(error.message);
    }
    
    if (data.user) {
        // Wait a moment for auth to propagate
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // If schoolId provided, use the profile_bootstrap RPC for proper multi-tenant setup
        if (schoolId) {
            const bootstrapResult = await bootstrapProfile(
                schoolId,
                role,
                role === 'student' ? grade : undefined,
                role === 'student' ? batch : undefined,
                username
            );
            
            if (!bootstrapResult.success) {
                console.error('Profile bootstrap failed:', bootstrapResult.error);
                throw new Error(bootstrapResult.error || 'Failed to create user profile');
            }
            
            console.log('Signup successful with multi-tenant bootstrap:', data.user.email);
            return { success: true };
        }
        
        // Legacy fallback: Create user profile directly (for backwards compatibility)
        const profileData: Record<string, unknown> = {
            id: data.user.id,
            email,
            username,
            role,
            avatar_url: `https://picsum.photos/seed/${username}/100/100`,
        };

        // Only add batch for students
        if (role === 'student') {
            profileData['grade'] = grade ?? 6;
            profileData['batch'] = batch;
        } else {
            profileData['grade'] = null;
            profileData['batch'] = null;
        }
        
        const { error: profileError } = await supabase
            .from('users')
            .insert(profileData);
        
        if (profileError) {
            console.error('Profile creation error:', profileError);
            throw new Error(`Failed to create user profile: ${profileError.message} (${profileError.code})`);
        }

        // If teacher, try to create teacher profile automatically
        // Note: This requires the teacher_question_system.sql to be run first
        if (role === 'teacher') {
            try {
                const { error: teacherError } = await createTeacherProfile({
                    school_name: school ?? null,
                    subject_specializations: [],
                    bio: null
                });

                if (teacherError) {
                    console.warn('Teacher profile will be created on first portal access:', teacherError.message);
                    // Don't throw error - profile will be created when they open teacher portal
                }
            } catch (err) {
                console.warn('Teacher profile setup pending - will be created on first portal access');
                // Ignore - not critical for signup
            }
        }
        
        console.log('Signup successful:', data.user.email);
        return { success: true };
    }
    
    throw new Error('Signup failed');
};

export const logout = async (): Promise<void> => {
    console.log('Logging out');
    const { error } = await supabase.auth.signOut();
    if (error) {
        console.error('Logout error:', error.message);
        throw error;
    }
};

export const loginWithGoogle = async (): Promise<void> => {
    const redirectTo = getAuthRedirectUrl();

    const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo,
            queryParams: {
                access_type: 'offline',
                prompt: 'consent',
            },
        },
    });

    if (error) {
        console.error('Google sign-in error:', error.message);
        throw new Error(error.message);
    }
};

// Create profile for OAuth users (Google sign-in)
export const createOAuthProfile = async (): Promise<void> => {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
        throw new Error('Not authenticated');
    }

    // Check if profile already exists
    const { data: existingProfile } = await supabase
        .from('users')
        .select('id')
        .eq('id', user.id)
        .single();

    if (existingProfile) {
        return; // Profile already exists
    }

    // Extract username from email or use name from OAuth provider
    const emailUsername = user.email?.split('@')[0] || 'user';
    const displayName = user.user_metadata?.['full_name'] || user.user_metadata?.['name'];
    const username = displayName || emailUsername;

    // Create user profile with default student role
    const profileData = {
        id: user.id,
        email: user.email,
        username: username,
        role: 'student', // Default to student for OAuth users
        grade: 6 as Grade,
        batch: '6A' as Batch, // Default batch
        school: user.user_metadata?.['school'] || null, // Will be set during setup
        avatar_url: user.user_metadata?.['avatar_url'] || `https://picsum.photos/seed/${username}/100/100`,
    };

    const { error: profileError } = await supabase
        .from('users')
        .insert(profileData);

    if (profileError) {
        console.error('OAuth profile creation error:', profileError);
        throw new Error(`Failed to create user profile: ${profileError.message}`);
    }

    console.log('OAuth profile created successfully for:', user.email);
};

// Send password reset email
export const sendPasswordResetEmail = async (email: string): Promise<void> => {
    console.log(`Sending password reset email to ${email}`);
    
    const redirectTo = getAuthRedirectUrl();
    
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
    });
    
    if (error) {
        console.error('Password reset error:', error.message);
        throw new Error(error.message);
    }
    
    console.log('Password reset email sent successfully');
};

// Update password (after clicking reset link)
export const updatePassword = async (newPassword: string): Promise<void> => {
    console.log('Updating password');
    
    const { error } = await supabase.auth.updateUser({
        password: newPassword,
    });
    
    if (error) {
        console.error('Password update error:', error.message);
        throw new Error(error.message);
    }
    
    console.log('Password updated successfully');
};

// ============================================
// Multi-Tenant Functions
// ============================================

/**
 * Get list of available schools for signup
 * This is the primary way to populate the school dropdown
 */
export const getAvailableSchools = async (): Promise<School[]> => {
    console.log('Fetching available schools...');
    
    const { data, error } = await supabase.rpc('get_available_schools');
    
    if (error) {
        console.error('Error fetching schools:', error.message);
        // Return empty array instead of throwing - allows graceful fallback
        return [];
    }
    
    console.log(`Found ${data?.length ?? 0} schools`);
    return data || [];
};

/**
 * Check if current user needs to complete profile setup
 * Used for OAuth users who authenticated but haven't picked school/role
 */
export const checkUserSetupStatus = async (): Promise<UserSetupStatus> => {
    const { data, error } = await supabase.rpc('check_user_setup_status');
    
    if (error) {
        console.error('Error checking setup status:', error.message);
        return { authenticated: false, needs_setup: false };
    }
    
    return data as UserSetupStatus;
};

/**
 * Bootstrap user profile with school and role
 * Called after OAuth login or when completing setup
 */
export const bootstrapProfile = async (
    schoolId: string,
    role: 'student' | 'teacher',
    grade?: Grade,
    batch?: Batch,
    username?: string
): Promise<ProfileBootstrapResult> => {
    console.log(`Bootstrapping profile: school=${schoolId}, role=${role}`);
    
    const { data, error } = await supabase.rpc('profile_bootstrap', {
        p_school_id: schoolId,
        p_role: role,
        p_grade: role === 'student' ? grade : null,
        p_batch: role === 'student' ? batch : null,
        p_username: username || null,
    });
    
    if (error) {
        console.error('Profile bootstrap RPC error:', error.message);
        return { success: false, error: error.message };
    }
    
    const result = data as ProfileBootstrapResult;
    
    if (result.success) {
        console.log('Profile bootstrap successful:', result);
    } else {
        console.error('Profile bootstrap failed:', result.error);
    }
    
    return result;
};

/**
 * Complete setup without school membership (Individuals mode)
 */
export const completeIndividualSetup = async (
    payload: IndividualSetupPayload
): Promise<ProfileBootstrapResult> => {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) {
        return { success: false, error: 'Not authenticated' };
    }

    const updates: Record<string, unknown> = {
        role: payload.role,
        needs_setup: false,
        updated_at: new Date().toISOString(),
    };

    if (payload.username) {
        updates['username'] = payload.username;
    }

    if (payload.role === 'student') {
        updates['grade'] = payload.grade ?? null;
        updates['batch'] = payload.batch ?? null;
    } else {
        updates['grade'] = null;
        updates['batch'] = null;
    }

    const { error } = await supabase
        .from('users')
        .update(updates)
        .eq('id', authData.user.id);

    if (error) {
        return { success: false, error: error.message || 'Failed to complete setup.' };
    }

    return { success: true, user_id: authData.user.id, role: payload.role };
};

/**
 * Complete profile setup details without changing school membership.
 */
export const completeProfileSetup = async (
    payload: IndividualSetupPayload
): Promise<ProfileBootstrapResult> => {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) {
        return { success: false, error: 'Not authenticated' };
    }

    const updates: Record<string, unknown> = {
        role: payload.role,
        needs_setup: false,
        updated_at: new Date().toISOString(),
    };

    if (payload.username) {
        updates['username'] = payload.username;
    }

    if (payload.role === 'student') {
        updates['grade'] = payload.grade ?? null;
        updates['batch'] = payload.batch ?? null;
    } else {
        updates['grade'] = null;
        updates['batch'] = null;
    }

    const { error } = await supabase
        .from('users')
        .update(updates)
        .eq('id', authData.user.id);

    if (error) {
        return { success: false, error: error.message || 'Failed to complete setup.' };
    }

    return { success: true, user_id: authData.user.id, role: payload.role };
};

/**
 * Validate an invite code and get school info
 */
export const validateInviteCode = async (code: string): Promise<InviteCodeResult> => {
    const { data, error } = await supabase.rpc('validate_invite_code', {
        p_code: code
    });
    
    if (error) {
        console.error('Error validating invite code:', error.message);
        return { valid: false, error: 'Failed to validate invite code' };
    }
    
    return data as InviteCodeResult;
};

/**
 * Join a school by invite code.
 */
export const joinSchoolByCode = async (
    code: string,
    role: 'student' | 'teacher'
): Promise<JoinSchoolByCodeResult> => {
    const { data, error } = await supabase.rpc('join_school_by_code', {
        p_invite_code: code,
        p_role: role,
    });

    if (error) {
        console.error('Error joining school by code:', error.message);
        return { success: false, error: 'Failed to join school by code' };
    }

    return data as JoinSchoolByCodeResult;
};

/**
 * Updated OAuth profile creation for multi-tenant
 * Now marks user as needing setup instead of auto-assigning defaults
 */
export const createOAuthProfileMultiTenant = async (): Promise<{ needsSetup: boolean }> => {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
        throw new Error('Not authenticated');
    }

    // Check if profile already exists and is complete
    const { data: existingProfile } = await supabase
        .from('users')
        .select('id, school_id, needs_setup')
        .eq('id', user.id)
        .single();

    if (existingProfile && existingProfile.school_id && !existingProfile.needs_setup) {
        return { needsSetup: false }; // Profile is complete
    }

    if (existingProfile) {
        // Profile exists but incomplete - mark for setup
        await supabase
            .from('users')
            .update({ needs_setup: true, updated_at: new Date().toISOString() })
            .eq('id', user.id);
        return { needsSetup: true };
    }

    // Create minimal profile marked for setup
    const emailUsername = user.email?.split('@')[0] || 'user';
    const displayName = user.user_metadata?.['full_name'] || user.user_metadata?.['name'];
    const username = displayName || emailUsername;

    const { error: profileError } = await supabase
        .from('users')
        .insert({
            id: user.id,
            email: user.email,
            username: username,
            needs_setup: true,  // Mark for setup
            avatar_url: user.user_metadata?.['avatar_url'] || `https://picsum.photos/seed/${username}/100/100`,
        });

    if (profileError) {
        console.error('OAuth profile creation error:', profileError);
        throw new Error(`Failed to create user profile: ${profileError.message}`);
    }

    console.log('OAuth profile created (needs setup) for:', user.email);
    return { needsSetup: true };
};
