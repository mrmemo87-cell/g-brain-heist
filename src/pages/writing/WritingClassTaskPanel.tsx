import React, { useCallback, useEffect, useState } from 'react';
import {
  assignWritingClassTask,
  cancelWritingClassTask,
  getWritingClassDrafts,
  getWritingClassTaskOptions,
  type WritingClassDraft,
  type WritingClassTaskOptions,
} from '../../lib/brains_heist/writingIntegrationService.js';
import type { SupportedGenre } from '../../lib/brains_heist/writingAssessment.js';

const GENRES: Array<{ value: SupportedGenre; label: string }> = [
  { value: 'email', label: 'Email' },
  { value: 'essay', label: 'Essay' },
  { value: 'article', label: 'Article' },
  { value: 'report', label: 'Report' },
  { value: 'review', label: 'Review' },
  { value: 'story', label: 'Story' },
  { value: 'paragraph', label: 'Paragraph' },
];

const DURATIONS = [
  { days: 1, label: 'Today only' },
  { days: 3, label: '3 days' },
  { days: 7, label: '1 week' },
  { days: 14, label: '2 weeks' },
];

type SelectChangeEvent = { target: { value: string } };

const fieldStyle = {
  display: 'grid',
  gap: 4,
  fontSize: 14,
  fontWeight: 600,
} as const;

const controlStyle = {
  borderRadius: 8,
  border: '1px solid #cbd5e1',
  padding: '8px 10px',
  font: 'inherit',
  fontWeight: 400,
  background: '#ffffff',
  color: '#0f172a',
  maxWidth: '100%',
} as const;

const formatDate = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
};

interface WritingClassTaskPanelProps {
  /** Roster class or teaching group id from the Writing Monitor. */
  scopeId: string;
  className: string;
}

/**
 * Lets a teacher set one Writing Hub task for a whole class, see how many students have submitted it, and withdraw it.
 * Students in the class receive this task in the hub until they submit it or it closes.
 */
