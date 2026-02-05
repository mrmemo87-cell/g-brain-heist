# Easy Way to Add More AS Chemistry Tests

The AS Chemistry test system is modular and easy to expand. Here's the complete process:

## Overview

Adding a new AS Chemistry test requires **3 simple steps**:
1. Create an HTML test file (copy/modify existing one)
2. Add answer keys to the TypeScript file
3. Register the test in CambridgeTestsHub.tsx

---

## Step 1: Create the HTML Test File

### Quick Copy Method (Easiest)
1. Go to `public/cambridge-tests/Chemistry/`
2. Copy any existing `.html` file (e.g., `atomic_structure.html`)
3. Rename it to your new test (e.g., `thermodynamics.html`)
4. Edit the file with your questions and answers

### What to Change in the HTML File

The HTML files follow a standard structure. You only need to modify:

```html
<!-- Change this -->
<h1 id="quizTitle" style="margin: 2px 0 6px; font-size: 26px;">AS Chemistry — [YOUR TEST NAME]</h1>
<div id="quizSubtitle" style="color: var(--text-muted); font-size: 14px;">Chapter X • [NUMBER] multiple-choice questions</div>

<!-- Add/modify questions in this format -->
const questionsData = [
  { q: "Question 1 text?", options: ["A", "B", "C", "D"], correct: "B", explanation: "Why B is correct" },
  { q: "Question 2 text?", options: ["A", "B", "C", "D"], correct: "C", explanation: "Why C is correct" },
  // ... add more questions
];
```

**Existing Test Files** (use as templates):
- `atomic_structure.html` - 49 questions (two parts)
- `atoms_molecules_stoichiometry.html` - 64 questions
- `chemical_bonding.html` - 55 questions
- `states_of_matter.html` - 61 questions
- `chemical_energetics.html` - 53 questions
- `electrochemistry.html` - 56 questions
- `equilibria.html` - 61 questions
- `group_2.html` - 73 questions
- `reaction_kinetics.html` - ~50 questions

Each file is self-contained with its own questions array.

---

## Step 2: Add Answer Keys

Edit [components/chemistryAnswerKeys.ts](components/chemistryAnswerKeys.ts)

Add an entry following this format:

```typescript
'AS Chemistry Ch11 (Your Topic)': {
  1: 'A', 2: 'B', 3: 'C', 4: 'D', 5: 'A', 6: 'B', 7: 'C', 8: 'D', 9: 'A', 10: 'B',
  11: 'C', 12: 'D', 13: 'A', 14: 'B', 15: 'C', 16: 'D', 17: 'A', 18: 'B', 19: 'C', 20: 'D',
  // ... add one entry per question (question_number: 'answer')
},
```

**Key points:**
- Key must be **exactly** `'AS Chemistry Ch#'` format to match the HTML quiz name
- Each number gets a letter answer (A, B, C, or D)
- Must have same number of answers as questions in HTML

---

## Step 3: Register in CambridgeTestsHub.tsx

Edit [components/CambridgeTestsHub.tsx](components/CambridgeTestsHub.tsx)

Add entries to the `AVAILABLE_TESTS` array (around line 90-200):

### For Single-Part Test:
```typescript
{
  id: 'as-chemistry-ch11-your-topic',
  name: 'AS Chemistry Ch11 (Your Topic)',
  description: 'Chapter 11 multiple-choice practice covering [key concepts].',
  duration: '50 min',
  totalQuestions: 50,  // Match your HTML file
  difficulty: 'Advanced',
  category: 'Science',
  subject: 'AS Chemistry',
  url: '/cambridge-tests/Chemistry/your_filename.html',  // Your new HTML file
},
```

