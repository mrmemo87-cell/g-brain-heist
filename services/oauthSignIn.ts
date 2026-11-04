// Google sign-in that works both on the website and inside the iPhone/Android app.
//
// Website: unchanged — Supabase redirects this tab to Google and back to /auth/callback.
// App: Google refuses sign-in inside embedded web views, so the app opens the system browser
// (Safari view / Chrome Custom Tab) and Supabase returns to brainsheist://auth/callback#tokens.
// src/native/nativeShell.ts catches that link, closes the browser and loads /auth/callback in the app,
// where Supabase reads the tokens exactly as it does on the website.

import type { Provider } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import { isNativeApp, nativeAuthRedirect } from '../src/lib/nativePlatform';

export interface OAuthStartOptions {
  redirectTo?: string;
  queryParams?: Record<string, string>;
}

export async function startOAuthSignIn(provider: Provider, options: OAuthStartOptions = {}): Promise<{ error: Error | null }> {
  if (!isNativeApp()) {
    const { error } = await supabase.auth.signInWithOAuth({ provider, options });
    return { error };
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { ...options, redirectTo: nativeAuthRedirect(options.redirectTo), skipBrowserRedirect: true },
  });
  if (error) return { error };
  if (!data?.url) return { error: new Error('Sign-in could not start. Please try again.') };

  try {
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url: data.url, presentationStyle: 'popover' });
    return { error: null };
  } catch (openError) {
    return { error: openError instanceof Error ? openError : new Error('Could not open the sign-in page.') };
  }
}
