# Assignment Improvements - Deployment Checklist

## Pre-Deployment Verification

Before deploying to production, complete this checklist:

### Code Review
- [ ] Review all modified files for syntax errors
  - `types.ts`
  - `components/TeacherPortal.tsx` 
  - `components/QuestView.tsx`
  - `services/gameService.ts`

- [ ] Verify no breaking changes to existing assignment flow
  - Existing assignments should still work
  - Teachers can still create assignments
  - Students can still take assignments

- [ ] Check TypeScript compilation
  ```bash
  npm run build
  # Should complete without errors
  ```

### Database Setup
- [ ] Have Supabase SQL Editor open
- [ ] Backup current database (optional but recommended)
- [ ] Have `ADD_ASSIGNMENT_DESCRIPTION_FIELD.sql` ready to run
- [ ] Have `CREATE_ASSIGNMENT_ANALYSES_TABLE.sql` ready to run

### OpenAI Configuration
- [ ] Verify `OPENAI_API_KEY` is set in Supabase secrets
  ```
  Supabase Dashboard → Settings → Environment variables
  Look for: OPENAI_API_KEY
  ```
- [ ] Test OpenAI API key is valid
  - Visit https://platform.openai.com/account/api-keys
  - Verify key is active and not expired

### Edge Function Ready
- [ ] Have `supabase-functions/analyze_assignment_answers/index.ts` ready
- [ ] Verify file path is correct
- [ ] Verify imports are available in Supabase

---

## Deployment Steps

### Step 1: Deploy Edge Function (5 minutes)

```bash
# Navigate to project root
cd /path/to/g-brain-heist

# Deploy the function
supabase functions deploy analyze_assignment_answers

# Output should show:
# ✓ Function deployed successfully
# Function URL: https://[project-id].supabase.co/functions/v1/analyze_assignment_answers
```

**Troubleshooting:**
- If error "Function not found": Check file is in `supabase-functions/analyze_assignment_answers/index.ts`
- If error "Dependencies": Ensure imports are compatible with Deno

### Step 2: Create Analytics Table (2 minutes)

1. Open Supabase Dashboard
2. Go to SQL Editor
3. Click "New Query"
4. Copy entire contents of `CREATE_ASSIGNMENT_ANALYSES_TABLE.sql`
5. Paste into editor
6. Click "Run" button
7. Should see: "Command completed successfully"

**Verify:**
```sql
SELECT table_name FROM information_schema.tables 
WHERE table_name = 'student_assignment_analyses';
```

Should return one row with table name.

### Step 3: Add Description Column (2 minutes)

1. Open Supabase Dashboard
2. Go to SQL Editor  
3. Click "New Query"
4. Copy entire contents of `ADD_ASSIGNMENT_DESCRIPTION_FIELD.sql`
5. Paste into editor
6. Click "Run" button
7. Should see: "Command completed successfully"

**Verify:**
```sql
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'assignments' AND column_name = 'description';
```

Should return one row with column name.

### Step 4: Push Code Updates (5 minutes)

```bash
# Commit changes
git add -A
git commit -m "feat: Add assignment improvements - descriptions and AI analysis"

# Push to repository
git push origin main

# Deploy to production
# (Use your deployment method - vercel, netlify, manual, etc.)
```

### Step 5: Test in Staging (10-15 minutes)

1. **Test Description Display**
   - Teacher creates new assignment
   - Fills in description field
   - Student starts assignment
   - Verify blue "📚 About This Assignment" card appears

2. **Test AI Analysis**
   - Student completes assignment
   - Teacher goes to Reports
   - Clicks "🔍 Analyze" on a student
   - Wait for analysis to load
   - Verify JSON response appears in browser console

3. **Test Error Handling**
   - Temporarily disable OpenAI key
   - Teacher clicks "🔍 Analyze"
   - Should see graceful error (no crash)
   - Re-enable key

4. **Test Data Storage**
   - Run in Supabase SQL Editor:
   ```sql
   SELECT * FROM student_assignment_analyses LIMIT 1;
   ```
   - Should show analysis data stored

---

## Production Deployment

