# Cambridge Listening Test 1 - Setup Instructions

## ✅ Test Created Successfully!

The Cambridge Listening Test 1 has been added to your game with all 25 questions and correct answers.

### 📋 Test Structure

**Part 1 (Q1-5):** Picture-based multiple choice (A, B, C)
- Question 1: What is the girl having for a snack now? → Answer: C
- Question 2: What does the boy's mother look like? → Answer: A
- Question 3: Where did the boy go first on Saturday? → Answer: B
- Question 4: What is the girl taking to school? → Answer: B
- Question 5: What does the boy advise the girl to do next? → Answer: C

**Part 2 (Q6-10):** Multiple choice scenarios
- Q6: Transport in city → Answer: B
- Q7: Football museum → Answer: B
- Q8: Photography competition → Answer: A
- Q9: School library → Answer: C
- Q10: Film recommendation → Answer: A

**Part 3 (Q11-15):** Fill in the blanks - School Orchestra
- Q11: Thursdays
- Q12: flute
- Q13: dance studio
- Q14: restaurant
- Q15: DRASTLE

**Part 4 (Q16-20):** Interview with Mandy Livingstone
- Q16: B (cooked with dad after school)
- Q17: C (heard on radio)
- Q18: C (friends interested to know more)
- Q19: A (felt could have done better)
- Q20: A (make cooking videos)

**Part 5 (Q21-25):** Matching speakers to statements
- Q21: H (new sports equipment)
- Q22: E (enjoy more than expected)
- Q23: D (was injured recently)
- Q24: C (made lots of friends)
- Q25: B (started at school)

---

## 🎧 Audio File Setup

### Option 1: Place Audio in Project Folder (Recommended)

1. **Rename your audio file** to: `cambridge_listening_test_1.mp3`
2. **Copy the file** to: `c:\Users\reigh\OneDrive\Documents\GitHub\g-brain-heist\`
3. The test will automatically find it when students click on the test

### Option 2: Upload to Supabase Storage

If you want to host the audio online:

1. Go to your Supabase Dashboard: https://sozodkxwhubespiedgxm.supabase.co
2. Navigate to **Storage** → **Buckets**
3. Create a new bucket called `cambridge-audio` (make it public)
4. Upload your audio file as `listening_test_1.mp3`
5. Update the audio source in `cambridge_listening_test_1.html`:
   - Find line with: `<source src="cambridge_listening_test_1.mp3"`
   - Replace with: `<source src="https://sozodkxwhubespiedgxm.supabase.co/storage/v1/object/public/cambridge-audio/listening_test_1.mp3"`

---

## 🎮 How Students Access the Test

1. Students log into Brains Heist game
2. Click on **Cambridge Tests** section
3. They'll see the new "Cambridge Listening Test 1" card with:
   - 🎧 Listening category badge
   - 25 questions
   - 30 minute duration
   - Intermediate difficulty
4. Click **Start Test** to begin
5. Their name and class are auto-filled from the game
6. They can play, pause, and replay the audio as needed
7. After submission, they see their score immediately

---

## 📊 Viewing Results

All test submissions are saved to the `quiz_scores` table in Supabase:
- Student name
- Class
- Score (out of 25)
- Percentage
- Individual answers
- Time taken

You can view results in Supabase Dashboard → **Table Editor** → **quiz_scores**

Or query them:
```sql
SELECT 
  student_name,
  student_class,
  score,
  percentage,
  submitted_at
FROM quiz_scores
WHERE quiz_name = 'Cambridge Listening Test 1'
ORDER BY submitted_at DESC;
```

---

## 🔧 Test Features

✅ **One-time submission** - Students can only submit once (tracked via localStorage + database)
✅ **Auto-scoring** - Immediate feedback with correct answers shown
✅ **Timer tracking** - Records how long students take
✅ **Audio controls** - Students can pause/replay as needed
✅ **Game integration** - Auto-fills student info from game login
✅ **Anti-cheat** - Prevents copy-paste of questions
✅ **Progress tracking** - Shows as completed in Cambridge Tests hub

---

## 📝 Next Steps

1. **Upload the audio file** using one of the methods above
2. **Test it yourself** - Click on the test from Cambridge Tests hub
3. **Share with students** - They can access it from the game

That's it! The test is ready to use. 🎉
