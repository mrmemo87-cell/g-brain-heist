import { supabase } from './supabaseClient';
import { ensureIeltsProfile } from './ieltsService';
import { getAuthRedirectUrl } from './env';
import { startOAuthSignIn } from './oauthSignIn';
import { toAuthSafeErrorMessage } from './authErrors';

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
    throw new Error(toAuthSafeErrorMessage(error));
  }

  await ensureIeltsProfile();
};

export const signup = async ({ email, password, username, fullName }: SignupPayload): Promise<{ requiresVerification: boolean }> => {
  // The confirmation email returns through the auth callback; the callback then opens the saved IELTS intent.
  const emailRedirectTo = getAuthRedirectUrl();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      ...(emailRedirectTo ? { emailRedirectTo } : {}),
      data: {
        app_context: 'ielts_hub',
        ielts_username: username,
        full_name: fullName,
      },
    },
  });

  if (error) {
    throw new Error(toAuthSafeErrorMessage(error));
  }

  const requiresVerification = !data.session;

  if (!requiresVerification) {
    await ensureIeltsProfile({ username, fullName: fullName ?? null });
  }

  return { requiresVerification };
};

// Learners in Instagram's in-app browser can't easily open the emailed link in the same browser, so they
// type the six-digit code from the same email instead; this signs them in right here.
export const verifySignupCode = async (
  email: string, code: string, profile: { username: string; fullName?: string },
): Promise<void> => {
  const token = code.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(token)) throw new Error('Enter the six-digit code from your confirmation email.');
  const { data, error } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token, type: 'signup' });
  if (error) throw new Error(toAuthSafeErrorMessage(error));
  if (!data.session) throw new Error('This code did not sign you in. Please request a new code.');
  await ensureIeltsProfile({ username: profile.username, fullName: profile.fullName ?? null });
};

export const resendSignupCode = async (email: string): Promise<void> => {
  const emailRedirectTo = getAuthRedirectUrl();
  const { error } = await supabase.auth.resend({
    type: 'signup', email: email.trim().toLowerCase(), ...(emailRedirectTo ? { options: { emailRedirectTo } } : {}),
  });
  if (error) throw new Error(toAuthSafeErrorMessage(error));
};

export const logout = async (): Promise<void> => {
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw new Error(error.message);
  }
};

export const loginWithGoogle = async (loginHint?: string): Promise<void> => {
  const redirectTo = getAuthRedirectUrl();

  const { error } = await startOAuthSignIn('google', {
    redirectTo,
    queryParams: loginHint ? { login_hint: loginHint } : { prompt: 'select_account' },
  });

  if (error) {
    throw new Error(error.message);
  }
};
