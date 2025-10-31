# ✅ Supabase + Vercel Migration Checklist

Print this or keep it open while you migrate!

---

## 🔷 Supabase Setup

- [ ] Go to https://supabase.com/dashboard
- [ ] Click "New Project"
- [ ] Enter project name: `g-brain-heist`
- [ ] Generate and **save** database password
- [ ] Select region closest to you
- [ ] Wait for project creation (~2 minutes)
- [ ] Project is ready ✅

---

## 🔷 Database Schema

- [ ] Open Supabase dashboard
- [ ] Go to SQL Editor
- [ ] Click "New Query"
- [ ] Open file: `supabase-schema.sql`
- [ ] Copy entire contents
- [ ] Paste into SQL Editor
- [ ] Click "Run"
- [ ] See success message ✅
- [ ] Go to Table Editor
- [ ] Verify 11 tables exist:
  - [ ] users
  - [ ] inventory
  - [ ] clans
  - [ ] clan_members
  - [ ] clan_chat
  - [ ] activities
  - [ ] activity_reactions
  - [ ] tasks
  - [ ] shop_purchases
  - [ ] sessions
  - [ ] caps

---

## 🔷 Security Policies

- [ ] Still in SQL Editor
- [ ] Click "New Query"
- [ ] Open file: `supabase-rls-policies.sql`
- [ ] Copy entire contents
- [ ] Paste into SQL Editor
- [ ] Click "Run"
- [ ] See success message ✅
- [ ] Policies enabled on all tables

---

## 🔷 Authentication Setup

- [ ] Go to Authentication → Providers
- [ ] Verify Email is enabled
- [ ] **Optional**: Enable Google OAuth
  - [ ] Go to Google Cloud Console
  - [ ] Create OAuth credentials
  - [ ] Copy Client ID
  - [ ] Copy Client Secret
  - [ ] Paste into Supabase
  - [ ] Save

---

## 🔷 Get API Credentials

- [ ] Go to Settings → API
- [ ] Copy **Project URL**: `https://_____.supabase.co`
- [ ] Write it here: _________________________________
- [ ] Copy **anon public** key (long JWT token)
- [ ] Save both somewhere safe! ✅

---

## 🔷 Install Supabase Package

- [ ] Open terminal in project folder
- [ ] Run: `npm install @supabase/supabase-js`
- [ ] Wait for installation
- [ ] See "added 1 package" ✅

---

## 🔷 Create .env File

- [ ] Create `.env` file in project root
- [ ] Add this line: `VITE_SUPABASE_URL=`
- [ ] Paste your Project URL after `=`
- [ ] Add this line: `VITE_SUPABASE_ANON_KEY=`
- [ ] Paste your anon key after `=`
- [ ] Save file ✅
- [ ] Example:
  ```
  VITE_SUPABASE_URL=https://abcd1234.supabase.co
  VITE_SUPABASE_ANON_KEY=eyJhbG...very-long-key
  ```

---

## 🔷 Test Locally

- [ ] Run: `npm run dev`
- [ ] Open browser: `http://localhost:5173`
- [ ] Try creating account
- [ ] Enter email and password
- [ ] Click "Sign Up"
- [ ] Check Supabase dashboard → Authentication → Users
- [ ] See your user listed ✅
- [ ] Try logging in
- [ ] Try answering a quest
- [ ] Check browser console - no errors ✅

---

## 🔷 Push to GitHub

- [ ] Run: `git status` (see changed files)
- [ ] Run: `git add .`
- [ ] Run: `git commit -m "Migrate to Supabase backend"`
- [ ] Run: `git push origin main`
- [ ] Go to GitHub - see new commit ✅

---

## 🔷 Deploy to Vercel

- [ ] Go to https://vercel.com/new
- [ ] Click "Import Project"
- [ ] Select: `mrmemo87-cell/g-brain-heist`
- [ ] Framework: Vite ✅
- [ ] Build Command: `npm run build` ✅
- [ ] Output Directory: `dist` ✅
- [ ] Click "Environment Variables"
- [ ] Add: `VITE_SUPABASE_URL` = (paste your URL)
- [ ] Add: `VITE_SUPABASE_ANON_KEY` = (paste your key)
- [ ] Apply to: Production, Preview, Development ✅
- [ ] Click "Deploy"
- [ ] Wait 2-3 minutes ⏳
- [ ] See success message ✅
- [ ] Click "Visit" to see live site

---

## 🔷 Configure Production Auth

- [ ] Copy your Vercel URL: `https://_____.vercel.app`
- [ ] Go to Supabase → Authentication → URL Configuration
- [ ] Click "Add URL" in Redirect URLs
- [ ] Add: `https://your-project.vercel.app/*`
- [ ] Add: `http://localhost:5173/*`
- [ ] Click Save ✅

---

## 🔷 Test Production

- [ ] Visit: `https://your-project.vercel.app`
- [ ] Try sign up
- [ ] Enter email and password
- [ ] Verify email (check inbox)
- [ ] Log in ✅
- [ ] Complete a quest
- [ ] Make a purchase
- [ ] Check Supabase dashboard - see data ✅
- [ ] Try on mobile phone ✅
- [ ] Share URL with friend to test multiplayer ✅

---

## 🎉 Launch Checklist

- [ ] All features tested and working
- [ ] No console errors
- [ ] Sign up flow works
- [ ] Login flow works
- [ ] Quests work
- [ ] Shop works
- [ ] PvP works
- [ ] Clans work
- [ ] Activity feed updates
- [ ] Mobile responsive
- [ ] Fast load times
- [ ] Share link with students! 🚀

---

## 📊 Post-Launch

- [ ] Monitor Supabase dashboard daily
- [ ] Check user signups
- [ ] Watch for errors in Logs
- [ ] Monitor database size
- [ ] Get student feedback
- [ ] Fix any bugs
- [ ] Add more quiz questions
- [ ] Celebrate success! 🎊

---

**Total Items:** 80+
**Estimated Time:** 40 minutes
**Difficulty:** Medium

**Pro Tip:** Go through this checklist with a friend or colleague for pair programming!
