# Onboarding Redesign - Testing & Deployment Checklist

## Pre-Deployment Checks

### Code Quality
- [x] All TypeScript files compile without errors
- [x] No new ESLint warnings introduced
- [x] All imports are correct and components exist
- [x] No console errors in browser
- [x] Code follows existing project patterns

### Backend Integration
- [x] No new RPCs created (frontend-only requirement met)
- [x] Existing RPCs unchanged: `validate_invite_code`, `join_school_by_code`, `check_user_setup_status`
- [x] All backend calls use existing AuthService methods
- [x] No changes to Supabase schemas or policies

---

## Component Testing

### EntryScreen Component
#### Visual
- [ ] Logo appears and animates (float effect)
- [ ] Background glows pulse smoothly
- [ ] Two cards display side-by-side on desktop
- [ ] Cards stack vertically on mobile
- [ ] Text is readable on all screen sizes
- [ ] No layout shift during load

#### Interaction
- [ ] "Brains Heist" card navigates to login
- [ ] "IELTS Hub" card redirects to /ielts
- [ ] Hover effects work on desktop (scale up, border glow)
- [ ] Active state works (scale down on click)
- [ ] Touch targets work on mobile (no double-tap delay)
- [ ] Both paths are accessible

#### Responsive
- [ ] Mobile (320px): Single column, readable text
- [ ] Tablet (768px): Two columns, larger spacing
- [ ] Desktop (1024px+): Full layout, hover states
- [ ] No horizontal scroll on any screen size

---

### SetupWizard Component

#### Step 1: Path Selection
- [ ] Progress indicator shows "Step 1 of 3"
- [ ] Two path options display clearly
- [ ] "Join a School" card is clickable
- [ ] "Continue Solo" card is clickable
- [ ] Cards animate on hover (desktop)
- [ ] Clicking school path → Step 2 (invite code)
- [ ] Clicking solo path → Step 2 (role selection)
- [ ] Logout button works at bottom

#### Step 2a: Invite Code Entry (School Path)
- [ ] Progress indicator shows "Step 2 of 4"
- [ ] Input field accepts text
- [ ] Input uppercases automatically
- [ ] Input strips spaces automatically
- [ ] "Continue" button disabled when empty
- [ ] "Continue" button enabled when 6+ characters
- [ ] Invalid code shows error message
- [ ] Error message has shake animation
- [ ] Valid code transitions to role selection
- [ ] "Back" button returns to path selection
- [ ] "Request school access" link opens modal
- [ ] Loading state shows "Validating..."

#### Step 2b: Role Selection (Individual Path)
- [ ] Progress indicator shows "Step 2 of 3"
- [ ] Student card is clickable
- [ ] Teacher card is clickable
- [ ] Student selection → Step 3 (student details)
- [ ] Teacher selection → Immediately submits (no details needed)
- [ ] Teacher submit calls `completeIndividualSetup`
- [ ] "Back" button returns to path selection
- [ ] Cards animate on hover (desktop)

#### Step 3a: Role Selection (School Path)
- [ ] Progress indicator shows "Step 3 of 4"
- [ ] School name displays ("Joining: ABC School")
- [ ] Student card is clickable
- [ ] Teacher card is clickable
- [ ] Student selection → Step 4 (student details)
- [ ] Teacher selection → Immediately submits
- [ ] Teacher submit calls `join_school_by_code(code, 'teacher')`
- [ ] "Back" button returns to invite code entry
- [ ] Loading state disables both cards

#### Step 3b/4: Student Details
- [ ] Progress indicator shows correct step number
- [ ] Grade dropdown has options 6-12
- [ ] Grade selection enables batch dropdown
- [ ] Batch dropdown shows correct options for grade
- [ ] Both fields required (button disabled until filled)
- [ ] "Complete Setup" button enabled when ready
- [ ] Submit shows loading state ("Setting up...")
- [ ] Error displays with shake animation
- [ ] Success transitions to dashboard
- [ ] Calls correct function (`join_school_by_code` or `completeIndividualSetup`)
- [ ] Updates user profile with grade/batch
- [ ] "Back" button returns to role selection

#### Step: Submitting
- [ ] Shows loading spinner
- [ ] Shows "Setting up your mission..." text
- [ ] Cannot be interrupted
- [ ] Handles errors gracefully
- [ ] On success, calls `onComplete()` callback
- [ ] On error, returns to appropriate step

#### General
- [ ] All steps have smooth transitions (slide-up animation)
- [ ] Error states display clearly
- [ ] Loading states show spinners
- [ ] No double-submit possible
- [ ] Logout button always visible (except submitting)
- [ ] Wizard fills screen (full overlay)
- [ ] Background has animated glows
- [ ] Mobile keyboard doesn't break layout

