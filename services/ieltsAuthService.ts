import { supabase } from './supabaseClient';
import { ensureIeltsProfile } from './ieltsService';
import { getAuthRedirectUrl } from './env';

interface SignupPayload {
  email: string;
  password: string;
  username: string;
  fullName?: string;
}

export const login = async (email: string, password: string): Promise<void> => {
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw new Error(error.message);
  }

  await ensureIeltsProfile();
};

export const signup = async ({ email, password, username, fullName }: SignupPayload): Promise<{ requiresVerification: boolean }> => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        app_context: 'ielts_hub',
        ielts_username: username,
        full_name: fullName,
      },
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  const requiresVerification = !data.session;

  if (!requiresVerification) {
    await ensureIeltsProfile({ username, fullName: fullName ?? null });
  }

  return { requiresVerification };
};

export const logout = async (): Promise<void> => {
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw new Error(error.message);
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
    throw new Error(error.message);
  }
};
