# Supabase Google OAuth Branding Checklist

This app signs users in with Supabase Auth's Google provider. The in-app OAuth `redirectTo` URL should be the app callback route, while the Google OAuth client redirect URI should be the Supabase Auth callback URL.

## Current app OAuth redirect flow

- Standard Brains Heist Google sign-in calls `supabase.auth.signInWithOAuth({ provider: 'google' })` with `redirectTo: getAuthRedirectUrl()`.
- IELTS Google sign-in uses the same `getAuthRedirectUrl()` helper and preserves the IELTS intent in `sessionStorage` before starting OAuth.
- `getAuthRedirectUrl()` resolves in this order:
  1. `VITE_SUPABASE_AUTH_REDIRECT_URL`
  2. `VITE_AUTH_REDIRECT_URL`
  3. `${VITE_SITE_URL || VITE_PUBLIC_SITE_URL || VITE_SUPABASE_SITE_URL || window.location.origin}/${VITE_SUPABASE_AUTH_CALLBACK_PATH || 'auth/callback'}`
- The existing production callback route is `/auth/callback`, so production should resolve to:
  `https://www.brainsheist.com/auth/callback`

## Production environment variables

Set one of these production configurations. Prefer the explicit redirect URL so OAuth does not depend on deploy-preview origins:

```env
VITE_SITE_URL=https://www.brainsheist.com
VITE_SUPABASE_AUTH_REDIRECT_URL=https://www.brainsheist.com/auth/callback
```

Alternative if you want path-based construction:

```env
VITE_SITE_URL=https://www.brainsheist.com
VITE_SUPABASE_AUTH_CALLBACK_PATH=auth/callback
```

## Supabase dashboard settings

In **Supabase Dashboard → Authentication → URL Configuration**:

- **Site URL:** `https://www.brainsheist.com`
- **Redirect URLs / Additional Redirect URLs:**
  - `https://www.brainsheist.com/auth/callback`
  - `https://brainsheist.com/auth/callback`
  - Local dev callback URL, if local Google sign-in is needed, for example `http://localhost:5173/auth/callback`

In **Supabase Dashboard → Authentication → Providers → Google**:

- Enable Google provider.
- Client ID and Client Secret must come from the Google OAuth client.
- Do not expose the Google client secret in frontend code or public docs.

## Google Cloud Console settings

In **Google Cloud Console → Google Auth Platform / Branding**:

- **App name:** `Brains Heist`
- **App logo:** Brains Heist logo
- **User support email:** use the production support mailbox
- **Homepage:** `https://www.brainsheist.com`
- **Privacy Policy URL:** production Brains Heist privacy-policy URL
- **Terms of Service URL:** production Brains Heist terms URL
- **Authorized domain:** `brainsheist.com`
- Publish the app / submit verification if Google requires it for the configured scopes or branding state.

In **Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client IDs → Web client**:

- **Authorized JavaScript origins:**
  - `https://www.brainsheist.com`
  - `https://brainsheist.com` if the apex domain serves the app
  - `http://localhost:5173` if local Google sign-in is needed
- **Authorized redirect URI:**
  - `https://<SUPABASE_PROJECT_REF>.supabase.co/auth/v1/callback`

Do **not** use `https://www.brainsheist.com/auth/callback` as the Google OAuth client redirect URI. Google returns to Supabase first; Supabase then redirects back to the app-level `redirectTo` URL after completing the Auth flow.

## Google verification requirement

Google verification is not controlled by this repository. It may be required if the OAuth consent screen is external/public, the app uses sensitive or restricted scopes, or Google flags the branding/domain setup for review. With basic Google sign-in scopes (`openid`, `email`, `profile`), verification is often limited to publishing/branding-domain checks, but the Google Auth Platform screen is the source of truth.
