# 🔥 EPIC ADMIN SETUP GUIDE 🔥

## Step 1: Run the SQL Setup

Go to your Supabase project dashboard:
1. Navigate to **SQL Editor**
2. Click **New Query**
3. Copy and paste the contents of `CREATE_ADMIN.sql`
4. Click **RUN** to execute

This will:
- Add the `admin_visible` column to your users table
- Create/update the admin user "Mr. Sobbi" with godly stats (Level 999, 999999 XP/Coins)
- Set the admin role and permissions

## Step 2: Fix AP Regeneration (If Not Already Done)

If you haven't already run the AP column fix:
1. Go to **SQL Editor** in Supabase
2. Run either:
   - `ADD_AP_COLUMN.sql` (adds the missing column)
   - OR `RESET_ALL_AP.sql` (adds column AND resets everyone to 20 AP)

## Step 3: Login as Admin

1. Open your app
2. Use these credentials:
   - **Username**: `Mr. Sobbi`
   - **Password**: `123Memoo@`

## Step 4: Admin Features

Once logged in as Mr. Sobbi, you'll see:

### 🎮 Dashboard Button
- A **GOLDEN ADMIN BUTTON** appears on your main dashboard
- It's bigger than other buttons and has a spinning crown 👑
- Click it to enter the Admin Portal

### ⚡ Admin Portal Features

#### Visibility Toggle
- **GHOST MODE** 👻: You're hidden from leaderboards and PvP (default)
- **VISIBLE MODE** 👁️: You appear in leaderboards with special golden styling
- **Always Unattackable**: Even when visible, no one can attack you in PvP

#### Dashboard Tab
- Total Users, Active Today, Total XP/Coins stats
- Quick Actions: Refresh Data, Send Announcement, God Powers

#### Users Tab
- See ALL users in the game
- Grant 1000 coins to any user instantly 💰
- Reset any user's AP to 20 ⚡
- Ban users (coming soon) 🔨

#### Other Tabs (Coming Soon)
- **Game Management**: Control game settings
- **Clan Management**: Manage all clans
- **Analytics**: Advanced stats and graphs
- **System Control**: Database maintenance, backups

### 🌟 Special Admin Styling

When you're visible in leaderboards:
- **Golden Crown Icon** 👑 instead of rank number
- **Animated golden border** around your profile
- **Glowing yellow text** with special effects
- **Pulsing avatar** with golden border

## Step 5: How Admin is Protected

### Unattackable in PvP
- Admin users are **automatically filtered out** from PvP target lists
- Backend query excludes `role='admin'` from raid targets
- Even if someone tried to hack the client, backend won't allow attack

### Special Permissions
- Admin role is checked on both client and server
- Only username "Mr. Sobbi" can access admin features
- Password is required: `123Memoo@`

## Troubleshooting

### Can't See Admin Button
- Make sure you're logged in as "Mr. Sobbi"
- Run `CREATE_ADMIN.sql` if you haven't already
- Check that the user has `role='admin'` in database

### AP Timer Still Showing "--"
- Run `ADD_AP_COLUMN.sql` or `RESET_ALL_AP.sql`
- Make sure `last_ap_update` column exists in users table

### Admin Not Showing in Leaderboard
- Check your visibility setting in Admin Portal
- Default is **GHOST MODE** (hidden)
- Toggle to **VISIBLE MODE** to appear

## Security Notes

⚠️ **IMPORTANT**: The admin credentials are hardcoded in the app:
- Username: `Mr. Sobbi`
- Password: `123Memoo@`

For production, you should:
1. Move credentials to environment variables
2. Use proper authentication with JWT tokens
3. Add additional security layers (2FA, IP whitelisting, etc.)

## Enjoy Your Godly Powers! 👑⚡

You now have complete control over the game universe!
