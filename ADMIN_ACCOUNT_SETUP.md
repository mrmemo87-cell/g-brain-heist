# 🔐 ADMIN ACCOUNT CREATION - STEP BY STEP

## The Issue
Supabase requires users to be created in the **Authentication** system first, then we update the database. You can't just insert a user into the `users` table directly.

## 📝 COMPLETE SETUP STEPS

### Step 1: Create Authentication User in Supabase

1. **Go to Supabase Dashboard**: https://supabase.com/dashboard
2. Select your project
3. Click **"Authentication"** in the left sidebar
4. Click **"Users"** tab
5. Click the **"Add user"** button (top right)
6. Select **"Create new user"**
7. Fill in the form:
   - **Email**: `admin@g-brain-heist.com`
   - **Password**: `123Memoo@`
   - ✅ **Check the box**: "Auto Confirm User" (IMPORTANT!)
8. Click **"Create user"**

You should see a success message and the new user in the list.

### Step 2: Run SQL to Give Admin Powers

1. In Supabase, click **"SQL Editor"** in the left sidebar
2. Click **"New query"**
3. Copy the entire contents of `CREATE_ADMIN.sql`
4. Paste into the SQL editor
5. Click **"RUN"** (or press Ctrl+Enter)

This will:
- Add the `admin_visible` column to your users table
- Update the user you just created to have:
  - Username: "Mr. Sobbi"
  - Role: admin
  - Level 999
  - 999,999 XP and Coins
  - All godly stats

### Step 3: Login to the App

1. Go to your deployed app
2. **Login** (not register!) with:
   - **Email**: `admin@g-brain-heist.com`
   - **Password**: `123Memoo@`

3. After login, you should see:
   - Your profile shows "Mr. Sobbi" as username
   - A golden **ADMIN** button on the dashboard
   - Level 999 with godly stats

## 🎯 Quick Troubleshooting

### "Invalid credentials" error
- Make sure you created the auth user in Step 1
- Make sure you checked "Auto Confirm User"
- Use the EMAIL (`admin@g-brain-heist.com`) to login, not the username
- Password is: `123Memoo@`

### User created but no admin button showing
- Run the SQL from Step 2
- Check that `role = 'admin'` in the database
- Refresh the page after running SQL

### "User already exists" in Step 1
- That's fine! Just skip to Step 2
- The SQL will update the existing user

## 📧 Login Credentials

**Email**: `admin@g-brain-heist.com`  
**Password**: `123Memoo@`

(Use the EMAIL to login, the app will then show username "Mr. Sobbi")

## 🔄 Alternative: Update Existing User

If you want to make an existing user an admin instead:

1. Find their email in the database
2. Replace `admin@g-brain-heist.com` in the SQL with their email
3. Change the username to whatever you want
4. Run the SQL

---

**After completing these steps, you'll have full admin access!** 👑⚡