### For Two-Part Test (Like Atomic Structure):
```typescript
{
  id: 'as-chemistry-ch11-your-topic-part-1',
  name: 'AS Chemistry Ch11 (Your Topic) (Part 1)',
  description: 'Chapter 11 part 1 - multiple-choice practice covering [concepts].',
  duration: '50 min',
  totalQuestions: 25,
  difficulty: 'Advanced',
  category: 'Science',
  subject: 'AS Chemistry',
  url: '/cambridge-tests/Chemistry/your_filename.html?part=1',
},
{
  id: 'as-chemistry-ch11-your-topic-part-2',
  name: 'AS Chemistry Ch11 (Your Topic) (Part 2)',
  description: 'Chapter 11 part 2 - multiple-choice practice covering [concepts].',
  duration: '48 min',
  totalQuestions: 24,
  difficulty: 'Advanced',
  category: 'Science',
  subject: 'AS Chemistry',
  url: '/cambridge-tests/Chemistry/your_filename.html?part=2',
},
```

---

## Complete Example: Adding "AS Chemistry Ch11 (Thermodynamics)"

### 1. Create HTML: `public/cambridge-tests/Chemistry/thermodynamics.html`
Copy from `atomic_structure.html`, change:
- Title to "AS Chemistry — Thermodynamics"
- Subtitle to "Chapter 11 • 50 multiple-choice questions"
- Questions array with your 50 questions

### 2. Add to chemistryAnswerKeys.ts:
```typescript
'AS Chemistry Ch11 (Thermodynamics)': {
  1: 'A', 2: 'B', 3: 'A', 4: 'C', 5: 'D',
  6: 'B', 7: 'C', 8: 'A', 9: 'D', 10: 'B',
  // ... 40 more answers
  51: 'A',
},
```

### 3. Add to CambridgeTestsHub.tsx (AVAILABLE_TESTS array):
```typescript
{
  id: 'as-chemistry-ch11-thermodynamics',
  name: 'AS Chemistry Ch11 (Thermodynamics)',
  description: 'Chapter 11 multiple-choice practice on enthalpy, entropy, spontaneity, and free energy.',
  duration: '52 min',
  totalQuestions: 50,
  difficulty: 'Advanced',
  category: 'Science',
  subject: 'AS Chemistry',
  url: '/cambridge-tests/Chemistry/thermodynamics.html',
},
```

✅ Done! The test now appears in the Cambridge Tests hub immediately.

---

## Features Automatically Included

All Chemistry tests automatically get:
- ✅ Auto-scoring with correct answers shown
- ✅ Student name/class auto-filled from game login
- ✅ Timer tracking
- ✅ One-time submission enforcement
- ✅ Score release system (admin can hold/release scores)
- ✅ Admin reporting with mistake analysis
- ✅ Submission saved to database

---

## Tips

**For faster setup:**
- Use existing test HTML as template (copy all structure)
- Count questions before creating answers array
- Match test duration to question count (~1 min per question)
- Use consistent naming: `AS Chemistry ChX (Topic Name)`

**For testing:**
- Use browser DevTools (F12) to check console for errors
- Test as student: login, start test, submit
- Check admin portal to verify scores saved

**For splitting into parts:**
- Use `?part=1` and `?part=2` query parameters
- Split questions into roughly equal halves
- Update totalQuestions for each part accordingly

---

## Existing Chemistry Tests (Already Set Up)

| Chapter | HTML File | Questions | Status |
|---------|-----------|-----------|--------|
| 1: Atomic Structure | atomic_structure.html | 49 | ✅ Complete |
| 2: Atoms, molecules & stoichiometry | atoms_molecules_stoichiometry.html | 64 | ✅ Complete |
| 3: Chemical bonding | chemical_bonding.html | 55 | ✅ Complete |
| 4: States of matter | states_of_matter.html | 61 | ✅ Complete |
| 5: Chemical Energetics | chemical_energetics.html | 53 | ✅ Complete |
| 6: Electrochemistry | electrochemistry.html | 56 | ✅ Complete |
| 7: Equilibria | equilibria.html | 61 | ✅ Complete |
| 8: Reaction kinetics | reaction_kinetics.html | ~50 | ✅ Complete |
| 10: Group 2 | group_2.html | 73 | ✅ Complete |

---

## Adding a New AS Subject (Physics, Biology, etc.)

If you want to add tests for a **different subject** (e.g., AS Physics, AS Biology, AS Economics), you need 4 steps instead of 3:

### 1. Create Answer Keys File

Create a new TypeScript file: `components/physicsAnswerKeys.ts` (for Physics example)

