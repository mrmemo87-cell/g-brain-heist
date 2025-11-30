# Geometry Diagram Builder System

A comprehensive interactive diagram system for creating and solving geometry questions with fill-in-the-blank answers.

## Overview

The Geometry Diagram Builder allows teachers to:
- Draw geometric shapes (lines, arrows, circles, points, angles)
- Add text labels and annotations
- Place blank fields where students must enter answers
- Set expected answers for validation
- Assign difficulty and XP points

Students can:
- View the diagram with interactive blank fields
- Enter their answers
- Get instant feedback on correctness
- Earn XP for correct answers

## Components

### DiagramBuilder (Teacher Mode)
`components/geometry/DiagramBuilder.tsx`

The main teacher interface for creating geometry diagrams.

**Features:**
- Canvas drawing tools (select, line, arrow, circle, point, text, blank, angle)
- Undo/redo support
- Grid snapping
- Question metadata (title, difficulty, subject, topic)
- Save/update/delete questions
- List view of saved questions

**Usage:**
```tsx
import { DiagramBuilder } from './components/geometry';

<DiagramBuilder 
  teacherId={teacher.id}
  onComplete={() => setView('dashboard')}
/>
```

### GeometryPlay (Student Mode)
`components/geometry/GeometryPlay.tsx`

The student interface for answering geometry questions.

**Features:**
- Display geometry diagram
- Input fields positioned over blank areas
- Timer countdown
- Answer validation with color feedback
- XP awards for correct answers

**Usage:**
```tsx
import { GeometryPlay } from './components/geometry';

<GeometryPlay
  questionId={selectedQuestion.id}
  // OR load random:
  subject="Maths"
  difficulty="medium"
  onComplete={(result) => handleResult(result)}
  onBack={() => setView('menu')}
  awardXP={(points) => addXP(points)}
/>
```

### DiagramToolbar
`components/geometry/DiagramToolbar.tsx`

Left-side toolbar component with drawing tool selection.

**Tools:**
- **Select** (🔲): Select and drag shapes
- **Line** (📏): Draw straight lines
- **Arrow** (➡️): Draw arrows
- **Angle** (∠): Draw angles
- **Circle** (⭕): Draw circles
- **Point** (•): Place points
- **Text** (T): Add text labels
- **Blank** (☐): Add answer blanks
- **Delete** (🗑️): Delete shapes
- **Undo/Redo** (↩️↪️): History navigation
- **Clear** (🧹): Clear canvas

### KonvaCanvasEditor
`components/geometry/KonvaCanvasEditor.tsx`

The Konva.js powered canvas component.

**Features:**
- Grid background with snapping
- Shape rendering (lines, arrows, circles, text)
- Blank field rendering
- Mouse event handling for drawing
- Drag and drop support
- Text editing overlay

## Database Schema

```sql
CREATE TABLE geometry_questions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    teacher_id UUID REFERENCES teachers(id) NOT NULL,
    title TEXT NOT NULL,
    subject_id TEXT,
    topic TEXT,
    difficulty TEXT DEFAULT 'medium',
    points INTEGER DEFAULT 15,
    time_limit INTEGER DEFAULT 60,
    diagram_json JSONB NOT NULL,  -- Konva stage JSON
    answers JSONB NOT NULL,       -- { blankId: expectedAnswer }
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

Run the migration:
```sql
-- See supabase-functions/geometry_questions.sql
```

## Service Functions

`components/geometry/geometryService.ts`

### saveGeometryQuestion
```typescript
await saveGeometryQuestion({
  teacher_id: 'uuid',
  title: 'Find angle x',
  subject_id: 'maths',
  topic: 'Geometry',
  difficulty: 'medium',
  points: 15,
  time_limit: 60,
  diagram_json: stageRef.current.toJSON(),
  answers: { 'blank-1': '45', 'blank-2': '135' }
});
```

### loadGeometryQuestion
```typescript
const question = await loadGeometryQuestion('question-uuid');
```

### getRandomGeometryQuestion
```typescript
const question = await getRandomGeometryQuestion('maths', 'medium');
```

### checkGeometryAnswers
```typescript
const result = checkGeometryAnswers(
  { 'blank-1': '45', 'blank-2': '135' },  // student answers
  { 'blank-1': '45', 'blank-2': '135' },  // expected answers
  15  // max points
);
// Returns: { isFullyCorrect: true, score: 15, details: [...] }
```

## Integration with TeacherPortal

The DiagramBuilder is accessible from the Teacher Portal dashboard:

1. Navigate to Teacher Portal
2. Click "📐 Geometry Diagrams" button
3. Create new diagrams or edit existing ones

## Types

```typescript
interface BlankField {
  id: string;
  type: 'blank';
  x: number;
  y: number;
  width: number;
  height: number;
  expectedAnswer: string;
}

interface GeometryQuestion {
  id: string;
  teacher_id: string;
  title: string;
  subject_id?: string;
  topic?: string;
  difficulty: 'easy' | 'medium' | 'hard';
  points: number;
  time_limit: number;
  diagram_json: string;
  answers: Record<string, string>;
  created_at?: string;
  updated_at?: string;
}

interface GeometryAnswerResult {
  isFullyCorrect: boolean;
  score: number;
  details: {
    blankId: string;
    expected: string;
    given: string;
    isCorrect: boolean;
  }[];
}
```

## Installation

The system requires Konva.js:

```bash
npm install konva react-konva
```

## XP System Integration

Questions use the standard XP system:
- **Easy**: 10 XP (default)
- **Medium**: 15 XP (default)
- **Hard**: 20 XP (default)
- Maximum: 30 XP (adjustable by teacher)

## Future Enhancements

- [ ] More shape types (rectangles, polygons, arcs)
- [ ] Import background images
- [ ] Multiple correct answers (ranges)
- [ ] Partial credit scoring
- [ ] Shape grouping
- [ ] Copy/paste shapes
- [ ] Question templates
- [ ] Batch question import
