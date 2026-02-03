# `batch` vs `class_students` - Quick Reference

## The Difference in One Picture

```
┌────────────────────────────────────────────────────────────┐
│                  Two Different Things                       │
└────────────────────────────────────────────────────────────┘

DENORMALIZED (Convenience)        NORMALIZED (Authority)
─────────────────────────         ──────────────────────

users.batch = "6A"                class_students:
  │                                 class_id = "class-uuid-456"
  │ Just a text field              student_id = "alice-uuid-123"
  │ No validation                   enrolled_at = "2026-01-15"
  │ No constraints
  │ Could be wrong                  Actually linked to:
  │                                   → specific class object
  │ Cannot find: which teacher?      → in specific school
  │ Cannot find: when enrolled?      → with timestamp
  │ Cannot find: other students?     → validates everything
  │
  └─→ Used for: Display, quick info
      Example: "Alice's batch is 6A"
      
      ❌ Do NOT rely on for:
         - Filtering students for teachers
         - Enrollment decisions
         - Multi-school safety
         - Audit trails
```

---

## Real-World Comparison

### Scenario: Student Alice

**Option A: Only `users.batch`**
```
Alice in users table:
  batch = "6A"

Questions:
Q: "Show me Alice's class?"
A: "6A" ← But which school? Multiple use "6A"!

Q: "Who's Alice's teacher?"
A: ??? Can't find (batch doesn't link to teacher)

Q: "When was Alice enrolled?"
A: ??? No timestamp in batch field

Q: "Move Alice to 6B"
A: UPDATE users SET batch = "6B" WHERE id = alice
   ❌ No history, no validation, no audit trail
```

**Option B: With `class_students`**
```
Alice in class_students:
  class_id = "class-uuid-456"
  student_id = "alice-uuid-123"
  enrolled_at = "2026-01-15"

class-uuid-456 in classes:
  school_id = "school-uuid-789"
  class_code = "6A"
  grade_level = 6

Questions:
Q: "Show me Alice's class?"
A: ✅ Silk Road International School, Class 6A

Q: "Who's Alice's teacher?"
A: ✅ Mr. Khan (linked via class_teacher_assignments)

Q: "When was Alice enrolled?"
A: ✅ 2026-01-15

Q: "Move Alice to 6B"
A: ✅ DELETE FROM class_students WHERE id = ...
   ✅ INSERT INTO class_students (new 6B class)
   ✅ History preserved, validation enforced
```

---

## Code Usage Examples

### Example 1: Admin Portal - "Show Unassigned Students"
```typescript
// This requires class_students
const assignedStudents = await listClassStudents(classIds);
// Result: Map of student_id → class_id

// Filter: students in school_members but NOT in assignmentMap
const unassigned = schoolStudents.filter(
  s => !assignmentMap[s.user_id]
);

// ❌ Can't do this with just batch field
// Because batch is just text, not the actual enrollment record
```

---

### Example 2: Teacher Portal - "Get My Students"
```sql
-- WITH class_students (correct)
SELECT u.id, u.username
FROM class_students cs
JOIN classes c ON c.id = cs.class_id
JOIN class_teacher_assignments cta ON cta.class_id = c.id
JOIN users u ON u.id = cs.student_id
WHERE cta.teacher_user_id = 'teacher-123'
  AND cta.active = true;

-- WITHOUT class_students (impossible)
SELECT u.id, u.username
FROM users u
WHERE u.batch = 'The teacher taught class?'  ❌ No way to find this!
  AND u.school_id = 'teacher-school'        ❌ How does teacher link to class?
```

---

### Example 3: Move Student Between Classes
```typescript
// WITH class_students (proper)
await moveStudentToClassViaRPC(studentId, newClassId);
// Under the hood:
//   DELETE FROM class_students WHERE student_id = X AND class_id != newClassId
//   INSERT INTO class_students (class_id, student_id) VALUES (newClassId, X)
// ✅ Full audit trail, validation, multi-tenancy safe

// WITHOUT class_students (would do)
UPDATE users SET batch = '6B' WHERE id = X
// ❌ What if 6B doesn't exist?
// ❌ What if student was in school2's 6A?
// ❌ No history of the move
// ❌ Could corrupt data
```

---

## The Truth Table

| Need | `batch` only | `class_students` |
|------|--------------|------------------|
| "Which class is Alice in?" | 📋 Alice is in batch "6A" | 🔗 Alice is enrolled in class UUID-456 (code: 6A, school: Silk Road) |
| "Show me all students in class 6A" | 🔍 Search all users where batch='6A' | 🔗 JOIN class_students WHERE class_id = ? |
| "Who teaches Alice?" | ❌ No way | 🔗 class → class_teacher_assignments → teacher |
| "When was Alice enrolled?" | ❌ No timestamp | ✅ class_students.enrolled_at |
| "Is this student in my school?" | ⚠️ Text could match any school | 🔐 FK constraint: class.school_id |
| "Move Alice to new class" | 💥 Just change text, lose history | ✅ Delete + Insert, full audit trail |
| "How many students in each class?" | 🐌 Full table scan, inefficient | ⚡ SELECT COUNT(*) FROM class_students GROUP BY class_id |
| "Can teacher see this student?" | ❌ No way to enforce | 🔐 RLS validates via class_students |

---

## Analogy

```
users.batch = "Your seat number is 4B"
  ↓
Just a label/reminder
Could be wrong
Could be out of date
No validation

class_students = "Official enrollment record that you're in seat 4B"
  ↓
Legal record
Validated and constrained
Timestamp of when you enrolled
Linked to actual seat object (which is in which room/school)
Can be audited
```

---

## When to Use Each

### Use `users.batch` for:
- ✅ Quick display in UI ("Alice is in batch 6A")
- ✅ Filtering students by grade in a school
- ✅ Bulk operations where school context is clear
- ✅ Legacy compatibility

### Use `class_students` for:
- ✅ **Everything related to actual enrollment**
- ✅ Finding which students a teacher teaches
- ✅ Determining enrollment status
- ✅ Multi-tenancy safety (school isolation)
- ✅ Audit trails and enrollment history
- ✅ RLS policies and security
- ✅ Teacher visibility to students

### The Rule:
If you need to know "which students are in this class?" → Use `class_students`
If you need to know "what batch is Alice in?" → Use `users.batch`

---

## Bottom Line

| | `batch` | `class_students` |
|---|---------|------------------|
| **Type** | TEXT ("6A") | RELATIONSHIP (UUID → UUID) |
| **Purpose** | Metadata, display | Enrollment authority |
| **Trust Level** | ⚠️ Denormalized (can be stale) | ✅ Normalized (source of truth) |
| **Safety** | ❌ No validation | ✅ FK constraints |
| **Multi-tenancy** | ❌ Unsafe | ✅ Safe |
| **Audit trail** | ❌ No history | ✅ Full history |
| **Source of truth** | ❌ No | ✅ Yes |

**Never use just `batch` for enrollment decisions. Always use `class_students` as the source of truth.**
