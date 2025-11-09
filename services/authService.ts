import { supabase } from './supabaseClient';
import { createTeacherProfile } from './rpcGateway';

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
        console.log('Login successful:', data.user.email);
        return { success: true };
    }
    
    throw new Error('Login failed');
};

export const signup = async (email: string, password: string, username: string, role: 'student' | 'teacher', batch?: string): Promise<{ success: boolean }> => {
    console.log(`Attempting signup for ${email} as ${role}`);
    
    // Sign up with Supabase Auth
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: {
                username,
                role,
                batch: role === 'student' ? batch : undefined,
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
        
        // Create user profile in users table
        const profileData: any = {
            id: data.user.id,
            email,
            username,
            role,
            avatar_url: `https://picsum.photos/seed/${username}/100/100`,
        };
        
        // Only add batch for students
        if (role === 'student') {
            profileData.batch = batch;
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
                    school_name: null,
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
    // Construct proper redirect URI that matches Supabase auth config
    const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : undefined;

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
    const displayName = user.user_metadata?.full_name || user.user_metadata?.name;
    const username = displayName || emailUsername;

    // Create user profile with default student role
    const profileData = {
        id: user.id,
        email: user.email,
        username: username,
        role: 'student', // Default to student for OAuth users
        batch: '8A', // Default batch
        avatar_url: user.user_metadata?.avatar_url || `https://picsum.photos/seed/${username}/100/100`,
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
