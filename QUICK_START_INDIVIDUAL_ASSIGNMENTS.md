# Quick Start: Individual Student Assignments

## 🚀 Deploy in 3 Steps

### 1️⃣ Run Database Migration (2 minutes)
Open Supabase SQL Editor and run:
```sql
-- Copy and paste the entire content of:
ENABLE_INDIVIDUAL_STUDENT_ASSIGNMENTS.sql
```

### 2️⃣ No Frontend Changes Needed! ✅
All TypeScript changes are already in the codebase. Just restart your dev server if running.

### 3️⃣ Test It Out
1. Login as a teacher
2. Go to **Assignments** → **New Assignment**
3. Click **"👥 Select Students"** button
4. Search and select specific students
5. Create assignment!

## 📝 Quick Examples

### Example 1: Assign to Top Performers
```
Mode: Select Students
Students: Pick 5 top students from any grade/batch
Subject: Advanced Maths
Questions: 10 hard questions
```

### Example 2: Remedial Assignment
```
Mode: Select Students  
Students: 3 students who need extra help
Subject: Science
Questions: 5 easy review questions
```

### Example 3: Whole Batch (Old Way Still Works!)
```
Mode: Assign to Batch
Batch: 8A
Subject: English
Questions: 15 mixed difficulty
```

## ✨ Key Features

| Feature | Description |
|---------|-------------|
| 🔍 **Search** | Find students by name, username, or batch |
| ✅ **Select All** | Quickly select all filtered students |
| 🎯 **Mix & Match** | Combine students from different grades/batches |
| 📊 **Live Count** | See how many students selected |
| 🔄 **Backward Compatible** | Old batch assignments still work perfectly |

## 🎓 User Interface

### Mode Toggle
```
┌─────────────────────┬─────────────────────┐
│  📚 Assign to Batch  │  👥 Select Students │
└─────────────────────┴─────────────────────┘
```

### Student Selector
```
┌────────────────────────────────────────────┐
│ Select Students (3 selected)   [Select All] [Clear] │
├────────────────────────────────────────────┤
│ Search students...                         │
├────────────────────────────────────────────┤
│ ☑ John Doe                                 │
│   @johndoe · Grade 8 · 8A                  │
├────────────────────────────────────────────┤
│ ☑ Jane Smith                               │
│   @janesmith · Grade 9 · 9B                │
├────────────────────────────────────────────┤
│ ☐ Bob Wilson                               │
│   @bobw · Grade 8 · 8C                     │
└────────────────────────────────────────────┘
```

## 🔒 Permissions

- ✅ Teachers can only assign to their students
- ✅ Banned students automatically excluded
- ✅ RLS policies protect all operations
- ✅ Teacher verification on all endpoints

## 📋 What Gets Created

### Batch Assignment
```sql
assignments (mode='batch', batch='8A')
  → student_assignments (for all 8A students)
```

### Custom Assignment  
```sql
assignments (mode='custom', batch=NULL)
  → assignment_students (tracks selections)
  → student_assignments (for selected students only)
```

## ❓ FAQs

**Q: Can I mix batch and custom in one assignment?**  
A: No, each assignment uses one mode. But you can create multiple assignments!

**Q: What happens to old assignments?**  
A: They continue working exactly as before. No changes needed.

**Q: Can students see who else has the assignment?**  
A: Students only see their own assignments, not who else received it.

**Q: Is there a limit on selected students?**  
A: No hard limit, but practically keep it reasonable (1-100 students).

**Q: Can I save student groups?**  
A: Not yet, but it's on the roadmap! For now, use search to quickly find similar students.

## 🐛 Troubleshooting

### No students appearing?
```sql
-- Check if students exist
SELECT id, username, grade, batch, role 
FROM users 
WHERE COALESCE(role, 'student') = 'student'
  AND NOT COALESCE(is_banned, false);
```

### Assignment creation fails?
1. Check you selected at least 1 student in custom mode
2. Verify you selected a batch in batch mode  
3. Ensure you have at least 1 question selected

### Search not working?
- Clear and retype search term
- Try searching by username instead of display name
- Check if student has the expected batch/grade

## 🎯 Pro Tips

1. **Quick Filter by Batch**: Type "8A" in search to see only 8A students
2. **Select by Name**: Search partial names - "john" finds "John Doe"  
3. **Clear Between Assignments**: Use "Clear" before creating next assignment
4. **Verify Count**: Always check the "X selected" count before creating
5. **Test First**: Create a test assignment to yourself before rolling out

## 📞 Need Help?

1. Check console for errors (F12)
2. Review `INDIVIDUAL_STUDENT_ASSIGNMENTS_GUIDE.md` for details
3. Verify SQL migration completed successfully
4. Check student data in users table

---
**Ready to Use!** Start creating targeted assignments now! 🎉
