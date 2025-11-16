# IELTS Prep Center Frontend Plan

This document captures the React + TypeScript + Tailwind implementation details for the IELTS Prep Center inside the Brain Heist app.

## 1. Route configuration

```tsx
import { createBrowserRouter } from 'react-router-dom';
import IeltsLayout from '@/features/ielts/IeltsLayout';
import IeltsOverviewPage from '@/features/ielts/pages/OverviewPage';
import ReadingListPage from '@/features/ielts/pages/reading/ReadingListPage';
import ReadingPracticePage from '@/features/ielts/pages/reading/ReadingPracticePage';
import ListeningListPage from '@/features/ielts/pages/listening/ListeningListPage';
import WritingPage from '@/features/ielts/pages/writing/WritingPage';
import SpeakingPage from '@/features/ielts/pages/speaking/SpeakingPage';
import SkillsLabPage from '@/features/ielts/pages/skills/SkillsLabPage';
import MockTestsPage from '@/features/ielts/pages/tests/MockTestsPage';
import ProgressPage from '@/features/ielts/pages/progress/ProgressPage';
import TeacherPortalPage from '@/features/ielts/pages/teacher/TeacherPortalPage';

export const router = createBrowserRouter([
  {
    path: '/ielts',
    element: <IeltsLayout />,
    children: [
      { index: true, element: <IeltsOverviewPage /> },
      { path: 'reading', element: <ReadingListPage /> },
      { path: 'reading/:setId', element: <ReadingPracticePage /> },
      { path: 'listening', element: <ListeningListPage /> },
      { path: 'writing', element: <WritingPage /> },
      { path: 'speaking', element: <SpeakingPage /> },
      { path: 'skills', element: <SkillsLabPage /> },
      { path: 'tests', element: <MockTestsPage /> },
      { path: 'progress', element: <ProgressPage /> },
      {
        path: 'teacher',
        element: (
          <RequireIeltsTeacher>
            <TeacherPortalPage />
          </RequireIeltsTeacher>
        ),
      },
    ],
  },
]);
```

*`RequireIeltsTeacher` is a simple wrapper that renders its children only when `useIsIeltsTeacher()` returns `true`.*

## 2. Component structure

| Component | Responsibility |
| --- | --- |
| `IeltsLayout` | Shared shell for all `/ielts` routes. Renders header, academic sub-navigation, and `Outlet`. |
| `IeltsOverviewPage` | Fetches quick stats, band estimates, and renders CTA cards. |
| `ReadingListPage` | Lists reading sets via React Query, allows navigating to practice page. |
| `ReadingPracticePage` | Loads set + questions, handles timers, answer state, scoring, Supabase submission, and review UI. |
| `ListeningListPage` | Same pattern as reading but renders audio player per set. |
| `WritingPage` | Tabbed interface for Task 1/Task 2 using `WritingTaskList` + `WritingTaskModal`. Handles attempt submission + feedback view. |
| `SpeakingPage` | Groups tasks by part, integrates with recording component, submits attempts + feedback. |
| `SkillsLabPage` | Placeholder sections (`VocabularyLab`, `GrammarLab`) ready for future datasets. |
| `MockTestsPage` | Multi-step mock test workflow referencing existing skill components. |
| `ProgressPage` | Aggregates attempts, renders progress cards + `ProgressChart`. |
| `TeacherPortalPage` | Teacher-only management view with student list and student detail drawer. |
| Shared hooks | `useIeltsStats`, `useReadingSets`, `useReadingSet`, `useIsIeltsTeacher`, etc. encapsulate Supabase queries. |

## 3. Example React + TypeScript code

### 3.1 `IeltsLayout`

```tsx
import { NavLink, Outlet } from 'react-router-dom';
import { cn } from '@/lib/utils';

const tabs = [
  { to: '/ielts', label: 'Overview', end: true },
  { to: '/ielts/reading', label: 'Reading' },
  { to: '/ielts/listening', label: 'Listening' },
  { to: '/ielts/writing', label: 'Writing' },
  { to: '/ielts/speaking', label: 'Speaking' },
  { to: '/ielts/skills', label: 'Skills Lab' },
  { to: '/ielts/tests', label: 'Mock Tests' },
  { to: '/ielts/progress', label: 'Progress' },
];

const IeltsLayout = () => {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-gradient-to-r from-sky-50 to-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-widest text-sky-500">Brain Heist Academy</p>
            <h1 className="text-3xl font-semibold text-slate-900">IELTS Prep Center</h1>
            <p className="text-sm text-slate-500">
              Focused training for Reading, Listening, Writing & Speaking
            </p>
          </div>
          <div className="text-sm text-slate-500">
            Need help? Contact your IELTS coach.
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                cn(
                  'rounded-full px-4 py-2 text-sm font-medium text-slate-500 transition hover:bg-white hover:text-slate-900',
                  isActive && 'bg-white text-sky-600 shadow'
                )
              }
            >
              {tab.label}
            </NavLink>
          ))}
          <TeacherTab />
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
};

const TeacherTab = () => {
  const { data: isTeacher } = useIsIeltsTeacher();
  if (!isTeacher) return null;
  return (
    <NavLink
      to="/ielts/teacher"
      className={({ isActive }) =>
        cn(
          'rounded-full px-4 py-2 text-sm font-medium text-slate-500 transition hover:bg-white hover:text-slate-900',
          isActive && 'bg-white text-sky-600 shadow'
        )
      }
    >
      Teacher
    </NavLink>
  );
};
```

