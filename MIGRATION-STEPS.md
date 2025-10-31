# 🚀 QUICK START: Supabase + Vercel Migration

Follow these exact steps to migrate G-Brain Heist to production!

---

## ⚡ Phase 1: Supabase Setup (15 minutes)

### Step 1: Create Supabase Project

1. Go to https://supabase.com/dashboard
2. Click **"New Project"**
3. Fill in:
   - Name: `g-brain-heist`
   - Database Password: **Save this password!**
   - Region: Choose closest to you
4. Click **"Create new project"** (wait ~2 minutes)

### Step 2: Run Database Schema

1. In Supabase dashboard → **SQL Editor**
2. Click **"New Query"**
3. Copy entire contents of `supabase-schema.sql`
4. Click **"Run"**
5. Verify success: Go to **Table Editor** → should see 11 tables

### Step 3: Configure Security Policies

1. In **SQL Editor** → **"New Query"**
2. Copy entire contents of `supabase-rls-policies.sql`
3. Click **"Run"**
4. Verify: Should see "35 policies created" or similar

### Step 4: Enable Authentication

1. Go to **Authentication** → **Providers**
2. Enable **Email** (should already be enabled)
3. **Optional**: Enable Google OAuth:
   - Click **Google**
   - Add Client ID and Secret from Google Cloud Console
   - Redirect URL: `https://your-project.supabase.co/auth/v1/callback`

### Step 5: Get API Credentials

1. Go to **Settings** → **API**
2. Copy these values:
   - **Project URL** (e.g., `https://abcdefgh.supabase.co`)
   - **anon public** key (long JWT token)
3. **Keep these safe!** You'll need them in the next phase

---

## ⚡ Phase 2: Local Development Setup (10 minutes)

### Step 1: Install Dependencies

Open terminal in project folder:

```bash
npm install @supabase/supabase-js
```

### Step 2: Create Environment File

Create `.env` file in project root:

```bash
# Windows PowerShell
New-Item -Path .env -ItemType File

# Then edit .env and add:
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

**Important:** Replace with your actual values from Step 5 above!

### Step 3: Update vite.config.ts

The `vite.config.ts` should already handle environment variables, but verify it has:

```typescript
export default defineConfig({
  // ... other config
  define: {
    'import.meta.env': JSON.stringify(process.env)
  }
})
```

  
```bash
npm run dev
```

Open browser → `http://localhost:5173`

Try:
- ✅ Creating an account
- ✅ Logging in
- ✅ Answering a quiz question
- ✅ Making a purchase

**If you get errors:** Check browser console and verify `.env` file is correct.

---

## ⚡ Phase 3: Vercel Deployment (10 minutes)

### Step 1: Push to GitHub

```bash
# Add all files
git add .

# Commit changes
git commit -m "Migrate to Supabase backend"

# Push to GitHub
git push origin main
```

### Step 2: Connect Vercel

1. Go to https://vercel.com/new
2. Click **"Import Project"**
3. Select your GitHub repo: `mrmemo87-cell/g-brain-heist`
4. Configure:
   - **Framework Preset**: Vite
   - **Build Command**: `npm run build`
   - **Output Directory**: `dsti`
   - **Install Command**: `npm install`

### Step 3: Add Environment Variables

Still in Vercel project setup:

1. Click **"Environment Variables"**
2. Add two variables:
   - `VITE_SUPABASE_URL` = `https://your-project.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = `your-anon-key`
3. Apply to: **Production, Preview, and Development**

### Step 4: Deploy

1. Click **"Deploy"**
2. Wait 2-3 minutes
3. Click **"Visit"** to see your live site!

---

## ⚡ Phase 4: Production Configuration (5 minutes)

### Step 1: Configure Auth Redirect URLs

1. In Supabase dashboard → **Authentication** → **URL Configuration**
2. Add to **Redirect URLs**:
   ```
   https://your-project-name.vercel.app/*
   http://localhost:5173/*
   ```

### Step 2: Test Production Site

Visit: `https://your-project-name.vercel.app`

Test the full flow:
1. ✅ Sign up new account
2. ✅ Log out
3. ✅ Log back in
4. ✅ Complete a quest
5. ✅ Hack another player
6. ✅ Join/create a clan

---

## 🎉 You're Live!

Your game is now:
- ✅ **Fully multiplayer** - Real shared data across all players
- ✅ **Secure** - Row-level security policies protect user data
- ✅ **Fast** - Deployed on Vercel's global CDN
- ✅ **Scalable** - Handles 100s of simultaneous students
- ✅ **Real-time** - Live updates for chat and activity feed

---

## 📊 Monitor Your Game

### Supabase Dashboard:
- **Database**: See real-time student data
- **Auth**: Monitor user signups
- **Logs**: Debug API errors
- **API Docs**: Auto-generated REST docs

### Vercel Dashboard:
- **Deployments**: See all versions
- **Analytics**: Visitor stats (upgrade to Pro)
- **Logs**: Runtime errors

---

## 🔄 Deploy Updates

Any time you make changes:

```bash
git add .
git commit -m "Your update message"
git push origin main
```

Vercel auto-deploys in 1-2 minutes!

---

## 🆘 Troubleshooting

### "Missing environment variables" error:
- ✅ Check `.env` file exists and has correct values
- ✅ Restart dev server (`npm run dev`)
- ✅ Verify no typos in variable names

### "Network request failed":
- ✅ Check Supabase project is active (not paused)
- ✅ Verify API URL and key are correct
- ✅ Check browser console for CORS errors

### Can't sign up / Login fails:
- ✅ Verify Email provider is enabled in Supabase
- ✅ Check redirect URLs are configured
- ✅ Clear browser cache and try incognito mode

### Vercel build fails:
- ✅ Verify environment variables are set in Vercel
- ✅ Check all dependencies are in `package.json`
- ✅ View detailed logs in Vercel dashboard

---

## 💰 Free Tier Limits

**Supabase Free:**
- 500MB database
- 2GB bandwidth/month
- 50,000 monthly active users
- Perfect for 50-100 students!

**Vercel Free:**
- Unlimited deployments
- 100GB bandwidth/month
- 100 builds/month
- More than enough!

---

## 📚 Next Steps

Once everything works:

1. **Add more questions**: Edit `gameService.ts` quest data
2. **Customize styling**: Update Tailwind classes
3. **Add analytics**: Integrate Vercel Analytics (upgrade)
4. **Custom domain**: Add in Vercel settings
5. **Invite students**: Share your Vercel URL!

---

**Total Time:** ~40 minutes
**Difficulty:** Medium (just follow steps!)

Need help? Check the logs:
- Supabase: Dashboard → Logs
- Vercel: Dashboard → Deployments → View Logs
- Browser: F12 → Console tab
