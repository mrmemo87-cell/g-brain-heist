import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchQuestionPage, type QuestionBrowserFilters, type QuestionCursor } from '../../services/questionBrowserService';
import type { TeacherQuestion } from '../../types';

export function useQuestionBrowser(filters: QuestionBrowserFilters, enabled = true, revision = 0) {
  const [questions, setQuestions] = useState<TeacherQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [retry, setRetry] = useState(0);
  const generation = useRef(0);
  const cursor = useRef<QuestionCursor | null>(null);
  const pending = useRef(false);
  const key = JSON.stringify(filters);
  useEffect(() => {
    const current = (generation.current ?? 0) + 1;
    generation.current = current;
    cursor.current = null;
    pending.current = false;
    setQuestions([]); setError(''); setHasMore(false); setLoading(enabled);
    if (!enabled) return;
    const timer = setTimeout(() => {
      pending.current = true;
      void fetchQuestionPage(JSON.parse(key)).then((page) => {
        if (generation.current !== current) return;
        setQuestions(page.questions); setHasMore(page.hasMore); cursor.current = page.nextCursor;
      }).catch((cause) => {
        if (generation.current === current) setError(cause instanceof Error ? cause.message : 'Questions could not be loaded.');
      }).finally(() => {
        if (generation.current === current) { pending.current = false; setLoading(false); }
      });
    }, 180);
    return () => { clearTimeout(timer); generation.current = (generation.current ?? 0) + 1; };
  }, [key, enabled, revision, retry]);

  const loadMore = useCallback(async () => {
    if (pending.current || !cursor.current) return;
    const current = generation.current;
    pending.current = true; setLoading(true); setError('');
    try {
      const page = await fetchQuestionPage({ ...JSON.parse(key), cursor: cursor.current });
      if (generation.current !== current) return;
      setQuestions((previous) => [...new Map([...previous, ...page.questions].map((q) => [q.id, q])).values()]);
      setHasMore(page.hasMore); cursor.current = page.nextCursor;
    } catch (cause) {
      if (generation.current === current) setError(cause instanceof Error ? cause.message : 'More questions could not be loaded.');
    } finally {
      if (generation.current === current) { pending.current = false; setLoading(false); }
    }
  }, [key]);
  return { questions, loading, error, hasMore, loadMore, retry: () => setRetry((value) => value + 1) };
}
