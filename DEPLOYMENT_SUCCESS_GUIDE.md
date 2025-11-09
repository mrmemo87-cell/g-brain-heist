# G-Brains Heist Post-Migration Deployment Guide

## 🎯 What We Just Accomplished

✅ **Database Migration Complete**: Successfully deployed all missing infrastructure:
- **9 New Database Tables**: notifications, tournaments (3 tables), teachers (3 tables), achievements (2 tables)
- **7 RPC Functions**: AP regeneration, teacher profiles, question tracking, notifications, tournament management
- **Comprehensive Security**: Row Level Security policies for all tables
- **Performance Optimization**: Strategic indexes for query performance

## 🔧 Next Steps - Testing & Deployment

### Step 1: Verify Database Schema
```sql
-- Run this in Supabase SQL Editor:
-- File: VERIFY_DATABASE_SCHEMA.sql
```
Copy and run the verification script to ensure all components are properly installed.

### Step 2: Test Application Features

#### A. Tournament System Testing
1. **Access Tournament Hub**: `/tournaments` route
2. **Test School Signup**: Try registering a school for tournaments
3. **Admin Dashboard**: Verify admin can manage tournaments (requires admin role)
4. **Bracket Display**: Check public tournament bracket view

#### B. Teacher Portal Testing
1. **Create Teacher Profile**: Access teacher portal and create profile
2. **Add Questions**: Create subject-specific questions with difficulty levels
3. **Student Tracking**: Verify question attempt recording works
4. **Statistics View**: Check teacher can see student performance

#### C. Notification System Testing
1. **AP Notifications**: Let AP reach full capacity - should get notification
2. **Level Up**: Gain XP to trigger level up notification
3. **Attack Notifications**: Test PvP attack notifications
4. **Notification Center**: Verify notifications display properly

#### D. Achievement System Testing
1. **First Login**: Should unlock "Welcome Hacker" achievement
2. **Level Progression**: Check level-based achievements unlock
3. **PvP Achievements**: Test combat-related achievement tracking
4. **Achievement Display**: Verify achievement progress shows correctly

### Step 3: Production Deployment

#### A. Commit and Push Changes
```bash
git add .
git commit -m "feat: complete database migration - tournaments, teachers, notifications, achievements"
git push origin main
```

#### B. Verify Vercel Deployment
1. Check Vercel dashboard for successful deployment
2. Test production app at: https://g-brain-heist.vercel.app
3. Verify all new features work in production

### Step 4: User Role Configuration

#### Set Admin Users (Run in Supabase SQL):
```sql
-- Replace 'your-email@example.com' with actual admin email
UPDATE users 
SET role = 'admin' 
WHERE email = 'your-email@example.com';
```

#### Set Teacher Users:
```sql
-- Replace with teacher emails
UPDATE users 
SET role = 'teacher' 
WHERE email = 'teacher@school.edu';
```

## 🎮 New Features Now Available

### For Students:
- **Tournament Hub**: Join school tournaments and view brackets
- **Teacher Questions**: Answer custom questions from teachers
- **Enhanced Notifications**: Real-time game event notifications
- **Achievement Tracking**: Unlock and track progress on achievements

### For Teachers:
- **Teacher Portal**: Create profiles and manage student questions
- **Question Creation**: Add custom questions by subject and difficulty
- **Student Analytics**: Track student performance and progress
- **Integration**: Questions integrated into main game flow

### For Admins:
- **Tournament Management**: Create seasons, manage signups, set brackets
- **User Management**: Promote users to teacher/admin roles
- **System Oversight**: Monitor all platform activities

## 🔍 Troubleshooting

### If Features Don't Appear:
1. Check browser console for errors
2. Verify user has correct role in database
3. Ensure RLS policies allow access
4. Check Supabase logs for function errors

### If Database Issues Occur:
1. Run verification script to check schema
2. Check Supabase dashboard for errors
3. Verify all functions exist and are callable
4. Test RPC functions individually

### If Deployment Fails:
1. Check Vercel build logs
2. Verify environment variables are set
3. Test locally first with `npm run dev`
4. Check for TypeScript compilation errors

## 📊 Performance Monitoring

Monitor these key metrics after deployment:
- **Database Query Performance**: Check slow query logs
- **Function Execution Times**: Monitor RPC function performance
- **User Engagement**: Track tournament signups and teacher adoption
- **Achievement Unlock Rates**: Monitor achievement system engagement

## 🚀 Success Indicators

Your deployment is successful when:
- ✅ All verification queries return expected results
- ✅ Students can access tournament hub
- ✅ Teachers can create profiles and questions
- ✅ Notifications appear for game events
- ✅ Achievements unlock properly
- ✅ Production app shows all new features

## 📞 Support

If you encounter issues:
1. Check the troubleshooting section above
2. Review Supabase dashboard for errors
3. Verify all environment variables
4. Test individual components separately

---

**Next Action**: Run the verification script and start testing the new features! 🎉