# Quick Start Guide - Admin Portal Updates

## 🚀 Immediate Actions Required

### 1. Run the Database Migration
```bash
# Open Supabase Dashboard → SQL Editor
# Copy and paste the contents of: ADD_CHEMISTRY_SCORE_RELEASE.sql
# Click "Run"
```

This adds the score release functionality for Chemistry tests.

---

## 🏫 Managing Schools (NEW!)

### Assign a School Admin:
1. Go to **Admin Portal**
2. Click **Schools** tab
3. Select school from dropdown
4. Search for user (optional)
5. Click **"👑 Make School Admin"** next to their name

**Note:** Only ONE school admin per school. Assigning a new one replaces the old one.

---

## 📊 Cambridge Test Reports (FIXED!)

### The Fix:
- ❌ **Before:** Students with F grades saw "Maintain Your Excellence"
- ✅ **After:** F-grade students see detailed weak areas and action plans

### How It Works:
The report now uses **grade-appropriate thresholds**:
- **F grade (0-59%):** Shows areas below 70% as weak
- **D grade (60-69%):** Shows areas below 65% as weak
- **C+ grades:** Shows areas below 60% as weak

This ensures failing students **always** see what they need to improve.

---

## 🔒 Chemistry Score Release (NEW!)

### Why This Matters:
Chemistry tests are complex and may require teacher review before releasing scores to students.

### How to Release Scores:

#### **Option 1: Individual Release**
1. Go to **Admin Portal → Cambridge**
2. Click **🔄 Load/Refresh Reports**
3. Filter by Chemistry test
4. For each student, click **🔓 Release Score**

#### **Option 2: Bulk Release**
1. Go to **Admin Portal → Cambridge**
2. Filter by specific Chemistry test
3. (Optional) Filter by class
4. Click **🔓 Bulk Release Scores**
5. Confirm the action
6. All unreleased scores for that filter are released at once

### Student View:
- **Before release:** "📊 Score submitted. Waiting for teacher to release results."
- **After release:** Full detailed report with score, answers, and analysis

---

## 🎯 Report Features

### Detailed Reports Include:
- **Skills Performance Analysis** - Visual bars showing % in each skill area
- **Priority Focus Areas** - Lists skills below threshold
- **Personalized Action Plan** - 1-3 specific improvement strategies
- **Grade-Appropriate Encouragement** - Message matches performance level
- **Printable Format** - Clean layout for parent-teacher conferences

### Answer Review Includes:
- **Summary Stats** - Correct/Wrong/Unanswered counts
- **Section Breakdown** - Performance by test section
- **Question-by-Question** - Shows student answer vs correct answer
- **Key Mistakes** - Highlights main errors for review

---

## 📋 Quick Reference

| Feature | Location | Action |
|---------|----------|--------|
| Assign School Admin | Admin Portal → **Schools** | Select school, click "Make School Admin" |
| View Test Reports | Admin Portal → **Cambridge** | Click "📄 Report" |
| View Answers | Admin Portal → **Cambridge** | Click "📝 Answers" |
| Release Chemistry Score | Admin Portal → **Cambridge** | Click "🔓 Release Score" |
| Bulk Release Scores | Admin Portal → **Cambridge** | Filter test, click "🔓 Bulk Release Scores" |
| Delete Submission | Admin Portal → **Cambridge** | Click "🗑️ Delete" |

---

## ⚠️ Important Notes

1. **Superadmin Required:** Only superadmins can access the Schools tab
2. **Non-Chemistry Tests:** Reading, Listening, Writing tests auto-release scores
3. **Chemistry Tests:** Require manual release using the buttons
4. **One Admin Per School:** Assigning a new school admin replaces the previous one
5. **F-Grade Logic:** Fixed to always show improvement areas for failing students

---

## 🐛 Troubleshooting

### "Schools tab not showing"
→ Verify you're logged in as a superadmin (`role = 'admin'` in database)

### "Release Score button not appearing"
→ Only shows for Chemistry tests that haven't been released yet

### "Student can't see score after release"
→ Check Supabase RLS policies, ensure migration ran successfully

### "F-grade still shows 'Maintain Excellence'"
→ Clear browser cache, refresh page. Check if old report data is cached.

---

## 📝 Testing Checklist

- [ ] Run SQL migration in Supabase
- [ ] Schools tab appears in admin portal
- [ ] Can select school and see members
- [ ] Can assign school admin successfully
- [ ] Cambridge reports load correctly
- [ ] F-grade students see weak areas (not "Excellence")
- [ ] Chemistry scores require manual release
- [ ] Release Score button works
- [ ] Bulk Release button works (when Chemistry test filtered)
- [ ] Students can see released scores
- [ ] Students can't see unreleased Chemistry scores

---

**Status:** ✅ Ready to Deploy  
**Files Changed:** 2 (AdminPortal.tsx, ADD_CHEMISTRY_SCORE_RELEASE.sql)  
**Breaking Changes:** None
