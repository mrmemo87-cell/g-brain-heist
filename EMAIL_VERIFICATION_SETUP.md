# Email Verification Setup Guide

## Overview

The app now enforces email verification before users can access gameplay, join schools, or use the teacher portal. This ensures all users have valid, verified email addresses.

## Features Implemented

### 1. **Email Verification Check**
- Added `checkEmailVerification()` function in `authService.ts`
- Checks if user's `email_confirmed_at` field is populated
- Returns verification status and user email

### 2. **Verification Screen Component**
- Created `EmailVerificationScreen.tsx`
- Shows user their email address
- Provides "Resend verification email" button
- Includes "I've verified my email" button to check status
- Beautiful UI matching the app's design system

### 3. **Main Auth Flow Integration**
- Modified `index.tsx` to check verification after login/signup
- Blocks access to SetupWizard if email not verified
- Shows verification screen with user's email
- Auto-checks verification status and continues flow after verification

### 4. **School Join Protection**
- `SetupWizard.tsx`: Blocks invite code validation until email verified
- `JoinSchoolCard.tsx`: Prevents school joining for unverified users
- Both show clear error messages about email verification requirement

### 5. **Teacher Portal Protection**
- `TeacherPortal.tsx`: Checks verification on mount
- Parent component handles showing verification screen
- Teachers must verify before accessing portal features

## User Flow

### New User Signup
1. User signs up with email/password or Google
2. User sees "Account created! Loading your profile..." message
3. Page auto-reloads after 1.5 seconds
4. **If email requires verification:**
   - User sees `EmailVerificationScreen` with their email
   - User checks inbox for verification email
   - User clicks verification link in email
   - User returns to app and clicks "I've verified my email"
   - App checks verification status and continues to SetupWizard
5. **If email already verified (Google or disabled confirmation):**
   - User proceeds directly to SetupWizard

### Existing User Login
1. User logs in
2. App checks `email_confirmed_at` status
3. **If not verified:** Shows verification screen
4. **If verified:** Continues to dashboard/app

### Verification Screen Actions
- **"Resend verification email"**: Calls Supabase `auth.resend()` API
- **"I've verified my email"**: Calls `auth.refreshSession()` and checks if `email_confirmed_at` is now populated

## Supabase Configuration

### Enable Email Confirmation (Optional)

Email confirmation is **disabled by default** in Supabase. To enable it:

1. Go to **Supabase Dashboard** → **Authentication** → **Settings**
2. Find **"Enable email confirmations"**
3. Toggle **ON**
4. Configure email templates if needed

### Email Templates

Customize the verification email:
1. Go to **Authentication** → **Email Templates**
2. Select **"Confirm signup"**
3. Edit subject/body as needed
4. Use variables: `{{ .ConfirmationURL }}`, `{{ .SiteURL }}`, etc.

### Redirect URL

Verification link redirects to your app after confirmation. Set in:
1. **Authentication** → **URL Configuration**
2. Add your app URL to **"Redirect URLs"**
3. Example: `https://yourdomain.com`, `http://localhost:5173`

## Testing

### Test Email Verification Flow

1. **Enable email confirmation** in Supabase (see above)
2. **Clear browser data** or use incognito mode
3. **Sign up** with a new email address
4. Should see: `EmailVerificationScreen` with email
5. **Check email inbox** (including spam folder)
6. **Click verification link** in email
7. Should be redirected to app
8. **Click "I've verified my email"** button
9. Should see: "Email verified! Loading..."
10. Should proceed to `SetupWizard`

### Test Blocked Actions (Unverified)

1. Sign up but **don't verify email**
2. Try to **validate invite code** in SetupWizard
3. Should see: "Please verify your email before joining a school..."
4. Try to **join school** from dashboard (JoinSchoolCard)
5. Should see: "Please verify your email before joining a school..."

### Test With Email Confirmation Disabled

1. **Disable email confirmation** in Supabase
2. Sign up with new email
3. Should skip verification screen (no `email_confirmed_at` check needed)
4. Should proceed directly to SetupWizard
5. All features should work without verification prompt

## Files Modified

### New Files
- `components/EmailVerificationScreen.tsx` - Verification UI component

### Modified Files
- `services/authService.ts` - Added `checkEmailVerification()` function
- `index.tsx` - Added verification check in auth flow, state management, and screen rendering
- `components/onboarding/SetupWizard.tsx` - Added verification check before invite code validation
- `components/JoinSchoolCard.tsx` - Added verification check before joining school
- `components/TeacherPortal.tsx` - Added verification check on mount

## Code Examples

### Check Verification Status
```typescript
const verificationStatus = await AuthService.checkEmailVerification();

if (!verificationStatus.isVerified) {
  // Show verification screen or error message
  console.log('Email not verified:', verificationStatus.email);
} else {
  // Continue with feature
  console.log('Email verified for:', verificationStatus.email);
}
```

### Resend Verification Email
```typescript
const { error } = await supabase.auth.resend({
  type: 'signup',
  email: userEmail,
});

if (!error) {
  console.log('Verification email sent!');
}
```

### Check If Email Verified After Clicking Link
```typescript
const { data, error } = await supabase.auth.refreshSession();

if (data.session?.user?.email_confirmed_at) {
  // Email is now verified
  window.location.reload(); // Trigger auth check
}
```

## Error Messages

The following user-friendly error messages are shown:

- **SetupWizard (invite code)**: "Please verify your email before joining a school. Check your inbox for the verification link."
- **JoinSchoolCard**: "Please verify your email before joining a school. Check your inbox for the verification link."
- **Verification Screen (resend)**: "Verification email sent! Check your inbox."
- **Verification Screen (check)**: "Email not verified yet. Please check your inbox."

## Troubleshooting

### User says they didn't receive verification email

1. **Check spam folder**
2. **Check Supabase logs**: Dashboard → Authentication → Logs
3. **Verify email is enabled**: Dashboard → Authentication → Settings
4. **Resend email**: User clicks "Resend verification email"
5. **Check SMTP settings**: Dashboard → Project Settings → API

### User verified but still sees verification screen

1. **Click "I've verified my email"** button (doesn't auto-refresh)
2. **Try refreshing page** (F5 or Ctrl+R)
3. **Check session**: May need to log out and log back in
4. **Verify in database**: Check `auth.users.email_confirmed_at` is not null

### Email verification link doesn't work

1. **Check redirect URLs**: Dashboard → Authentication → URL Configuration
2. **Verify link format**: Should look like `https://yourapp.com/auth/callback?token=...`
3. **Check token expiry**: Verification tokens expire (default 24 hours)
4. **Regenerate link**: User clicks "Resend verification email"

## Future Enhancements

- Add countdown timer for resend button (prevent spam)
- Add email change verification flow
- Add admin override to manually verify emails
- Add email verification reminder notifications
- Track verification metrics (conversion rate, time to verify)

## Security Notes

- Email verification proves user owns the email address
- Prevents spam accounts and invalid registrations
- Required for password reset functionality
- Recommended for production apps
- Can be disabled for testing/development environments