export const WritingClassTaskPanel: React.FC<WritingClassTaskPanelProps> = ({ scopeId, className }) => {
  const [genre, setGenre] = useState<SupportedGenre>('email');
  const [options, setOptions] = useState<WritingClassTaskOptions | null>(null);
  const [promptId, setPromptId] = useState('');
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [drafts, setDrafts] = useState<WritingClassDraft[]>([]);

  useEffect(() => {
    let cancelled = false;
    void getWritingClassDrafts(scopeId).then((result) => {
      if (!cancelled) setDrafts(result.ok && result.data ? result.data : []);
    });
    return () => { cancelled = true; };
  }, [scopeId]);

  const load = useCallback(async (nextGenre: SupportedGenre) => {
    setError('');
    const result = await getWritingClassTaskOptions({ scope_id: scopeId, genre: nextGenre });
    if (!result.ok || !result.data) {
      setOptions(null);
      setError(result.error ?? 'Unable to load tasks for this class.');
      return;
    }
    setOptions(result.data);
    setPromptId((current) => (result.data!.tasks.some((task) => task.prompt_id === current) ? current : result.data!.tasks[0]?.prompt_id ?? ''));
  }, [scopeId]);

  useEffect(() => {
    setOptions(null);
    setMessage('');
    void load(genre);
  }, [genre, load]);

  const selectedTask = options?.tasks.find((task) => task.prompt_id === promptId) ?? null;
  const current = options?.current ?? null;

  const assign = async () => {
    if (!selectedTask || busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    const result = await assignWritingClassTask({ scope_id: scopeId, prompt_id: selectedTask.prompt_id, days });
    if (!result.ok || !result.data) {
      setError(result.error ?? 'Unable to set the class task.');
    } else {
      setMessage(
        `Task set for ${result.data.student_count} ${result.data.student_count === 1 ? 'student' : 'students'}.`
        + (result.data.skipped_count > 0
          ? ` ${result.data.skipped_count} ${result.data.skipped_count === 1 ? 'student is' : 'students are'} recorded in a different grade and did not receive it.`
          : '')
      );
      await load(genre);
    }
    setBusy(false);
  };

  const withdraw = async () => {
    if (!current || busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    const result = await cancelWritingClassTask(current.assignment_id);
    if (!result.ok) setError(result.error ?? 'Unable to withdraw the class task.');
    else {
      setMessage('Task withdrawn. Students can choose their own task again.');
      await load(genre);
    }
    setBusy(false);
  };

  return (
    <div data-testid="writing-class-task-panel" style={{ display: 'grid', gap: 14 }}>
      {current ? (
        <div className="writing-monitor__sync-warning" role="status" style={{ display: 'grid', gap: 6 }}>
          <strong>Current class task: {current.prompt_title}</strong>
          <span>
            {current.submitted_count} of {current.student_count} students have submitted · open until {formatDate(current.closes_at)}
          </span>
          <div>
            <button type="button" className="writing-monitor__secondary-button" onClick={() => void withdraw()} disabled={busy}>
              Withdraw this task
            </button>
          </div>
        </div>
      ) : (
        <p style={{ margin: 0, color: '#475569' }}>
          No class task is set. Each student in {className} currently gets their own task and chooses the genre.
        </p>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'end' }}>
        <label style={fieldStyle}>
          Genre
          <select
            value={genre}
            onChange={(event: SelectChangeEvent) => setGenre(event.target.value as SupportedGenre)}
            style={controlStyle}
            disabled={busy}
          >
            {GENRES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <label style={{ ...fieldStyle, flex: '1 1 220px', minWidth: 0 }}>
          Task{options?.grade ? ` (Grade ${options.grade})` : ''}
          <select
            value={promptId}
            onChange={(event: SelectChangeEvent) => setPromptId(event.target.value)}
            style={controlStyle}
            disabled={busy || !options || options.tasks.length === 0}
          >
            {(options?.tasks ?? []).map((task) => (
              <option key={task.prompt_id} value={task.prompt_id}>{task.title.split('·').pop()?.trim() || task.title}</option>
            ))}
          </select>
        </label>
        <label style={fieldStyle}>
          Open for
          <select
            value={days}
            onChange={(event: SelectChangeEvent) => setDays(Number(event.target.value))}
            style={controlStyle}
            disabled={busy}
          >
            {DURATIONS.map((item) => <option key={item.days} value={item.days}>{item.label}</option>)}
          </select>
        </label>
      </div>

      {selectedTask ? (
        <blockquote style={{ margin: 0, padding: '10px 14px', borderLeft: '4px solid #2563eb', background: '#f8fafc', borderRadius: 6, lineHeight: 1.55 }}>
          {selectedTask.prompt_text}
          <div style={{ color: '#475569', fontSize: 14, marginTop: 6 }}>
            About {selectedTask.target_word_count} words · {selectedTask.time_limit_minutes} minutes
          </div>
        </blockquote>
      ) : options && options.tasks.length === 0 ? (
        <p style={{ margin: 0, color: '#b45309' }}>
          No approved tasks were found for this class. Check that the students have a grade recorded.
        </p>
      ) : null}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <button
          type="button"
          className="writing-monitor__primary-button"
          onClick={() => void assign()}
          disabled={busy || !selectedTask}
        >
          {busy ? 'Saving…' : current ? 'Replace the class task' : `Set this task for ${className}`}
        </button>
        {message ? <span role="status" style={{ color: '#166534' }}>{message}</span> : null}
        {error ? <span role="alert" style={{ color: '#b91c1c' }}>{error}</span> : null}
      </div>

      {drafts.length > 0 ? (
        <details data-testid="writing-class-drafts">
          <summary style={{ cursor: 'pointer', fontWeight: 700 }}>
            Drafts in progress ({drafts.length})
          </summary>
          <p style={{ margin: '8px 0', color: '#475569', fontSize: 14 }}>
            Work students have started but not submitted. It is saved automatically as they write.
          </p>
          <div style={{ display: 'grid', gap: 10 }}>
            {drafts.map((item) => (
              <details key={`${item.student_id}:${item.prompt_id}`} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px' }}>
                <summary style={{ cursor: 'pointer' }}>
                  <strong>{item.student_name}</strong>
                  {' · '}{item.task_title.split('·').pop()?.trim() || item.task_title}
                  {' · '}{item.draft.trim().split(/\s+/).filter(Boolean).length} words
                  {' · saved '}{formatDate(item.updated_at)}
                  {item.tab_change_count > 0 ? ` · left the tab ${item.tab_change_count} ${item.tab_change_count === 1 ? 'time' : 'times'}` : ''}
                </summary>
                <p style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{item.draft}</p>
              </details>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
};

export default WritingClassTaskPanel;
