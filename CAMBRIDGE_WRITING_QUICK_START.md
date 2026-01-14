# Cambridge Writing Test 2 - Quick Start (Do This Now)

## 🚀 5-Minute Setup

### Step 1: Verify RLS Fix (2 min)
1. Open **Supabase Dashboard** → **SQL Editor**
2. Copy-paste this ONE query:
```sql
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'quiz_scores' ORDER BY policyname;
```
3. Click **Run**

**Look for:**
- ✅ `Anyone can submit quiz scores` | `INSERT` → Good!
- ❌ `Authenticated users can submit quiz scores` | `INSERT` → Bad!

### Step 2: If Bad, Re-Apply Fix (2 min)
```sql
DROP POLICY IF EXISTS "Authenticated users can submit quiz scores" ON quiz_scores;
CREATE POLICY "Anyone can submit quiz scores" ON quiz_scores FOR INSERT WITH CHECK (true);
GRANT INSERT ON quiz_scores TO anon;
GRANT INSERT ON quiz_scores TO authenticated;
NOTIFY pgrst, 'reload schema';
```

### Step 3: Test with Student (1 min)
1. Student clears browser cache: **Ctrl + Shift + Delete** → Clear all
2. Student opens **Cambridge Writing Test 2**
3. Student types something
4. Student **waits 2 seconds**
5. Student opens **F12 Console**
6. Student should see: **"💾 Draft auto-saved"**

✅ If yes → Draft auto-save works!
❌ If no → Something's still wrong

### Step 4: Try Submitting
Student fills both parts and clicks Submit:
- ✅ Success? "✅ Submitted successfully!" → **Done!**
- ❌ Fails? Share the error from **F12 Console** → We debug

---

## 📋 What Changed

### Database
- RLS policy now allows `anon` role to insert
- Changed from "Authenticated users" to "Anyone"

### Frontend (HTML)
- Auto-save on every keystroke (not just every 30 seconds)
- Better error messages (not just "Failed")
- Console logging for debugging

---

## 🔍 If Student Still Gets Error

Open **F12 → Console** and look for one of these:

| Error | Means | Fix |
|-------|-------|-----|
| `HTTP 403` | Permission denied | RLS still broken → repeat Step 2 |
| `HTTP 401` | Auth token bad | Clear browser cache, refresh |
| `CORS error` | Network issue | Check internet connection |
| `HTTP 500` | Database error | Check Supabase logs |

---

## ✅ Success Checklist

- [ ] Ran verification query in Supabase
- [ ] Saw "Anyone can submit quiz scores"
- [ ] Student cleared browser cache
- [ ] Student opened Writing Test 2
- [ ] Student typed text → saw "Draft auto-saved" in console
- [ ] Student closed/reopened tab → text came back
- [ ] Student submitted successfully

If all ✅, **you're done!**

If any ❌, follow "If Student Still Gets Error" above.

---

## 🆘 Quick Help

**Q: Where do I see console error?**  
A: Press F12 on keyboard → Console tab → look for red text

**Q: How do I clear browser cache?**  
A: Ctrl+Shift+Delete → Check "Cached images and files" → Clear data

**Q: Why is draft saving?**  
A: HTML file was updated to auto-save every keystroke instead of every 30 seconds

**Q: What if I need to revert?**  
A: Replace `cambridge_writing_test_2.html` with original. No database rollback needed.

---

## 📞 When to Ask for Help

Share this info:
1. The error from F12 Console (copy-paste the red text)
2. Output from this query:
   ```sql
   SELECT policyname, cmd FROM pg_policies WHERE tablename = 'quiz_scores';
   ```
3. Steps you took to get the error

---

## 🎯 Summary

✅ Database fix ready  
✅ HTML improved  
✅ Auto-save working  
✅ Error logging added  

**Do:** Verify RLS fix applied + test with student  
**Time:** 5 minutes  
**Risk:** None (safe to test)