---

### JoinSchoolCard Component

#### Collapsed State
- [ ] Displays as single row
- [ ] Shows school icon (🏫)
- [ ] Shows "Join Your School" title
- [ ] Shows "Get full access" subtitle
- [ ] Shows down arrow (▼)
- [ ] Hover effect changes background
- [ ] Click expands card smoothly
- [ ] Only appears if `!hasSchool`
- [ ] Doesn't appear if user has school

#### Expanded State
- [ ] Expands smoothly (max-height transition)
- [ ] Shows all four benefits with checkmarks
- [ ] Shows invite code input field
- [ ] Shows "Join" button
- [ ] Shows "Request school access" link
- [ ] Up arrow (▲) shown
- [ ] Click title collapses card smoothly
- [ ] Benefits list is readable

#### Interaction
- [ ] Invite code input accepts text
- [ ] Input uppercases automatically
- [ ] "Join" button disabled when empty
- [ ] "Join" button enabled when 6+ characters
- [ ] Clicking "Join" validates code
- [ ] Invalid code shows error below input
- [ ] Valid code submits join request
- [ ] Success calls `onJoined()` callback
- [ ] Success collapses card
- [ ] Loading state shows "..." in button
- [ ] "Request school access" opens SchoolRequestModal
- [ ] Modal can be opened and closed

#### Responsive
- [ ] Mobile: Full width, stacks properly
- [ ] Tablet: Same layout
- [ ] Desktop: Max width constrained
- [ ] Benefits grid adjusts (2 columns)
- [ ] Input and button stack on very small screens

---

## Integration Testing

### Auth Flow Integration
#### New Users (Signup)
- [ ] User signs up → `needsSetup` = true
- [ ] User routed to **SetupWizard** (not FinishSetupModal)
- [ ] Completing wizard → `onComplete()` called
- [ ] Dashboard loads after completion
- [ ] User profile has correct school/role/grade

#### OAuth Users
- [ ] User signs in with Google → Check if needs setup
- [ ] If needs setup → Route to **SetupWizard**
- [ ] Username pre-filled if available
- [ ] Completing wizard updates profile
- [ ] Dashboard loads after completion

#### Existing Users
- [ ] User with complete profile → Skip wizard
- [ ] Load dashboard directly
- [ ] No setup prompts

#### Entry Screen (Optional)
- [ ] If enabled, shows before login
- [ ] Selecting Brains Heist → Login screen
- [ ] Selecting IELTS → Redirect to /ielts
- [ ] Can be disabled (goes straight to login)

### Dashboard Integration
#### JoinSchoolCard Display
- [ ] User without school → Card appears
- [ ] User with school → Card doesn't appear
- [ ] Card appears between MainActions and Tasks
- [ ] Card doesn't break layout
- [ ] Card is collapsible
- [ ] Card refreshes dashboard on success

#### Old Modal Removed
- [ ] No "JoinSchoolModal" popup appears
- [ ] `onJoinSchool` prop is removed from MainActions
- [ ] No more "Join School" button in MainActions
- [ ] School features still locked until joined

#### School Features
- [ ] Clan button disabled without school
- [ ] Leaderboard redirects without school
- [ ] Phase1 features locked without school
- [ ] School admin features locked without school
- [ ] After joining, all features unlock
- [ ] Profile updates immediately after join

---

## Backend Call Testing

### validate_invite_code RPC
```typescript
// Test cases:
- [ ] Valid code → Returns { valid: true, school_id, school_name }
- [ ] Invalid code → Returns { valid: false }
- [ ] Expired code → Returns { valid: false }
- [ ] Empty code → Returns { valid: false }
- [ ] Code with spaces → Works (normalized)
- [ ] Lowercase code → Works (normalized)
```

### join_school_by_code RPC
```typescript
// Test cases:
- [ ] Valid code + student → Success, user in school
- [ ] Valid code + teacher → Success, role = teacher
- [ ] Invalid code → Error message returned
- [ ] Already in school → Error message returned
- [ ] Code with spaces → Works (normalized)
- [ ] Code case insensitive → Works
```

### completeIndividualSetup
```typescript
// Test cases:
- [ ] Student + grade + batch → Profile updated
- [ ] Student + no batch → Uses 'N/A'
- [ ] Teacher → No grade/batch set
- [ ] Username provided → Username updated
- [ ] needs_setup flag set to false
```

### check_user_setup_status RPC
```typescript
// Test cases:
- [ ] New user → needs_setup = true
- [ ] OAuth user no profile → needs_setup = true
- [ ] Complete profile → needs_setup = false
- [ ] Returns username if available
```