### 1. Create Database Backup
```sql
-- Optional but recommended
-- Supabase handles this automatically, but good practice:
-- Export your data before production changes
```

### 2. Deploy in Sequence
1. Run SQL migrations (Step 2-3 above)
2. Deploy edge function (Step 1 above)
3. Deploy code changes (Step 4 above)
4. Run tests (Step 5 above)

### 3. Monitor After Deployment
- Watch for errors in:
  - Browser console
  - Supabase function logs
  - Server error tracking (if you use one)
- Check that students can still complete assignments
- Verify teacher reports still generate correctly

### 4. Rollback Plan (if needed)

If something breaks, you can rollback:

**Remove new features only (keep data):**
```sql
-- This deletes the analyses table but keeps assignment data
DROP TABLE IF EXISTS student_assignment_analyses;

-- This removes the description column but keeps other data
ALTER TABLE assignments DROP COLUMN IF EXISTS description;
```

**Revert code changes:**
```bash
git revert HEAD
git push origin main
# Redeploy previous version
```

---

## Post-Deployment

### 1. Verify Everything Works
- [ ] Teachers can create assignments with descriptions
- [ ] Students see descriptions before starting
- [ ] Teachers can view assignment reports
- [ ] AI analysis generates without errors
- [ ] Existing assignments still work

### 2. Monitor Performance
- Check Supabase function logs for errors
- Monitor OpenAI API usage (to watch costs)
- Check database query performance

### 3. Communicate with Users
Teachers should know:
- New description field (optional) for better student context
- New "🔍 Analyze" button generates AI feedback
- Analysis takes 5-10 seconds to generate
- Analysis is optional - still works without it

---

## Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| Edge function returns 404 | Verify function deployed: `supabase functions list` |
| OpenAI API error | Check OPENAI_API_KEY is set in Supabase secrets |
| Analysis never loads | Check browser console for errors, check function logs |
| TypeScript errors | Run `npm run build`, fix errors before deploying |
| Database error | Verify SQL migrations ran successfully |
| Students don't see description | Ensure QuestView changes were deployed |

---

## Rollback Procedures

### If Edge Function Fails
```bash
# Remove function
supabase functions delete analyze_assignment_answers

# Code will gracefully fail without crashing
# Teachers can still view reports, just without AI analysis
```

### If Database Changes Fail
```sql
-- Remove table
DROP TABLE IF EXISTS student_assignment_analyses;

-- Remove column
ALTER TABLE assignments DROP COLUMN IF EXISTS description;
```

### Full Rollback
```bash
# Revert all code changes
git revert HEAD~2..HEAD
# or
git checkout main
git reset --hard origin/main

# Re-deploy previous version
```

---

## Performance & Costs

**Edge Function:**
- Uses GPT-4o-mini (cost-effective)
- ~$0.01-0.05 per analysis
- 5-10 second response time

**Database:**
- New table: ~100 KB per 1000 analyses
- New column: Minimal storage increase
- No significant performance impact

**Network:**
- Calls OpenAI API (external, not your server)
- Analysis only generated on-demand
- No continuous background processes

---

## Support Contacts

If you encounter issues:

1. **Supabase Dashboard** → Functions → analyze_assignment_answers → Logs
   - Shows function execution errors

2. **OpenAI Dashboard** → Account → Usage
   - Shows API key usage and errors

3. **Browser Developer Tools** → Console
   - Shows client-side JavaScript errors

4. **Supabase Dashboard** → SQL Editor
   - Run queries to verify table structure

---

## Success Criteria

Deployment is successful when:

✅ Teachers can add descriptions to assignments  
✅ Students see descriptions before starting  
✅ AI analysis generates for student performance  
✅ Analysis data is stored in database  
✅ Existing assignment functionality still works  
✅ No errors in logs or console  
✅ Performance is acceptable (< 15 second load)  

---

## Timeline

- **Pre-deployment checks**: 15 minutes
- **Database migrations**: 5 minutes
- **Edge function deployment**: 5 minutes
- **Code deployment**: 5 minutes
- **Testing**: 15 minutes
- **Total**: ~45 minutes to 1 hour

---

**Ready to deploy! 🚀 Follow the steps above in order and you'll have the new features live.**
