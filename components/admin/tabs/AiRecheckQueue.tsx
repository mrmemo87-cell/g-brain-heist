import React, { useCallback, useEffect, useState } from 'react';
import {
  decideSuperadminAiRecheck,
  loadSuperadminAiRecheckQueue,
  type AdminAiRecheckAction,
  type AdminAiRecheckItem,
  type AdminAiRecheckQueue,
} from '../../../services/adminQuestionBankService';
import { useAdmin } from '../AdminContext';
import './QuestionTaxonomyReviewQueue.css';
import './AiRecheckQueue.css';

const PAGE_SIZE = 20;
const LETTERS = 'ABCDEFGH';

const optionText = (option: string | { text?: string }) => typeof option === 'string'
  ? option
  : option.text || 'Image option';

const formatDate = (value?: string | null) => value
  ? new Date(value).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  : 'Not recorded';

const resolveImageUrl = (url?: string | null) => {
  const trimmed = url?.trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) return trimmed;
  const path = trimmed.replace(/^\/+/, '');
  return `${supabaseUrl}/storage/v1/object/public/${path.startsWith('question-images/') ? path : `question-images/${path}`}`;
};

interface Draft {
  item: AdminAiRecheckItem;
  action: AdminAiRecheckAction;
  notes: string;
}

