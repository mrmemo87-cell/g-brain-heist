import { supabase } from './supabaseClient';

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
                const { error: teacherError } = await supabase.rpc('create_teacher_profile', {
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