```typescript
export const physicsAnswerKeys: Record<string, Record<number, string>> = {
  'AS Physics Ch1 (Mechanics)': {
    1: 'A', 2: 'B', 3: 'C', 4: 'D', 5: 'A', 6: 'B', 7: 'C', 8: 'D', 9: 'A', 10: 'B',
    // ... add all answers
  },
  'AS Physics Ch2 (Waves)': {
    1: 'C', 2: 'D', 3: 'A', 4: 'B', 5: 'C', // ... etc
  },
};

export const physicsQuestionRanges: Record<string, { start: number; end: number }> = {
  'AS Physics Ch1 (Mechanics)': { start: 1, end: 60 },
  'AS Physics Ch2 (Waves)': { start: 1, end: 55 },
};
```

### 2. Update CambridgeTestsHub.tsx

Two changes:

**Change A:** Update the subject type definition (line 13):
```typescript
// Before:
subject: 'English stage 9' | 'AS Chemistry';

// After:
subject: 'English stage 9' | 'AS Chemistry' | 'AS Physics';
```

**Change B:** Add your test entries to AVAILABLE_TESTS array with the new subject:
```typescript
{
  id: 'as-physics-ch1-mechanics',
  name: 'AS Physics Ch1 (Mechanics)',
  description: 'Chapter 1 multiple-choice practice on forces, motion, and energy.',
  duration: '60 min',
  totalQuestions: 60,
  difficulty: 'Advanced',
  category: 'Science',
  subject: 'AS Physics',  // ← New subject
  url: '/cambridge-tests/Physics/mechanics.html',
},
```

### 3. Update AdminPortal.tsx

**Change A:** Import the new answer keys (line 13):
```typescript
// Before:
import { chemistryAnswerKeys, chemistryQuestionRanges } from './chemistryAnswerKeys';

// After:
import { chemistryAnswerKeys, chemistryQuestionRanges } from './chemistryAnswerKeys';
import { physicsAnswerKeys, physicsQuestionRanges } from './physicsAnswerKeys';
```

**Change B:** Add to the answerKeysMap (around line 581):
```typescript
const answerKeysMap = {
  ...chemistryAnswerKeys,
  ...physicsAnswerKeys,  // ← Add this
};
```

**Change C:** Update the score release condition (around line 2204):
```typescript
// Before:
{quizFilter !== 'all' && quizFilter.toLowerCase().includes('chemistry') && (

// After:
{quizFilter !== 'all' && (quizFilter.toLowerCase().includes('chemistry') || quizFilter.toLowerCase().includes('physics')) && (
```

This makes score release work for Physics too (repeat for each new subject).

### 4. Create HTML test files and folders

- Create folder: `public/cambridge-tests/Physics/`
- Create HTML files in that folder: `mechanics.html`, `waves.html`, etc.
- Follow the same structure as Chemistry tests

---

## Quick Subject Template

For any new AS subject, you need:

| File | Location | Purpose |
|------|----------|---------|
| Answer keys | `components/[subject]AnswerKeys.ts` | All answers for all tests |
| CambridgeTestsHub | Update type + array | Register tests in UI |
| AdminPortal | Update imports + maps | Enable admin score release |
| HTML tests | `public/cambridge-tests/[Subject]/` | The actual tests |

---

## Troubleshooting

**Test doesn't appear in hub?**
- Check spelling: Must be `'AS Physics'` (or your subject) in subject field
- Verify ID is unique (no duplicates)
- Verify you updated the subject type definition in CambridgeTestsHub.tsx line 13
- Restart app (clear cache: Ctrl+Shift+Delete)

**Scoring doesn't work?**
- Verify answer keys match HTML exactly (case-sensitive A/B/C/D)
- Check answer key title matches quiz name in HTML
- Ensure question numbers are sequential (1, 2, 3... not gaps)

**Admin can't release scores?**
- Run this SQL: `ALTER TABLE quiz_scores ADD COLUMN score_released BOOLEAN DEFAULT FALSE;`
- Test might need to be marked as Chemistry type (already automatic)

---

## Questions?
All Chemistry tests use the same infrastructure. If something works for one, it works for all.