const AiRecheckQueue: React.FC<{ onOpenVault: () => void }> = ({ onOpenVault }) => {
  const { addToast } = useAdmin();
  const [queue, setQueue] = useState<AdminAiRecheckQueue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [offset, setOffset] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setQueue(await loadSuperadminAiRecheckQueue({ subject: subject || null, limit: PAGE_SIZE, offset }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'The AI recheck queue could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [subject, offset]);

  useEffect(() => { void load(); }, [load]);

  const subjects = Array.from(new Set((queue?.items || []).map((item) => item.subject).filter(Boolean))) as string[];

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft || saving) return;
    if (draft.action === 'retire' && draft.notes.trim().length < 10) {
      addToast('Give a reason of at least 10 characters before retiring a question.', 'error');
      return;
    }
    setSaving(true);
    try {
      await decideSuperadminAiRecheck({ questionId: draft.item.id, action: draft.action, notes: draft.notes });
      addToast(draft.action === 'approve'
        ? 'Approved. Students’ answers to this question now count as evidence.'
        : 'Retired. The question is removed from practice and evidence.', 'success');
      setDraft(null);
      await load();
    } catch (decisionError) {
      addToast(decisionError instanceof Error ? decisionError.message : 'The decision could not be saved.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="taxonomy-review ai-recheck">
      <header className="taxonomy-review__hero">
        <div>
          <button type="button" className="ai-recheck__back" onClick={onOpenVault}>← Question bank</button>
          <h2>AI recheck queue</h2>
          <p>AI-drafted questions are live for practice but do not count in student profiles until you approve them. Check the key, the visual and the wording.</p>
        </div>
        <div className="ai-recheck__count" aria-live="polite">
          <strong>{queue ? queue.total : '—'}</strong>
          <span>waiting</span>
        </div>
      </header>

      <section className="ai-recheck__body">
        {subjects.length > 1 || subject ? (
          <label className="ai-recheck__filter">
            <span>Subject</span>
            <select id="ai-recheck-subject" value={subject} onChange={(event) => { setSubject(event.target.value); setOffset(0); }}>
              <option value="">All subjects</option>
              {subjects.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
        ) : null}

        {error ? <div className="taxonomy-review__error" role="alert"><strong>Queue unavailable</strong><p>{error}</p><button type="button" onClick={() => void load()}>Try again</button></div> : null}
        {!error && loading && !queue ? <div className="taxonomy-review__loading"><span /><span /><span /><p>Loading AI-drafted questions…</p></div> : null}
        {!error && queue && !queue.items.length ? (
          <div className="taxonomy-review__empty"><span>✓</span><h4>Nothing waiting</h4><p>New AI-drafted questions appear here as soon as they are imported.</p></div>
        ) : null}

        {!error && queue?.items.length ? (
          <div className={loading ? 'ai-recheck__cards is-refreshing' : 'ai-recheck__cards'}>
            {queue.items.map((item) => (
              <article key={item.id} className="ai-recheck__card">
                <header>
                  <strong>{item.subject || 'Subject not set'} · {item.topic_name || 'No topic'}</strong>
                  <span>{item.difficulty || '—'} · grades {(item.eligible_grade_levels || [item.grade]).filter(Boolean).join(', ') || '—'} · added {formatDate(item.recheck_requested_at || item.created_at)}</span>
                </header>
                {resolveImageUrl(item.image_url) ? (
                  <figure>
                    <img src={resolveImageUrl(item.image_url)} alt={item.image_alt_text || 'Question visual'} />
                    <figcaption>{item.image_alt_text || 'No alt text recorded.'}</figcaption>
                  </figure>
                ) : null}
                <h4>{item.question_text}</h4>
                {item.options?.length ? (
                  <ol className="ai-recheck__options">
                    {item.options.map((option, index) => {
                      const text = optionText(option);
                      const isKey = text === item.correct_answer;
                      return (
                        <li key={`${item.id}-${index}`} className={isKey ? 'is-key' : undefined}>
                          <span>{LETTERS[index]}</span><p>{text}</p>{isKey ? <em>Key</em> : null}
                        </li>
                      );
                    })}
                  </ol>
                ) : <p className="ai-recheck__answer"><span>Answer</span> {item.correct_answer}</p>}
                {item.explanation ? <p className="ai-recheck__explanation"><span>Explanation shown to students</span>{item.explanation}</p> : null}
                <p className="ai-recheck__meta">{item.verified_by_authority || 'Unknown source'} · © {item.copyright_holder || 'not recorded'}{item.times_answered ? ` · answered ${item.times_answered}×, ${item.times_correct || 0} correct` : ''}</p>
                <footer className="taxonomy-review__actions">
                  <button type="button" className="is-approve" onClick={() => setDraft({ item, action: 'approve', notes: '' })}>Approve</button>
                  <button type="button" className="is-retire" onClick={() => setDraft({ item, action: 'retire', notes: '' })}>Retire</button>
                </footer>
              </article>
            ))}
          </div>
        ) : null}

        {queue && queue.total > PAGE_SIZE ? (
          <footer className="taxonomy-review__pagination">
            <span>{offset + 1}–{Math.min(offset + PAGE_SIZE, queue.total)} of {queue.total}</span>
            <div>
              <button type="button" disabled={!offset || loading} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>← Previous</button>
              <button type="button" disabled={offset + PAGE_SIZE >= queue.total || loading} onClick={() => setOffset(offset + PAGE_SIZE)}>Next →</button>
            </div>
          </footer>
        ) : null}
      </section>

      {draft ? (
        <div className="taxonomy-review__modal" role="dialog" aria-modal="true" aria-labelledby="ai-recheck-title" onMouseDown={(event) => event.target === event.currentTarget && !saving && setDraft(null)}>
          <form onSubmit={submit}>
            <header>
              <div>
                <span>Recheck decision · logged permanently</span>
                <h3 id="ai-recheck-title">{draft.action === 'approve' ? 'Approve question' : 'Retire question'}</h3>
                <p>{draft.action === 'approve'
                  ? 'The question stays live and students’ answers start counting in their profiles.'
                  : 'The question is removed from practice and will never count as evidence.'}</p>
              </div>
              <button type="button" disabled={saving} onClick={() => setDraft(null)} aria-label="Close">×</button>
            </header>
            <div className="taxonomy-review__modal-body">
              <div className="taxonomy-review__decision-context"><span>{draft.item.subject}</span><strong>{draft.item.question_text}</strong></div>
              <label className="taxonomy-review__rationale">
                <span>{draft.action === 'approve' ? 'Note (optional)' : 'Reason for retiring'}</span>
                <textarea
                  id="ai-recheck-notes"
                  autoFocus
                  required={draft.action === 'retire'}
                  minLength={draft.action === 'retire' ? 10 : undefined}
                  maxLength={2000}
                  value={draft.notes}
                  onChange={(event) => setDraft((current) => current ? { ...current, notes: event.target.value } : current)}
                  placeholder={draft.action === 'approve' ? 'For example: key and graph checked.' : 'For example: option C is also correct.'}
                />
              </label>
            </div>
            <footer>
              <button type="button" disabled={saving} onClick={() => setDraft(null)}>Cancel</button>
              <button type="submit" className={draft.action === 'approve' ? 'is-approve' : 'is-retire'} disabled={saving}>
                {saving ? 'Saving…' : draft.action === 'approve' ? 'Approve' : 'Retire'}
              </button>
            </footer>
          </form>
        </div>
      ) : null}
    </div>
  );
};

export default AiRecheckQueue;