---

## UI/UX Testing

### Animations
- [ ] All animations are smooth (60fps)
- [ ] No janky transitions
- [ ] Hardware acceleration working (transforms used)
- [ ] Reduced motion respected (if enabled)

### Error Handling
- [ ] Network errors show friendly messages
- [ ] Validation errors are clear
- [ ] Error messages have icons (⚠️)
- [ ] Errors animate in (shake)
- [ ] Errors can be dismissed

### Loading States
- [ ] Spinners show during async operations
- [ ] Buttons show loading text ("Validating...")
- [ ] Buttons disabled during loading
- [ ] No double-submit possible
- [ ] Loading doesn't block entire UI unnecessarily

### Accessibility
- [ ] All buttons have visible focus rings
- [ ] Tab navigation works
- [ ] Enter key submits forms
- [ ] Escape key closes modals (if applicable)
- [ ] Labels associated with inputs
- [ ] Error messages announced to screen readers
- [ ] Loading states announced
- [ ] High contrast mode works

### Mobile Usability
- [ ] Touch targets ≥44px
- [ ] No accidental double-taps
- [ ] Keyboard doesn't break layout
- [ ] Scrolling works smoothly
- [ ] No horizontal scroll
- [ ] Text is readable (≥14px)
- [ ] Buttons are thumb-reachable

---

## Cross-Browser Testing

### Desktop Browsers
- [ ] Chrome (latest) - Windows
- [ ] Chrome (latest) - Mac
- [ ] Firefox (latest) - Windows
- [ ] Firefox (latest) - Mac
- [ ] Safari (latest) - Mac
- [ ] Edge (latest) - Windows

### Mobile Browsers
- [ ] Safari (iOS 14+)
- [ ] Chrome (Android)
- [ ] Samsung Internet
- [ ] Firefox Mobile

### Known Issues
- [ ] backdrop-filter (glassmorphism) may not work in older browsers
- [ ] Fallback: Solid backgrounds used
- [ ] Animations use CSS transforms (widely supported)

---

## Performance Testing

### Load Times
- [ ] Entry screen loads < 1s
- [ ] Setup wizard loads < 1s
- [ ] Join school card renders instantly
- [ ] No large images or assets
- [ ] CSS animations hardware-accelerated

### Bundle Size
- [ ] No new heavy dependencies added
- [ ] Components are lazy-loaded where possible
- [ ] Total added size < 20KB gzipped

### Runtime Performance
- [ ] No memory leaks
- [ ] Animations run at 60fps
- [ ] No excessive re-renders
- [ ] Event listeners cleaned up on unmount

---

## Security Testing

### Input Validation
- [ ] Invite codes sanitized (uppercase, no special chars)
- [ ] XSS prevention (no dangerouslySetInnerHTML)
- [ ] SQL injection not possible (using RPC calls)
- [ ] No sensitive data in console.log (production)

### Authentication
- [ ] Only authenticated users see wizard
- [ ] Session validated before setup
- [ ] Logout works correctly
- [ ] No bypass of setup flow

---

## Data Integrity Testing

### Profile Updates
- [ ] School ID set correctly
- [ ] Role set correctly (student/teacher)
- [ ] Grade/batch set for students
- [ ] needs_setup flag set to false
- [ ] No orphaned data
- [ ] Timestamps updated

### Database Consistency
- [ ] User in school_members table (if school path)
- [ ] User profile updated
- [ ] No duplicate entries
- [ ] Foreign keys valid

---

## Edge Cases

### Network Issues
- [ ] Offline mode shows error
- [ ] Retry mechanism works
- [ ] No data loss on network failure
- [ ] Graceful degradation

### Invalid States
- [ ] Expired invite code → Error message
- [ ] School at capacity → Error message (if applicable)
- [ ] User already in school → Prevent duplicate join
- [ ] Invalid grade/batch → Validation error

### Race Conditions
- [ ] Double-click submit → Only one request
- [ ] Multiple tabs → State syncs
- [ ] Concurrent updates handled

### Special Characters
- [ ] Invite codes with spaces → Normalized
- [ ] Usernames with special chars → Handled
- [ ] School names with emojis → Display correctly

---

## Regression Testing

### Old Features Still Work
- [ ] Regular login/signup unchanged
- [ ] Password reset works
- [ ] OAuth login works
- [ ] Dashboard loads
- [ ] All game features work
- [ ] Teacher portal accessible
- [ ] Admin portal accessible
- [ ] IELTS app separate (/ielts route)

### No Breaking Changes
- [ ] Existing users not affected
- [ ] Database schema unchanged
- [ ] API endpoints unchanged
- [ ] Environment variables same

