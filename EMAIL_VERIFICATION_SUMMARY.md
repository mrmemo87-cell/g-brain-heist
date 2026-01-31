# Email Verification Feature - Quick Reference

## What Was Added

✅ **Email verification check** after signup/login  
✅ **Verification screen** with resend button  
✅ **Blocks school joining** until verified  
✅ **Blocks teacher portal** until verified  
✅ **Auto-reload after signup** to trigger verification check  

## How It Works

### Flow
```
Signup → Auto-reload → Check email_confirmed_at
  ├─ If NULL → Show EmailVerificationScreen
  │    ├─ User clicks link in email
  │    ├─ User returns and clicks "I've verified"
  │    └─ Continues to SetupWizard
  └─ If SET → Continue to SetupWizard/Dashboard
```

### Components Changed
1. **index.tsx** - Main auth flow with verification check
2. **EmailVerificationScreen.tsx** - New verification UI
3. **authService.ts** - New `checkEmailVerification()` function
4. **SetupWizard.tsx** - Blocks invite code validation
5. **JoinSchoolCard.tsx** - Blocks school joining
6. **TeacherPortal.tsx** - Checks verification on mount

## Testing Instructions

### If Email Confirmation is ENABLED in Supabase:
1. Sign up with new email
2. You'll see: "Verify your email to continue"
3. Check inbox for verification email
4. Click link in email
5. Return to app, click "I've verified my email"
6. Should proceed to SetupWizard

### If Email Confirmation is DISABLED (default):
1. Sign up with new email
2. Skip verification screen (email already "verified")
3. Proceed directly to SetupWizard

## Enable Email Confirmation

**Supabase Dashboard** → **Authentication** → **Settings** → Toggle **"Enable email confirmations"** ON

## Key Files

- [EMAIL_VERIFICATION_SETUP.md](EMAIL_VERIFICATION_SETUP.md) - Full documentation
- [components/EmailVerificationScreen.tsx](components/EmailVerificationScreen.tsx) - Verification UI
- [services/authService.ts](services/authService.ts) - `checkEmailVerification()` function
- [index.tsx](index.tsx) - Main integration point

## User-Facing Messages

**Verification Screen:**
- "Verify your email to continue"
- Shows user's email address
- "Resend verification email" button
- "I've verified my email" button

**School Join Blocked:**
- "Please verify your email before joining a school. Check your inbox for the verification link."

## Next Steps

1. ✅ Code deployed
2. ⏳ Run [CREATE_USER_PROFILE_TRIGGER.sql](CREATE_USER_PROFILE_TRIGGER.sql) in Supabase (if not done)
3. ⏳ Test signup flow with email verification enabled/disabled
4. ⏳ Verify school joining is blocked for unverified users
5. ⏳ Check teacher portal blocks unverified teachers

## Production Recommendation

**Enable email confirmation** in Supabase for production to:
- Prevent spam accounts
- Ensure valid email addresses
- Enable password reset functionality
- Improve security and data quality
