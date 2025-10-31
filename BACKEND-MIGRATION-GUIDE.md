# 🚀 Supabase + Vercel Migration Guide

This guide walks you through migrating G-Brain Heist from localStorage to Supabase backend with Vercel deployment.

---

## 📋 Prerequisites

- [Supabase Account](https://supabase.com) (free tier works)
- [Vercel Account](https://vercel.com) (free tier works)
- [GitHub Account](https://github.com) (for deployment)
- Node.js 16+ installed locally

---

## 🎯 Step-by-Step Migration

### **Step 1: Create Supabase Project** ⏱️ 5 minutes

1. Go to https://supabase.com and sign in
2. Click **"New Project"**
3. Fill in:
   - **Name**: `g-brain-heist`
   - **Database Password**: Generate a strong password (save it!)
   - **Region**: Choose closest to your students
   - **Pricing Plan**: Free tier is fine for testing
4. Click **"Create new project"** (takes ~2 minutes)
5. Once ready, go to **Settings → API** and copy:
   - `Project URL` (looks like: `https://xxxxx.supabase.co`)
   - `anon public` key (the long JWT token)

---

### **Step 2: Run Database Schema** ⏱️ 5 minutes

1. In your Supabase dashboard, go to **SQL Editor**
2. Click **"New Query"**
3. Copy the entire contents from `supabase-schema.sql` (we'll create this file)
4. Click **"Run"** to execute the schema
5. Verify tables were created: Go to **Table Editor**, you should see:
   - `users`, `inventory`, `clans`, `clan_members`, `activities`, `tasks`, `shop_purchases`, `sessions`

---

### **Step 3: Configure Row Level Security (RLS)** ⏱️ 5 minutes

1. Still in Supabase SQL Editor, create a new query
2. Copy contents from `supabase-rls-policies.sql` (we'll create this)
3. Run the query to enable security policies
4. Go to **Authentication → Providers**:
   - Enable **Email** provider
   - Enable **Google** provider (optional, for OAuth):
     - Add your Google OAuth Client ID/Secret
     - Callback URL: `https://xxxxx.supabase.co/auth/v1/callback`

---

### **Step 4: Install Supabase Client** ⏱️ 2 minutes

Open your terminal in the project directory:

```bash
npm install @supabase/supabase-js
```

---

### **Step 5: Configure Environment Variables** ⏱️ 3 minutes

1. Create `.env` file in project root (we'll generate this):
   ```env
   VITE_SUPABASE_URL=https://xxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key-here
   ```

2. Add `.env` to `.gitignore` (already should be there)

3. Create `.env.example` for other developers:
   ```env
   VITE_SUPABASE_URL=your-supabase-url
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```

---

### **Step 6: Test Locally** ⏱️ 5 minutes

```bash
# Start development server
npm run dev

# Test in browser (should now connect to Supabase)
# Try:
# - Creating an account
# - Logging in
# - Answering quiz questions
# - Making a purchase
# - Hacking another player
```

---

### **Step 7: Push to GitHub** ⏱️ 3 minutes

```bash
# Stage all changes
git add .

# Commit changes
git commit -m "Migrate to Supabase backend"

# Push to GitHub
git push origin main
```

---

### **Step 8: Deploy to Vercel** ⏱️ 5 minutes

1. Go to https://vercel.com and sign in
2. Click **"Add New Project"**
3. Import your GitHub repository: `mrmemo87-cell/g-brain-heist`
4. Configure project:
   - **Framework Preset**: Vite
   - **Root Directory**: `./` (leave as is)
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`

5. Add **Environment Variables**:
   - `VITE_SUPABASE_URL` = your Supabase URL
   - `VITE_SUPABASE_ANON_KEY` = your Supabase anon key

6. Click **"Deploy"**

7. Wait 1-2 minutes for build to complete

8. Visit your live site at: `https://your-project.vercel.app`

---

### **Step 9: Configure Production Domain** ⏱️ 2 minutes (optional)

1. In Vercel dashboard, go to **Settings → Domains**
2. Add custom domain: `brainheist.yourdomain.com`
3. Add the CNAME record to your DNS provider
4. Wait for DNS propagation (~5 minutes)

---

### **Step 10: Update Supabase Auth Redirect URLs** ⏱️ 2 minutes

1. In Supabase dashboard, go to **Authentication → URL Configuration**
2. Add your Vercel URLs to **Redirect URLs**:
   ```
   https://your-project.vercel.app/*
   https://brainheist.yourdomain.com/*
   ```

---

## 🎉 You're Live!

Your game is now:
- ✅ Running on Supabase backend with PostgreSQL
- ✅ Deployed on Vercel CDN (fast globally)
- ✅ Real-time multiplayer enabled
- ✅ Secure authentication with RLS
- ✅ Scales automatically (free tier: 500MB DB, unlimited API requests)

---

## 📊 Monitor Your App

### Supabase Dashboard:
- **Database**: View real-time data, run SQL queries
- **Auth**: See registered users
- **Logs**: Monitor API calls and errors
- **API Docs**: Auto-generated REST API documentation

### Vercel Dashboard:
- **Deployments**: View build history
- **Analytics**: See visitor stats (upgrade to Pro for detailed analytics)
- **Logs**: View runtime errors
- **Performance**: Monitor page load speeds

---

## 🔄 Future Updates

To deploy changes:

```bash
git add .
git commit -m "Your changes"
git push origin main
```

Vercel will auto-deploy within 1-2 minutes!

---

## 🆘 Troubleshooting

### "Failed to fetch" errors:
- Check your `.env` file has correct Supabase credentials
- Verify Supabase project is running (not paused)
- Check browser console for CORS errors

### Authentication not working:
- Verify email provider is enabled in Supabase
- Check redirect URLs are configured
- Clear browser localStorage and try again

### Database errors:
- Check RLS policies are enabled
- Verify user has proper permissions
- View logs in Supabase dashboard

### Vercel build fails:
- Check environment variables are set
- Verify `package.json` has all dependencies
- View build logs in Vercel dashboard

---

## 💰 Cost Breakdown

### Free Tier Limits:
- **Supabase Free**: 500MB database, 2GB bandwidth, 50,000 monthly active users
- **Vercel Free**: Unlimited deployments, 100GB bandwidth/month

### When to upgrade:
- Supabase Pro ($25/mo): 8GB database, 100GB bandwidth, better support
- Vercel Pro ($20/mo): Better analytics, team collaboration

For a class of 50-100 students, free tier is plenty!

---

## 📚 Additional Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Vercel Documentation](https://vercel.com/docs)
- [Supabase Auth Guide](https://supabase.com/docs/guides/auth)
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)

---

**Total Migration Time**: ~45 minutes
**Difficulty**: Medium (just follow steps carefully!)