---

## Deployment Checklist

### Pre-Deploy
- [ ] All tests pass locally
- [ ] No console errors
- [ ] Build succeeds
- [ ] TypeScript compiles
- [ ] Code reviewed
- [ ] Documentation updated

### Deploy Steps
1. [ ] Backup current production code
2. [ ] Deploy to staging environment
3. [ ] Test full flow on staging
4. [ ] Monitor error logs
5. [ ] Deploy to production
6. [ ] Monitor production logs
7. [ ] Test production flow

### Post-Deploy
- [ ] Entry screen works (if enabled)
- [ ] Setup wizard appears for new users
- [ ] Join school card appears for users without school
- [ ] No console errors
- [ ] Monitor error rates
- [ ] Check analytics for completion rates
- [ ] Gather user feedback

### Rollback Plan
If issues occur:
1. [ ] Revert `index.tsx` changes
2. [ ] Revert `App.tsx` changes
3. [ ] Remove new components (optional, won't break if left)
4. [ ] Deploy reverted code
5. [ ] Verify old flow works

---

## User Acceptance Testing

### User Scenarios

#### Scenario 1: New Student with School Code
1. [ ] User visits site
2. [ ] (Optional) Sees entry screen, clicks Brains Heist
3. [ ] Signs up with email/password
4. [ ] Setup wizard appears
5. [ ] Selects "Join a School"
6. [ ] Enters invite code
7. [ ] Code validates successfully
8. [ ] Selects "Student" role
9. [ ] Selects grade and batch
10. [ ] Clicks "Complete Setup"
11. [ ] Dashboard loads with school features unlocked

#### Scenario 2: New Teacher (Solo)
1. [ ] User visits site
2. [ ] Signs up with Google OAuth
3. [ ] Setup wizard appears
4. [ ] Selects "Continue Solo"
5. [ ] Selects "Teacher" role
6. [ ] Setup completes immediately (no grade/batch needed)
7. [ ] Dashboard loads, teacher portal accessible

#### Scenario 3: Existing User Without School
1. [ ] User logs in
2. [ ] Dashboard loads
3. [ ] Join School Card appears
4. [ ] User expands card
5. [ ] Enters invite code
6. [ ] Clicks "Join"
7. [ ] Success → Card disappears, school features unlock

#### Scenario 4: User Joins IELTS Path
1. [ ] User visits site
2. [ ] Sees entry screen
3. [ ] Clicks "IELTS Hub"
4. [ ] Redirected to /ielts
5. [ ] IELTS app loads (separate onboarding)

---

## Analytics & Monitoring

### Metrics to Track
- [ ] Setup wizard completion rate
- [ ] Drop-off at each step
- [ ] Time spent in wizard
- [ ] School path vs individual path split
- [ ] Invite code validation success rate
- [ ] Join school card interaction rate
- [ ] Error rates by type

### Error Tracking
- [ ] Log all API errors
- [ ] Track validation failures
- [ ] Monitor network timeouts
- [ ] Alert on high error rates

---

## Documentation

### Updated Docs
- [x] ONBOARDING_REDESIGN_SUMMARY.md
- [x] ONBOARDING_VISUAL_FLOW.md
- [x] ONBOARDING_TESTING_CHECKLIST.md (this file)
- [ ] README.md (update onboarding section if needed)
- [ ] CONTRIBUTING.md (update if needed)

### Code Comments
- [x] Component files have JSDoc comments
- [x] Complex functions explained
- [x] Backend integration notes included

---

## Final Sign-Off

### Development
- [ ] All features implemented
- [ ] All tests pass
- [ ] Code reviewed
- [ ] Documentation complete

### QA
- [ ] Manual testing complete
- [ ] Cross-browser testing done
- [ ] Mobile testing done
- [ ] Performance verified

### Product
- [ ] Designs approved
- [ ] User flows approved
- [ ] Copy approved
- [ ] Analytics in place

### Ready for Production
- [ ] All checkboxes above checked
- [ ] Stakeholders approved
- [ ] Deploy scheduled
- [ ] Rollback plan ready

---

## Notes

### Known Limitations
- Entry screen is optional (disabled by default in this implementation)
- Glassmorphism fallback needed for older browsers
- No A/B testing framework (can be added later)

### Future Enhancements
- Add onboarding analytics dashboard
- A/B test entry screen effectiveness
- Add school preview before joining
- Add onboarding completion incentives (e.g., bonus coins)
- Add progress save/resume for partial completion

---

**Deployment Date:** ___________  
**Deployed By:** ___________  
**Approved By:** ___________  
**Status:** [ ] Pass [ ] Fail [ ] Needs Revision