### 3.2 Reading list page + hook

```tsx
interface IeltsReadingSet {
  id: string;
  title: string;
  level: 'Beginner' | 'Intermediate' | 'Advanced';
  duration_minutes: number | null;
  estimated_band_low: number;
  estimated_band_high: number;
  passages: string[];
}

const useReadingSets = () => {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ['ielts_reading_sets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ielts_reading_sets')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as IeltsReadingSet[];
    },
  });
};

const ReadingListPage = () => {
  const { data, isLoading, error } = useReadingSets();
  const navigate = useNavigate();

  if (isLoading) {
    return <PageState title="Loading reading sets..." />;
  }
  if (error) {
    return <PageState title="Could not load reading sets" description={error.message} tone="error" />;
  }

  return (
    <section className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold text-slate-900">Reading Practice</h2>
        <p className="text-sm text-slate-500">Choose a set to test your comprehension skills.</p>
      </header>
      <div className="grid gap-4 md:grid-cols-2">
        {data?.map((set) => (
          <article key={set.id} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm uppercase text-sky-500">{set.level}</p>
                <h3 className="text-xl font-semibold text-slate-900">{set.title}</h3>
              </div>
              {set.duration_minutes && (
                <span className="text-sm text-slate-500">{set.duration_minutes} min</span>
              )}
            </div>
            <dl className="mt-4 flex flex-wrap gap-4 text-sm text-slate-500">
              <div>
                <dt className="font-medium text-slate-700">Band range</dt>
                <dd>
                  {set.estimated_band_low} - {set.estimated_band_high}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-slate-700">Passages</dt>
                <dd>{set.passages.length}</dd>
              </div>
            </dl>
            <button
              onClick={() => navigate(`/ielts/reading/${set.id}`)}
              className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-sky-500"
            >
              Start practice
            </button>
          </article>
        ))}
      </div>
    </section>
  );
};
```

### 3.3 Reading practice page

```tsx
interface IeltsReadingQuestion {
  id: string;
  set_id: string;
  question_number: number;
  question_type: 'mcq' | 'tfng' | 'matching' | 'short_answer';
  prompt: string;
  options: string[] | null;
  correct_answer: string;
  explanation?: string | null;
}

const useReadingSet = (setId: string) => {
  const supabase = useSupabase();
  return useQuery({
    enabled: !!setId,
    queryKey: ['ielts_reading_set', setId],
    queryFn: async () => {
      const { data: set, error } = await supabase
        .from('ielts_reading_sets')
        .select('*, questions:ielts_reading_questions(*)')
        .eq('id', setId)
        .single();
      if (error) throw error;
      return set as IeltsReadingSet & { questions: IeltsReadingQuestion[] };
    },
  });
};

const bandFromPercent = (percent: number) => {
  if (percent >= 90) return 9;
  if (percent >= 80) return 8;
  if (percent >= 70) return 7;
  if (percent >= 60) return 6;
  if (percent >= 50) return 5;
  return 4;
};

const ReadingPracticePage = () => {
  const { setId } = useParams<{ setId: string }>();
  const supabase = useSupabase();
  const { data, isLoading } = useReadingSet(setId!);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submittedAttempt, setSubmittedAttempt] = useState<IeltsReadingAttempt | null>(null);
  const [timeLeft, setTimeLeft] = useState(() => (data?.duration_minutes ?? 0) * 60);

  useEffect(() => {
    if (!data?.duration_minutes) return;
    setTimeLeft(data.duration_minutes * 60);
    const interval = window.setInterval(() => {
      setTimeLeft((prev) => Math.max(prev - 1, 0));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [data?.duration_minutes]);

  const handleAnswer = (questionId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const handleSubmit = async () => {
    if (!data) return;
    const correctCount = data.questions.reduce((total, question) => {
      return total + (answers[question.id]?.trim().toLowerCase() === question.correct_answer.trim().toLowerCase() ? 1 : 0);
    }, 0);
    const totalQuestions = data.questions.length;
    const percent = Math.round((correctCount / totalQuestions) * 100);
    const estBand = bandFromPercent(percent);

    const attemptPayload = {
      set_id: data.id,
      answers,
      raw_score: correctCount,
      total_questions: totalQuestions,
      percent,
      est_band: estBand,
    } satisfies InsertIeltsReadingAttempt;

    const { data: attempt, error } = await supabase
      .from('ielts_reading_attempts')
      .insert(attemptPayload)
      .select()
      .single();

    if (error) {
      toast.error('Could not save attempt. Please try again.');
      return;
    }

    setSubmittedAttempt(attempt as IeltsReadingAttempt);
  };

  if (isLoading || !data) {
    return <PageState title="Loading reading set..." />;
  }

  if (submittedAttempt) {
    return <ReadingReview attempt={submittedAttempt} questions={data.questions} answers={answers} />;
  }

  return (
    <div className="space-y-6">
      <header className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="text-2xl font-semibold text-slate-900">{data.title}</h2>
        <p className="text-sm text-slate-500">Level: {data.level}</p>
        {data.duration_minutes ? (
          <p className="text-sm text-slate-500">
            Time left: {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
          </p>
        ) : (
          <p className="text-sm text-slate-500">No timer</p>
        )}
      </header>
      <ol className="space-y-5">
        {data.questions
          .sort((a, b) => a.question_number - b.question_number)
          .map((question) => (
            <li key={question.id} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <p className="text-sm font-medium text-slate-700">
                Question {question.question_number}
              </p>
              <p className="mt-2 text-slate-900">{question.prompt}</p>
              <QuestionInput question={question} value={answers[question.id] ?? ''} onChange={handleAnswer} />
            </li>
          ))}
      </ol>
      <button
        onClick={handleSubmit}
        className="inline-flex w-full items-center justify-center rounded-xl bg-sky-600 px-4 py-3 text-base font-semibold text-white shadow-md transition hover:bg-sky-500"
      >
        Submit answers
      </button>
    </div>
  );
};
```

