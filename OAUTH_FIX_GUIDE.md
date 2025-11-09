# Google OAuth Fix Instructions

## Problem
Google OAuth is returning "Error 400: redirect_uri_mismatch" because the redirect URI configured in Google Cloud Console doesn't match what your application is using.

## Solution Steps

### 1. Update Google Cloud Console OAuth Configuration

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to "APIs & Services" → "Credentials"
3. Find your OAuth 2.0 Client ID for "Brains Heist"
4. Click "Edit" on your OAuth client
5. In "Authorized redirect URIs" section, add these URLs:

   **Required URLs:**
   ```
   http://localhost:3000/auth/callback
   https://sozodkxwhubespiedgxm.supabase.co/auth/v1/callback
   ```

   **Production (required for g-brain-heist.vercel.app):**
   ```
   http://g-brain-heist.vercel.app/auth/callback
   https://g-brain-heist.vercel.app/auth/callback
   http://g-brain-heist.vercel.app
   https://g-brain-heist.vercel.app
   ```

6. Click "Save"

### 2. Update Supabase Auth Configuration

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project: sozodkxwhubespiedgxm
3. Navigate to "Authentication" → "URL Configuration"
4. Update these settings:

   **Site URL (for production):**
   ```
   https://g-brain-heist.vercel.app
   ```
   
   **For local development:**
   ```
   http://localhost:3000
   ```

   **Redirect URLs (add these lines):**
   ```
   https://g-brain-heist.vercel.app/auth/callback
   https://g-brain-heist.vercel.app/**
   http://g-brain-heist.vercel.app/auth/callback
   http://g-brain-heist.vercel.app/**
   http://localhost:3000/auth/callback
   http://localhost:3000/**
   ```

5. Click "Save"

### 3. Verify Google Provider Configuration

1. In Supabase Dashboard, go to "Authentication" → "Providers"
2. Click on "Google"
3. Ensure these are configured:
   - **Client ID**: Your Google OAuth Client ID
   - **Client Secret**: Your Google OAuth Client Secret
   - **Enabled**: ✓ Checked

### 4. Test the Fix

1. Restart your development server: `npm run dev`
2. Navigate to http://localhost:3000
3. Try signing in with Google
4. The OAuth flow should now work without redirect errors

## Common Issues

- **Still getting redirect errors?** Double-check that you saved the changes in both Google Cloud Console and Supabase
- **Wrong domain?** Make sure you're accessing your app via `http://localhost:3000` exactly
- **HTTPS issues?** For local development, use HTTP (not HTTPS) for localhost

## Production Deployment

When deploying to production, remember to:
1. Add your production domain to Google OAuth redirect URIs
2. Update Supabase Site URL to your production domain
3. Add production redirect URLs to Supabase configuration