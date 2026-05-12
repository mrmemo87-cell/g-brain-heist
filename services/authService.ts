import { supabase } from './supabaseClient';
import { createTeacherProfile } from './rpcGateway';
import { getAuthRedirectUrl, getEnvVar } from './env';
import { BAN_MESSAGE, isBannedFlag, storeBanMessage } from './banMessage';
import { EMAIL_ALREADY_REGISTERED_MESSAGE, toAuthSafeErrorMessage } from './authErrors';
import type { Batch, Grade } from '../types';

// Export supabase for use in components
export { supabase };

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

const getDefaultProfileUsername = (user: { email?: string; user_metadata?: Record<string, unknown> }): string => {
    const emailUsername = user.email?.split('@')[0] || 'user';
    const displayName = user.user_metadata?.['full_name'] || user.user_metadata?.['name'];
    return typeof displayName === 'string' && displayName.trim() ? displayName : emailUsername;
};

const buildSetupProfileUpsertPayload = async (
    user: { id: string; email?: string; user_metadata?: Record<string, unknown> },
    payload: IndividualSetupPayload,
): Promise<Record<string, unknown>> => {
    const { data: existingProfile, error: existingError } = await supabase
        .from('users')
        .select('username, avatar_url')
        .eq('id', user.id)
        .maybeSingle();

    if (existingError && existingError.code !== 'PGRST116') {
        throw new Error(existingError.message || 'Failed to read existing profile.');
    }

    const username = payload.username?.trim()
        || (typeof existingProfile?.username === 'string' && existingProfile.username.trim() ? existingProfile.username : null)
        || getDefaultProfileUsername(user);
    const avatarUrl = typeof existingProfile?.avatar_url === 'string' && existingProfile.avatar_url.trim()
        ? existingProfile.avatar_url
        : user.user_metadata?.['avatar_url'] || `https://picsum.photos/seed/${username}/100/100`;

    return {
        id: user.id,
        email: user.email ?? null,
        username,
        role: payload.role,
        needs_setup: false,
        updated_at: new Date().toISOString(),
        avatar_url: avatarUrl,
        grade: payload.role === 'student' ? payload.grade ?? null : null,
        batch: payload.role === 'student' ? payload.batch ?? null : null,
    };
};

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

    let data: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>['data'];
    let error: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>['error'];

    try {
        const result = await supabase.auth.signInWithPassword({
            email,
            password,
        });
        data = result.data;
        error = result.error;
    } catch (signInError) {
        const message = signInError instanceof Error ? signInError.message : String(signInError);
        const isAbortLike =
            (signInError instanceof DOMException && signInError.name === 'AbortError') ||
            /fetch is aborted|aborted/i.test(message);

        if (isAbortLike) {
            throw new Error('Login request timed out. Please check your internet connection and try again.');
        }

        throw new Error(message || 'Unable to reach login service. Please try again.');
    }
    
    if (error) {
        console.error('Login error:', error.message);
        if (/fetch is aborted|aborted/i.test(error.message)) {
            throw new Error('Login request timed out. Please check your internet connection and try again.');
        }
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
        throw new Error(toAuthSafeErrorMessage(error));
    }
    
    if (data.user) {
        console.log('User created:', data.user.id, 'Email:', data.user.email);
        
        // Profile will be created automatically by database trigger
        // No need to call RPC or wait for session
        
        // If schoolId provided, we still need to use profile_bootstrap for school joining
        if (schoolId) {
            // Wait for profile to be created by trigger
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            const { data: sessionData } = await supabase.auth.getSession();
            if (!sessionData.session) {
                // No session means email confirmation required
                console.log('Email confirmation required. Profile created, but school join will happen after confirmation.');
                return { success: true };
            }
            
            const bootstrapResult = await bootstrapProfile(
                schoolId,
                role,
                role === 'student' ? grade : undefined,
                role === 'student' ? batch : undefined,
                username
            );
            
            if (!bootstrapResult.success) {
                console.error('Profile bootstrap failed:', bootstrapResult.error);
                throw new Error(toAuthSafeErrorMessage(bootstrapResult.error || 'Failed to join school'));
            }
            
            console.log('Signup successful with school join:', data.user.email);
            return { success: true };
        }
        
        console.log('Signup successful, profile will be created automatically:', data.user.email);
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

/**
 * Check if the current user's email is verified
 * @returns {Promise<{isVerified: boolean, email: string | undefined}>}
 */
export const checkEmailVerification = async (): Promise<{
    isVerified: boolean;
    email: string | undefined;
    user: any;
}> => {
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error || !user) {
        return { isVerified: false, email: undefined, user: null };
    }

    // Check if email_confirmed_at exists and is not null
    const isVerified = !!user.email_confirmed_at;
    
    return {
        isVerified,
        email: user.email,
        user,
    };
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
    const { data: existingProfile, error: existingProfileError } = await supabase
        .from('users')
        .select('id')
        .eq('id', user.id)
        .maybeSingle();

    if (existingProfileError && existingProfileError.code !== 'PGRST116') {
        throw new Error(`Failed to load user profile: ${existingProfileError.message}`);
    }

    if (existingProfile) {
        return; // Profile already exists
    }

    if (user.email) {
        const { data: profileByEmail, error: emailLookupError } = await supabase
            .from('users')
            .select('id')
            .ilike('email', user.email)
            .maybeSingle();

        if (emailLookupError && emailLookupError.code !== 'PGRST116') {
            throw new Error(`Failed to verify user profile email: ${emailLookupError.message}`);
        }

        if (profileByEmail && profileByEmail.id !== user.id) {
            throw new Error(EMAIL_ALREADY_REGISTERED_MESSAGE);
        }
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
        .upsert(profileData, { onConflict: 'id' });

    if (profileError) {
        console.error('OAuth profile creation error:', profileError);
        throw new Error(toAuthSafeErrorMessage(profileError));
    }

    console.log('OAuth profile created successfully for:', user.email);
};

// Send password reset email
export const sendPasswordResetEmail = async (email: string): Promise<void> => {
    console.log(`Sending password reset email to ${email}`);
    
    // Use production URL or current origin for password reset
    const siteUrl = getEnvVar('VITE_SITE_URL') || 
                    (typeof window !== 'undefined' ? window.location.origin : 'https://www.brainsheist.com');
    const redirectTo = `${siteUrl}/auth/reset`;
    
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
    });
    
    if (error) {
        console.error('Password reset error:', error.message);
        throw new Error(error.message);
    }
    
    console.log('Password reset email sent successfully to redirect:', redirectTo);
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
    
    // Check email verification
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email_confirmed_at) {
        return { success: false, error: 'Please verify your email before joining a school' };
    }
    
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

    let upsertPayload: Record<string, unknown>;
    try {
        upsertPayload = await buildSetupProfileUpsertPayload(authData.user, payload);
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to prepare setup profile.' };
    }

    const { error } = await supabase
        .from('users')
        .upsert(upsertPayload, { onConflict: 'id' });

    if (error) {
        return { success: false, error: error.message || 'Failed to complete setup.' };
    }

    return {
        success: true,
        user_id: authData.user.id,
        role: payload.role,
        username: String(upsertPayload['username'] ?? ''),
    };
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

    let upsertPayload: Record<string, unknown>;
    try {
        upsertPayload = await buildSetupProfileUpsertPayload(authData.user, payload);
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to prepare setup profile.' };
    }

    const { error } = await supabase
        .from('users')
        .upsert(upsertPayload, { onConflict: 'id' });

    if (error) {
        return { success: false, error: error.message || 'Failed to complete setup.' };
    }

    return {
        success: true,
        user_id: authData.user.id,
        role: payload.role,
        username: String(upsertPayload['username'] ?? ''),
    };
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
    // Check email verification
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email_confirmed_at) {
        return { success: false, error: 'Please verify your email before joining a school' };
    }

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
