// Demo-site mode. On the public demo deployment (demo.brainsheist.com) the build sets
// VITE_DEMO_MODE=1 and the demo logins; everywhere else these are absent and every
// demo feature stays off. Nothing here is secret: the demo accounts are public by design
// and the demo database is rebuilt from scratch every night.
import { getEnvVar } from './env';

export interface DemoPersona {
  key: 'teacher' | 'student';
  email: string;
  password: string;
  title: string;
  description: string;
}

export const isDemoMode = (): boolean => getEnvVar('VITE_DEMO_MODE') === '1';

export const getDemoPersonas = (): DemoPersona[] => {
  const teacherEmail = getEnvVar('VITE_DEMO_TEACHER_EMAIL') || 'demo.teacher@example.com';
  const teacherPassword = getEnvVar('VITE_DEMO_TEACHER_PASSWORD') || 'BrainsHeistDemo2026';
  const studentEmail = getEnvVar('VITE_DEMO_STUDENT_EMAIL') || 'demo.s01@example.com';
  const studentPassword = getEnvVar('VITE_DEMO_STUDENT_PASSWORD') || teacherPassword;
  return [
    {
      key: 'teacher',
      email: teacherEmail,
      password: teacherPassword,
      title: 'Ms. Mitchell · Teacher & School Head',
      description: 'Two Grade 7 classes, eight weeks of evidence, support plans in every stage, School Head dashboards.',
    },
    {
      key: 'student',
      email: studentEmail,
      password: studentPassword,
      title: 'Aibek · Student, class 7A',
      description: 'Daily missions, Class Conquest, clans, battles, streaks and a recovered learning plan.',
    },
  ];
};

const VISITOR_KEY = 'brains_heist_demo_visitor_v1';

export interface StoredDemoVisitor {
  id: string;
  name: string;
  email: string;
  enteredAs?: string;
  registeredAt: string;
}

export const readStoredDemoVisitor = (): StoredDemoVisitor | null => {
  try {
    const raw = window.localStorage.getItem(VISITOR_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDemoVisitor;
    return parsed && typeof parsed.id === 'string' ? parsed : null;
  } catch {
    return null;
  }
};

export const storeDemoVisitor = (visitor: StoredDemoVisitor): void => {
  try { window.localStorage.setItem(VISITOR_KEY, JSON.stringify(visitor)); } catch { /* storage unavailable */ }
};

export const clearStoredDemoVisitor = (): void => {
  try { window.localStorage.removeItem(VISITOR_KEY); } catch { /* storage unavailable */ }
};
