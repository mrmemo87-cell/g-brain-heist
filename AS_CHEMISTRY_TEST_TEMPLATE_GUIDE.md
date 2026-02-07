# AS Chemistry Test Creation Guide

A comprehensive reference guide for creating new AS Chemistry tests that follow the established system structure.

---

## Table of Contents

1. [Overview](#overview)
2. [Core System Components](#core-system-components)
3. [Step-by-Step Creation Process](#step-by-step-creation-process)
4. [HTML File Structure](#html-file-structure)
5. [Answer Key Registration](#answer-key-registration)
6. [Test Registration in CambridgeTestsHub](#test-registration-in-cambridgetestshub)
7. [Key Conventions](#key-conventions)
8. [Quality Checklist](#quality-checklist)
9. [Real Examples](#real-examples)

---

## Overview

The AS Chemistry test system consists of **49 questions per single test** (or ~25-26 per part for two-part tests), featuring multiple-choice questions with detailed answer explanations. All tests follow a consistent structure across three main files:

1. **HTML Test Files** - `public/cambridge-tests/Chemistry/*.html`
2. **Answer Keys** - `components/chemistryAnswerKeys.ts`
3. **Test Registry** - `components/CambridgeTestsHub.tsx`

### Current Existing Tests

- `atomic_structure.html` - 49 questions (Atomic Structure, Chapter 1)
- `atoms_molecules_stoichiometry.html` - 64 questions (Chapter 2)
- `chemical_bonding.html` - 55 questions (Chapter 3)
- `states_of_matter.html` - 61 questions (Chapter 4)
- `chemical_energetics.html` - 53 questions (Chapter 5)
- `electrochemistry.html` - 56 questions (Chapter 6)
- `equilibria.html` - 73 questions (Chapter 7)
- `reaction_kinetics.html` - ~50 questions (Chapter 8)
- `chemical_periodicity.html` - 85 questions (Chapter 9)
- `group_2.html` - 73 questions (Chapter 10)

---

## Core System Components

### 1. Test Question Object Structure

Each question in the HTML file follows this format:

```javascript
{
  number: 1,                              // Sequential question number
  code: '9701_m20_qp_12 Q: 1',           // Cambridge exam paper reference
  prompt: 'Question text here?',          // The actual question (can include HTML)
  table: {                                // OR simpleOptions (see below)
    headers: ['Column 1', 'Column 2'],
    rows: [
      { label: 'A', values: ['A1', 'A2'] },
      { label: 'B', values: ['B1', 'B2'] },
      { label: 'C', values: ['C1', 'C2'] },
      { label: 'D', values: ['D1', 'D2'] },
    ]
  },
  explanation: 'Why this answer is correct...'
}
```

**OR for simple options:**

```javascript
{
  number: 1,
  code: '9701_m20_qp_12 Q: 1',
  prompt: 'Question text?',
  simpleOptions: [
    { label: 'A', text: 'Option A text' },
    { label: 'B', text: 'Option B text' },
    { label: 'C', text: 'Option C text' },
    { label: 'D', text: 'Option D text' },
  ],
  explanation: 'Why this answer is correct...'
}
```

### 2. HTML File Template Components

**CSS Variables (in :root):**
```css
--bg-gradient: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0b1033 100%);
--card-bg: rgba(255, 255, 255, 0.05);
--border: rgba(255, 255, 255, 0.12);
--accent: #38bdf8;
--accent-2: #8b5cf6;
--text-main: #e2e8f0;
--text-muted: #94a3b8;
--success: #22c55e;
--warning: #f59e0b;
```

**Key HTML Elements:**
- Quiz title: `<h1 id="quizTitle">` - Format: "AS Chemistry — [Test Name]"
- Quiz subtitle: `<div id="quizSubtitle">` - Format: "Chapter X • [N] multiple-choice questions"
- Questions container: `<div id="quizContainer">`
- Submit area: `<div class="submit-area">`
- Anti-cheat modal: `<div id="antiCheatModal">`
- Submit confirmation modal: `<div id="submitModal">`

### 3. Answer Key Format

In `chemistryAnswerKeys.ts`:

```typescript
export const chemistryAnswerKeys: Record<string, Record<number, string>> = {
  'AS Chemistry Ch# (Topic Name)': {
    1: 'A', 2: 'B', 3: 'C', 4: 'D', 5: 'A', // ... one per question
    // Must match the key in CambridgeTestsHub.tsx exactly
  },
};

export const chemistryQuestionRanges: Record<string, { total: number; splitIndex: number }> = {
  'AS Chemistry Ch# (Topic Name)': { total: XX, splitIndex: YY },
  // total = total number of questions
  // splitIndex = where to split for Part 1 vs Part 2 (roughly half)
};
```

### 4. Test Registry Format

In `CambridgeTestsHub.tsx` (AVAILABLE_TESTS array):

**For Two-Part Tests (Standard):**
```typescript
{
  id: 'as-chemistry-ch#-topic-name-part-1',
  name: 'AS Chemistry Ch# (Topic Name) (Part 1)',
  description: 'Chapter # multiple-choice practice covering [key concepts].',
  duration: '50 min',
  totalQuestions: 25,  // First part count
  difficulty: 'Advanced',
  category: 'Science',
  subject: 'AS Chemistry',
  url: '/cambridge-tests/Chemistry/filename.html?part=1',
},
{
  id: 'as-chemistry-ch#-topic-name-part-2',
  name: 'AS Chemistry Ch# (Topic Name) (Part 2)',
  description: 'Chapter # multiple-choice practice covering [key concepts].',
  duration: '48 min',
  totalQuestions: 24,  // Second part count
  difficulty: 'Advanced',
  category: 'Science',
  subject: 'AS Chemistry',
  url: '/cambridge-tests/Chemistry/filename.html?part=2',
},
```

**For Single-Part Tests:**
```typescript
{
  id: 'as-chemistry-topic-name',
  name: 'AS Chemistry — Topic Name',
  description: 'Multiple-choice practice covering [key concepts].',
  duration: 'XX min',
  totalQuestions: XX,
  difficulty: 'Advanced',
  category: 'Science',
  subject: 'AS Chemistry',
  url: '/cambridge-tests/Chemistry/filename.html',
},
```

---

## Step-by-Step Creation Process

### Step 1: Create the HTML Test File

**Location:** `public/cambridge-tests/Chemistry/`

**Quick Method:**
1. Copy an existing test file (e.g., `atomic_structure.html`)
2. Rename to your new test name (snake_case, e.g., `thermodynamics.html`)
3. Edit the copied file with your questions

**Key Elements to Modify:**
1. **Title and Subtitle:**
   ```html
   <h1 id="quizTitle">AS Chemistry — [Your Test Name]</h1>
   <div id="quizSubtitle">Chapter X • [N] multiple-choice questions</div>
   ```

2. **Quiz Base ID and Name (in JavaScript section):**
   ```javascript
   const QUIZ_BASE_ID = 'as_chemistry_your_test_name';
   const QUIZ_BASE_NAME = 'AS Chemistry — Your Test Name';
   ```

3. **Questions Array:**
   ```javascript
   let QUESTIONS = [
     {
       number: 1,
       code: '9701_m20_qp_12 Q: 1',
       prompt: 'Your first question?',
       // table: OR simpleOptions:
       explanation: 'Explanation here...'
     },
     // Add all remaining questions...
   ];
   ```

4. **Answer Key Array (in the HTML):**
   ```javascript
   let ANSWER_KEY = {
     1: 'A', 2: 'B', 3: 'C', // ... match your questions
   };
   ```

---

### Step 2: Add Answer Keys to chemistryAnswerKeys.ts

**File:** `components/chemistryAnswerKeys.ts`

**Action:**
1. Add a new entry to `chemistryAnswerKeys` object
2. Add a corresponding entry to `chemistryQuestionRanges`

**Key Name Format:**
- **MUST** match the exact name in your HTML's `<h1 id="quizTitle">`
- Format: `'AS Chemistry Ch# (Topic Name)'` or `'AS Chemistry — Topic Name'`

**Example:**
```typescript
export const chemistryAnswerKeys: Record<string, Record<number, string>> = {
  // ... existing entries ...
  'AS Chemistry Ch11 (Your Topic)': {
    1: 'A', 2: 'B', 3: 'C', 4: 'D', 5: 'A', 6: 'B', 7: 'C', 8: 'D', 9: 'A', 10: 'B',
    11: 'C', 12: 'D', 13: 'A', 14: 'B', 15: 'C', 16: 'D', 17: 'A', 18: 'B', 19: 'C', 20: 'D',
    // ... continue for all questions ...
    50: 'A',
  },
};

export const chemistryQuestionRanges: Record<string, { total: number; splitIndex: number }> = {
  // ... existing entries ...
  'AS Chemistry Ch11 (Your Topic)': { total: 50, splitIndex: 25 },
};
```

**Rules:**
- Total questions: 40-85 questions (Atomic Structure has 49, Group 2 has 73)
- Split index: Roughly `Math.ceil(total / 2)` for two-part tests
- Each question number gets exactly one letter (A, B, C, or D)

---

### Step 3: Register in CambridgeTestsHub.tsx

**File:** `components/CambridgeTestsHub.tsx`

**Location:** Find `AVAILABLE_TESTS` array around line 90-200 and add entries

**For Two-Part Test (Standard, 50 questions):**

```typescript
{
  id: 'as-chemistry-ch11-your-topic-part-1',
  name: 'AS Chemistry Ch11 (Your Topic) (Part 1)',
  description: 'Chapter 11 part 1 - multiple-choice practice covering [key concepts].',
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
  description: 'Chapter 11 part 2 - multiple-choice practice covering [key concepts].',
  duration: '50 min',
  totalQuestions: 25,
  difficulty: 'Advanced',
  category: 'Science',
  subject: 'AS Chemistry',
  url: '/cambridge-tests/Chemistry/your_filename.html?part=2',
},
```

**ID Format Rules:**
- Format: `as-chemistry-chX-topic-name-part-Y`
- Use lowercase with hyphens (kebab-case)
- Replace spaces with hyphens
- Use short, descriptive topic names

---

## HTML File Structure

### Complete Minimal Template

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=5.0" />
  <title>AS Chemistry — Your Topic</title>
  <script src="../examguard.js"></script>
  <style>
    :root {
      --bg-gradient: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0b1033 100%);
      --card-bg: rgba(255, 255, 255, 0.05);
      --border: rgba(255, 255, 255, 0.12);
      --accent: #38bdf8;
      --accent-2: #8b5cf6;
      --text-main: #e2e8f0;
      --text-muted: #94a3b8;
      --success: #22c55e;
      --warning: #f59e0b;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 20px;
      font-family: 'Segoe UI', Arial, sans-serif;
      background: var(--bg-gradient);
      color: var(--text-main);
      min-height: 100vh;
    }
    .container {
      max-width: 1000px;
      margin: 0 auto 40px;
      background: rgba(255,255,255,0.04);
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 24px;
      box-shadow: 0 20px 50px rgba(0,0,0,0.35);
    }
    /* ... additional styles from atomic_structure.html ... */
  </style>
</head>
<body>
  <!-- Existing HTML structure from atomic_structure.html -->
  <div class="container">
    <div class="header">
      <img src="..." alt="..." />
      <div>
        <h1 id="quizTitle">AS Chemistry — Your Topic</h1>
        <div id="quizSubtitle">Chapter X • N multiple-choice questions</div>
      </div>
    </div>
    <!-- Rest of structure... -->
  </div>

  <script>
    const QUIZ_BASE_ID = 'as_chemistry_your_topic';
    const QUIZ_BASE_NAME = 'AS Chemistry — Your Topic';
    
    let QUESTIONS = [
      {
        number: 1,
        code: '9701_m20_qp_12 Q: 1',
        prompt: 'Question text?',
        table: {
          headers: ['Column 1', 'Column 2'],
          rows: [
            { label: 'A', values: ['A1', 'A2'] },
            { label: 'B', values: ['B1', 'B2'] },
            { label: 'C', values: ['C1', 'C2'] },
            { label: 'D', values: ['D1', 'D2'] },
          ]
        },
        explanation: 'Why this is correct...'
      },
      // ... more questions ...
    ];
    
    let ANSWER_KEY = {
      1: 'A', 2: 'B', 3: 'C', // ... all answers
    };
    
    // Rest of script from atomic_structure.html...
  </script>
</body>
</html>
```

### Supported Question Types

#### Type 1: Table Format (for comparison questions)

```javascript
{
  number: 1,
  code: 'Reference code',
  prompt: 'Question text?',
  table: {
    headers: ['Property', 'Substance A', 'Substance B'],
    rows: [
      { label: 'A', values: ['Property 1', 'Property 2', 'Property 3'] },
      { label: 'B', values: ['Property 1', 'Property 2', 'Property 3'] },
      { label: 'C', values: ['Property 1', 'Property 2', 'Property 3'] },
      { label: 'D', values: ['Property 1', 'Property 2', 'Property 3'] },
    ]
  },
  explanation: 'The correct answer is...'
}
```

#### Type 2: Simple Options (for text-based questions)

```javascript
{
  number: 1,
  code: 'Reference code',
  prompt: 'Which of the following is correct?',
  simpleOptions: [
    { label: 'A', text: 'First option text' },
    { label: 'B', text: 'Second option text' },
    { label: 'C', text: 'Third option text' },
    { label: 'D', text: 'Fourth option text' },
  ],
  explanation: 'The answer is B because...'
}
```

#### Type 3: Structured Format (for data-heavy questions)

```javascript
{
  number: 1,
  code: 'Reference code',
  prompt: 'Analyze the following structure:',
  structuredData: {
    diagram: '<svg>...</svg>', // Optional HTML/SVG
    text: 'Additional data...'
  },
  simpleOptions: [
    { label: 'A', text: 'Option A' },
    // ...
  ],
  explanation: 'Explanation...'
}
```

---

## Answer Key Registration

### chemistryAnswerKeys.ts Structure

**Important Rules:**

1. **Key Name Matching**: The key in this file MUST EXACTLY match the `<h1 id="quizTitle">` text in your HTML
2. **Numbering**: Must start at 1 and be consecutive for all questions
3. **Answer Letters**: Only A, B, C, or D
4. **Question Count**: Must match the total number of questions in your HTML test

**Example Entry:**

```typescript
'AS Chemistry — Atomic Structure': {
  1: 'A', 2: 'C', 3: 'C', 4: 'D', 5: 'B', 6: 'B', 7: 'A', 8: 'A', 9: 'D', 10: 'D',
  11: 'B', 12: 'A', 13: 'C', 14: 'A', 15: 'C', 16: 'A', 17: 'D', 18: 'C', 19: 'C', 20: 'B',
  21: 'B', 22: 'A', 23: 'B', 24: 'D', 25: 'A', 26: 'C', 27: 'D', 28: 'A', 29: 'D', 30: 'C',
  31: 'D', 32: 'D', 33: 'D', 34: 'B', 35: 'C', 36: 'D', 37: 'B', 38: 'A', 39: 'A', 40: 'C',
  41: 'D', 42: 'A', 43: 'C', 44: 'C', 45: 'D', 46: 'C', 47: 'A', 48: 'D', 49: 'A',
},
```

### chemistryQuestionRanges Structure

**Purpose**: Defines total question count and split point for two-part tests

```typescript
'AS Chemistry — Atomic Structure': { 
  total: 49,      // Total number of questions
  splitIndex: 25, // Index where Part 1 ends (roughly half)
},
```

**Split Index Guidelines:**
- For 49 questions: splitIndex = 25 (Part 1: 25, Part 2: 24)
- For 50 questions: splitIndex = 25 (Part 1: 25, Part 2: 25)
- For 64 questions: splitIndex = 32 (Part 1: 32, Part 2: 32)
- For 73 questions: splitIndex = 37 (Part 1: 37, Part 2: 36)

---

## Test Registration in CambridgeTestsHub

### AVAILABLE_TESTS Array Structure

Each test entry needs these exact properties:

| Property | Type | Example | Notes |
|----------|------|---------|-------|
| `id` | string | `'as-chemistry-ch1-atomic-structure-part-1'` | Kebab-case, unique identifier |
| `name` | string | `'AS Chemistry Ch1 (Atomic Structure) (Part 1)'` | Match HTML title exactly |
| `description` | string | `'Chapter 1 practice...'` | 50-150 characters, clear learning outcomes |
| `duration` | string | `'50 min'` | Format: "N min" |
| `totalQuestions` | number | `25` | Part 1 + Part 2 = full test total |
| `difficulty` | string | `'Advanced'` | Always "Advanced" for AS Chemistry |
| `category` | string | `'Science'` | Always "Science" for Chemistry |
| `subject` | string | `'AS Chemistry'` | Always "AS Chemistry" |
| `url` | string | `'/cambridge-tests/Chemistry/atomic_structure.html?part=1'` | File path, include `?part=X` for splits |

### Naming Conventions

**ID Naming:**
```
as-chemistry-[chapter]-[topic]-[part-N]
as-chemistry-atomic-structure-part-1
as-chemistry-ch2-atoms-molecules-part-2
as-chemistry-ch11-thermodynamics-part-1
```

**Name Naming:**
```
AS Chemistry [Ch#] (Topic Name) (Part N)
AS Chemistry — Atomic Structure (Part 1)
AS Chemistry Ch2 (Atoms, molecules and stoichiometry) (Part 2)
AS Chemistry Ch11 (Your Topic) (Part 1)
```

---

## Key Conventions

### File Naming

**HTML Files**: `snake_case.html`
```
✓ atomic_structure.html
✓ chemical_bonding.html
✓ reaction_kinetics.html
✗ AtomicStructure.html
✗ atomic structure.html
```

**ID Format**: `kebab-case`
```
✓ as-chemistry-ch1-atomic-structure-part-1
✓ as-chemistry-group-2-part-1
✗ as_chemistry_ch1_atomic_structure_part_1
✗ asChemistry-ch1-AtomicStructure-part-1
```

### Chapter Numbering

| Chapter | Topic | File |
|---------|-------|------|
| Ch1 | Atomic Structure | `atomic_structure.html` |
| Ch2 | Atoms, Molecules, Stoichiometry | `atoms_molecules_stoichiometry.html` |
| Ch3 | Chemical Bonding | `chemical_bonding.html` |
| Ch4 | States of Matter | `states_of_matter.html` |
| Ch5 | Chemical Energetics | `chemical_energetics.html` |
| Ch6 | Electrochemistry | `electrochemistry.html` |
| Ch7 | Equilibria | `equilibria.html` |
| Ch8 | Reaction Kinetics | `reaction_kinetics.html` |
| Ch9 | Chemical Periodicity | `chemical_periodicity.html` |
| Ch10 | Group 2 | `group_2.html` |

### Question Code Format

Cambridge exam questions follow this format:
```
9701_[SESSION]_qp_[VARIANT] Q: [QUESTION_NUMBER]

Examples:
9701_m20_qp_12 Q: 1     (May 2020, variant 1 or 2, question 1)
9701_m21_qp_21 Q: 5     (May 2021, variant 2, question 1)
9701_w20_qp_13 Q: 8     (Winter 2020, variant 1, question 3)
```

### Duration Calculation

**Standard timing:**
- ~1 minute per question for AS Chemistry
- 49-50 questions = ~50 minutes
- 64 questions = ~64 minutes

**For two-part tests:**
- Part 1 (25 questions) = 50 min
- Part 2 (24 questions) = 48 min

---

## Quality Checklist

Before publishing a new test, verify:

### HTML File
- [ ] Title: `<h1 id="quizTitle">AS Chemistry — Topic Name</h1>`
- [ ] Subtitle: `<div id="quizSubtitle">Chapter X • N multiple-choice questions</div>`
- [ ] QUIZ_BASE_ID and QUIZ_BASE_NAME variables set correctly
- [ ] All questions have: `number`, `code`, `prompt`, `table`/`simpleOptions`, `explanation`
- [ ] Question numbers are consecutive (1, 2, 3, ... N)
- [ ] ANSWER_KEY object has entry for every question (1: 'X', 2: 'Y', ...)
- [ ] All answer keys are valid (A, B, C, or D)
- [ ] File saved as snake_case.html in `public/cambridge-tests/Chemistry/`

### chemistryAnswerKeys.ts
- [ ] Key name matches HTML title EXACTLY
- [ ] All questions 1 to N have answers
- [ ] All answers are single letters: A, B, C, or D
- [ ] Added entry to `chemistryQuestionRanges` with correct total and splitIndex
- [ ] No extra spaces or typos in key names

### CambridgeTestsHub.tsx
- [ ] Two entries added (Part 1 and Part 2)
- [ ] IDs are unique (not duplicated)
- [ ] IDs use kebab-case format
- [ ] Names match HTML title exactly
- [ ] Description is clear and specific
- [ ] Duration matches calculation (~1 min per question)
- [ ] totalQuestions adds up correctly (Part 1 + Part 2 = total)
- [ ] difficulty = 'Advanced'
- [ ] category = 'Science'
- [ ] subject = 'AS Chemistry'
- [ ] url includes correct filename and ?part=1 or ?part=2

### Cross-File Consistency
- [ ] HTML title = chemistryAnswerKeys key = CambridgeTestsHub name
- [ ] Total questions: HTML = answerKeys = questionsRange
- [ ] Question count: (Part 1 + Part 2) = total in questionsRange
- [ ] File path in URL matches actual HTML filename

---

## Real Examples

### Example 1: Atomic Structure Test

**HTML File:** `public/cambridge-tests/Chemistry/atomic_structure.html`

```javascript
const QUIZ_BASE_ID = 'as_chemistry_atomic_structure';
const QUIZ_BASE_NAME = 'AS Chemistry — Atomic Structure';

let QUESTIONS = [
  {
    number: 1,
    code: '9701_m20_qp_12 Q: 1',
    prompt: 'What number of protons, neutrons and electrons are present in the ion <span class="nuclide"><sup>54</sup>Fe<sup>3+</sup></span>?',
    table: {
      headers: ['protons', 'neutrons', 'electrons'],
      rows: [
        { label: 'A', values: ['26', '28', '23'] },
        { label: 'B', values: ['26', '28', '29'] },
        { label: 'C', values: ['29', '25', '23'] },
        { label: 'D', values: ['29', '25', '26'] },
      ]
    },
    explanation: 'Fe has atomic number 26 (26 protons). Isotope number is 54, so neutrons = 54 - 26 = 28. With charge 3+, loses 3 electrons: 26 - 3 = 23. Answer: A'
  },
  // ... more questions ...
];

let ANSWER_KEY = {
  1: 'A', 2: 'C', 3: 'C', 4: 'D', 5: 'B',
  // ... 44 more answers ...
};
```

**chemistryAnswerKeys.ts:**

```typescript
'AS Chemistry — Atomic Structure': {
  1: 'A', 2: 'C', 3: 'C', 4: 'D', 5: 'B', 6: 'B', 7: 'A', 8: 'A', 9: 'D', 10: 'D',
  // ... 39 more ...
  49: 'A',
},

// In chemistryQuestionRanges:
'AS Chemistry — Atomic Structure': { total: 49, splitIndex: 25 },
```

**CambridgeTestsHub.tsx:**

```typescript
{
  id: 'as-chemistry-atomic-structure-part-1',
  name: 'AS Chemistry — Atomic Structure (Part 1)',
  description: 'Chapter 1 multiple-choice practice focusing on protons, neutrons, electrons, isotopes, and particle behaviour in fields.',
  duration: '50 min',
  totalQuestions: 25,
  difficulty: 'Advanced',
  category: 'Science',
  subject: 'AS Chemistry',
  url: '/cambridge-tests/Chemistry/atomic_structure.html?part=1',
},
{
  id: 'as-chemistry-atomic-structure-part-2',
  name: 'AS Chemistry — Atomic Structure (Part 2)',
  description: 'Chapter 1 multiple-choice practice focusing on protons, neutrons, electrons, isotopes, and particle behaviour in fields.',
  duration: '48 min',
  totalQuestions: 24,
  difficulty: 'Advanced',
  category: 'Science',
  subject: 'AS Chemistry',
  url: '/cambridge-tests/Chemistry/atomic_structure.html?part=2',
},
```

---

### Example 2: Creating a New Test (Thermodynamics)

**Step 1: Create HTML File**

1. Copy `atomic_structure.html` → `public/cambridge-tests/Chemistry/thermodynamics.html`
2. Update:
   ```html
   <h1 id="quizTitle">AS Chemistry Ch11 (Thermodynamics)</h1>
   <div id="quizSubtitle">Chapter 11 • 50 multiple-choice questions</div>
   ```
3. Update JavaScript constants:
   ```javascript
   const QUIZ_BASE_ID = 'as_chemistry_ch11_thermodynamics';
   const QUIZ_BASE_NAME = 'AS Chemistry Ch11 (Thermodynamics)';
   ```
4. Add 50 questions to QUESTIONS array
5. Create ANSWER_KEY with 50 answers

**Step 2: Update chemistryAnswerKeys.ts**

```typescript
'AS Chemistry Ch11 (Thermodynamics)': {
  1: 'A', 2: 'B', 3: 'A', 4: 'C', 5: 'D', // ... 45 more
  50: 'B',
},

'AS Chemistry Ch11 (Thermodynamics)': { total: 50, splitIndex: 25 },
```

**Step 3: Register in CambridgeTestsHub.tsx**

```typescript
{
  id: 'as-chemistry-ch11-thermodynamics-part-1',
  name: 'AS Chemistry Ch11 (Thermodynamics) (Part 1)',
  description: 'Chapter 11 part 1 - multiple-choice practice on enthalpy, entropy, spontaneity, and free energy.',
  duration: '50 min',
  totalQuestions: 25,
  difficulty: 'Advanced',
  category: 'Science',
  subject: 'AS Chemistry',
  url: '/cambridge-tests/Chemistry/thermodynamics.html?part=1',
},
{
  id: 'as-chemistry-ch11-thermodynamics-part-2',
  name: 'AS Chemistry Ch11 (Thermodynamics) (Part 2)',
  description: 'Chapter 11 part 2 - multiple-choice practice on enthalpy, entropy, spontaneity, and free energy.',
  duration: '50 min',
  totalQuestions: 25,
  difficulty: 'Advanced',
  category: 'Science',
  subject: 'AS Chemistry',
  url: '/cambridge-tests/Chemistry/thermodynamics.html?part=2',
},
```

---

## Troubleshooting

### Problem: Test doesn't load or shows blank

**Causes:**
- HTML file not in `public/cambridge-tests/Chemistry/`
- URL path incorrect in CambridgeTestsHub.tsx
- QUIZ_BASE_NAME doesn't match HTML title

**Solution:**
1. Verify file exists and path is correct
2. Check URL in CambridgeTestsHub matches filename exactly
3. Ensure HTML `<h1>` text matches the key in chemistryAnswerKeys.ts

### Problem: Questions don't display correctly

**Causes:**
- Missing required question properties (number, prompt, table/simpleOptions)
- Consecutive question numbering broken (1, 2, 4 instead of 1, 2, 3)
- HTML syntax errors in prompt or explanation

**Solution:**
1. Check every question has: number, code, prompt, table/simpleOptions, explanation
2. Ensure question.number = 1 to N (no gaps)
3. Test in browser's console for JavaScript syntax errors

### Problem: Answers don't match when submitted

**Causes:**
- Answer key doesn't match ANSWER_KEY in HTML
- Answer keys missing for some questions
- Question count mismatch (HTML has 50 but answer key has 49)

**Solution:**
1. Count questions in HTML: should equal total in chemistryAnswerKeys
2. Verify every question number 1 to N has an answer
3. Double-check answers match the correct option in HTML (A, B, C, or D)

### Problem: Part splitting shows wrong questions

**Causes:**
- splitIndex calculated incorrectly
- Questions not numbered 1 to N

**Solution:**
1. splitIndex should be: `Math.ceil(total_questions / 2)`
2. For 50 questions: splitIndex = 25 (Part 1: Q1-Q25, Part 2: Q26-Q50)
3. For 49 questions: splitIndex = 25 (Part 1: Q1-Q25, Part 2: Q26-Q49)

---

## Summary

To create a new AS Chemistry test:

1. **Copy & Modify HTML** - Use existing test as template, update title/subtitle/questions
2. **Add Answer Keys** - Add to both chemistryAnswerKeys and chemistryQuestionRanges
3. **Register Test** - Add Part 1 and Part 2 entries to CambridgeTestsHub.tsx
4. **Verify Consistency** - Ensure all three files reference the same test name and question counts
5. **Test** - Load in browser and verify questions, answers, and scoring work

All AS Chemistry tests follow the same structure, making new tests quick to add while maintaining consistency across the platform.