### 3.4 Writing task page

```tsx
interface IeltsWritingTask {
  id: string;
  title: string;
  task_type: 'task1' | 'task2';
  prompt: string;
  bands_target: string;
}

interface IeltsWritingAttempt {
  id: string;
  task_id: string;
  answer_text: string;
  word_count: number;
  band_overall?: number | null;
  band_task_response?: number | null;
  band_coherence?: number | null;
  band_lexical?: number | null;
  band_grammar?: number | null;
  feedback?: string | null;
}

const WritingTaskPage = ({ task }: { task: IeltsWritingTask }) => {
  const supabase = useSupabase();
  const [answer, setAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [attempt, setAttempt] = useState<IeltsWritingAttempt | null>(null);
  const wordCount = answer.trim() ? answer.trim().split(/\s+/).length : 0;

  const submitAttempt = async () => {
    setSubmitting(true);
    try {
      const { data, error } = await supabase
        .from('ielts_writing_attempts')
        .insert({
          task_id: task.id,
          answer_text: answer,
          word_count: wordCount,
        })
        .select()
        .single();
      if (error) throw error;
      setAttempt(data as IeltsWritingAttempt);

      await triggerWritingEvaluation(data.id);

      const { data: refreshed } = await supabase
        .from('ielts_writing_attempts')
        .select('*')
        .eq('id', data.id)
        .single();
      setAttempt(refreshed as IeltsWritingAttempt);
    } catch (err) {
      toast.error('Could not submit writing.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <header>
        <p className="text-sm uppercase text-sky-500">{task.task_type === 'task1' ? 'Task 1' : 'Task 2'}</p>
        <h2 className="text-2xl font-semibold text-slate-900">{task.title}</h2>
        <p className="text-sm text-slate-500">Target bands: {task.bands_target}</p>
      </header>
      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <p className="whitespace-pre-line text-slate-900">{task.prompt}</p>
      </div>
      <textarea
        value={answer}
        onChange={(event) => setAnswer(event.target.value)}
        rows={12}
        className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 shadow-sm focus:border-sky-400 focus:outline-none"
        placeholder="Write your response here..."
      />
      <div className="flex items-center justify-between text-sm text-slate-500">
        <span>Word count: {wordCount}</span>
        <button
          onClick={submitAttempt}
          disabled={submitting || wordCount === 0}
          className="inline-flex items-center rounded-xl bg-sky-600 px-4 py-2 font-medium text-white disabled:opacity-60"
        >
          {submitting ? 'Submitting...' : 'Submit for feedback'}
        </button>
      </div>
      {attempt && attempt.band_overall && (
        <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <h3 className="text-xl font-semibold text-slate-900">Feedback</h3>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-xl bg-sky-50 p-4">
              <p className="text-sm text-slate-500">Overall band</p>
              <p className="text-3xl font-bold text-sky-700">{attempt.band_overall.toFixed(1)}</p>
            </div>
            <dl className="grid gap-2 text-sm text-slate-600">
              <FeedbackBand label="Task response" value={attempt.band_task_response} />
              <FeedbackBand label="Coherence" value={attempt.band_coherence} />
              <FeedbackBand label="Lexical" value={attempt.band_lexical} />
              <FeedbackBand label="Grammar" value={attempt.band_grammar} />
            </dl>
          </div>
          {attempt.feedback && (
            <div className="mt-4 whitespace-pre-line text-slate-700">{attempt.feedback}</div>
          )}
          {attempt.upgraded_sample && (
            <div className="mt-4 rounded-xl bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-600">Sample upgrade</p>
              <p className="mt-2 text-slate-800">{attempt.upgraded_sample}</p>
            </div>
          )}
        </section>
      )}
    </div>
  );
};
```

These snippets can be dropped directly into a Vite + React + Tailwind + Supabase setup and expanded for the remaining IELTS routes. All UI elements strictly avoid XP, coins, or other Brain Heist game systems and focus solely on IELTS learning flows.
