import { supabase } from './supabaseClient';

/**
 * Check if the current user's email is verified
 */
export const isEmailVerified = async (): Promise<boolean> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return false;
    }

    // Check email_confirmed_at from auth metadata
    return !!user.email_confirmed_at;
  } catch (error) {
    console.error('Error checking email verification:', error);
    return false;
  }
};

/**
 * Resend verification email to current user
 */
export const resendVerificationEmail = async (): Promise<{ success: boolean; error?: string }> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user?.email) {
      return { success: false, error: 'No user email found' };
    }

    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: user.email,
    });

    if (error) {
      console.error('Error resending verification email:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Exception resending verification email:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to resend email' 
    };
  }
};
