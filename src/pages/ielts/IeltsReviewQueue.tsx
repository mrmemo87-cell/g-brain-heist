import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { rpcIeltsReviewQueue, type IeltsReviewQueueItem, type IeltsReviewSkill } from '../../../services/ieltsTeacherReviewService';
import { friendlyIeltsAdminError } from '../../lib/schoolAdminPresentation';
import { IeltsButton } from '../../components/ielts/IeltsUi';
import '../../styles/ielts-submission-review.css';

const statusLabel: Record<string, string> = { pending: 'Waiting for review', in_review: 'Draft saved', finalized: 'Finalized' };

interface IeltsReviewQueueProps {
  embedded?: boolean;
  onOpenReview?: (review: { skill: IeltsReviewSkill; attemptId: string }) => void;
}

const IeltsReviewQueue: React.FC<IeltsReviewQueueProps> = ({ embedded = false, onOpenReview }) => {
  const navigate = useNavigate();
  const [skill, setSkill] = useState<IeltsReviewSkill | ''>('');
  const [reviewStatus, setReviewStatus] = useState('');
  const classId = '';
  const studentId = '';
  const schoolId = new URLSearchParams(window.location.search).get('school');

  const filters = useMemo(() => ({ schoolId, skill, reviewStatus, classId: classId || null, studentId: studentId || null }), [schoolId, skill, reviewStatus, classId, studentId]);
  const { data: rows = [], isLoading, error, refetch } = useQuery({
    queryKey: ['ielts-review-queue', filters],
    queryFn: () => rpcIeltsReviewQueue(filters),
  });

  const openReview = (row: IeltsReviewQueueItem) => {
    if (onOpenReview) {
      onOpenReview({ skill: row.skill, attemptId: row.attempt_id });
      return;
    }
    navigate(`/ielts/reviews/${row.skill}/${encodeURIComponent(row.attempt_id)}`);
  };

  const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'date unknown');

  return (
    <main data-testid={embedded ? 'embedded-ielts-review-queue' : 'ielts-review-queue'} className={`bh-ielts-page bh-ielts-review-list ir-page${embedded ? ' ir-embedded' : ''}`}>
      <section className="ir-shell">
        {!embedded && <button type="button" className="ir-back" onClick={() => navigate('/ielts/programme?programmeSection=reviews')}>← Back to review desk</button>}
        <header className="ir-head">
          <div>
            <p className="ir-eyebrow">Writing & Speaking practice</p>
            <h1>All practice reviews</h1>
            <p className="ir-muted">Every assigned practice essay and interview, including work you have already reviewed.</p>
          </div>
          <IeltsButton type="button" onClick={() => void refetch()}>Refresh</IeltsButton>
        </header>

        <div className="ir-card ir-filters">
          <label className="ir-field">Skill
            <select value={skill} onChange={(e) => setSkill(e.target.value as IeltsReviewSkill | '')}>
              <option value="">Writing and Speaking</option>
              <option value="writing">Writing</option>
              <option value="speaking">Speaking</option>
            </select>
          </label>
          <label className="ir-field">Status
            <select value={reviewStatus} onChange={(e) => setReviewStatus(e.target.value)}>
              <option value="">All</option>
              <option value="pending">Waiting for review</option>
              <option value="in_review">Draft saved</option>
              <option value="finalized">Finalized</option>
            </select>
          </label>
        </div>

        {error ? <div className="ir-notice ir-notice--error" role="alert">{friendlyIeltsAdminError(error, 'Unable to load the review queue. Please try again.')}</div> : null}
        {isLoading ? <p className="ir-muted" role="status">Loading submissions…</p> : null}

        <ul className="ir-list">
          {rows.map((row) => (
            <li key={`${row.skill}-${row.attempt_id}`} className="ir-card ir-row">
              <div>
                <strong>{row.student_name ?? 'Student'}{row.class_name ? <span className="ir-muted"> · {row.class_name}</span> : null}</strong>
                <span>{row.skill === 'writing' ? 'Writing' : 'Speaking'} · {row.task_title ?? row.prompt ?? 'Untitled submission'}</span>
                <span className="ir-muted ir-small">Submitted {day(row.submitted_at)}{row.overall_band ? ` · task band ${row.overall_band}` : ''}</span>
              </div>
              <span className={`ir-status ir-status--${row.review_status === 'finalized' ? 'final' : row.review_status}`}>{statusLabel[row.review_status] ?? row.review_status}</span>
              <IeltsButton type="button" variant={row.review_status === 'finalized' ? 'secondary' : 'primary'} onClick={() => openReview(row)}>{row.review_status === 'finalized' ? 'Open' : row.review_status === 'in_review' ? 'Continue review' : 'Review'}</IeltsButton>
            </li>
          ))}
          {!isLoading && rows.length === 0 ? <li className="ir-card ir-muted">No submissions match these filters.</li> : null}
        </ul>
      </section>
    </main>
  );
};

export default IeltsReviewQueue;
