// Geometry Diagram Types
export interface BlankField {
  id: string;
  type: 'blank';
  x: number;
  y: number;
  width: number;
  height: number;
  expectedAnswer: string;
  label?: string;
}

export interface GeometryQuestion {
  id: string;
  teacher_id: string;
  title: string;
  diagram_json: string;
  answers: Record<string, string>;
  subject: string;
  subject_id?: string;
  topic: string;
  difficulty: 'easy' | 'medium' | 'hard';
  points: number;
  time_limit: number;
  is_active: boolean;
  is_public: boolean;
  times_answered: number;
  times_correct: number;
  created_at: string;
  updated_at: string;
}

export interface GeometryAnswerResult {
  correctCount: number;
  totalCount: number;
  wrongFields: string[];
  score: number;
  isFullyCorrect: boolean;
}

export type DiagramTool = 
  | 'select'
  | 'line'
  | 'arrow'
  | 'angle'
  | 'circle'
  | 'point'
  | 'text'
  | 'blank'
  | 'delete';

export interface DiagramShape {
  id: string;
  type: string;
  attrs: Record<string, unknown>;
}
