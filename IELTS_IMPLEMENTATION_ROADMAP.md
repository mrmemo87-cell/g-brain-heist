# IELTS Prep Hub - Complete Implementation Roadmap

## Overview
Transform IELTS portal from empty shell to fully functional test preparation system with free samples and premium access tiers.

## Phase 1: Database Setup ✅ In Progress

### Step 1.1: Run Migrations (IN ORDER)
```sql
1. POPULATE_IELTS_SAMPLE_DATA.sql          -- Creates 3 reading sets
2. IELTS_PREMIUM_TIERS.sql                  -- Adds tier system
3. COMPLETE_IELTS_SAMPLE_DATA.sql           -- Adds passages & questions
```

### Step 1.2: Verify Data
```sql
-- Check reading sets
SELECT * FROM ielts_reading_sets;

-- Check passages
SELECT rs.title, rp.title as passage_title 
FROM ielts_reading_sets rs
JOIN ielts_reading_passages rp ON rp.set_id = rs.id;

-- Check questions
SELECT rs.title, COUNT(rq.id) as questions
FROM ielts_reading_sets rs
LEFT JOIN ielts_reading_questions rq ON rq.set_id = rs.id
GROUP BY rs.id, rs.title;
```

## Phase 2: Frontend Components

### 2.1: Reading Practice Component
**File**: `src/pages/ielts/ReadingPractice.tsx`

Features:
- Display passage text
- Show questions one by one
- Timer per question
- Submit answers
- Show results with explanations
- Calculate band score estimate

### 2.2: Results Dashboard
**File**: `src/pages/ielts/ResultsDashboard.tsx`

Features:
- Show score breakdown
- Display correct/incorrect answers
- Band score estimate
- Time taken
- "Upgrade to Prime" CTA if free user

### 2.3: Prime Application Form
**File**: `src/pages/ielts/PrimeApplication.tsx`

Form fields:
- Full name
- Email
- Motivation (why you want Prime access)
- Target band score
- Test date
- Submit application

### 2.4: Certificate Generator
**File**: `src/pages/ielts/Certificate.tsx`

Features:
- Professional PDF certificate
- Brains Heist Academy branding
- Certificate number
- Band score
- Digital signature
- Download/print options

## Phase 3: Access Control Logic

### 3.1: Tier Check Middleware
```typescript
// Check if user can access content
const canAccess = async (contentTier: string) => {
  const { data } = await supabase
    .from('ielts_users')
    .select('tier')
    .eq('id', userId)
    .single();
    
  if (contentTier === 'free') return true;
  return data?.tier === 'prime_prep_user' || data?.tier === 'admin';
};
```

### 3.2: Trial Limit Tracking
```typescript
// Track skill attempts
const recordAttempt = async (skillType: string) => {
  await supabase.rpc('record_skill_attempt', {
    p_user_id: userId,
    p_skill_type: skillType
  });
};
```

## Phase 4: AI-Generated Tests (Future)

### 4.1: Integration Points
- OpenAI API for question generation
- Claude for essay evaluation
- Text-to-Speech for listening tests

### 4.2: Test Generation Workflow
1. Select difficulty level
2. Choose topic areas
3. AI generates passage
4. AI creates comprehension questions
5. Human review & approval
6. Publish to platform

## Phase 5: Certificate System

### 5.1: Certificate Template
Professional design with:
- Brains Heist Academy header
- Student name
- Test type & date
- Band score
- Certificate number
- Digital signature
- QR code for verification

### 5.2: PDF Generation
Use `jsPDF` or similar library to generate PDF certificates

## Deployment Checklist

### Database
- [ ] Run POPULATE_IELTS_SAMPLE_DATA.sql
- [ ] Run IELTS_PREMIUM_TIERS.sql
- [ ] Run COMPLETE_IELTS_SAMPLE_DATA.sql
- [ ] Verify data populated correctly

### Frontend
- [ ] Update reading page to fetch passages
- [ ] Create practice session component
- [ ] Build results dashboard
- [ ] Add Prime application form
- [ ] Create certificate generator
- [ ] Add "Upgrade to Prime" CTAs

### Testing
- [ ] Test free tier access
- [ ] Test practice session flow
- [ ] Test results display
- [ ] Test Prime application submission
- [ ] Test certificate generation
- [ ] Test access restrictions

### Polish
- [ ] Professional styling
- [ ] Loading states
- [ ] Error handling
- [ ] Mobile responsiveness
- [ ] Analytics tracking

## User Journey

### Free User
1. Sign up → IELTS portal
2. See 3 sample reading exercises
3. Complete practice → See results
4. See "Upgrade to Prime" prompt
5. Fill Prime application
6. Wait for approval

### Prime User
1. Application approved
2. Access all content
3. One trial per skill (Reading, Listening, Writing, Speaking)
4. One full mock test
5. Get certificates upon completion
6. Track progress over time

## Success Metrics
- User sign-ups
- Practice completions
- Prime applications submitted
- Prime approval rate
- Certificate generations
- User satisfaction scores

## Next Steps
1. Run the 3 SQL migrations
2. Verify data in Supabase
3. Update frontend to display exercises
4. Build practice session flow
5. Add Prime application system
6. Create certificate generator
