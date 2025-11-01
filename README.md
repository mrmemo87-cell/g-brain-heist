<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />

**A neon cyber-heist educational game where students become agents, completing knowledge quests and climbing leaderboards!**
[![Made with React](https://img.shields.io/badge/React-19.2-61dafb?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6.2-646cff?logo=vite)](https://vitejs.dev/)

</div>

---

# 🎮 G-Brain Heist

## 📚 Table of Contents

- [About the Project](#-about-the-project)
- [Game Features](#-game-features)
- [Getting Started](#-getting-started)
- [How to Play](#-how-to-play)
- [For Students](#-for-students)
- [For Educators](#-for-educators)
- [Technical Details](#-technical-details)
- [FAQ](#-faq)

---

## 🎯 About the Project

**G-Brain Heist** is an educational gamification platform designed to make learning engaging and competitive. Students take on the role of cyber agents in a neon-themed digital world, where they:

- Complete **knowledge quests** (MCQ challenges)
- Participate in **PvP hacks** (student vs student competition)
- Join or create **clans** for collaborative play
- Manage **daily and weekly tasks**
- Shop for power-ups and cosmetics
- Track progress with **XP, levels, and leaderboards**

This project is **completely frontend-based** with no backend required, making it perfect for classroom deployment!

---

## ✨ Game Features

### 🎓 Knowledge Quests
- Multiple-choice questions on various subjects
- Earn XP and coins for correct answers
- Progressive difficulty system
- Real-time feedback on answers

### ⚔️ PvP Hacks (Student vs Student)
- Challenge other players in your batch
- Win coins by successfully "hacking" opponents
- Use shields and crackers for strategic gameplay
- Risk/reward system based on opponent level

### 👥 Clan System
- Create or join clans (costs 1000 coins to create)
- Chat with clan members (includes toxicity filter)
- Pool resources in the clan vault
- Unlock clan-wide buffs (XP boosts, shields, attack power)
- Role-based hierarchy (Leader, Officer, Member)

### 🛒 Shop & Inventory
- **Shields**: Block incoming attacks
- **Crackers**: Bypass enemy shields
- **Boosters**: 1.5x XP multiplier for 1 hour
- **Major Boosters**: 2.0x XP multiplier for 1 hour
- **Cosmetics**: Customization items
- Daily purchase limits for balance

### 📊 Progress Tracking
- Real-time XP and level system
- Daily/weekly task management
- Streak tracking for consecutive play
- AP (Action Points) system for PvP
- Daily and weekly reward caps

### 💾 Auto-Save System
- Progress automatically saved to browser localStorage
- No account registration required
- Reset option available for testing

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** (version 16 or higher)
- **npm** or **yarn** package manager
- Modern web browser (Chrome, Firefox, Edge, Safari)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/mrmemo87-cell/g-brain-heist.git
   cd g-brain-heist
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the development server**
   ```bash
   npm run dev
   ```

4. **Open your browser**
   - Navigate to `http://localhost:5173`
   - The app should load automatically

### Building for Production

```bash
npm run build
```

This creates an optimized production build in the `dist/` folder. You can serve this with any static file server or deploy to platforms like:
- Netlify
- Vercel
- GitHub Pages
- Firebase Hosting

---

## 🎮 How to Play

### Initial Login
1. Enter any email and password (mock authentication)
2. You'll start as **NeonGhost** (Level 12) with 8,750 coins

### Daily Routine
1. **Check your tasks** - Complete daily objectives for rewards
2. **Start a quest** - Answer knowledge questions to earn XP/coins
3. **PvP hacks** - Challenge rivals when you have AP (Action Points)
4. **Shop wisely** - Buy boosters before quests for maximum XP
5. **Join a clan** - Collaborate with teammates

### Strategy Tips
- 🔥 Use boosters before completing multiple quests
- 🛡️ Always keep a shield active to prevent coin loss
- 🎯 Target lower-level players for higher win rates
- 💰 Save coins for clan creation or expensive items
- ⚡ Complete daily tasks before they reset

---

## 👨‍🎓 For Students

### Reset Your Progress
If you want to start fresh or test features:
1. Open browser Developer Tools (F12)
2. Go to Console tab
3. Type: `localStorage.clear()` and press Enter
4. Refresh the page

### Understanding Stats
- **XP**: Experience points - gain levels as you earn more
- **Coins**: In-game currency for purchases
- **AP**: Action Points for PvP (regenerates over time)
- **Streak**: Consecutive days played
- **Level**: Your overall progression

### Daily/Weekly Caps
The game has caps to prevent grinding:
- **Daily XP Cap**: 1,000 XP
- **Daily Coins Cap**: 2,000 coins
- **Weekly XP Cap**: 6,500 XP
- **Weekly Coins Cap**: 10,000 coins

### Privacy Note
All data is stored **locally in your browser**. No personal information is collected or sent to any server.

---

## 👨‍🏫 For Educators

### Educational Value
This game teaches:
- **Subject mastery** through knowledge quests
- **Strategic thinking** via resource management
- **Collaboration** through clan mechanics
- **Time management** with daily/weekly tasks
- **Risk assessment** in PvP scenarios

### Customization Options

To customize the game for your class, edit these files:

#### 1. **Questions** (`services/gameService.ts`)
```typescript
// Line ~180: Modify mcq_questions_get function
export const mcq_questions_get = (subject_id: string, limit: number = 5): Promise<Question[]> => {
    // Add your own questions here
}
```

#### 2. **Subjects** (`services/gameService.ts`)
```typescript
// Line ~167: Modify mcq_subjects_list function
const subjects: Subject[] = [
    { id: 'subj_math', name: 'Algebra', difficulty: 2 },
    { id: 'subj_science', name: 'Physics', difficulty: 3 },
    // Add more subjects
];
```

#### 3. **Starting Stats** (`services/gameService.ts`)
```typescript
// Line ~15: Modify DEFAULT_PROFILE
const DEFAULT_PROFILE: Profile = {
    level: 1,        // Starting level
    xp: 0,          // Starting XP
    coins: 1000,    // Starting coins
    // ... other properties
};
```

#### 4. **Shop Items & Prices** (`services/gameService.ts`)
```typescript
// Line ~252: Modify MOCK_SHOP_ITEMS array
```

### Deployment for Class
1. Build the production version: `npm run build`
2. Deploy to a hosting service (Netlify/Vercel are free)
3. Share the URL with students
4. Students can play directly in browser - no installation needed

### Monitoring Student Progress
Since this is a frontend-only app, there's no built-in analytics. To add tracking:
- Implement a backend (see [Technical Details](#-technical-details))
- Use browser extensions for exporting localStorage data
- Have students screenshot their profiles

---

## 🔧 Technical Details

### Architecture
- **Frontend Framework**: React 19.2 with TypeScript
- **Build Tool**: Vite 6.2
- **Styling**: TailwindCSS (CDN)
- **State Management**: React useState/useEffect hooks
- **Persistence**: Browser localStorage
- **No Backend**: All game logic runs client-side

### Project Structure
```
g-brain-heist/
├── components/          # React components
│   ├── Header.tsx
│   ├── PlayerProfileCard.tsx
│   ├── QuestView.tsx
│   ├── PvPView.tsx
│   ├── ClanView.tsx
│   ├── ShopView.tsx
│   └── ...
├── services/
│   ├── gameService.ts   # Game logic & mock data
│   ├── authService.ts   # Mock authentication
│   └── storageService.ts # localStorage utilities
├── types.ts             # TypeScript type definitions
├── App.tsx              # Main app component
└── index.tsx            # Entry point
```

### Data Persistence
All game state is saved to localStorage with these keys:
- `gbh_profile` - Player profile data
- `gbh_inventory` - Owned items
- `gbh_clan` - Clan membership
- `gbh_chat` - Clan chat history
- `gbh_last_save` - Timestamp of last save

### Adding a Backend
To convert this to a full client-server architecture:

1. **Choose a backend** (Node.js/Express, Python/Flask, Firebase, Supabase)
2. **Replace mock functions** in `services/gameService.ts` with real API calls
3. **Add authentication** (JWT tokens, OAuth, or similar)
4. **Set up database** (PostgreSQL, MongoDB, Firebase Realtime DB)
5. **Deploy backend** and update API endpoints

Example API call replacement:
```typescript
// Before (Mock)
export const whoami = (): Promise<Profile> => {
  return mockApiCall(MOCK_PROFILE);
};

// After (Real API)
export const whoami = async (): Promise<Profile> => {
  const response = await fetch(`${API_URL}/api/profile`, {
    headers: { 'Authorization': `Bearer ${getToken()}` }
  });
  return response.json();
};
```

### Browser Compatibility
- ✅ Chrome/Edge 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ⚠️ IE11 not supported

---

## ❓ FAQ

### Q: Is this safe for students?
**A:** Yes! There's no data collection, no external network calls, and a built-in toxicity filter for chat.

### Q: Can multiple students use the same computer?
**A:** Each browser profile maintains separate localStorage, so students should use different browser profiles or accounts.

### Q: How do I backup my progress?
**A:** Open DevTools Console and run:
```javascript
console.log(localStorage); // View your data
// Copy and save the output
```

### Q: Can I use real questions from my curriculum?
**A:** Absolutely! Edit the `mcq_questions_get` function in `services/gameService.ts`.

### Q: Why is there no backend?
**A:** This design makes it easier to deploy and maintain for educational settings. You can add a backend later if needed.

### Q: Can I use this commercially?
**A:** Check the repository license. For educational use, it's free!

### Q: Where can I report bugs?
**A:** Open an issue on [GitHub](https://github.com/mrmemo87-cell/g-brain-heist/issues).

---

## 🤝 Contributing

We welcome contributions! Please:
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

This project is part of an educational initiative. See the repository for license details.

---

## 🙏 Acknowledgments

- Built with ❤️ for educators and students
- Inspired by gamification in education
- Neon design aesthetic from cyberpunk culture

---

<div align="center">
Made with 💙 for learning | Star ⭐ this repo if you find it useful!
</div>

