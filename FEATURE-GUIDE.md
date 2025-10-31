# 🎮 G-Brain Heist - Feature Implementation Guide

## ✅ Completed Features

### 1. Sticky Header with Back Button
- Header now stays at top when scrolling (`sticky top-0`)
- Back button (←) appears when not on dashboard
- Settings icon now visible on mobile
- All changes deployed ✅

### 2. Clan Affiliation Display
- Rival cards in PvP now show clan names (⚔️ Clan Name)
- Fetches clan membership via SQL join
- Only shows if player is in a clan ✅

### 3. Mock Data Removal
- Removed fallback mock clan data
- Returns empty arrays if no real data ✅

---

## 📋 Remaining Features to Implement

### 4. Avatar Selection System

**Funny Preset Avatars:**
Create these fun avatar options:

```typescript
const PRESET_AVATARS = [
  { id: 'robot', url: 'https://api.dicebear.com/7.x/bottts/svg?seed=Felix', name: '🤖 Bot' },
  { id: 'alien', url: 'https://api.dicebear.com/7.x/bottts/svg?seed=Alien', name: '👽 Alien' },
  { id: 'pixel', url: 'https://api.dicebear.com/7.x/pixel-art/svg?seed=Pixel', name: '🎮 Pixel' },
  { id: 'adventurer', url: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Adv', name: '🦸 Hero' },
  { id: 'croodles', url: 'https://api.dicebear.com/7.x/croodles/svg?seed=Crood', name: '😎 Cool' },
  { id: 'fun-emoji', url: 'https://api.dicebear.com/7.x/fun-emoji/svg?seed=Happy', name: '😊 Happy' },
  { id: 'lorelei', url: 'https://api.dicebear.com/7.x/lorelei/svg?seed=Lore', name: '🌸 Cute' },
  { id: 'micah', url: 'https://api.dicebear.com/7.x/micah/svg?seed=Mic', name: '🎭 Face' },
];
```

**Implementation Steps:**

1. **Add Avatar Modal to Settings** (in Header.tsx):
```tsx
const [showAvatarPicker, setShowAvatarPicker] = useState(false);
const [selectedAvatar, setSelectedAvatar] = useState(profile.avatar_url);

// In settings modal, add button:
<button 
  onClick={() => setShowAvatarPicker(true)}
  className="w-full p-3 bg-black/20 rounded-lg hover:bg-black/30"
>
  Change Avatar
</button>
```

2. **Create Avatar Picker Component**:
```tsx
{showAvatarPicker && (
  <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4">
    <div className="card-glass p-6 max-w-2xl w-full">
      <h3 className="text-2xl font-heading mb-4">Choose Your Avatar</h3>
      
      {/* Preset Avatars Grid */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {PRESET_AVATARS.map(avatar => (
          <button
            key={avatar.id}
            onClick={() => setSelectedAvatar(avatar.url)}
            className={`p-2 rounded-lg border-2 ${
              selectedAvatar === avatar.url ? 'border-ion-blue' : 'border-gray-600'
            }`}
          >
            <img src={avatar.url} alt={avatar.name} className="w-full rounded" />
            <p className="text-xs mt-1">{avatar.name}</p>
          </button>
        ))}
      </div>
      
      {/* Custom Upload */}
      <div className="border-t border-gray-700 pt-4">
        <label className="block text-sm mb-2">Or upload your own:</label>
        <input
          type="file"
          accept="image/*"
          onChange={handleImageUpload}
          className="w-full p-2 bg-black/20 rounded"
        />
      </div>
      
      {/* Actions */}
      <div className="flex gap-3 mt-4">
        <button onClick={handleSaveAvatar} className="flex-1 bg-ion-blue p-3 rounded">
          Save
        </button>
        <button onClick={() => setShowAvatarPicker(false)} className="flex-1 bg-gray-600 p-3 rounded">
          Cancel
        </button>
      </div>
    </div>
  </div>
)}
```

3. **Add API Function** (in gameService.ts):
```typescript
export const update_avatar = async (avatar_url: string): Promise<void> => {
  const user = await getCurrentUser();
  await updateProfile(user.id, { avatar_url });
  return mockApiCall(undefined);
};
```

4. **For Custom Upload**, use Supabase Storage:
```typescript
const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;
  
  // Upload to Supabase Storage
  const { data, error } = await supabase.storage
    .from('avatars')
    .upload(`${user.id}/${Date.now()}.png`, file);
  
  if (error) {
    addToast('Upload failed', 'error');
    return;
  }
  
  // Get public URL
  const { data: urlData } = supabase.storage
    .from('avatars')
    .getPublicUrl(data.path);
  
  setSelectedAvatar(urlData.publicUrl);
};
```

5. **Enable Storage in Supabase**:
   - Go to Supabase Dashboard → Storage
   - Create bucket named `avatars`
   - Make it public
   - Set RLS policies to allow authenticated users to upload

---

### 5. Question Upload System

**Two Options:**

#### Option A: Supabase Dashboard (Easiest)

