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

export const signup = async (email: string, password: string, username: string, batch: string): Promise<{ success: boolean }> => {
    console.log(`Attempting signup for ${email}`);
    
    // Sign up with Supabase Auth
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: {
                username,
                batch,
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
        const { error: profileError } = await supabase
            .from('users')
            .insert({
                id: data.user.id,
                email,
                username,
                batch,
                avatar_url: `https://picsum.photos/seed/${username}/100/100`,
            });
        
        if (profileError) {
            console.error('Profile creation error:', profileError);
            // More detailed error message
            throw new Error(`Failed to create user profile: ${profileError.message} (${profileError.code})`);
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
