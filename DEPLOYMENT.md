# Deployment Guide

This guide will help you deploy G-Brains Heist for your students.

## 🚀 Quick Deploy Options

### Option 1: Netlify (Recommended - Easiest)

1. **Push your code to GitHub** (if not already done)
   ```bash
   git add .
   git commit -m "Ready for deployment"
   git push origin main
   ```

2. **Sign up at [Netlify](https://www.netlify.com/)** (free account)

3. **Click "Add new site" → "Import an existing project"**

4. **Connect your GitHub repository**

5. **Configure build settings:**
   - Build command: `npm run build`
   - Publish directory: `dist`

6. **Click "Deploy site"**

7. **Done!** Your site will be live at `https://random-name-123.netlify.app`
   - You can customize the domain name in site settings

### Option 2: Vercel

1. **Push to GitHub** (if not already done)

2. **Sign up at [Vercel](https://vercel.com/)** (free account)

3. **Click "New Project"**

4. **Import your repository**

5. **Configure:**
   - Framework Preset: Vite
   - Build Command: `npm run build`
   - Output Directory: `dist`

6. **Deploy!**

### Option 3: GitHub Pages

1. **Install gh-pages:**
   ```bash
   npm install --save-dev gh-pages
   ```

2. **Update `package.json`:**
   ```json
   {
     "scripts": {
       "predeploy": "npm run build",
       "deploy": "gh-pages -d dist"
     },
     "homepage": "https://YOUR_USERNAME.github.io/g-brain-heist"
   }
   ```

3. **Update `vite.config.ts`:**
   ```typescript
   export default defineConfig({
     base: '/g-brain-heist/',
     plugins: [react()],
   })
   ```

4. **Deploy:**
   ```bash
   npm run deploy
   ```

5. **Enable GitHub Pages:**
   - Go to repository Settings → Pages
   - Source: Deploy from branch `gh-pages`

### Option 4: Local Network (For Classroom)

If you want to run it on a local server for your classroom:

1. **Build the project:**
   ```bash
   npm run build
   ```

2. **Serve the `dist` folder:**
   
   Using Python:
   ```bash
   cd dist
   python -m http.server 8080
   ```
   
   Using Node.js (install `serve` globally):
   ```bash
   npm install -g serve
   serve -s dist -p 8080
   ```

3. **Share your IP address** with students:
   - Find your local IP: `ipconfig` (Windows) or `ifconfig` (Mac/Linux)
   - Students access: `http://YOUR_IP:8080`

---

## 📝 Post-Deployment Checklist

- [ ] Test the deployed app on mobile and desktop
- [ ] Verify localStorage works (progress saves)
- [ ] Test all game features (quests, PvP, shop, clan)
- [ ] Check that error boundaries work
- [ ] Share the URL with students
- [ ] Provide instructions from the README

---

## 🔧 Troubleshooting

### Build Fails
- Run `npm install` to ensure all dependencies are installed
- Check Node.js version (should be 16+)
- Clear cache: `rm -rf node_modules dist` then `npm install`

### Blank Page After Deployment
- Check browser console for errors
- Verify base URL in `vite.config.ts` matches your deployment
- Ensure `dist` folder is being served

### LocalStorage Not Working
- Check browser privacy settings
- Ensure site is served over HTTPS (Netlify/Vercel do this automatically)
- Test in incognito mode to rule out extensions

---

## 🎓 For Students

Once deployed, share these instructions:

**How to Access:**
1. Go to [YOUR_DEPLOYED_URL]
2. Login with any email/password (it's just for demo)
3. Start playing!

**Important Notes:**
- Progress is saved in your browser
- Don't clear browser data or you'll lose progress
- Works best on Chrome, Firefox, or Safari
- Mobile-friendly!

---

## 🔒 Security Notes

This is a **frontend-only** application with no real backend:
- No actual authentication (mock login accepts anything)
- All data stored locally in browser
- No user data collected or transmitted
- Safe for educational use

For production use with real student accounts, you'll need to implement:
- Real authentication system
- Backend API
- Database
- Proper security measures

---

## 📊 Monitoring (Optional)

To track student usage, you can add:
- Google Analytics (free)
- Plausible Analytics (privacy-focused)
- Custom backend with analytics

Add tracking code to `index.html` if desired.

---

## 💡 Tips

1. **Custom Domain:** Both Netlify and Vercel allow custom domains for free
2. **Auto-Deploy:** Connect to GitHub for automatic deploys on push
3. **Preview Deploys:** Both platforms create preview URLs for pull requests
4. **Environment Variables:** Can be set in deployment platform UI
5. **Performance:** Both Netlify and Vercel have excellent CDN and performance

---

Need help? Open an issue on GitHub!