1. Go to Supabase Dashboard → Table Editor → `questions` table (if doesn't exist, create it)

2. **Create questions table** (run in SQL Editor):
```sql
CREATE TABLE IF NOT EXISTS questions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    subject_id TEXT NOT NULL,
    question_text TEXT NOT NULL,
    choices JSONB NOT NULL, -- {"A": "...", "B": "...", "C": "...", "D": "..."}
    correct_answer TEXT NOT NULL, -- "A", "B", "C", or "D"
    explanation TEXT,
    difficulty INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add RLS
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view questions"
    ON questions FOR SELECT
    USING (true);
```

3. **Add Questions Manually** in Table Editor or use SQL:
```sql
INSERT INTO questions (subject_id, question_text, choices, correct_answer, explanation, difficulty) VALUES
('subj_science', 'What is the chemical symbol for water?', 
 '{"A": "H2O", "B": "CO2", "C": "O2", "D": "N2"}',
 'A', 
 'Water is composed of 2 hydrogen atoms and 1 oxygen atom', 
 1),
('subj_math', 'What is 7 × 8?',
 '{"A": "54", "B": "56", "C": "58", "D": "60"}',
 'B',
 '7 × 8 = 56',
 2);
```

#### Option B: CSV Import Tool

1. Create CSV file `questions.csv`:
```csv
subject_id,question_text,choice_a,choice_b,choice_c,choice_d,correct_answer,explanation,difficulty
subj_science,What is H2O?,Water,Oxygen,Hydrogen,Carbon,A,H2O is the chemical formula for water,1
subj_math,What is 5+5?,8,9,10,11,C,5 plus 5 equals 10,1
```

2. **Create Import Script** `scripts/import-questions.ts`:
```typescript
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as csv from 'csv-parser';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY! // Use service key, not anon key
);

async function importQuestions(csvPath: string) {
  const questions: any[] = [];
  
  fs.createReadStream(csvPath)
    .pipe(csv())
    .on('data', (row) => {
      questions.push({
        subject_id: row.subject_id,
        question_text: row.question_text,
        choices: {
          A: row.choice_a,
          B: row.choice_b,
          C: row.choice_c,
          D: row.choice_d,
        },
        correct_answer: row.correct_answer,
        explanation: row.explanation,
        difficulty: parseInt(row.difficulty),
      });
    })
    .on('end', async () => {
      const { error } = await supabase
        .from('questions')
        .insert(questions);
      
      if (error) {
        console.error('Import failed:', error);
      } else {
        console.log(`✅ Imported ${questions.length} questions`);
      }
    });
}

importQuestions('./questions.csv');
```

3. **Run Import**:
```bash
npm install csv-parser
npx ts-node scripts/import-questions.ts
```

#### Update mcq_questions_get to Use Database:

```typescript
export const mcq_questions_get = async (subject_id: string, limit: number = 5): Promise<Question[]> => {
  const { data: questions, error } = await supabase
    .from('questions')
    .select('*')
    .eq('subject_id', subject_id)
    .limit(limit);
  
  if (error || !questions) {
    console.error('Error fetching questions:', error);
    return mockApiCall([]); // Fallback to empty
  }
  
  // Transform to Question format
  return mockApiCall(questions.map(q => ({
    id: q.id,
    subject_id: q.subject_id,
    prompt: q.question_text,
    choices: q.choices,
    correct: q.correct_answer,
    explanation: q.explanation,
  })));
};
```

---

### 6. Real-time Updates

**Implement Supabase Realtime Subscriptions:**

#### Setup in App.tsx:

```typescript
useEffect(() => {
  // Subscribe to activity feed updates
  const activityChannel = supabase
    .channel('activities')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'activities'
      },
      (payload) => {
        console.log('New activity!', payload);
        // Refresh news feed
        GameService.news_feed().then(setNews);
      }
    )
    .subscribe();
  
  // Subscribe to profile updates (for coin/XP changes from attacks)
  const profileChannel = supabase
    .channel('profile_updates')
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'users',
        filter: `id=eq.${profile.id}`
      },
      (payload) => {
        console.log('Profile updated!', payload);
        // Update profile
        setProfile(payload.new as Profile);
      }
    )
    .subscribe();
  
  // Cleanup on unmount
  return () => {
    supabase.removeChannel(activityChannel);
    supabase.removeChannel(profileChannel);
  };
}, [profile?.id]);
```

#### Add Real-time to Clan Chat:

```typescript
// In ClanView.tsx
useEffect(() => {
  if (!currentClan) return;
  
  const chatChannel = supabase
    .channel(`clan_chat_${currentClan.id}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'clan_chat',
        filter: `clan_id=eq.${currentClan.id}`
      },
      (payload) => {
        // Add new message to chat
        const newMessage = payload.new as ClanChatMessage;
        setChatMessages(prev => [...prev, newMessage]);
      }
    )
    .subscribe();
  
  return () => {
    supabase.removeChannel(chatChannel);
  };
}, [currentClan?.id]);
```

#### Enable Realtime in Supabase:

1. Go to Supabase Dashboard → Database → Replication
2. Enable replication for:
   - `activities`
   - `users`
   - `clan_chat`
   - `activity_reactions`

---

## 🚀 Deployment Checklist

After implementing features:

1. **Test Locally:**
   ```bash
   npm run dev
   ```

2. **Build:**
   ```bash
   npm run build
   ```

3. **Commit & Push:**
   ```bash
   git add .
   git commit -m "Add avatar picker and real-time updates"
   git push origin main
   ```

4. **Verify Deployment:**
   - Wait 2-3 minutes for Vercel
   - Test on production URL
   - Check Supabase logs if issues

---

## 📱 Mobile Testing Tips

- Test header scrolling behavior
- Verify settings modal is accessible
- Check avatar picker on small screens
- Ensure back button is easy to tap
- Test landscape orientation

---

## 🎯 Priority Order

1. ✅ **Header & Navigation** - DONE
2. ✅ **Clan Display** - DONE
3. 🔄 **Real-time Updates** - RECOMMENDED NEXT (biggest impact)
4. **Avatar Selection** - Fun feature
5. **Question Upload** - Content management

Real-time updates will make the game feel much more alive and responsive!
